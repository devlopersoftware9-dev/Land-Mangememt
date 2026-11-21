<?php

namespace App\Models;

use App\Enums\OwnershipEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/** Append-only. Updating or deleting an event is blocked. */
class PlotEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['plot_id', 'event', 'from_customer_id', 'to_customer_id', 'event_date', 'reference', 'notes', 'meta', 'created_by'];

    protected function casts(): array
    {
        return [
            'event' => OwnershipEvent::class,
            'event_date' => 'date',
            'meta' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Plot history cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Plot history cannot be deleted.'));
    }

    public function plot(): BelongsTo { return $this->belongsTo(Plot::class); }
    public function fromCustomer(): BelongsTo { return $this->belongsTo(Customer::class, 'from_customer_id'); }
    public function toCustomer(): BelongsTo { return $this->belongsTo(Customer::class, 'to_customer_id'); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
