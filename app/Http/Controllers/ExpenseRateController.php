<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\ExpenseRate;
use Illuminate\Http\Request;

/** Settings > Registry rates: change tax % / fixed fees after a budget, no code change. */
class ExpenseRateController extends Controller
{
    public function index()
    {
        return view('settings.rates', ['rates' => ExpenseRate::orderBy('sort')->get()]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'rates' => 'required|array',
            'rates.*.rate' => 'nullable|numeric|min:0|max:100',
            'rates.*.non_filer_rate' => 'nullable|numeric|min:0|max:100',
            'rates.*.fixed_amount' => 'nullable|integer|min:0',
            'rates.*.default_on' => 'boolean',
            'rates.*.is_active' => 'boolean',
            'rates.*.receipt' => 'boolean',
            'rates.*.params' => 'nullable|array',
        ]);

        foreach ($data['rates'] as $id => $values) {
            $rate = ExpenseRate::find($id);
            if (! $rate) {
                continue;
            }
            $old = $rate->only(['rate', 'non_filer_rate', 'fixed_amount', 'params', 'default_on', 'is_active']);
            $rate->fill([
                'rate' => $values['rate'] ?? $rate->rate,
                'non_filer_rate' => $values['non_filer_rate'] ?? $rate->non_filer_rate,
                'fixed_amount' => $values['fixed_amount'] ?? $rate->fixed_amount,
                'params' => isset($values['params']) ? array_map('floatval', $values['params']) + ($rate->params ?? []) : $rate->params,
                'default_on' => (bool) ($values['default_on'] ?? false),
                'is_active' => (bool) ($values['is_active'] ?? false),
                'receipt' => (bool) ($values['receipt'] ?? false),
            ]);
            if ($rate->isDirty()) {
                $rate->save();
                AuditLog::record('rates.updated', $rate, $old, $rate->only(array_keys($old)));
            }
        }

        return back()->with('status', __('app.saved'));
    }
}
