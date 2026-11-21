<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = ['code', 'name', 'name_ur', 'developer', 'location', 'mauza', 'marla_sqft', 'map_file', 'map_svg', 'is_active', 'notes'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function landPurchases(): HasMany { return $this->hasMany(LandPurchase::class); }
    public function intiqals(): HasMany { return $this->hasMany(Intiqal::class); }
    public function parcels(): HasMany { return $this->hasMany(LandParcel::class); }
    public function streets(): HasMany { return $this->hasMany(Street::class); }
    public function plots(): HasMany { return $this->hasMany(Plot::class); }

    /**
     * Area summary: total purchased, non-saleable (by type), saleable (plots).
     *
     * @return array{total_sqft: float, non_saleable_sqft: float, saleable_sqft: float, by_type: array<string,float>, unallocated_sqft: float}
     */
    public function areaSummary(): array
    {
        $total = (float) $this->landPurchases()->sum('area_sqft');
        $byType = $this->parcels()->selectRaw('type, SUM(area_sqft) as total')->groupBy('type')
            ->pluck('total', 'type')->map(fn ($v) => (float) $v)->all();
        $nonSaleable = array_sum($byType);
        $saleable = (float) $this->plots()->sum('area_sqft');

        return [
            'total_sqft' => $total,
            'by_type' => $byType,
            'non_saleable_sqft' => $nonSaleable,
            'saleable_sqft' => $saleable,
            'unallocated_sqft' => $total - $nonSaleable - $saleable,
        ];
    }
}
