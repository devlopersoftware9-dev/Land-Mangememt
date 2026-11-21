<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Street extends Model
{
    protected $fillable = ['project_id', 'number', 'name', 'width_ft'];

    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function plots(): HasMany { return $this->hasMany(Plot::class); }
}
