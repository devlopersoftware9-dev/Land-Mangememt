<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Intiqal extends Model
{
    protected $fillable = [
        'project_id', 'land_purchase_id', 'intiqal_no', 'intiqal_date', 'holder_name', 'holder_name_ur',
        'holder_cnic', 'holder_is_filer', 'holder_acquired_on', 'mauza', 'khasra_nos', 'area_sqft', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'intiqal_date' => 'date',
            'holder_acquired_on' => 'date',
            'holder_is_filer' => 'boolean',
            'area_sqft' => 'decimal:2',
        ];
    }

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function landPurchase(): BelongsTo { return $this->belongsTo(LandPurchase::class); }

    public function registryCases(): BelongsToMany
    {
        return $this->belongsToMany(RegistryCase::class, 'registry_case_intiqal')
            ->withPivot('area_sqft')->withTimestamps();
    }

    /** Area already issued (fard jari) from this intiqal, excluding cancelled cases. */
    public function issuedSqft(): float
    {
        return (float) $this->registryCases()->where('registry_cases.status', '!=', 'cancelled')
            ->sum('registry_case_intiqal.area_sqft');
    }

    public function balanceSqft(): float
    {
        return (float) $this->area_sqft - $this->issuedSqft();
    }

    /** 236-C applies when the holder acquired the land less than 3 years before the registry. */
    public function isWithinThreeYears(?\DateTimeInterface $on = null): bool
    {
        if (! $this->holder_acquired_on) {
            return true; // unknown -> assume tax applies (safer); user can untick
        }

        return $this->holder_acquired_on->copy()->addYears(3)->greaterThan($on ?? now());
    }
}
