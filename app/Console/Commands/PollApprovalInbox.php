<?php

namespace App\Console\Commands;

use App\Services\Approval\InboxProcessor;
use App\Services\Approval\IncomingMessage;
use Illuminate\Console\Command;
use Throwable;
use Webklex\IMAP\Facades\Client;

/**
 * Reads new emails from the Gmail inbox (IMAP) and passes them to InboxProcessor.
 * Scheduled every 2 minutes in routes/console.php.
 */
class PollApprovalInbox extends Command
{
    protected $signature = 'approvals:poll-inbox {--days=14 : Look back this many days}';

    protected $description = 'Read director replies (Approved / Rejected) from the approvals inbox';

    public function handle(InboxProcessor $processor): int
    {
        try {
            $client = Client::account('default');
            $client->connect();
            $folder = $client->getFolder(config('landms.approval.imap_folder', 'INBOX'));
            $messages = $folder->query()->unseen()->since(now()->subDays((int) $this->option('days')))->get();
        } catch (Throwable $e) {
            $this->error('Inbox connection failed: '.$e->getMessage());
            report($e);

            return self::FAILURE;
        }

        $count = 0;
        foreach ($messages as $message) {
            try {
                $from = $message->getFrom()->first();
                $header = $message->getHeader();
                $incoming = new IncomingMessage(
                    messageId: trim((string) $message->getMessageId(), '<> '),
                    fromEmail: (string) ($from->mail ?? ''),
                    subject: (string) $message->getSubject(),
                    bodyText: (string) ($message->hasTextBody() ? $message->getTextBody() : strip_tags((string) $message->getHTMLBody())),
                    inReplyTo: (string) $message->getInReplyTo() ?: null,
                    authResults: $header ? (string) $header->get('authentication-results') : null,
                    receivedAt: $message->getDate()?->first()?->toDate(),
                );
                $result = $processor->handle($incoming);
                $message->setFlag('Seen');
                $this->line("{$incoming->subject} -> {$result}");
                $count++;
            } catch (Throwable $e) {
                report($e);
                $this->warn('Skipped one message: '.$e->getMessage());
            }
        }

        $client->disconnect();
        $this->info("Processed {$count} message(s).");

        return self::SUCCESS;
    }
}
