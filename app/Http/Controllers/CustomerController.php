<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $customers = Customer::query()
            ->when($request->filled('q'), function ($q) use ($request) {
                $t = '%'.$request->string('q').'%';
                $q->where(fn ($w) => $w->where('name', 'like', $t)->orWhere('cnic', 'like', $t)->orWhere('phone', 'like', $t));
            })
            ->withCount('currentPlots')->orderBy('name')->paginate(50)->withQueryString();

        return view('customers.index', compact('customers'));
    }

    public function show(Customer $customer)
    {
        $customer->load(['currentPlots', 'ownerships.plot', 'registryCases.plot']);

        return view('customers.show', compact('customer'));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:150',
            'name_ur' => 'nullable|string|max:150',
            'relation' => 'nullable|in:s/o,d/o,w/o',
            'father_name' => 'nullable|string|max:150',
            'cnic' => ['nullable', 'regex:/^\d{5}-\d{7}-\d$/', 'unique:customers,cnic'],
            'phone' => 'nullable|string|max:30',
            'email' => 'nullable|email',
            'address' => 'nullable|string|max:500',
            'is_filer' => 'boolean',
            'nominee_name' => 'nullable|string|max:150',
            'nominee_cnic' => ['nullable', 'regex:/^\d{5}-\d{7}-\d$/'],
            'nominee_relation' => 'nullable|string|max:50',
        ]);
        $customer = Customer::create($data + ['relation' => $data['relation'] ?? 's/o']);
        AuditLog::record('customer.created', $customer);

        return back()->with('status', __('app.saved'))->with('new_customer_id', $customer->id);
    }
}
