@extends('layouts.app')
@section('title', __('app.plot').' '.$plot->plot_no)
@section('content')
@php($s = $plot->sale_status->value)
@php($canAct = auth()->user()->hasRole('accounts'))
<div class="flex flex-wrap items-center gap-3 mb-4">
    <h1 class="text-xl font-semibold">{{ __('app.plot') }} <span class="ltr-num">{{ $plot->plot_no }}</span></h1>
    <span class="rounded-full px-3 py-0.5 text-sm text-white" style="background: {{ $plot->sale_status->color() }}">{{ $plot->sale_status->label() }}</span>
    <span class="rounded-full px-3 py-0.5 text-sm bg-slate-200">{{ $plot->construction_status->label() }}</span>
</div>

<div class="grid md:grid-cols-3 gap-6">
    {{-- Details --}}
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm space-y-1">
        <h2 class="font-semibold mb-2">{{ __('plots.details') }}</h2>
        <div>{{ __('plots.street') }}: <span class="ltr-num">{{ $plot->street?->number ?? '—' }}</span></div>
        <div>{{ __('plots.size') }}: <span class="ltr-num">{{ $plot->size_marla ?? '—' }} M</span>
            @if($plot->width_ft) <span class="ltr-num text-slate-500">({{ $plot->width_ft }} × {{ $plot->depth_ft }})</span>@endif</div>
        <div>{{ __('plots.category') }}: {{ $plot->category->label() }}</div>
        <div>{{ __('plots.customer') }}:
            @if($plot->currentCustomer)
                <a class="text-emerald-700" href="{{ route('customers.show', $plot->currentCustomer) }}">{{ $plot->currentCustomer->displayName() }}</a>
                <span class="ltr-num text-slate-500">{{ $plot->currentCustomer->cnic }}</span>
            @else {{ __('app.company') }} @endif
        </div>
        @if($plot->sold_on)<div>{{ __('plots.sold_on') }}: <span class="ltr-num">{{ $plot->sold_on->format('d-m-Y') }}</span></div>@endif
        @if($plot->payment_cleared_at)<div>{{ __('plots.payment_cleared_on') }}: <span class="ltr-num">{{ $plot->payment_cleared_at->format('d-m-Y') }}</span></div>@endif
        @if($case = $plot->activeRegistryCase())
            <div class="pt-2"><a class="text-emerald-700" href="{{ route('registry.show', $case) }}">{{ __('registry.open_case') }} {{ $case->reference }} · {{ $case->status->label() }}</a></div>
        @endif
    </section>

    {{-- Actions: only what is allowed in the current status --}}
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm md:col-span-2">
        <h2 class="font-semibold mb-3">{{ __('plots.actions') }}</h2>
        @if(! $canAct)
            <p class="text-slate-500">{{ __('app.read_only') }}</p>
        @else
        <div class="grid md:grid-cols-2 gap-4">
            @if($s === 'available')
                <form method="POST" action="{{ route('plots.sell', $plot) }}" class="border rounded p-3 space-y-2">@csrf
                    <div class="font-medium">{{ __('plots.sell') }}</div>
                    @include('plots.partials.customer-select')
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                    <input name="reference" placeholder="{{ __('plots.file_no') }}" class="border rounded px-2 py-1 w-full">
                    <button class="bg-emerald-700 text-white rounded px-3 py-1">{{ __('plots.sell') }}</button>
                </form>
            @endif

            @if($s === 'sold')
                <form method="POST" action="{{ route('plots.payment-clear', $plot) }}" class="border rounded p-3 space-y-2"
                      onsubmit="return confirm('{{ __('plots.confirm_payment_clear') }}')">@csrf
                    <div class="font-medium">{{ __('plots.payment_clear') }}</div>
                    <p class="text-slate-500">{{ __('plots.payment_clear_help') }}</p>
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                    <label class="flex items-center gap-2"><input type="checkbox" required> {{ __('plots.payment_clear_tick') }}</label>
                    <button class="bg-orange-600 text-white rounded px-3 py-1">{{ __('plots.payment_clear') }}</button>
                </form>
            @endif

            @if(in_array($s, ['sold', 'payment_cleared']))
                <form method="POST" action="{{ route('plots.transfer', $plot) }}" class="border rounded p-3 space-y-2">@csrf
                    <div class="font-medium">{{ __('plots.transfer') }}</div>
                    @include('plots.partials.customer-select')
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                    <input name="reference" placeholder="{{ __('plots.file_no') }}" class="border rounded px-2 py-1 w-full">
                    <button class="bg-slate-800 text-white rounded px-3 py-1">{{ __('plots.transfer') }}</button>
                </form>
                <form method="POST" action="{{ route('plots.cancel', $plot) }}" class="border rounded p-3 space-y-2" onsubmit="return confirm('{{ __('app.are_you_sure') }}')">@csrf
                    <div class="font-medium">{{ __('plots.cancel_sale') }}</div>
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                    <textarea name="notes" placeholder="{{ __('app.notes') }}" class="border rounded px-2 py-1 w-full"></textarea>
                    <button class="bg-red-600 text-white rounded px-3 py-1">{{ __('plots.cancel_sale') }}</button>
                </form>
            @endif

            @if(in_array($s, ['sold', 'payment_cleared', 'registered']))
                <form method="POST" action="{{ route('plots.repurchase', $plot) }}" class="border rounded p-3 space-y-2" onsubmit="return confirm('{{ __('app.are_you_sure') }}')">@csrf
                    <div class="font-medium">{{ __('plots.repurchase') }}</div>
                    <p class="text-slate-500">{{ __('plots.repurchase_help') }}</p>
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                    <input name="reference" placeholder="{{ __('plots.reference') }}" class="border rounded px-2 py-1 w-full">
                    <textarea name="notes" placeholder="{{ __('app.notes') }}" class="border rounded px-2 py-1 w-full"></textarea>
                    <button class="bg-slate-800 text-white rounded px-3 py-1">{{ __('plots.repurchase') }}</button>
                </form>
            @endif

            @if($s === 'payment_cleared')
                <form method="POST" action="{{ route('registry.store') }}" class="border rounded p-3 space-y-2">@csrf
                    <input type="hidden" name="plot_id" value="{{ $plot->id }}">
                    <div class="font-medium">{{ __('registry.new_demand') }}</div>
                    <select name="mode" class="border rounded px-2 py-1 w-full">
                        @foreach(\App\Enums\RegistryMode::options() as $v => $l)<option value="{{ $v }}">{{ $l }}</option>@endforeach
                    </select>
                    <input type="date" name="demand_date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                    <input type="number" name="maliyat" placeholder="{{ __('registry.maliyat') }}" required class="border rounded px-2 py-1 w-full ltr-num">
                    <button class="bg-purple-700 text-white rounded px-3 py-1">{{ __('registry.create_demand') }}</button>
                </form>
            @endif

            <form method="POST" action="{{ route('plots.construction', $plot) }}" class="border rounded p-3 space-y-2">@csrf
                <div class="font-medium">{{ __('plots.construction') }}</div>
                <select name="construction_status" class="border rounded px-2 py-1 w-full">
                    @foreach($constructionStatuses as $v => $l)<option value="{{ $v }}" @selected($plot->construction_status->value === $v)>{{ $l }}</option>@endforeach
                </select>
                <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1 w-full">
                <button class="bg-slate-600 text-white rounded px-3 py-1">{{ __('app.save') }}</button>
            </form>
        </div>
        @endif
    </section>
</div>

{{-- Ownership chain --}}
<section class="bg-white rounded-lg shadow-sm p-4 mt-6">
    <h2 class="font-semibold mb-3">{{ __('plots.ownership_chain') }}</h2>
    <ol class="flex flex-wrap items-center gap-2 text-sm">
        @forelse($plot->ownerships as $o)
            <li class="rounded border px-3 py-1 {{ $o->ended_on ? 'bg-slate-50' : 'bg-emerald-50 border-emerald-300' }}">
                <div class="font-medium">{{ $o->holderName() }}</div>
                <div class="text-xs text-slate-500 ltr-num">{{ $o->started_on->format('d-m-Y') }} → {{ $o->ended_on?->format('d-m-Y') ?? __('app.now') }}</div>
                @if($o->end_event)<div class="text-xs">{{ $o->end_event->label() }}</div>@endif
            </li>
            @if(! $loop->last)<li class="text-slate-400">{{ app()->getLocale() === 'ur' ? '←' : '→' }}</li>@endif
        @empty
            <li class="text-slate-500">{{ __('app.company') }}</li>
        @endforelse
    </ol>
</section>

{{-- Full timeline --}}
<section class="bg-white rounded-lg shadow-sm p-4 mt-6">
    <h2 class="font-semibold mb-3">{{ __('plots.history') }}</h2>
    <table class="w-full text-sm">
        <tr class="text-slate-500 border-b"><th class="text-start py-1">{{ __('app.date') }}</th><th class="text-start">{{ __('plots.event') }}</th><th class="text-start">{{ __('plots.from') }}</th><th class="text-start">{{ __('plots.to') }}</th><th class="text-start">{{ __('plots.reference') }}</th><th class="text-start">{{ __('app.by') }}</th></tr>
        @foreach($plot->events as $e)
            <tr class="border-b align-top">
                <td class="py-1 ltr-num">{{ $e->event_date->format('d-m-Y') }}</td>
                <td>{{ $e->event->label() }}@if($e->notes)<div class="text-xs text-slate-500">{{ $e->notes }}</div>@endif</td>
                <td>{{ $e->fromCustomer?->name ?? ($e->event->value === 'sold' ? __('app.company') : '') }}</td>
                <td>{{ $e->toCustomer?->name ?? (in_array($e->event->value, ['repurchased', 'cancelled']) ? __('app.company') : '') }}</td>
                <td class="ltr-num">{{ $e->reference }}</td>
                <td class="text-slate-500">{{ $e->creator?->name }}</td>
            </tr>
        @endforeach
    </table>
</section>
@endsection
