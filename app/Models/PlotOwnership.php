<?php

namespace App\Models;

use App\Enums\OwnershipEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One holding period. customer_id NULL = company. */
class PlotOwnership extends Model
{
    protected $fillable = ['plot_id', 'customer_id', 'started_on', 'ended_on', 'start_event', 'end_event'];

    protected function casts(): array
    {
        return [
            'started_on' => 'date',
            'ended_on' => 'date',
            'start_event' => OwnershipEvent::class,
            'end_event' => OwnershipEvent::class,
        ];
    }

    public function plot(): BelongsTo { return $this->belongsTo(Plot::class); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }

    public function holderName(): string
    {
        return $this->customer?->displayName() ?? __('app.company');
    }
}
