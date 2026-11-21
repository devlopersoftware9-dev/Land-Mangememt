<?php

namespace App\Http\Middleware;

use App\Models\Project;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

/** Which society/project the user is working in (switch from the top bar). */
class SetCurrentProject
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()) {
            $id = $request->session()->get('project_id');
            $project = $id ? Project::find($id) : null;
            $project ??= Project::where('is_active', true)->orderBy('id')->first();
            if ($project) {
                $request->session()->put('project_id', $project->id);
            }
            app()->instance('currentProject', $project);
            View::share('currentProject', $project);
            View::share('allProjects', Project::where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'name_ur']));
        }

        return $next($request);
    }
}
