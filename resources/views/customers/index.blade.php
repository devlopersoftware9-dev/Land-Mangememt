@extends('layouts.app')
@section('title', __('nav.customers'))
@section('content')
<h1 class="text-xl font-semibold mb-4">{{ __('nav.customers') }}</h1>
<form class="mb-3 text-sm flex gap-2">
    <input name="q" value="{{ request('q') }}" placeholder="{{ __('customers.search') }}" class="border rounded px-3 py-1">
    <button class="bg-slate-800 text-white rounded px-3">{{ __('app.filter') }}</button>
</form>
<div class="bg-white rounded-lg shadow-sm overflow-x-auto mb-6">
<table class="w-full text-sm">
    <thead class="bg-slate-100 text-slate-600"><tr>
        <th class="text-start p-2">{{ __('customers.name') }}</th><th class="text-start p-2">{{ __('customers.cnic') }}</th>
        <th class="text-start p-2">{{ __('customers.phone') }}</th><th class="text-start p-2">{{ __('customers.plots') }}</th><th class="text-start p-2">{{ __('registry.filer') }}</th>
    </tr></thead>
    <tbody>
    @foreach($customers as $c)
        <tr class="border-t hover:bg-slate-50">
            <td class="p-2"><a class="text-emerald-700" href="{{ route('customers.show', $c) }}">{{ $c->displayName() }}</a></td>
            <td class="p-2 ltr-num">{{ $c->cnic }}</td><td class="p-2 ltr-num">{{ $c->phone }}</td>
            <td class="p-2 ltr-num">{{ $c->current_plots_count }}</td><td class="p-2">{{ $c->is_filer ? '✔' : '' }}</td>
        </tr>
    @endforeach
    </tbody>
</table>
</div>
{{ $customers->links() }}

@if(auth()->user()->hasRole('accounts'))
<section id="new" class="bg-white rounded-lg shadow-sm p-4 mt-6">
    <h2 class="font-semibold mb-3">{{ __('customers.new') }}</h2>
    <form method="POST" action="{{ route('customers.store') }}" class="grid md:grid-cols-3 gap-3 text-sm">@csrf
        <input name="name" required placeholder="{{ __('customers.name') }}" class="border rounded px-2 py-1">
        <input name="name_ur" placeholder="{{ __('customers.name_ur') }}" dir="rtl" class="border rounded px-2 py-1">
        <div class="flex gap-1">
            <select name="relation" class="border rounded px-1"><option>s/o</option><option>d/o</option><option>w/o</option></select>
            <input name="father_name" placeholder="{{ __('customers.father_name') }}" class="border rounded px-2 py-1 flex-1">
        </div>
        <input name="cnic" placeholder="00000-0000000-0" pattern="\d{5}-\d{7}-\d" class="border rounded px-2 py-1 ltr-num">
        <input name="phone" placeholder="{{ __('customers.phone') }}" class="border rounded px-2 py-1 ltr-num">
        <input name="email" type="email" placeholder="Email" class="border rounded px-2 py-1 ltr-num">
        <input name="address" placeholder="{{ __('customers.address') }}" class="border rounded px-2 py-1 md:col-span-2">
        <label class="flex items-center gap-2"><input type="hidden" name="is_filer" value="0"><input type="checkbox" name="is_filer" value="1"> {{ __('registry.filer') }}</label>
        <input name="nominee_name" placeholder="{{ __('customers.nominee') }}" class="border rounded px-2 py-1">
        <input name="nominee_cnic" placeholder="{{ __('customers.nominee_cnic') }}" class="border rounded px-2 py-1 ltr-num">
        <input name="nominee_relation" placeholder="{{ __('customers.nominee_relation') }}" class="border rounded px-2 py-1">
        <div><button class="bg-emerald-700 text-white rounded px-4 py-1">{{ __('app.save') }}</button></div>
    </form>
</section>
@endif
@endsection
