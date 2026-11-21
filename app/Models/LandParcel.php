<?php

namespace App\Models;

use App\Enums\ParcelType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Non-saleable area: road, park, masjid, green belt, graveyard ... */
class LandParcel extends Model
{
    protected $fillable = ['project_id', 'type', 'name', 'name_ur', 'area_sqft', 'width_ft', 'map_shape', 'notes'];

    protected function casts(): array
    {
        return [
            'type' => ParcelType::class,
            'map_shape' => 'array',
            'area_sqft' => 'decimal:2',
        ];
    }

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
}
