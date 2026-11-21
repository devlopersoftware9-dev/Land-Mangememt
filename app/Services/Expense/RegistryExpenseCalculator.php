<?php

namespace App\Services\Expense;

use App\Enums\ExpensePayer;
use App\Enums\RateCalcType;

/**
 * Same calculation as the Google Sheet "Registery Exp":
 *
 *  Stamp Paper       buyer   maliyat x 1% + 1,100
 *  TMA Sale Tax      buyer   maliyat x 1%
 *  236-K             buyer   filer 1.25% / non-filer 10.50%
 *  Registration Fee  buyer   maliyat x 0.5%
 *  PLRA              buyer   3,600 upto 31 lac, +100 per lac above
 *  Excise            buyer   free upto 5 marla, fixed above
 *  Fixed lines       buyer   intiqal fee, CG verification, mix exp, map/naksha fee, LA commission
 *  236-C             seller  filer 2.75% / non-filer 11.50% (land held < 3 years)
 *  7E FBR            seller  1% (off by default)
 *  Makaan            seller  2% of land value (off by default)
 *
 * All rates come from the database (editable). Pure PHP, framework-free.
 */
final class RegistryExpenseCalculator
{
    /** @param  RateDefinition[]  $rates */
    public function calculate(array $rates, ExpenseInput $in): ExpenseResult
    {
        usort($rates, fn (RateDefinition $a, RateDefinition $b) => $a->sort <=> $b->sort);

        $lines = [];
        foreach ($rates as $def) {
            if ($in->kind === ExpenseInput::KIND_SELLER && $def->payer !== ExpensePayer::Seller) {
                continue;
            }

            $on = $in->enabled[$def->code] ?? $def->defaultOn;
            if (! $on) {
                continue;
            }

            [$rate, $amount] = $this->lineAmount($def, $in);
            $isManual = array_key_exists($def->code, $in->manual);
            if ($isManual) {
                $amount = max(0, (int) $in->manual[$def->code]);
            }

            $lines[] = new ExpenseLine($def->code, $def->label, $def->payer, $rate, $amount, $def->receipt, $isManual, $def->sort);
        }

        return new ExpenseResult($lines);
    }

    /** @return array{0: ?float, 1: int} [rate used, amount] */
    private function lineAmount(RateDefinition $def, ExpenseInput $in): array
    {
        $m = $in->maliyat;

        switch ($def->calcType) {
            case RateCalcType::Percent:
                return [$def->rate, self::round($m * ($def->rate ?? 0) / 100) + $def->fixedAmount];

            case RateCalcType::PercentFilerNonFiler:
                $isFiler = $def->payer === ExpensePayer::Buyer ? $in->buyerIsFiler : $in->sellerIsFiler;
                $rate = $isFiler ? $def->rate : ($def->nonFilerRate ?? $def->rate);

                return [$rate, self::round($m * ($rate ?? 0) / 100)];

            case RateCalcType::Fixed:
                return [null, $def->fixedAmount];

            case RateCalcType::Plra:
                $base = (int) ($def->params['base'] ?? 3600);
                $upto = (int) ($def->params['upto'] ?? 3_100_000);
                $step = (int) ($def->params['step'] ?? 100);
                $per = max(1, (int) ($def->params['per'] ?? 100_000));
                $extraLacs = $m > $upto ? (int) ceil(($m - $upto) / $per) : 0;

                return [null, $base + $extraLacs * $step];

            case RateCalcType::Excise:
                $free = (float) ($def->params['free_upto_marla'] ?? 5);

                return [null, $in->areaMarla <= $free ? 0 : $def->fixedAmount];

            case RateCalcType::PercentOfLandValue:
                return [$def->rate, self::round(($in->landValue ?? 0) * ($def->rate ?? 0) / 100)];
        }

        return [null, 0];
    }

    /** Round half up to whole rupees (avoids float noise like 30999.9999). */
    private static function round(float $v): int
    {
        return (int) round($v + 1e-6, 0, PHP_ROUND_HALF_UP);
    }
}
