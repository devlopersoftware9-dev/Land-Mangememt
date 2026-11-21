<?php

namespace App\Http\Controllers;

use App\Models\ApprovalRequest;
use App\Services\Approval\ApprovalService;
use App\Services\Workflow\WorkflowException;
use Illuminate\Http\Request;

/**
 * Public pages for the director's one-click links. No login.
 * GET only shows "Confirm approve?" (so email link scanners cannot approve);
 * the director's button press (POST) records the decision.
 */
class ApprovalDecisionController extends Controller
{
    public function __construct(private readonly ApprovalService $service) {}

    public function show(string $reference, string $decision, string $token)
    {
        app()->setLocale('en');
        $approval = ApprovalRequest::with(['registryCase.plot.project', 'registryCase.customer', 'expense'])
            ->where('reference', $reference)->first();

        $error = null;
        if (! $approval || ! in_array($decision, ['approve', 'reject'], true)) {
            $error = __('approval.invalid_link');
        } elseif (! $approval->awaitingDirector()) {
            $error = __('approval.already_decided');
        } elseif ($approval->tokens_expire_at?->isPast()) {
            $error = __('approval.link_expired');
        }

        return view('approvals.decide', compact('approval', 'decision', 'token', 'error'));
    }

    public function confirm(Request $request, string $reference, string $decision, string $token)
    {
        app()->setLocale('en');
        try {
            $approval = $this->service->decideByLink($reference, $decision, $token, $request->ip());
        } catch (WorkflowException $e) {
            return view('approvals.decide', ['approval' => null, 'decision' => $decision, 'token' => '', 'error' => $e->getMessage()]);
        }

        return view('approvals.decide', ['approval' => $approval, 'decision' => $decision, 'token' => '', 'error' => null, 'done' => true]);
    }
}
