<?php

namespace App\Mail;

use App\Enums\ApprovalType;
use App\Models\ApprovalRequest;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Queue\SerializesModels;

/** The email the director receives (always in English, like the current sheet emails). */
class ApprovalRequestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public ApprovalRequest $approval,
        public User $sender,
        public string $approveUrl,
        public string $rejectUrl,
    ) {
        $this->locale('en');
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->approval->subject);
    }

    public function headers(): Headers
    {
        return new Headers(messageId: $this->approval->outgoing_message_id);
    }

    public function content(): Content
    {
        $case = $this->approval->registryCase->loadMissing(['plot.project', 'customer', 'intiqals']);
        $expense = $this->approval->type === ApprovalType::Fard ? null : $this->approval->expense?->load('lines');

        return new Content(view: 'emails.approval', with: [
            'approval' => $this->approval,
            'case' => $case,
            'expense' => $expense,
            'sender' => $this->sender,
            'approveUrl' => $this->approveUrl,
            'rejectUrl' => $this->rejectUrl,
        ]);
    }
}
