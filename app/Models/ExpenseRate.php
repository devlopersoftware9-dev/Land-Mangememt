<?php

namespace App\Models;

use App\Enums\ExpensePayer;
use App\Enums\RateCalcType;
use App\Services\Expense\RateDefinition;
use Illuminate\Database\Eloquent\Model;

/** Editable from Settings > Registry Rates (budget changes need no code change). */
class ExpenseRate extends Model
{
    protected $fillable = ['code', 'label', 'label_ur', 'payer', 'calc_type', 'rate', 'non_filer_rate', 'fixed_amount', 'params', 'receipt', 'default_on', 'sort', 'is_active'];

    protected function casts(): array
    {
        return [
            'payer' => ExpensePayer::class,
            'calc_type' => RateCalcType::class,
            'params' => 'array',
            'receipt' => 'boolean',
            'default_on' => 'boolean',
            'is_active' => 'boolean',
            'rate' => 'float',
            'non_filer_rate' => 'float',
            'fixed_amount' => 'integer',
        ];
    }

    public function toDefinition(): RateDefinition
    {
        return new RateDefinition(
            code: $this->code,
            label: app()->getLocale() === 'ur' && $this->label_ur ? $this->label_ur : $this->label,
            payer: $this->payer,
            calcType: $this->calc_type,
            rate: $this->rate,
            nonFilerRate: $this->non_filer_rate,
            fixedAmount: $this->fixed_amount,
            params: $this->params ?? [],
            receipt: $this->receipt,
            defaultOn: $this->default_on,
            sort: $this->sort,
        );
    }
}
