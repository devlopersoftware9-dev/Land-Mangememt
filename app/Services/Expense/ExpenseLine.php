<?php

namespace App\Services\Expense;

use App\Enums\ExpensePayer;

final class ExpenseLine
{
    public function __construct(
        public readonly string $code,
        public readonly string $label,
        public readonly ExpensePayer $payer,
        public readonly ?float $rate,
        public readonly int $amount,
        public readonly bool $receipt,
        public readonly bool $isManual,
        public readonly int $sort,
    ) {}
}
