<?php

namespace App\Models;

use App\Enums\ExpensePayer;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegistryExpenseLine extends Model
{
    public $timestamps = false;

    protected $fillable = ['registry_expense_id', 'code', 'label', 'payer', 'rate', 'amount', 'receipt', 'is_manual', 'sort'];

    protected function casts(): array
    {
        return [
            'payer' => ExpensePayer::class,
            'receipt' => 'boolean',
            'is_manual' => 'boolean',
            'amount' => 'integer',
        ];
    }

    public function expense(): BelongsTo { return $this->belongsTo(RegistryExpense::class, 'registry_expense_id'); }
}
