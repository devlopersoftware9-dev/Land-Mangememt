<?php

namespace App\Enums;

/**
 * Steps of one registry case. See App\Services\Workflow\RegistryWorkflow
 * for who may move a case from one step to the next.
 */
enum RegistryStatus: string
{
    use HasLabel;

    // common steps
    case Demand = 'demand';                                 // customer gave demand
    case FardApprovalPending = 'fard_approval_pending';     // email sent to director
    case FardApprovalReview = 'fard_approval_review';       // director replied, waiting for our Check & Verify
    case FardApproved = 'fard_approved';                    // verified -> Land Management's turn
    case FardJariIssued = 'fard_jari_issued';               // intiqal(s) selected, "Fard Jari" message sent
    case FardReceived = 'fard_received';                    // registry officer brought the fard

    // Raasta A (client self)
    case FardHandedOver = 'fard_handed_over';               // fard given to client, waiting client's registry details
    case ClientRegistryRecorded = 'client_registry_recorded'; // client's registry no/date recorded  (final)

    // Raasta B (company managed)
    case ExpenseApprovalPending = 'expense_approval_pending';
    case ExpenseApprovalReview = 'expense_approval_review';
    case ExpenseApproved = 'expense_approved';
    case ExpensePaid = 'expense_paid';
    case RegistryDone = 'registry_done';
    case RegistryRecorded = 'registry_recorded';            // registry came to office & recorded
    case HandedOver = 'handed_over';                        // registry given to client (final)

    case Cancelled = 'cancelled';

    public function isFinal(): bool
    {
        return in_array($this, [self::ClientRegistryRecorded, self::HandedOver, self::Cancelled], true);
    }

    /** Which role acts on this step (for dashboard "who is holding the file"). */
    public function actor(): UserRole
    {
        return match ($this) {
            self::FardApproved => UserRole::LandManagement,
            self::FardJariIssued, self::ExpensePaid, self::RegistryDone, self::RegistryRecorded,
            self::FardReceived => UserRole::RegistryOfficer,
            default => UserRole::Accounts,
        };
    }
}
