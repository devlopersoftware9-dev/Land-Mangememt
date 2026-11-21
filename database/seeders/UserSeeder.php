<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/** Creates the first admin. Password is printed once – change it after first login. */
class UserSeeder extends Seeder
{
    public function run(): void
    {
        if (User::where('role', UserRole::Admin->value)->exists()) {
            return;
        }
        $password = env('ADMIN_PASSWORD') ?: Str::password(12, symbols: false);

        User::create([
            'name' => 'Admin',
            'email' => env('ADMIN_EMAIL', 'admin@landms.local'),
            'role' => UserRole::Admin,
            'department' => 'Admin',
            'locale' => 'en',
            'password' => $password,
        ]);

        $this->command?->warn("Admin login: ".env('ADMIN_EMAIL', 'admin@landms.local')." / {$password}  (change it!)");
    }
}
