<?php

namespace Database\Seeders;

use App\Models\ExpenseRate;
use App\Services\Expense\DefaultRates;
use Illuminate\Database\Seeder;

/** Registry expense lines from the Google Sheet. Existing rates are not overwritten. */
class ExpenseRateSeeder extends Seeder
{
    public function run(): void
    {
        foreach (DefaultRates::all() as $row) {
            ExpenseRate::firstOrCreate(['code' => $row['code']], $row + [
                'default_on' => $row['default_on'] ?? true,
                'is_active' => true,
            ]);
        }
    }
}
