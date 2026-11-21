<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Land bought from a seller. Deliberately no price columns, only ticks. */
class LandPurchase extends Model
{
    protected $fillable = [
        'project_id', 'seller_name', 'seller_name_ur', 'seller_father_name', 'seller_cnic', 'seller_phone',
        'mauza', 'khewat_no', 'khatooni_no', 'khasra_nos', 'area_sqft', 'agreement_date', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'agreement_date' => 'date',
            'payment_cleared' => 'boolean',
            'payment_cleared_at' => 'datetime',
            'intiqal_done' => 'boolean',
            'intiqal_done_at' => 'datetime',
            'area_sqft' => 'decimal:2',
        ];
    }

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function intiqals(): HasMany { return $this->hasMany(Intiqal::class); }
}
