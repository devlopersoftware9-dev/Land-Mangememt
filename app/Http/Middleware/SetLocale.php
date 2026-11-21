<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** English / Urdu per user. Urdu pages render right-to-left (see layouts/app.blade.php). */
class SetLocale
{
    public const SUPPORTED = ['en', 'ur'];

    public function handle(Request $request, Closure $next): Response
    {
        $locale = $request->session()->get('locale') ?? $request->user()?->locale ?? config('app.locale');
        if (! in_array($locale, self::SUPPORTED, true)) {
            $locale = 'en';
        }
        app()->setLocale($locale);

        return $next($request);
    }
}
