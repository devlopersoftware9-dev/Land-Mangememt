<?php

namespace App\Models;

use App\Enums\RegistryMode;
use App\Enums\RegistryStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * One registry file: demand -> director approval -> fard -> (A) handover fard
 * or (B) expense approval -> registry -> record -> handover.
 * Status changes only through App\Services\Workflow\RegistryWorkflow.
 */
class RegistryCase extends Model
{
    protected $fillable = [
        'reference', 'plot_id', 'customer_id', 'mode', 'demand_date', 'area_marla', 'area_sqft', 'maliyat',
        'seller_name', 'fard_no', 'registry_no', 'registry_date', 'registry_office', 'buyer_intiqal_no', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'mode' => RegistryMode::class,
            'status' => RegistryStatus::class,
            'demand_date' => 'date',
            'fard_jari_at' => 'datetime',
            'fard_received_on' => 'date',
            'fard_handed_over_on' => 'date',
            'registry_date' => 'date',
            'registry_recorded_on' => 'date',
            'handed_over_on' => 'date',
            'expense_paid' => 'boolean',
            'expense_paid_at' => 'datetime',
            'area_marla' => 'decimal:2',
            'area_sqft' => 'decimal:2',
            'maliyat' => 'integer',
        ];
    }

    public function plot(): BelongsTo { return $this->belongsTo(Plot::class); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function approvals(): HasMany { return $this->hasMany(ApprovalRequest::class)->latest(); }
    public function expenses(): HasMany { return $this->hasMany(RegistryExpense::class)->latest(); }
    public function documents(): MorphMany { return $this->morphMany(Document::class, 'documentable'); }

    public function intiqals(): BelongsToMany
    {
        return $this->belongsToMany(Intiqal::class, 'registry_case_intiqal')->withPivot('area_sqft')->withTimestamps();
    }

    public static function nextReference(): string
    {
        $prefix = config('landms.request_prefix', 'REQ-');
        $last = static::query()->where('reference', 'like', $prefix.'%')->orderByDesc('id')->value('reference');
        $n = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }
}
