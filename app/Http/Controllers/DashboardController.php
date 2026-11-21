<?php

namespace App\Http\Controllers;

use App\Enums\ApprovalStatus;
use App\Enums\PlotSaleStatus;
use App\Enums\RegistryStatus;
use App\Models\ApprovalRequest;
use App\Models\RegistryCase;
use App\Services\Area\AreaConverter;

class DashboardController extends Controller
{
    public function index()
    {
        $project = $this->project();

        $plotCounts = $project->plots()->selectRaw('sale_status, COUNT(*) as n')->groupBy('sale_status')->pluck('n', 'sale_status');
        $construction = $project->plots()->selectRaw('construction_status, COUNT(*) as n')->groupBy('construction_status')->pluck('n', 'construction_status');

        $caseCounts = RegistryCase::whereHas('plot', fn ($q) => $q->where('project_id', $project->id))
            ->whereNotIn('status', [RegistryStatus::HandedOver->value, RegistryStatus::ClientRegistryRecorded->value, RegistryStatus::Cancelled->value])
            ->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        $toVerify = ApprovalRequest::with('registryCase.plot')
            ->whereHas('registryCase.plot', fn ($q) => $q->where('project_id', $project->id))
            ->whereIn('status', [ApprovalStatus::DirectorApproved->value, ApprovalStatus::DirectorRejected->value, ApprovalStatus::NeedsReview->value])
            ->latest('decided_at')->get();

        $waitingDirector = ApprovalRequest::whereHas('registryCase.plot', fn ($q) => $q->where('project_id', $project->id))
            ->where('status', ApprovalStatus::Sent->value)->count();

        $intiqals = $project->intiqals()->get()->map(fn ($i) => [
            'intiqal' => $i, 'balance' => $i->balanceSqft(),
        ]);

        return view('dashboard.index', [
            'project' => $project,
            'plotCounts' => $plotCounts,
            'construction' => $construction,
            'caseCounts' => $caseCounts,
            'toVerify' => $toVerify,
            'waitingDirector' => $waitingDirector,
            'intiqals' => $intiqals,
            'area' => $project->areaSummary(),
            'conv' => new AreaConverter($project->marla_sqft),
            'statuses' => PlotSaleStatus::cases(),
        ]);
    }
}
