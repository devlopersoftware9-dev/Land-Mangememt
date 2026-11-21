<?php

namespace App\Services\Expense;

use App\Enums\ExpensePayer;

final class ExpenseResult
{
    /** @param  ExpenseLine[]  $lines */
    public function __construct(public readonly array $lines) {}

    public function buyerTotal(): int
    {
        return $this->sumFor(ExpensePayer::Buyer);
    }

    public function sellerTotal(): int
    {
        return $this->sumFor(ExpensePayer::Seller);
    }

    public function grandTotal(): int
    {
        return $this->buyerTotal() + $this->sellerTotal();
    }

    private function sumFor(ExpensePayer $payer): int
    {
        $sum = 0;
        foreach ($this->lines as $line) {
            if ($line->payer === $payer) {
                $sum += $line->amount;
            }
        }

        return $sum;
    }
}
