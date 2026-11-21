<?php

namespace App\Services\Approval;

use App\Enums\ApprovalStatus;
use App\Enums\ApprovalType;
use App\Enums\UserRole;
use App\Mail\ApprovalRequestMail;
use App\Models\ApprovalRequest;
use App\Models\AuditLog;
use App\Models\RegistryCase;
use App\Models\RegistryExpense;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\ApprovalNeedsAttention;
use App\Services\Workflow\RegistryWorkflow;
use App\Services\Workflow\WorkflowException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * Director approval by email. The director never logs in.
 *
 *  - Email has one-click Approve / Reject links (random tokens, stored hashed, expire, single use).
 *    The link opens a small confirm page first, so Gmail's link scanner cannot approve by itself.
 *  - Or the director simply replies "Approved" / "Rejected"; InboxProcessor reads the reply.
 *  - Either way our user gets a "Check & Review" email and must Verify before the file moves on.
 */
class ApprovalService
{
    public function createAndSend(RegistryCase $case, ApprovalType $type, User $by, ?RegistryExpense $expense = null): ApprovalRequest
    {
        $projectId = $case->plot->project_id;
        $director = Setting::get('director_email', config('landms.approval.director_email'), $projectId);
        if (! $director) {
            throw new WorkflowException(__('workflow.director_email_missing'));
        }
        $cc = Setting::get('approval_cc', null, $projectId);
        $cc = $cc ? array_filter(array_map('trim', explode(',', $cc))) : config('landms.approval.cc', []);

        $approveToken = Str::random(48);
        $rejectToken = Str::random(48);

        $approval = new ApprovalRequest([
            'reference' => ApprovalRequest::nextReference(),
            'registry_case_id' => $case->id,
            'registry_expense_id' => $expense?->id,
            'type' => $type,
            'status' => ApprovalStatus::Draft,
            'to_email' => $director,
            'cc' => array_values($cc),
            'sent_by' => $by->id,
        ]);
        $approval->subject = $this->subject($approval, $case, $expense);
        $approval->approve_token_hash = hash('sha256', $approveToken);
        $approval->reject_token_hash = hash('sha256', $rejectToken);
        $approval->tokens_expire_at = now()->addDays((int) config('landms.approval.link_valid_days', 7));
        $approval->outgoing_message_id = strtolower($approval->reference).'.'.Str::random(12).'@'.parse_url((string) config('app.url'), PHP_URL_HOST);
        $approval->save();

        $mail = new ApprovalRequestMail($approval, $by,
            route('approval.decide', ['reference' => $approval->reference, 'decision' => 'approve', 'token' => $approveToken]),
            route('approval.decide', ['reference' => $approval->reference, 'decision' => 'reject', 'token' => $rejectToken]),
        );
        $approval->body_html = $mail->render();
        Mail::to($director)->cc($approval->cc ?? [])->send($mail);

        $approval->forceFill(['status' => ApprovalStatus::Sent, 'sent_at' => now()])->save();
        AuditLog::record('approval.sent', $approval, [], ['to' => $director, 'subject' => $approval->subject]);

        return $approval;
    }

    /**
     * Subject always carries the plot no. and the [APR-xxxx] reference (used to match replies).
     * Expense subject follows the existing Google Sheet format.
     */
    public function subject(ApprovalRequest $a, RegistryCase $case, ?RegistryExpense $expense): string
    {
        $plot = $case->plot->plot_no;
        $project = $case->plot->project->code ?? '';
        $rs = fn (int $v) => 'Rs.'.$v.'/-';

        return match ($a->type) {
            ApprovalType::Fard => "Fard Approval Request--Plot_{$plot} {$project} ".rtrim(rtrim((string) $case->area_marla, '0'), '.')." Marla Maliyat {$rs($case->maliyat)} [{$a->reference}]",
            ApprovalType::RegistryExpense => "Request Approval--Registery Exp {$rs($expense?->grand_total ?? 0)} Plot_{$plot} [{$a->reference}]",
            ApprovalType::SellerExpense => "{$rs($expense?->seller_total ?? 0)} Request Approval--Seller Exp (236-C) Plot_{$plot} [{$a->reference}]",
        };
    }

    /** One-click link from the email. Returns the approval on success. */
    public function decideByLink(string $reference, string $decision, string $token, ?string $ip): ApprovalRequest
    {
        $approval = ApprovalRequest::where('reference', $reference)->firstOrFail();
        if (! in_array($decision, ['approve', 'reject'], true)) {
            throw new WorkflowException(__('approval.invalid_link'));
        }
        $hash = $decision === 'approve' ? $approval->approve_token_hash : $approval->reject_token_hash;
        if (! $hash || ! hash_equals($hash, hash('sha256', $token))) {
            throw new WorkflowException(__('approval.invalid_link'));
        }
        if ($approval->tokens_expire_at?->isPast()) {
            throw new WorkflowException(__('approval.link_expired'));
        }
        if (! $approval->awaitingDirector()) {
            throw new WorkflowException(__('approval.already_decided'));
        }

        $this->recordDecision($approval, $decision === 'approve' ? 'approved' : 'rejected', 'link', $approval->to_email, $ip);

        return $approval->refresh();
    }

    /** Director's decision is stored; our users get a "Check & Review" notification. */
    public function recordDecision(ApprovalRequest $approval, string $decision, string $channel, ?string $fromEmail, ?string $ip = null, ?string $remarks = null): void
    {
        DB::transaction(function () use ($approval, $decision, $channel, $fromEmail, $ip, $remarks) {
            $approval->forceFill([
                'decision' => $decision,
                'decision_channel' => $channel,
                'decided_at' => now(),
                'decided_from_email' => $fromEmail,
                'decided_ip' => $ip,
                'director_remarks' => $remarks,
                'status' => $decision === 'approved' ? ApprovalStatus::DirectorApproved : ApprovalStatus::DirectorRejected,
                // links are single use
                'approve_token_hash' => null,
                'reject_token_hash' => null,
            ])->save();

            app(RegistryWorkflow::class)->onDirectorDecision($approval);
            AuditLog::record('approval.decided', $approval, [], compact('decision', 'channel', 'fromEmail'));
        });

        $this->notifyReviewers($approval, $decision === 'approved' ? 'approved' : 'rejected');
    }

    /** Unclear reply, unknown sender, failed authentication... a human must look. */
    public function markNeedsReview(ApprovalRequest $approval, string $reason): void
    {
        if ($approval->awaitingDirector()) {
            $approval->forceFill(['status' => ApprovalStatus::NeedsReview])->save();
        }
        AuditLog::record('approval.needs_review', $approval, [], ['reason' => $reason]);
        $this->notifyReviewers($approval, $reason);
    }

    public function notifyReviewers(?ApprovalRequest $approval, string $reason, ?string $detail = null): void
    {
        $users = User::where('is_active', true)
            ->whereIn('role', [UserRole::Admin->value, UserRole::Accounts->value])->get();
        if ($approval?->sender && ! $users->contains('id', $approval->sender->id)) {
            $users->push($approval->sender);
        }
        Notification::send($users, new ApprovalNeedsAttention($approval, $reason, $detail));
    }
}
