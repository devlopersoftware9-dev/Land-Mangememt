<?php

namespace App\Http\Controllers;

use App\Http\Middleware\SetLocale;
use App\Models\Project;
use Illuminate\Http\Request;

class PreferenceController extends Controller
{
    public function locale(Request $request, string $locale)
    {
        abort_unless(in_array($locale, SetLocale::SUPPORTED, true), 404);
        $request->session()->put('locale', $locale);
        $request->user()?->forceFill(['locale' => $locale])->save();

        return back();
    }

    public function project(Request $request)
    {
        $project = Project::where('is_active', true)->findOrFail($request->integer('project_id'));
        $request->session()->put('project_id', $project->id);

        return redirect()->route('dashboard');
    }
}
