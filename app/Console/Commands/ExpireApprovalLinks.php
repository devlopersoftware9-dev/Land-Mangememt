<?php

namespace App\Console\Commands;

use App\Enums\ApprovalStatus;
use App\Models\ApprovalRequest;
use App\Services\Approval\ApprovalService;
use App\Services\Workflow\RegistryWorkflow;
use Illuminate\Console\Command;

/** Approvals still unanswered after the link validity: mark expired and tell our users (they can re-send). */
class ExpireApprovalLinks extends Command
{
    protected $signature = 'approvals:expire-links';

    protected $description = 'Expire unanswered director approval links';

    public function handle(ApprovalService $service, RegistryWorkflow $workflow): int
    {
        $expired = ApprovalRequest::where('status', ApprovalStatus::Sent->value)
            ->where('tokens_expire_at', '<', now())->get();

        foreach ($expired as $approval) {
            $approval->forceFill([
                'status' => ApprovalStatus::Expired,
                'approve_token_hash' => null,
                'reject_token_hash' => null,
            ])->save();
            $workflow->onApprovalExpired($approval);
            $service->notifyReviewers($approval, 'expired');
        }

        $this->info($expired->count().' expired.');

        return self::SUCCESS;
    }
}
