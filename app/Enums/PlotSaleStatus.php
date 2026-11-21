<?php

namespace App\Enums;

/**
 * Sale / registry life of a plot. No sale price is ever stored.
 *
 *  available -> sold -> payment_cleared -> registry_in_process -> registered
 *        ^        |                                                  |
 *        |   (cancelled)                                     (repurchased by company)
 *        +--------+--------------------------------------------------+
 */
enum PlotSaleStatus: string
{
    use HasLabel;

    case Available = 'available';
    case Sold = 'sold';
    case PaymentCleared = 'payment_cleared';
    case RegistryInProcess = 'registry_in_process';
    case Registered = 'registered';
    case Blocked = 'blocked';   // held by management, not for sale

    public function color(): string
    {
        return match ($this) {
            self::Available => '#22c55e',
            self::Sold => '#eab308',
            self::PaymentCleared => '#f97316',
            self::RegistryInProcess => '#a855f7',
            self::Registered => '#3b82f6',
            self::Blocked => '#6b7280',
        };
    }

    /** A customer currently holds this plot (company is not the holder). */
    public function hasCustomer(): bool
    {
        return in_array($this, [self::Sold, self::PaymentCleared, self::RegistryInProcess, self::Registered], true);
    }
}
