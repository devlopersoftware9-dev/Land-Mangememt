<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Route middleware:  ->middleware('role:accounts,land_management')  (admin always passes) */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        abort_unless($user && $user->is_active && $user->hasRole(...$roles), 403);

        return $next($request);
    }
}
