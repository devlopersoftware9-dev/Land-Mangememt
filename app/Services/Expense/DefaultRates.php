<?php

namespace App\Services\Expense;

/**
 * Starting rates, copied from the Google Sheet "Registery Exp" (Nov 2026).
 * Used by the seeder; afterwards they are edited from the Settings page.
 *
 * rate / non_filer_rate are percents (1.0 = 1%).
 */
final class DefaultRates
{
    /** @return array<int, array<string,mixed>> */
    public static function all(): array
    {
        return [
            ['code' => 'stamp_paper', 'label' => 'Stamp Paper', 'label_ur' => 'اسٹامپ پیپر', 'payer' => 'buyer', 'calc_type' => 'percent', 'rate' => 1.0, 'fixed_amount' => 1100, 'receipt' => true, 'sort' => 10],
            ['code' => 'map_fee', 'label' => 'Map Fee', 'label_ur' => 'نقشہ فیس (میپ)', 'payer' => 'buyer', 'calc_type' => 'fixed', 'fixed_amount' => 0, 'receipt' => true, 'sort' => 20],
            ['code' => 'tma_sale_tax', 'label' => 'TMA - Sale Tax', 'label_ur' => 'ٹی ایم اے سیل ٹیکس', 'payer' => 'buyer', 'calc_type' => 'percent', 'rate' => 1.0, 'receipt' => true, 'sort' => 30],
            ['code' => 'naksha_fee', 'label' => 'Naksha Fee', 'label_ur' => 'نقشہ فیس', 'payer' => 'buyer', 'calc_type' => 'fixed', 'fixed_amount' => 0, 'receipt' => true, 'sort' => 40],
            ['code' => 'intiqal_fee', 'label' => 'Intiqal Fee', 'label_ur' => 'انتقال فیس', 'payer' => 'buyer', 'calc_type' => 'fixed', 'fixed_amount' => 1500, 'receipt' => false, 'sort' => 50],
            ['code' => 'mix_exp', 'label' => 'Mix Expense', 'label_ur' => 'متفرق اخراجات', 'payer' => 'buyer', 'calc_type' => 'fixed', 'fixed_amount' => 5000, 'receipt' => false, 'sort' => 60],
            ['code' => 'excise_tax', 'label' => 'Excise Tax (upto 5 marla free)', 'label_ur' => 'ایکسائز ٹیکس (5 مرلہ تک فری)', 'payer' => 'buyer', 'calc_type' => 'excise', 'fixed_amount' => 0, 'params' => ['free_upto_marla' => 5], 'receipt' => true, 'sort' => 70],
            ['code' => 'fbr_7e', 'label' => '7E FBR (paid by seller)', 'label_ur' => '7E ایف بی آر (بیچنے والا)', 'payer' => 'seller', 'calc_type' => 'percent', 'rate' => 1.0, 'receipt' => true, 'default_on' => false, 'sort' => 80],
            ['code' => 'tax_236c', 'label' => '236-C Tax (held < 3 years)', 'label_ur' => '236-C ٹیکس', 'payer' => 'seller', 'calc_type' => 'percent_filer', 'rate' => 2.75, 'non_filer_rate' => 11.5, 'receipt' => true, 'sort' => 90],
            ['code' => 'cg_verification', 'label' => 'CG Verification', 'label_ur' => 'سی جی ویریفیکیشن', 'payer' => 'buyer', 'calc_type' => 'fixed', 'fixed_amount' => 500, 'receipt' => true, 'sort' => 100],
            ['code' => 'tax_236k', 'label' => '236-K Tax', 'label_ur' => '236-K ٹیکس', 'payer' => 'buyer', 'calc_type' => 'percent_filer', 'rate' => 1.25, 'non_filer_rate' => 10.5, 'receipt' => true, 'sort' => 110],
            ['code' => 'la_commission', 'label' => 'LA Commission', 'label_ur' => 'ایل اے کمیشن', 'payer' => 'buyer', 'calc_type' => 'fixed', 'fixed_amount' => 0, 'receipt' => false, 'sort' => 120],
            ['code' => 'makaan', 'label' => 'In case Makaan (2% of land value)', 'label_ur' => 'مکان کی صورت میں (2٪)', 'payer' => 'seller', 'calc_type' => 'percent_land', 'rate' => 2.0, 'receipt' => true, 'default_on' => false, 'sort' => 130],
            ['code' => 'plra', 'label' => 'PLRA (3,600 upto 31 lac, +100 per lac)', 'label_ur' => 'پی ایل آر اے فیس', 'payer' => 'buyer', 'calc_type' => 'plra', 'params' => ['base' => 3600, 'upto' => 3_100_000, 'step' => 100, 'per' => 100_000], 'receipt' => true, 'sort' => 140],
            ['code' => 'registration_fee', 'label' => 'Registration Fee', 'label_ur' => 'رجسٹریشن فیس', 'payer' => 'buyer', 'calc_type' => 'percent', 'rate' => 0.5, 'receipt' => false, 'sort' => 150],
        ];
    }
}
