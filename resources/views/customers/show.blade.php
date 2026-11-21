@extends('layouts.app')
@section('title', $customer->name)
@section('content')
<h1 class="text-xl font-semibold mb-1">{{ $customer->displayName() }}</h1>
<p class="text-sm text-slate-500 mb-4"><span class="ltr-num">{{ $customer->cnic }} · {{ $customer->phone }}</span> · {{ $customer->address }}
    · {{ $customer->is_filer ? __('registry.filer') : __('registry.non_filer') }}</p>

<div class="grid md:grid-cols-2 gap-6">
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm">
        <h2 class="font-semibold mb-2">{{ __('customers.current_plots') }}</h2>
        @forelse($customer->currentPlots as $p)
            <a href="{{ route('plots.show', $p) }}" class="flex justify-between border-b py-1"><span class="ltr-num">{{ $p->plot_no }}</span><span>{{ $p->sale_status->label() }}</span></a>
        @empty <p class="text-slate-500">{{ __('app.nothing') }}</p> @endforelse
    </section>
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm">
        <h2 class="font-semibold mb-2">{{ __('customers.history') }}</h2>
        @forelse($customer->ownerships as $o)
            <div class="flex justify-between border-b py-1">
                <a class="ltr-num text-emerald-700" href="{{ route('plots.show', $o->plot) }}">{{ $o->plot->plot_no }}</a>
                <span class="ltr-num">{{ $o->started_on->format('d-m-Y') }} → {{ $o->ended_on?->format('d-m-Y') ?? __('app.now') }}</span>
                <span>{{ $o->end_event?->label() }}</span>
            </div>
        @empty <p class="text-slate-500">{{ __('app.nothing') }}</p> @endforelse
    </section>
</div>
@endsection
