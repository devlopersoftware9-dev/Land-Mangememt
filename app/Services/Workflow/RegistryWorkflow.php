<?php

namespace App\Services\Workflow;

use App\Enums\ApprovalStatus;
use App\Enums\ApprovalType;
use App\Enums\PlotSaleStatus;
use App\Enums\RegistryMode;
use App\Enums\RegistryStatus as S;
use App\Enums\UserRole;
use App\Models\ApprovalRequest;
use App\Models\AuditLog;
use App\Models\ExpenseRate;
use App\Models\Intiqal;
use App\Models\Plot;
use App\Models\RegistryCase;
use App\Models\RegistryExpense;
use App\Models\User;
use App\Services\Approval\ApprovalService;
use App\Services\Area\AreaConverter;
use App\Services\Expense\ExpenseInput;
use App\Services\Expense\RegistryExpenseCalculator;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * The registry procedure, step by step:
 *
 *  demand -> [email director: Fard approval] -> director replies -> we Check & Verify -> fard_approved
 *  -> Land Management selects intiqal(s) + "Fard Jari" message -> fard_jari_issued
 *  -> Registry Officer brings fard -> fard_received
 *     A (client_self):     fard_handed_over -> client_registry_recorded           (final)
 *     B (company_managed): [email director: Registry Expense] -> verify -> expense_approved
 *                          -> expense_paid -> registry_done -> registry_recorded -> handed_over (final)
 */
class RegistryWorkflow
{
    public function __construct(
        private readonly PlotService $plots,
        private readonly ApprovalService $approvals,
        private readonly RegistryExpenseCalculator $calculator,
    ) {}

    // ---------------------------------------------------------------- 1. demand
    public function createDemand(Plot $plot, RegistryMode $mode, CarbonInterface $demandDate, int $maliyat, User $by, ?string $notes = null): RegistryCase
    {
        $this->role($by, UserRole::Accounts);
        if ($plot->sale_status !== PlotSaleStatus::PaymentCleared) {
            throw new WorkflowException(__('workflow.payment_not_cleared', ['plot' => $plot->plot_no]));
        }
        if ($maliyat <= 0) {
            throw new WorkflowException(__('workflow.maliyat_required'));
        }

        return DB::transaction(function () use ($plot, $mode, $demandDate, $maliyat, $by, $notes) {
            $area = new AreaConverter((int) ($plot->project->marla_sqft ?? config('landms.marla_sqft')));
            $sqft = (float) ($plot->area_sqft ?: $area->toSqft(0, (float) $plot->size_marla));

            $case = new RegistryCase([
                'reference' => RegistryCase::nextReference(),
                'plot_id' => $plot->id,
                'customer_id' => $plot->current_customer_id,
                'mode' => $mode,
                'demand_date' => $demandDate,
                'area_sqft' => $sqft,
                'area_marla' => $plot->size_marla ?: $area->sqftToMarla($sqft),
                'maliyat' => $maliyat,
                'notes' => $notes,
                'created_by' => $by->id,
            ]);
            $case->status = S::Demand;
            $case->save();

            $this->plots->markRegistryStarted($plot, $demandDate, $case->reference);
            AuditLog::record('registry.demand', $case);

            return $case;
        });
    }

    // ---------------------------------------------------------------- 2. fard approval by email
    public function sendFardApproval(RegistryCase $case, User $by): ApprovalRequest
    {
        $this->role($by, UserRole::Accounts);
        $this->expect($case, [S::Demand]);

        return DB::transaction(function () use ($case, $by) {
            $approval = $this->approvals->createAndSend($case, ApprovalType::Fard, $by);
            $this->move($case, S::FardApprovalPending);

            return $approval;
        });
    }

    /** Called by ApprovalService when the director clicks a link or replies. */
    public function onDirectorDecision(ApprovalRequest $approval): void
    {
        $case = $approval->registryCase;
        match ($approval->type) {
            ApprovalType::Fard => $case->status === S::FardApprovalPending && $this->move($case, S::FardApprovalReview),
            ApprovalType::RegistryExpense => $case->status === S::ExpenseApprovalPending && $this->move($case, S::ExpenseApprovalReview),
            ApprovalType::SellerExpense => null, // side approval, does not block the case
        };
    }

    /** Link expired without an answer: case goes back one step so it can be re-sent. */
    public function onApprovalExpired(ApprovalRequest $approval): void
    {
        $case = $approval->registryCase;
        match ($approval->type) {
            ApprovalType::Fard => $case->status === S::FardApprovalPending && $this->move($case, S::Demand),
            ApprovalType::RegistryExpense => $case->status === S::ExpenseApprovalPending && $this->move($case, S::FardReceived),
            ApprovalType::SellerExpense => null,
        };
    }

    /**
     * "Check & Review": our user confirms the director's decision. Only then the case moves on.
     * If the director rejected, the case goes back so data can be corrected and re-sent.
     */
    public function verifyApproval(ApprovalRequest $approval, User $by, ?string $remarks = null): void
    {
        $this->role($by, UserRole::Accounts);
        if (! $approval->awaitingVerification()) {
            throw new WorkflowException(__('workflow.nothing_to_verify'));
        }
        if ($approval->status === ApprovalStatus::NeedsReview) {
            throw new WorkflowException(__('workflow.needs_manual_decision'));
        }

        DB::transaction(function () use ($approval, $by, $remarks) {
            $approved = $approval->status === ApprovalStatus::DirectorApproved;
            $approval->forceFill([
                'status' => $approved ? ApprovalStatus::Verified : ApprovalStatus::Closed,
                'verified_by' => $by->id,
                'verified_at' => now(),
                'verify_remarks' => $remarks,
            ])->save();

            $case = $approval->registryCase;
            match ($approval->type) {
                ApprovalType::Fard => $this->move($case, $approved ? S::FardApproved : S::Demand),
                ApprovalType::RegistryExpense => $this->move($case, $approved ? S::ExpenseApproved : S::FardReceived),
                ApprovalType::SellerExpense => null,
            };
            AuditLog::record('approval.verified', $approval, [], ['approved' => $approved]);
        });
    }

    /**
     * For a "needs review" approval (unclear reply / unknown sender) a user who has
     * checked with the director records the decision by hand.
     */
    public function resolveManually(ApprovalRequest $approval, bool $approved, User $by, string $remarks): void
    {
        $this->role($by, UserRole::Accounts);
        if (! $approval->awaitingDirector()) {
            throw new WorkflowException(__('workflow.nothing_to_verify'));
        }
        $this->approvals->recordDecision($approval, $approved ? 'approved' : 'rejected', 'manual', $by->email, null, $remarks);
        $approval->refresh();
        $this->verifyApproval($approval, $by, $remarks);
    }

    // ---------------------------------------------------------------- 3. land management: intiqal(s) + fard jari
    /**
     * @param  array<int,float>  $allocations  intiqal_id => area_sqft taken from it (1 to 3 intiqals)
     */
    public function issueFardJari(RegistryCase $case, array $allocations, string $message, User $by): void
    {
        $this->role($by, UserRole::LandManagement);
        $this->expect($case, [S::FardApproved]);

        $allocations = array_filter($allocations, fn ($a) => (float) $a > 0);
        if ($allocations === []) {
            throw new WorkflowException(__('workflow.select_intiqal'));
        }

        DB::transaction(function () use ($case, $allocations, $message, $by) {
            $total = 0.0;
            $holders = [];
            $sync = [];
            foreach ($allocations as $intiqalId => $sqft) {
                /** @var Intiqal $intiqal */
                $intiqal = Intiqal::where('project_id', $case->plot->project_id)->lockForUpdate()->findOrFail($intiqalId);
                if ((float) $sqft > $intiqal->balanceSqft() + 0.01) {
                    throw new WorkflowException(__('workflow.intiqal_balance_low', [
                        'no' => $intiqal->intiqal_no, 'balance' => $intiqal->balanceSqft(),
                    ]));
                }
                $total += (float) $sqft;
                $holders[] = $intiqal->holder_name;
                $sync[$intiqal->id] = ['area_sqft' => $sqft];
            }
            if (abs($total - (float) $case->area_sqft) > 0.5) {
                throw new WorkflowException(__('workflow.allocation_mismatch', [
                    'total' => $total, 'needed' => (float) $case->area_sqft,
                ]));
            }

            $case->intiqals()->sync($sync);
            $case->forceFill([
                'seller_name' => implode(', ', array_unique($holders)),
                'fard_jari_at' => now(),
                'fard_jari_by' => $by->id,
                'fard_jari_message' => $message,
            ])->save();
            $this->move($case, S::FardJariIssued);
        });
    }

    // ---------------------------------------------------------------- 4. registry officer brings fard
    public function markFardReceived(RegistryCase $case, ?string $fardNo, CarbonInterface $on, User $by): void
    {
        $this->role($by, UserRole::RegistryOfficer);
        $this->expect($case, [S::FardJariIssued]);
        $case->forceFill(['fard_no' => $fardNo, 'fard_received_on' => $on])->save();
        $this->move($case, S::FardReceived);
    }

    // ---------------------------------------------------------------- Raasta A
    public function handOverFard(RegistryCase $case, CarbonInterface $on, User $by): void
    {
        $this->role($by, UserRole::RegistryOfficer, UserRole::Accounts);
        $this->mode($case, RegistryMode::ClientSelf);
        $this->expect($case, [S::FardReceived]);
        $case->forceFill(['fard_handed_over_on' => $on])->save();
        $this->move($case, S::FardHandedOver);
    }

    public function recordClientRegistry(RegistryCase $case, string $registryNo, CarbonInterface $registryDate, ?string $office, User $by): void
    {
        $this->role($by, UserRole::Accounts, UserRole::RegistryOfficer);
        $this->mode($case, RegistryMode::ClientSelf);
        $this->expect($case, [S::FardHandedOver]);

        DB::transaction(function () use ($case, $registryNo, $registryDate, $office) {
            $case->forceFill(['registry_no' => $registryNo, 'registry_date' => $registryDate, 'registry_office' => $office])->save();
            $this->move($case, S::ClientRegistryRecorded);
            $this->plots->markRegistered($case->plot, $registryDate, $registryNo);
        });
    }

    // ---------------------------------------------------------------- Raasta B
    /**
     * Calculate & save the registry expense sheet (filer / non-filer template).
     * kind = registry_expense (buyer+seller) or seller_expense (e.g. only 236-C).
     */
    public function saveExpense(RegistryCase $case, ExpenseInput $input, User $by): RegistryExpense
    {
        $this->role($by, UserRole::Accounts);
        if ($input->kind === ExpenseInput::KIND_FULL) {
            $this->mode($case, RegistryMode::CompanyManaged);
            $this->expect($case, [S::FardReceived]);
        } else {
            $this->expect($case, [S::FardReceived, S::FardHandedOver, S::ExpenseApproved, S::ExpensePaid]);
        }

        $rates = ExpenseRate::where('is_active', true)->get()->map->toDefinition()->all();
        $result = $this->calculator->calculate($rates, $input);

        return DB::transaction(function () use ($case, $input, $result, $by) {
            $expense = RegistryExpense::create([
                'registry_case_id' => $case->id,
                'kind' => $input->kind,
                'maliyat' => $input->maliyat,
                'area_marla' => $input->areaMarla,
                'buyer_is_filer' => $input->buyerIsFiler,
                'seller_is_filer' => $input->sellerIsFiler,
                'land_value' => $input->landValue,
                'buyer_total' => $result->buyerTotal(),
                'seller_total' => $result->sellerTotal(),
                'grand_total' => $result->grandTotal(),
                'seller_name' => $case->seller_name,
                'buyer_name' => $case->customer?->name,
                'created_by' => $by->id,
            ]);
            foreach ($result->lines as $line) {
                $expense->lines()->create([
                    'code' => $line->code, 'label' => $line->label, 'payer' => $line->payer,
                    'rate' => $line->rate, 'amount' => $line->amount, 'receipt' => $line->receipt,
                    'is_manual' => $line->isManual, 'sort' => $line->sort,
                ]);
            }

            return $expense;
        });
    }

    /** "Save" on the expense form = email to director (same as the Google Sheet button). */
    public function sendExpenseApproval(RegistryExpense $expense, User $by): ApprovalRequest
    {
        $this->role($by, UserRole::Accounts);
        $case = $expense->registryCase;

        if ($expense->kind === ExpenseInput::KIND_SELLER) {
            return $this->approvals->createAndSend($case, ApprovalType::SellerExpense, $by, $expense);
        }

        $this->expect($case, [S::FardReceived]);

        return DB::transaction(function () use ($case, $expense, $by) {
            $approval = $this->approvals->createAndSend($case, ApprovalType::RegistryExpense, $by, $expense);
            $this->move($case, S::ExpenseApprovalPending);

            return $approval;
        });
    }

    public function markExpensePaid(RegistryCase $case, User $by): void
    {
        $this->role($by, UserRole::Accounts);
        $this->expect($case, [S::ExpenseApproved]);
        $case->forceFill(['expense_paid' => true, 'expense_paid_at' => now(), 'expense_paid_by' => $by->id])->save();
        $this->move($case, S::ExpensePaid);
    }

    public function markRegistryDone(RegistryCase $case, string $registryNo, CarbonInterface $registryDate, ?string $office, User $by): void
    {
        $this->role($by, UserRole::RegistryOfficer);
        $this->expect($case, [S::ExpensePaid]);
        $case->forceFill(['registry_no' => $registryNo, 'registry_date' => $registryDate, 'registry_office' => $office])->save();
        $this->move($case, S::RegistryDone);
    }

    /** Registry came back to office (until intiqal is attested) and is recorded. */
    public function recordRegistryInOffice(RegistryCase $case, CarbonInterface $on, ?string $buyerIntiqalNo, User $by): void
    {
        $this->role($by, UserRole::Accounts, UserRole::RegistryOfficer);
        $this->expect($case, [S::RegistryDone]);

        DB::transaction(function () use ($case, $on, $buyerIntiqalNo) {
            $case->forceFill(['registry_recorded_on' => $on, 'buyer_intiqal_no' => $buyerIntiqalNo])->save();
            $this->move($case, S::RegistryRecorded);
            $this->plots->markRegistered($case->plot, $case->registry_date ?? $on, (string) $case->registry_no);
        });
    }

    public function handOverRegistry(RegistryCase $case, CarbonInterface $on, User $by): void
    {
        $this->role($by, UserRole::Accounts, UserRole::RegistryOfficer);
        $this->expect($case, [S::RegistryRecorded]);
        $case->forceFill(['handed_over_on' => $on])->save();
        $this->move($case, S::HandedOver);
    }

    // ---------------------------------------------------------------- cancel
    public function cancel(RegistryCase $case, string $reason, User $by): void
    {
        $this->role($by, UserRole::Admin);
        if ($case->status->isFinal()) {
            throw new WorkflowException(__('workflow.case_closed'));
        }
        DB::transaction(function () use ($case, $reason) {
            $case->forceFill(['notes' => trim(($case->notes ?? '')."\nCancelled: ".$reason)])->save();
            $this->move($case, S::Cancelled);
            $this->plots->revertRegistryStarted($case->plot, now(), $case->reference, $reason);
        });
    }

    // ---------------------------------------------------------------- helpers
    private function move(RegistryCase $case, S $to): bool
    {
        $from = $case->status;
        $case->status = $to;
        $case->save();
        AuditLog::record('registry.status', $case, ['status' => $from?->value], ['status' => $to->value]);

        return true;
    }

    /** @param  S[]  $allowed */
    private function expect(RegistryCase $case, array $allowed): void
    {
        if (! in_array($case->status, $allowed, true)) {
            throw new WorkflowException(__('workflow.case_wrong_status', [
                'ref' => $case->reference, 'status' => $case->status->label(),
            ]));
        }
    }

    private function mode(RegistryCase $case, RegistryMode $mode): void
    {
        if ($case->mode !== $mode) {
            throw new WorkflowException(__('workflow.wrong_mode', ['mode' => $case->mode->label()]));
        }
    }

    private function role(User $user, UserRole ...$roles): void
    {
        if (! $user->hasRole(...$roles)) {
            throw new WorkflowException(__('workflow.not_allowed'));
        }
    }
}
