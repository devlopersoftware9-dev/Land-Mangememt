@extends('layouts.app')
@section('title', __('nav.registry'))
@section('content')
<h1 class="text-xl font-semibold mb-4">{{ __('nav.registry') }}</h1>

{{-- Plots whose payment is cleared but no demand yet = "Registry Pending" column --}}
<section class="bg-white rounded-lg shadow-sm p-4 mb-6">
    <h2 class="font-semibold mb-2">{{ __('registry.pending_plots') }} <span class="text-slate-500 ltr-num">({{ $pendingPlots->count() }})</span></h2>
    <div class="flex flex-wrap gap-2 text-sm">
        @forelse($pendingPlots as $p)
            <a href="{{ route('plots.show', $p) }}" class="border rounded px-2 py-1 hover:bg-orange-50">
                <span class="ltr-num font-medium">{{ $p->plot_no }}</span> · {{ $p->currentCustomer?->name }}
            </a>
        @empty
            <span class="text-slate-500">{{ __('app.nothing') }}</span>
        @endforelse
    </div>
</section>

<form class="flex gap-2 mb-3 text-sm">
    <select name="status" class="border rounded px-2 py-1" onchange="this.form.submit()">
        <option value="">{{ __('registry.open_files') }}</option>
        @foreach($statuses as $v => $l)<option value="{{ $v }}" @selected(request('status') === $v)>{{ $l }}</option>@endforeach
    </select>
</form>

<div class="bg-white rounded-lg shadow-sm overflow-x-auto">
<table class="w-full text-sm">
    <thead class="bg-slate-100 text-slate-600">
        <tr>
            <th class="text-start p-2">{{ __('registry.reference') }}</th>
            <th class="text-start p-2">{{ __('app.plot') }}</th>
            <th class="text-start p-2">{{ __('plots.customer') }}</th>
            <th class="text-start p-2">{{ __('registry.mode') }}</th>
            <th class="text-start p-2">{{ __('registry.step') }}</th>
            <th class="text-start p-2">{{ __('registry.with') }}</th>
            <th class="text-start p-2">{{ __('registry.demand_date') }}</th>
        </tr>
    </thead>
    <tbody>
    @forelse($cases as $c)
        <tr class="border-t hover:bg-slate-50">
            <td class="p-2"><a class="text-emerald-700 ltr-num" href="{{ route('registry.show', $c) }}">{{ $c->reference }}</a></td>
            <td class="p-2 ltr-num">{{ $c->plot->plot_no }}</td>
            <td class="p-2">{{ $c->customer?->name }}</td>
            <td class="p-2">{{ $c->mode->label() }}</td>
            <td class="p-2">{{ $c->status->label() }}</td>
            <td class="p-2 text-slate-500">{{ $c->status->isFinal() ? '—' : $c->status->actor()->label() }}</td>
            <td class="p-2 ltr-num">{{ $c->demand_date->format('d-m-Y') }}</td>
        </tr>
    @empty
        <tr><td colspan="7" class="p-4 text-slate-500">{{ __('app.nothing') }}</td></tr>
    @endforelse
    </tbody>
</table>
</div>
<div class="mt-4">{{ $cases->links() }}</div>
@endsection
