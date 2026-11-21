@extends('layouts.app')
@section('title', __('nav.dashboard'))
@section('content')
<h1 class="text-xl font-semibold mb-4">{{ app()->getLocale() === 'ur' && $project->name_ur ? $project->name_ur : $project->name }}</h1>

{{-- Plot status tiles --}}
<div class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
    @foreach($statuses as $s)
        <a href="{{ route('plots.index', ['status' => $s->value]) }}" class="bg-white rounded-lg shadow-sm p-4 border-t-4" style="border-color: {{ $s->color() }}">
            <div class="text-sm text-slate-500">{{ $s->label() }}</div>
            <div class="text-2xl font-semibold ltr-num">{{ $plotCounts[$s->value] ?? 0 }}</div>
        </a>
    @endforeach
</div>

<div class="grid md:grid-cols-2 gap-6">
    {{-- Approvals waiting for our Check & Review --}}
    <section class="bg-white rounded-lg shadow-sm p-4">
        <h2 class="font-semibold mb-2">{{ __('dashboard.to_verify') }}
            <span class="text-sm text-slate-500">· {{ __('dashboard.waiting_director', ['n' => $waitingDirector]) }}</span></h2>
        @forelse($toVerify as $a)
            <a href="{{ route('approvals.show', $a) }}" class="flex justify-between border-b py-2 text-sm hover:bg-slate-50">
                <span>{{ __('app.plot') }} <b class="ltr-num">{{ $a->registryCase->plot->plot_no }}</b> · {{ $a->type->label() }}</span>
                <span class="font-medium {{ $a->status->value === 'director_approved' ? 'text-emerald-700' : ($a->status->value === 'director_rejected' ? 'text-red-700' : 'text-amber-700') }}">{{ $a->status->label() }}</span>
            </a>
        @empty
            <p class="text-sm text-slate-500">{{ __('app.nothing') }}</p>
        @endforelse
    </section>

    {{-- Registry files: which step, who holds them --}}
    <section class="bg-white rounded-lg shadow-sm p-4">
        <h2 class="font-semibold mb-2">{{ __('dashboard.registry_files') }}</h2>
        @forelse($caseCounts as $status => $n)
            @php($st = \App\Enums\RegistryStatus::from($status))
            <a href="{{ route('registry.index', ['status' => $status]) }}" class="flex justify-between border-b py-2 text-sm hover:bg-slate-50">
                <span>{{ $st->label() }} <span class="text-slate-400">({{ $st->actor()->label() }})</span></span>
                <span class="ltr-num font-medium">{{ $n }}</span>
            </a>
        @empty
            <p class="text-sm text-slate-500">{{ __('app.nothing') }}</p>
        @endforelse
    </section>

    {{-- Area summary --}}
    <section class="bg-white rounded-lg shadow-sm p-4">
        <h2 class="font-semibold mb-2">{{ __('dashboard.area') }}</h2>
        <table class="w-full text-sm">
            <tr class="border-b"><td class="py-1">{{ __('land.total_purchased') }}</td><td class="ltr-num text-end">{{ $conv->format($area['total_sqft']) }}</td></tr>
            @foreach($area['by_type'] as $type => $sqft)
                <tr class="border-b text-slate-600"><td class="py-1 ps-4">{{ \App\Enums\ParcelType::from($type)->label() }}</td><td class="ltr-num text-end">{{ $conv->format($sqft) }}</td></tr>
            @endforeach
            <tr class="border-b"><td class="py-1">{{ __('land.non_saleable') }}</td><td class="ltr-num text-end">{{ $conv->format($area['non_saleable_sqft']) }}</td></tr>
            <tr class="border-b font-medium"><td class="py-1">{{ __('land.saleable') }}</td><td class="ltr-num text-end">{{ $conv->format($area['saleable_sqft']) }}</td></tr>
            <tr><td class="py-1 text-slate-500">{{ __('land.unallocated') }}</td><td class="ltr-num text-end text-slate-500">{{ $conv->format(max(0, $area['unallocated_sqft'])) }}</td></tr>
        </table>
    </section>

    {{-- Intiqal balances --}}
    <section class="bg-white rounded-lg shadow-sm p-4">
        <h2 class="font-semibold mb-2">{{ __('land.intiqal_balance') }}</h2>
        <table class="w-full text-sm">
            <tr class="text-slate-500 border-b"><th class="text-start py-1">{{ __('land.intiqal_no') }}</th><th class="text-start">{{ __('land.holder') }}</th><th class="text-end">{{ __('land.balance') }}</th></tr>
            @forelse($intiqals as $row)
                <tr class="border-b"><td class="py-1 ltr-num">{{ $row['intiqal']->intiqal_no }}</td><td>{{ $row['intiqal']->holder_name }}</td>
                    <td class="text-end ltr-num {{ $row['balance'] <= 0 ? 'text-red-600' : '' }}">{{ $conv->format(max(0, $row['balance'])) }}</td></tr>
            @empty
                <tr><td colspan="3" class="py-2 text-slate-500">{{ __('app.nothing') }}</td></tr>
            @endforelse
        </table>
    </section>

    {{-- Construction --}}
    <section class="bg-white rounded-lg shadow-sm p-4">
        <h2 class="font-semibold mb-2">{{ __('dashboard.construction') }}</h2>
        @foreach(\App\Enums\ConstructionStatus::cases() as $c)
            <div class="flex justify-between border-b py-1 text-sm"><span>{{ $c->label() }}</span><span class="ltr-num">{{ $construction[$c->value] ?? 0 }}</span></div>
        @endforeach
    </section>
</div>
@endsection
