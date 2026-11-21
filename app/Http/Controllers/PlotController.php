<?php

namespace App\Http\Controllers;

use App\Enums\ConstructionStatus;
use App\Enums\PlotSaleStatus;
use App\Models\Customer;
use App\Models\Plot;
use App\Services\Workflow\PlotService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class PlotController extends Controller
{
    public function __construct(private readonly PlotService $service) {}

    public function index(Request $request)
    {
        $project = $this->project();
        $plots = $project->plots()->with(['street', 'currentCustomer'])
            ->when($request->filled('status'), fn ($q) => $q->where('sale_status', $request->string('status')))
            ->when($request->filled('street'), fn ($q) => $q->where('street_id', $request->integer('street')))
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%'.$request->string('q').'%';
                $q->where(fn ($w) => $w->where('plot_no', 'like', $term)
                    ->orWhereHas('currentCustomer', fn ($c) => $c->where('name', 'like', $term)->orWhere('cnic', 'like', $term)));
            })
            ->naturalOrder()->paginate(50)->withQueryString();

        return view('plots.index', [
            'plots' => $plots,
            'streets' => $project->streets()->orderByRaw('CAST(number AS UNSIGNED)')->get(),
            'statuses' => PlotSaleStatus::options(),
        ]);
    }

    public function map()
    {
        $project = $this->project();

        return view('plots.map', [
            'project' => $project,
            'plots' => $project->plots()->whereNotNull('map_shape')->get(['id', 'plot_no', 'sale_status', 'construction_status', 'map_shape']),
            'parcels' => $project->parcels()->whereNotNull('map_shape')->get(),
        ]);
    }

    public function show(Plot $plot)
    {
        $this->authorizeProject($plot);
        $plot->load(['street', 'currentCustomer', 'ownerships.customer', 'events.fromCustomer', 'events.toCustomer', 'events.creator', 'registryCases']);

        return view('plots.show', [
            'plot' => $plot,
            'customers' => Customer::orderBy('name')->get(['id', 'name', 'father_name', 'relation', 'cnic']),
            'constructionStatuses' => ConstructionStatus::options(),
        ]);
    }

    public function sell(Request $request, Plot $plot)
    {
        $this->authorizeProject($plot);
        $data = $this->validated($request, true);

        return $this->attempt(fn () => $this->service->sell(
            $plot, Customer::findOrFail($data['customer_id']), Carbon::parse($data['date']), $data['reference'] ?? null, $data['notes'] ?? null
        ), __('plots.sold_ok', ['plot' => $plot->plot_no]));
    }

    public function clearPayment(Request $request, Plot $plot)
    {
        $this->authorizeProject($plot);
        $data = $this->validated($request);

        return $this->attempt(fn () => $this->service->clearPayment($plot, Carbon::parse($data['date']), $data['notes'] ?? null),
            __('plots.payment_cleared_ok', ['plot' => $plot->plot_no]));
    }

    public function transfer(Request $request, Plot $plot)
    {
        $this->authorizeProject($plot);
        $data = $this->validated($request, true);

        return $this->attempt(fn () => $this->service->transfer(
            $plot, Customer::findOrFail($data['customer_id']), Carbon::parse($data['date']), $data['reference'] ?? null, $data['notes'] ?? null
        ), __('plots.transferred_ok', ['plot' => $plot->plot_no]));
    }

    public function cancel(Request $request, Plot $plot)
    {
        $this->authorizeProject($plot);
        $data = $this->validated($request);

        return $this->attempt(fn () => $this->service->cancelSale($plot, Carbon::parse($data['date']), $data['notes'] ?? null),
            __('plots.cancelled_ok', ['plot' => $plot->plot_no]));
    }

    public function repurchase(Request $request, Plot $plot)
    {
        $this->authorizeProject($plot);
        $data = $this->validated($request);

        return $this->attempt(fn () => $this->service->repurchase($plot, Carbon::parse($data['date']), $data['reference'] ?? null, $data['notes'] ?? null),
            __('plots.repurchased_ok', ['plot' => $plot->plot_no]));
    }

    public function construction(Request $request, Plot $plot)
    {
        $this->authorizeProject($plot);
        $data = $request->validate([
            'construction_status' => ['required', Rule::enum(ConstructionStatus::class)],
            'date' => 'required|date',
            'notes' => 'nullable|string|max:1000',
        ]);

        return $this->attempt(fn () => $this->service->setConstruction(
            $plot, ConstructionStatus::from($data['construction_status']), Carbon::parse($data['date']), $data['notes'] ?? null
        ), __('app.saved'));
    }

    private function validated(Request $request, bool $needsCustomer = false): array
    {
        return $request->validate([
            'customer_id' => [$needsCustomer ? 'required' : 'nullable', 'exists:customers,id'],
            'date' => 'required|date|before_or_equal:today',
            'reference' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:1000',
        ]);
    }

    private function authorizeProject(Plot $plot): void
    {
        abort_unless($plot->project_id === $this->project()->id, 404);
    }
}
