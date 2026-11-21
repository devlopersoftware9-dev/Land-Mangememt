<?php

namespace App\Http\Controllers;

use App\Models\ApprovalRequest;
use App\Services\Workflow\RegistryWorkflow;
use Illuminate\Http\Request;

/** Our side of approvals: list, open, "Check & Review" -> Verify. */
class ApprovalController extends Controller
{
    public function __construct(private readonly RegistryWorkflow $workflow) {}

    public function index(Request $request)
    {
        $project = $this->project();
        $approvals = ApprovalRequest::with(['registryCase.plot', 'sender', 'verifier'])
            ->whereHas('registryCase.plot', fn ($q) => $q->where('project_id', $project->id))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest()->paginate(50)->withQueryString();

        return view('approvals.index', compact('approvals'));
    }

    public function show(ApprovalRequest $approval)
    {
        $approval->load(['registryCase.plot.project', 'registryCase.customer', 'expense.lines', 'inboundEmails', 'sender', 'verifier']);
        abort_unless($approval->registryCase->plot->project_id === $this->project()->id, 404);

        return view('approvals.show', compact('approval'));
    }

    /** Director already decided; our user checked it and confirms. */
    public function verify(Request $request, ApprovalRequest $approval)
    {
        $d = $request->validate(['remarks' => 'nullable|string|max:1000']);

        return $this->attempt(fn () => $this->workflow->verifyApproval($approval, $request->user(), $d['remarks'] ?? null), __('approval.verified_ok'));
    }

    /** Unclear reply: user confirmed with director (phone/WhatsApp) and records it by hand. */
    public function resolve(Request $request, ApprovalRequest $approval)
    {
        $d = $request->validate(['decision' => 'required|in:approved,rejected', 'remarks' => 'required|string|max:1000']);

        return $this->attempt(fn () => $this->workflow->resolveManually($approval, $d['decision'] === 'approved', $request->user(), $d['remarks']), __('approval.verified_ok'));
    }
}
