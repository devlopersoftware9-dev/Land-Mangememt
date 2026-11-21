<?php

namespace App\Http\Controllers;

use App\Enums\PlotSaleStatus;
use App\Enums\RegistryMode;
use App\Enums\RegistryStatus;
use App\Models\ExpenseRate;
use App\Models\Plot;
use App\Models\RegistryCase;
use App\Models\RegistryExpense;
use App\Services\Expense\ExpenseInput;
use App\Services\Expense\RegistryExpenseCalculator;
use App\Services\Workflow\RegistryWorkflow;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class RegistryCaseController extends Controller
{
    public function __construct(private readonly RegistryWorkflow $workflow) {}

    /** "Registry Pending" plots (payment cleared, no case yet) + open cases by step. */
    public function index(Request $request)
    {
        $project = $this->project();

        $pendingPlots = $project->plots()->with('currentCustomer')
            ->where('sale_status', PlotSaleStatus::PaymentCleared->value)->naturalOrder()->get();

        $cases = RegistryCase::with(['plot', 'customer'])
            ->whereHas('plot', fn ($q) => $q->where('project_id', $project->id))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')),
                fn ($q) => $q->whereNotIn('status', [RegistryStatus::HandedOver->value, RegistryStatus::ClientRegistryRecorded->value, RegistryStatus::Cancelled->value]))
            ->latest()->paginate(50)->withQueryString();

        return view('registry.index', [
            'pendingPlots' => $pendingPlots,
            'cases' => $cases,
            'statuses' => RegistryStatus::options(),
            'modes' => RegistryMode::options(),
        ]);
    }

    public function show(RegistryCase $case)
    {
        $this->authorizeProject($case);
        $case->load(['plot.project', 'customer', 'intiqals', 'approvals.inboundEmails', 'expenses.lines', 'documents']);
        $project = $case->plot->project;

        return view('registry.show', [
            'case' => $case,
            'intiqals' => $project->intiqals()->get()->map(fn ($i) => ['intiqal' => $i, 'balance' => $i->balanceSqft()]),
            'rates' => ExpenseRate::where('is_active', true)->orderBy('sort')->get(),
        ]);
    }

    /** Demand: customer asked for registry of a payment-cleared plot. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'plot_id' => ['required', Rule::exists('plots', 'id')->where('project_id', $this->project()->id)],
            'mode' => ['required', Rule::enum(RegistryMode::class)],
            'demand_date' => 'required|date|before_or_equal:today',
            'maliyat' => 'required|integer|min:1',
            'notes' => 'nullable|string|max:1000',
        ]);

        $case = null;
        $response = $this->attempt(function () use ($data, $request, &$case) {
            $case = $this->workflow->createDemand(
                Plot::findOrFail($data['plot_id']), RegistryMode::from($data['mode']), Carbon::parse($data['demand_date']),
                (int) $data['maliyat'], $request->user(), $data['notes'] ?? null,
            );
        }, __('registry.demand_ok'));

        return $case ? redirect()->route('registry.show', $case)->with('status', __('registry.demand_ok')) : $response;
    }

    /** All workflow buttons on the case page post here. */
    public function step(Request $request, RegistryCase $case, string $step)
    {
        $this->authorizeProject($case);
        $user = $request->user();
        $wf = $this->workflow;

        return match ($step) {
            'send-fard-approval' => $this->attempt(fn () => $wf->sendFardApproval($case, $user), __('registry.sent_to_director')),

            'fard-jari' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $d = $request->validate([
                    'allocations' => 'required|array|min:1|max:5',
                    'allocations.*' => 'nullable|numeric|min:0',
                    'message' => 'required|string|max:2000',
                ]);
                $wf->issueFardJari($case, $d['allocations'], $d['message'], $user);
            }, __('registry.fard_jari_ok')),

            'fard-received' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $d = $request->validate(['fard_no' => 'nullable|string|max:50', 'date' => 'required|date']);
                $wf->markFardReceived($case, $d['fard_no'] ?? null, Carbon::parse($d['date']), $user);
            }, __('app.saved')),

            'hand-over-fard' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $d = $request->validate(['date' => 'required|date']);
                $wf->handOverFard($case, Carbon::parse($d['date']), $user);
            }, __('app.saved')),

            'client-registry', 'registry-done' => $this->attempt(function () use ($request, $case, $user, $wf, $step) {
                $d = $request->validate(['registry_no' => 'required|string|max:50', 'registry_date' => 'required|date', 'registry_office' => 'nullable|string|max:150']);
                $step === 'client-registry'
                    ? $wf->recordClientRegistry($case, $d['registry_no'], Carbon::parse($d['registry_date']), $d['registry_office'] ?? null, $user)
                    : $wf->markRegistryDone($case, $d['registry_no'], Carbon::parse($d['registry_date']), $d['registry_office'] ?? null, $user);
            }, __('app.saved')),

            'expense-preview' => $this->preview($request, $case),

            'expense-save' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $expense = $wf->saveExpense($case, $this->expenseInput($request, $case), $user);
                $wf->sendExpenseApproval($expense, $user);   // Save = email to director
            }, __('registry.sent_to_director')),

            'expense-paid' => $this->attempt(fn () => $wf->markExpensePaid($case, $user), __('app.saved')),

            'record-in-office' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $d = $request->validate(['date' => 'required|date', 'buyer_intiqal_no' => 'nullable|string|max:50', 'registry_copy' => 'nullable|file|mimes:pdf,jpg,jpeg,png|max:10240']);
                if ($request->hasFile('registry_copy')) {
                    $file = $request->file('registry_copy');
                    $case->documents()->create([
                        'type' => 'registry_copy',
                        'path' => $file->store("registry/{$case->reference}"),
                        'original_name' => $file->getClientOriginalName(),
                        'size' => $file->getSize(),
                        'uploaded_by' => $user->id,
                    ]);
                }
                $wf->recordRegistryInOffice($case, Carbon::parse($d['date']), $d['buyer_intiqal_no'] ?? null, $user);
            }, __('app.saved')),

            'hand-over' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $d = $request->validate(['date' => 'required|date']);
                $wf->handOverRegistry($case, Carbon::parse($d['date']), $user);
            }, __('app.saved')),

            'cancel' => $this->attempt(function () use ($request, $case, $user, $wf) {
                $d = $request->validate(['reason' => 'required|string|max:500']);
                $wf->cancel($case, $d['reason'], $user);
            }, __('app.saved')),
        };
    }

    /** Live calculation for the expense form (JSON), nothing is saved. */
    private function preview(Request $request, RegistryCase $case)
    {
        $rates = ExpenseRate::where('is_active', true)->get()->map->toDefinition()->all();
        $result = app(RegistryExpenseCalculator::class)->calculate($rates, $this->expenseInput($request, $case));

        return response()->json([
            'lines' => array_map(fn ($l) => [
                'code' => $l->code, 'label' => $l->label, 'payer' => $l->payer->value, 'rate' => $l->rate,
                'amount' => $l->amount, 'receipt' => $l->receipt, 'manual' => $l->isManual,
            ], $result->lines),
            'buyer_total' => $result->buyerTotal(),
            'seller_total' => $result->sellerTotal(),
            'grand_total' => $result->grandTotal(),
        ]);
    }

    private function expenseInput(Request $request, RegistryCase $case): ExpenseInput
    {
        $d = $request->validate([
            'kind' => 'required|in:'.ExpenseInput::KIND_FULL.','.ExpenseInput::KIND_SELLER,
            'maliyat' => 'required|integer|min:1',
            'area_marla' => 'required|numeric|min:0',
            'buyer_is_filer' => 'boolean',
            'seller_is_filer' => 'boolean',
            'land_value' => 'nullable|integer|min:0',
            'enabled' => 'array',
            'enabled.*' => 'boolean',
            'manual' => 'array',
            'manual.*' => 'nullable|integer|min:0',
        ]);

        return new ExpenseInput(
            maliyat: (int) $d['maliyat'],
            areaMarla: (float) $d['area_marla'],
            buyerIsFiler: (bool) ($d['buyer_is_filer'] ?? false),
            sellerIsFiler: (bool) ($d['seller_is_filer'] ?? false),
            landValue: isset($d['land_value']) ? (int) $d['land_value'] : null,
            kind: $d['kind'],
            enabled: array_map('boolval', $d['enabled'] ?? []),
            manual: array_map('intval', array_filter($d['manual'] ?? [], fn ($v) => $v !== null && $v !== '')),
        );
    }

    private function authorizeProject(RegistryCase $case): void
    {
        abort_unless($case->plot && $case->plot->project_id === $this->project()->id, 404);
    }
}
