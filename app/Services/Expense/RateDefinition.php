<?php

namespace App\Services\Expense;

use App\Enums\ExpensePayer;
use App\Enums\RateCalcType;

/** One expense line definition (comes from the expense_rates table). */
final class RateDefinition
{
    /**
     * @param  float|null  $rate  percent, e.g. 1.0 means 1%
     * @param  array<string,mixed>  $params
     */
    public function __construct(
        public readonly string $code,
        public readonly string $label,
        public readonly ExpensePayer $payer,
        public readonly RateCalcType $calcType,
        public readonly ?float $rate = null,
        public readonly ?float $nonFilerRate = null,
        public readonly int $fixedAmount = 0,
        public readonly array $params = [],
        public readonly bool $receipt = true,
        public readonly bool $defaultOn = true,
        public readonly int $sort = 0,
    ) {}
}
