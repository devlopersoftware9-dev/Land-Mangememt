<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Document extends Model
{
    protected $fillable = ['documentable_type', 'documentable_id', 'type', 'path', 'original_name', 'size', 'uploaded_by'];

    public function documentable(): MorphTo { return $this->morphTo(); }
}
