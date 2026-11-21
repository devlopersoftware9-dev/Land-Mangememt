<?php

namespace App\Services\Approval;

use App\Models\ApprovalRequest;
use App\Models\InboundEmail;
use App\Models\Setting;

/**
 * Decides what one incoming email means for the approvals.
 *
 *  1. Find the approval: [APR-xxxx] in subject, else In-Reply-To = our Message-ID.
 *  2. Sender must be the registered director email, else -> notify, do nothing.
 *  3. Gmail's Authentication-Results must show the sender passed SPF/DKIM/DMARC (anti-spoofing).
 *  4. "Approved" / "Rejected" -> record decision (our user still verifies).
 *     Anything else -> "needs review" + notify.
 * Every email is stored in inbound_emails as evidence.
 */
class InboxProcessor
{
    public function __construct(
        private readonly ReplyParser $parser,
        private readonly ApprovalService $approvals,
    ) {}

    public function handle(IncomingMessage $msg): string
    {
        if (InboundEmail::where('message_id', $msg->messageId)->exists()) {
            return 'duplicate';
        }

        $approval = $this->findApproval($msg);
        $result = $this->evaluate($msg, $approval);

        InboundEmail::create([
            'message_id' => $msg->messageId,
            'in_reply_to' => $msg->inReplyTo,
            'from_email' => strtolower($msg->fromEmail),
            'subject' => $msg->subject,
            'body_text' => mb_substr($msg->bodyText, 0, 20000),
            'auth_results' => $msg->authResults,
            'received_at' => $msg->receivedAt,
            'approval_request_id' => $approval?->id,
            'result' => $result,
            'processed_at' => now(),
        ]);

        $snippet = mb_substr($this->parser->newText($msg->bodyText), 0, 300);

        match ($result) {
            ReplyParser::APPROVED, ReplyParser::REJECTED => $this->approvals->recordDecision(
                $approval, $result, 'reply', $msg->fromEmail, null, $snippet
            ),
            'unclear', 'not_authenticated' => $this->approvals->markNeedsReview($approval, $result),
            'unknown_sender' => $this->approvals->notifyReviewers($approval, 'unknown_sender', $msg->fromEmail.': '.$msg->subject),
            default => null, // unmatched / already_decided / ignored: stored only
        };

        return $result;
    }

    private function findApproval(IncomingMessage $msg): ?ApprovalRequest
    {
        $ref = $this->parser->reference($msg->subject);
        if ($ref) {
            return ApprovalRequest::where('reference', $ref)->first();
        }
        if ($msg->inReplyTo) {
            $id = trim($msg->inReplyTo, '<> ');

            return ApprovalRequest::where('outgoing_message_id', $id)->first();
        }

        return null;
    }

    private function evaluate(IncomingMessage $msg, ?ApprovalRequest $approval): string
    {
        if (! $approval) {
            return 'unmatched';
        }

        $director = strtolower((string) Setting::get('director_email', $approval->to_email, $approval->registryCase?->plot?->project_id));
        if (strtolower(trim($msg->fromEmail)) !== $director) {
            return 'unknown_sender';
        }

        if (! $approval->awaitingDirector()) {
            return 'already_decided';
        }

        if (config('landms.approval.require_authenticated_reply') && ! $this->authenticated($msg->authResults)) {
            return 'not_authenticated';
        }

        return $this->parser->decision($msg->bodyText);
    }

    /** Gmail adds e.g. "mx.google.com; dkim=pass ...; spf=pass ...; dmarc=pass ..." */
    private function authenticated(?string $header): bool
    {
        if (! $header) {
            return false;
        }
        $h = strtolower($header);
        if (str_contains($h, 'dmarc=fail') || str_contains($h, 'spf=fail')) {
            return false;
        }

        return str_contains($h, 'dmarc=pass') || (str_contains($h, 'dkim=pass') && str_contains($h, 'spf=pass'));
    }
}
