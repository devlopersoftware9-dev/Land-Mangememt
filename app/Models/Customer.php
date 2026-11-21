<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    protected $fillable = [
        'name', 'name_ur', 'relation', 'father_name', 'cnic', 'phone', 'email', 'address', 'is_filer',
        'nominee_name', 'nominee_cnic', 'nominee_relation', 'notes',
    ];

    protected function casts(): array
    {
        return ['is_filer' => 'boolean'];
    }

    public function currentPlots(): HasMany { return $this->hasMany(Plot::class, 'current_customer_id'); }
    public function ownerships(): HasMany { return $this->hasMany(PlotOwnership::class); }
    public function registryCases(): HasMany { return $this->hasMany(RegistryCase::class); }

    public function displayName(): string
    {
        return trim($this->name.($this->father_name ? " {$this->relation} {$this->father_name}" : ''));
    }
}
