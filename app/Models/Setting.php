<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['project_id', 'key', 'value'];

    /** Project setting -> global setting -> config fallback. */
    public static function get(string $key, mixed $default = null, ?int $projectId = null): mixed
    {
        if ($projectId) {
            $v = static::where('project_id', $projectId)->where('key', $key)->value('value');
            if ($v !== null) {
                return $v;
            }
        }
        $v = static::whereNull('project_id')->where('key', $key)->value('value');

        return $v ?? $default;
    }

    public static function put(string $key, mixed $value, ?int $projectId = null): void
    {
        static::updateOrCreate(['project_id' => $projectId, 'key' => $key], ['value' => $value]);
    }
}
