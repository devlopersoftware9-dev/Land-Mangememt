<?php

namespace App\Enums;

/** Every change of hands of a plot is one row in plot_events. Never deleted. */
enum OwnershipEvent: string
{
    use HasLabel;

    case Sold = 'sold';                       // company -> customer
    case PaymentCleared = 'payment_cleared';
    case Transferred = 'transferred';         // customer -> customer (file transfer before registry)
    case Cancelled = 'cancelled';             // sale cancelled, back to company
    case Repurchased = 'repurchased';         // company bought it back ("wapas liya")
    case RegistryStarted = 'registry_started';
    case Registered = 'registered';
    case ConstructionChanged = 'construction_changed';
    case Note = 'note';
}
