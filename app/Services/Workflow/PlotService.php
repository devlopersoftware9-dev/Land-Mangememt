<?php

namespace App\Services\Workflow;

use App\Enums\ConstructionStatus;
use App\Enums\OwnershipEvent;
use App\Enums\PlotSaleStatus;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Plot;
use App\Models\PlotEvent;
use App\Models\PlotOwnership;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Every change of a plot's holder goes through here, so the ownership chain
 * (plot_ownerships) and the timeline (plot_events) are always complete.
 * No sale price / repurchase amount is recorded anywhere.
 */
class PlotService
{
    /** Company -> customer. */
    public function sell(Plot $plot, Customer $customer, CarbonInterface $date, ?string $reference = null, ?string $notes = null): Plot
    {
        $this->expect($plot, [PlotSaleStatus::Available], 'sell');

        return DB::transaction(function () use ($plot, $customer, $date, $reference, $notes) {
            $this->changeHolder($plot, $customer, $date, OwnershipEvent::Sold);
            $plot->forceFill([
                'sale_status' => PlotSaleStatus::Sold,
                'current_customer_id' => $customer->id,
                'sold_on' => $date,
                'payment_cleared_at' => null,
                'payment_cleared_by' => null,
            ])->save();
            $this->event($plot, OwnershipEvent::Sold, null, $customer->id, $date, $reference, $notes);

            return $plot;
        });
    }

    /** "Payment Clear" tick -> plot moves to the registry list. */
    public function clearPayment(Plot $plot, CarbonInterface $date, ?string $notes = null): Plot
    {
        $this->expect($plot, [PlotSaleStatus::Sold], 'clear payment');

        return DB::transaction(function () use ($plot, $date, $notes) {
            $plot->forceFill([
                'sale_status' => PlotSaleStatus::PaymentCleared,
                'payment_cleared_at' => now(),
                'payment_cleared_by' => auth()->id(),
            ])->save();
            $this->event($plot, OwnershipEvent::PaymentCleared, $plot->current_customer_id, $plot->current_customer_id, $date, null, $notes);

            return $plot;
        });
    }

    /** Customer -> customer (file transfer), only before registry. Payment state is kept. */
    public function transfer(Plot $plot, Customer $to, CarbonInterface $date, ?string $reference = null, ?string $notes = null): Plot
    {
        $this->expect($plot, [PlotSaleStatus::Sold, PlotSaleStatus::PaymentCleared], 'transfer');
        if ($plot->current_customer_id === $to->id) {
            throw new WorkflowException(__('workflow.same_customer'));
        }

        return DB::transaction(function () use ($plot, $to, $date, $reference, $notes) {
            $from = $plot->current_customer_id;
            $this->changeHolder($plot, $to, $date, OwnershipEvent::Transferred);
            $plot->forceFill(['current_customer_id' => $to->id])->save();
            $this->event($plot, OwnershipEvent::Transferred, $from, $to->id, $date, $reference, $notes);

            return $plot;
        });
    }

    /** Sale cancelled (before registry) -> back to company, available again. */
    public function cancelSale(Plot $plot, CarbonInterface $date, ?string $notes = null): Plot
    {
        $this->expect($plot, [PlotSaleStatus::Sold, PlotSaleStatus::PaymentCleared], 'cancel');

        return $this->backToCompany($plot, $date, OwnershipEvent::Cancelled, null, $notes);
    }

    /** Company buys the plot back ("wapas liya"). Allowed any time a customer holds it, but not mid-registry. */
    public function repurchase(Plot $plot, CarbonInterface $date, ?string $reference = null, ?string $notes = null): Plot
    {
        $this->expect($plot, [PlotSaleStatus::Sold, PlotSaleStatus::PaymentCleared, PlotSaleStatus::Registered], 'repurchase');

        return $this->backToCompany($plot, $date, OwnershipEvent::Repurchased, $reference, $notes);
    }

    public function setConstruction(Plot $plot, ConstructionStatus $status, CarbonInterface $date, ?string $notes = null): Plot
    {
        $old = $plot->construction_status;
        $plot->forceFill(['construction_status' => $status])->save();
        $this->event($plot, OwnershipEvent::ConstructionChanged, null, null, $date, null, $notes, [
            'from' => $old?->value, 'to' => $status->value,
        ]);

        return $plot;
    }

    /** Called by RegistryWorkflow. */
    public function markRegistryStarted(Plot $plot, CarbonInterface $date, string $caseRef): void
    {
        $this->expect($plot, [PlotSaleStatus::PaymentCleared], 'start registry');
        $plot->forceFill(['sale_status' => PlotSaleStatus::RegistryInProcess])->save();
        $this->event($plot, OwnershipEvent::RegistryStarted, $plot->current_customer_id, $plot->current_customer_id, $date, $caseRef);
    }

    public function markRegistered(Plot $plot, CarbonInterface $date, string $registryNo): void
    {
        $this->expect($plot, [PlotSaleStatus::RegistryInProcess], 'register');
        $plot->forceFill(['sale_status' => PlotSaleStatus::Registered])->save();
        $this->event($plot, OwnershipEvent::Registered, $plot->current_customer_id, $plot->current_customer_id, $date, $registryNo);
    }

    /** Registry case cancelled -> plot returns to "payment cleared". */
    public function revertRegistryStarted(Plot $plot, CarbonInterface $date, string $caseRef, ?string $notes = null): void
    {
        if ($plot->sale_status !== PlotSaleStatus::RegistryInProcess) {
            return;
        }
        $plot->forceFill(['sale_status' => PlotSaleStatus::PaymentCleared])->save();
        $this->event($plot, OwnershipEvent::Note, null, null, $date, $caseRef, $notes ?? 'Registry case cancelled');
    }

    // ------------------------------------------------------------------

    private function backToCompany(Plot $plot, CarbonInterface $date, OwnershipEvent $event, ?string $reference, ?string $notes): Plot
    {
        return DB::transaction(function () use ($plot, $date, $event, $reference, $notes) {
            $from = $plot->current_customer_id;
            $this->changeHolder($plot, null, $date, $event);
            $plot->forceFill([
                'sale_status' => PlotSaleStatus::Available,
                'current_customer_id' => null,
                'sold_on' => null,
                'payment_cleared_at' => null,
                'payment_cleared_by' => null,
            ])->save();
            $this->event($plot, $event, $from, null, $date, $reference, $notes);

            return $plot;
        });
    }

    /** Close the open holding period and open a new one. */
    private function changeHolder(Plot $plot, ?Customer $to, CarbonInterface $date, OwnershipEvent $event): void
    {
        $open = PlotOwnership::where('plot_id', $plot->id)->whereNull('ended_on')->latest('id')->first();
        if ($open) {
            $open->update(['ended_on' => $date, 'end_event' => $event]);
        } elseif (! PlotOwnership::where('plot_id', $plot->id)->exists()) {
            // first ever change: record that the company held it until now
            PlotOwnership::create([
                'plot_id' => $plot->id,
                'customer_id' => null,
                'started_on' => $plot->created_at ?? $date,
                'ended_on' => $date,
                'start_event' => OwnershipEvent::Note,
                'end_event' => $event,
            ]);
        }
        PlotOwnership::create([
            'plot_id' => $plot->id,
            'customer_id' => $to?->id,
            'started_on' => $date,
            'start_event' => $event,
        ]);
    }

    private function event(Plot $plot, OwnershipEvent $event, ?int $from, ?int $to, CarbonInterface $date, ?string $ref = null, ?string $notes = null, array $meta = []): void
    {
        PlotEvent::create([
            'plot_id' => $plot->id,
            'event' => $event,
            'from_customer_id' => $from,
            'to_customer_id' => $to,
            'event_date' => $date,
            'reference' => $ref,
            'notes' => $notes,
            'meta' => $meta ?: null,
            'created_by' => auth()->id(),
        ]);
        AuditLog::record('plot.'.$event->value, $plot, [], ['to_customer_id' => $to, 'reference' => $ref]);
    }

    /** @param  PlotSaleStatus[]  $allowed */
    private function expect(Plot $plot, array $allowed, string $action): void
    {
        if (! in_array($plot->sale_status, $allowed, true)) {
            throw new WorkflowException(__('workflow.plot_wrong_status', [
                'plot' => $plot->plot_no,
                'status' => $plot->sale_status?->label(),
                'action' => $action,
            ]));
        }
    }
}
