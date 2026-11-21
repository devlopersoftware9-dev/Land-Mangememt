<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RegistryExpense extends Model
{
    protected $fillable = [
        'registry_case_id', 'kind', 'maliyat', 'area_marla', 'buyer_is_filer', 'seller_is_filer', 'land_value',
        'buyer_total', 'seller_total', 'grand_total', 'seller_name', 'buyer_name', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'buyer_is_filer' => 'boolean',
            'seller_is_filer' => 'boolean',
            'maliyat' => 'integer',
            'buyer_total' => 'integer',
            'seller_total' => 'integer',
            'grand_total' => 'integer',
        ];
    }

    public function registryCase(): BelongsTo { return $this->belongsTo(RegistryCase::class); }
    public function lines(): HasMany { return $this->hasMany(RegistryExpenseLine::class)->orderBy('sort'); }
}
