<?php

namespace App\Services\Expense;

final class ExpenseInput
{
    public const KIND_FULL = 'registry_expense';   // buyer + seller ("Registery Exp" sheet)
    public const KIND_SELLER = 'seller_expense';   // seller only ("Seller Registery Exp" sheet)

    /**
     * @param  array<string,bool>  $enabled  code => on/off (overrides the rate's default)
     * @param  array<string,int>  $manual  code => amount typed by user (overrides calculation)
     */
    public function __construct(
        public readonly int $maliyat,
        public readonly float $areaMarla,
        public readonly bool $buyerIsFiler = true,
        public readonly bool $sellerIsFiler = true,
        public readonly ?int $landValue = null,
        public readonly string $kind = self::KIND_FULL,
        public readonly array $enabled = [],
        public readonly array $manual = [],
    ) {}
}
