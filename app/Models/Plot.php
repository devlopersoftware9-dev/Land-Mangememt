<?php

namespace App\Models;

use App\Enums\ConstructionStatus;
use App\Enums\PlotCategory;
use App\Enums\PlotSaleStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A saleable plot. Status changes must go through App\Services\Workflow\PlotService
 * so that history (plot_events / plot_ownerships) is always written.
 */
class Plot extends Model
{
    protected $fillable = [
        'project_id', 'street_id', 'plot_no', 'category', 'size_marla', 'area_sqft', 'width_ft', 'depth_ft',
        'is_corner', 'is_park_facing', 'is_main_road', 'map_shape', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'category' => PlotCategory::class,
            'sale_status' => PlotSaleStatus::class,
            'construction_status' => ConstructionStatus::class,
            'is_corner' => 'boolean',
            'is_park_facing' => 'boolean',
            'is_main_road' => 'boolean',
            'map_shape' => 'array',
            'sold_on' => 'date',
            'payment_cleared_at' => 'datetime',
            'size_marla' => 'decimal:2',
            'area_sqft' => 'decimal:2',
        ];
    }

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function street(): BelongsTo { return $this->belongsTo(Street::class); }
    public function currentCustomer(): BelongsTo { return $this->belongsTo(Customer::class, 'current_customer_id'); }
    public function ownerships(): HasMany { return $this->hasMany(PlotOwnership::class)->orderBy('started_on')->orderBy('id'); }
    public function events(): HasMany { return $this->hasMany(PlotEvent::class)->orderBy('event_date')->orderBy('id'); }
    public function registryCases(): HasMany { return $this->hasMany(RegistryCase::class); }

    public function activeRegistryCase(): ?RegistryCase
    {
        return $this->registryCases()->whereNotIn('status', ['handed_over', 'client_registry_recorded', 'cancelled'])->latest()->first();
    }

    public function scopeStatus(Builder $q, PlotSaleStatus $status): Builder
    {
        return $q->where('sale_status', $status->value);
    }

    /** Sort "21.9" before "21.10". */
    public function scopeNaturalOrder(Builder $q): Builder
    {
        return $q->orderByRaw("CAST(SUBSTRING_INDEX(plot_no, '.', 1) AS UNSIGNED), CAST(SUBSTRING_INDEX(plot_no, '.', -1) AS UNSIGNED), plot_no");
    }
}
