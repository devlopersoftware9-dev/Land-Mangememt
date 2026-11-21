<?php

namespace App\Providers;

use App\Services\Approval\ReplyParser;
use App\Services\Area\AreaConverter;
use App\Services\Expense\RegistryExpenseCalculator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(RegistryExpenseCalculator::class);
        $this->app->singleton(ReplyParser::class);
        $this->app->bind(AreaConverter::class, fn () => new AreaConverter(
            (int) config('landms.marla_sqft', 270),
            (int) config('landms.marla_per_kanal', 20),
        ));
    }

    public function boot(): void
    {
        Model::shouldBeStrict(false);
    }
}
