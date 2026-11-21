<?php

namespace App\Notifications;

use App\Models\ApprovalRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * "Check & Review" email + in-app notification to our users.
 * reason: approved | rejected | unclear | not_authenticated | unknown_sender
 */
class ApprovalNeedsAttention extends Notification
{
    use Queueable;

    public function __construct(
        public ?ApprovalRequest $approval,
        public string $reason,
        public ?string $detail = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $locale = $notifiable->locale ?? 'en';
        $plot = $this->approval?->registryCase?->plot?->plot_no ?? '-';
        $type = $this->approval?->type?->label() ?? '';
        $ref = $this->approval?->reference ?? '';

        $mail = (new MailMessage)
            ->subject(__('approval.review_subject', ['plot' => $plot, 'type' => $type, 'reason' => __('approval.reason.'.$this->reason), 'ref' => $ref], $locale))
            ->greeting(__('approval.review_greeting', [], $locale))
            ->line(__('approval.reason_text.'.$this->reason, ['plot' => $plot, 'type' => $type], $locale));

        if ($this->detail) {
            $mail->line($this->detail);
        }
        if ($this->approval?->director_remarks) {
            $mail->line(__('approval.director_wrote', [], $locale).' "'.$this->approval->director_remarks.'"');
        }
        if ($this->approval) {
            $mail->action(__('approval.open_and_verify', [], $locale), route('approvals.show', $this->approval));
        }

        return $mail;
    }

    public function toArray(object $notifiable): array
    {
        return [
            'approval_id' => $this->approval?->id,
            'reference' => $this->approval?->reference,
            'plot_no' => $this->approval?->registryCase?->plot?->plot_no,
            'type' => $this->approval?->type?->value,
            'reason' => $this->reason,
            'detail' => $this->detail,
        ];
    }
}
