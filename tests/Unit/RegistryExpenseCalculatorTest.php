<?php

namespace Tests\Unit;

use App\Enums\ExpensePayer;
use App\Enums\RateCalcType;
use App\Services\Expense\DefaultRates;
use App\Services\Expense\ExpenseInput;
use App\Services\Expense\RateDefinition;
use App\Services\Expense\RegistryExpenseCalculator;
use PHPUnit\Framework\TestCase;

/** Figures come from the live Google Sheet "Registery Exp" (21-11-2026). */
class RegistryExpenseCalculatorTest extends TestCase
{
    /** @return RateDefinition[] */
    public static function rates(): array
    {
        return array_map(fn (array $r) => new RateDefinition(
            code: $r['code'],
            label: $r['label'],
            payer: ExpensePayer::from($r['payer']),
            calcType: RateCalcType::from($r['calc_type']),
            rate: $r['rate'] ?? null,
            nonFilerRate: $r['non_filer_rate'] ?? null,
            fixedAmount: $r['fixed_amount'] ?? 0,
            params: $r['params'] ?? [],
            receipt: $r['receipt'] ?? true,
            defaultOn: $r['default_on'] ?? true,
            sort: $r['sort'] ?? 0,
        ), DefaultRates::all());
    }

    public function test_plot_2_24_matches_google_sheet(): void
    {
        // Plot 2.24, 6.25 marla, maliyat 31,00,000, filer
        $r = (new RegistryExpenseCalculator)->calculate(self::rates(), new ExpenseInput(3_100_000, 6.25, true, true));
        $amounts = [];
        foreach ($r->lines as $l) {
            $amounts[$l->code] = $l->amount;
        }

        $this->assertSame(32_100, $amounts['stamp_paper']);
        $this->assertSame(31_000, $amounts['tma_sale_tax']);
        $this->assertSame(38_750, $amounts['tax_236k']);
        $this->assertSame(85_250, $amounts['tax_236c']);
        $this->assertSame(3_600, $amounts['plra']);
        $this->assertSame(15_500, $amounts['registration_fee']);
        $this->assertSame(127_950, $r->buyerTotal());
        $this->assertSame(85_250, $r->sellerTotal());
        $this->assertSame(213_200, $r->grandTotal());
    }

    public function test_seller_only_sheet_plot_5_13(): void
    {
        $r = (new RegistryExpenseCalculator)->calculate(self::rates(), new ExpenseInput(3_750_000, 7.5, true, true, kind: ExpenseInput::KIND_SELLER));
        $this->assertSame(0, $r->buyerTotal());
        $this->assertSame(103_125, $r->sellerTotal());
    }

    public function test_non_filer_rates(): void
    {
        $r = (new RegistryExpenseCalculator)->calculate(self::rates(), new ExpenseInput(3_100_000, 6.25, false, false));
        $a = array_column(array_map(fn ($l) => ['c' => $l->code, 'a' => $l->amount], $r->lines), 'a', 'c');
        $this->assertSame(325_500, $a['tax_236k']);   // 10.5%
        $this->assertSame(356_500, $a['tax_236c']);   // 11.5%
    }

    public function test_plra_adds_100_per_lac_above_31_lac(): void
    {
        $calc = new RegistryExpenseCalculator;
        $plra = fn (int $m) => array_values(array_filter($calc->calculate(self::rates(), new ExpenseInput($m, 5))->lines, fn ($l) => $l->code === 'plra'))[0]->amount;
        $this->assertSame(3_600, $plra(2_500_000));
        $this->assertSame(3_600, $plra(3_100_000));
        $this->assertSame(3_700, $plra(3_150_000));
        $this->assertSame(4_500, $plra(4_000_000));
    }

    public function test_manual_override_and_untick(): void
    {
        $r = (new RegistryExpenseCalculator)->calculate(self::rates(), new ExpenseInput(
            3_100_000, 6.25, true, true, enabled: ['tax_236c' => false], manual: ['mix_exp' => 7_000],
        ));
        $codes = array_map(fn ($l) => $l->code, $r->lines);
        $this->assertNotContains('tax_236c', $codes);
        $this->assertSame(0, $r->sellerTotal());
        $this->assertSame(127_950 + 2_000, $r->buyerTotal());
    }
}
