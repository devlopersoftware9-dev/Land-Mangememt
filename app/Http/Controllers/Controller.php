<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\Workflow\WorkflowException;
use Closure;
use Illuminate\Http\RedirectResponse;

abstract class Controller
{
    protected function project(): Project
    {
        $project = app()->bound('currentProject') ? app('currentProject') : null;
        abort_unless($project, 404, __('app.no_project'));

        return $project;
    }

    /** Run a workflow step; show its message as an error instead of a crash. */
    protected function attempt(Closure $action, string $success): RedirectResponse
    {
        try {
            $action();
        } catch (WorkflowException $e) {
            return back()->withErrors(['workflow' => $e->getMessage()])->withInput();
        }

        return back()->with('status', $success);
    }
}
