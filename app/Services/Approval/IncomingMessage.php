<?php

namespace App\Services\Approval;

/** Plain data of one email read from the inbox (independent of the IMAP library). */
final class IncomingMessage
{
    public function __construct(
        public readonly string $messageId,
        public readonly string $fromEmail,
        public readonly string $subject,
        public readonly string $bodyText,
        public readonly ?string $inReplyTo = null,
        public readonly ?string $authResults = null,
        public readonly ?\DateTimeInterface $receivedAt = null,
    ) {}
}
