@extends('layouts.app')
@section('title', __('nav.land'))
@section('content')
@php($canEdit = auth()->user()->hasRole('land_management'))
<h1 class="text-xl font-semibold mb-4">{{ __('nav.land') }}</h1>

<div class="grid md:grid-cols-4 gap-3 mb-6 text-sm">
    <div class="bg-white rounded-lg shadow-sm p-3">{{ __('land.total_purchased') }}<div class="text-lg font-semibold ltr-num">{{ $conv->format($area['total_sqft']) }}</div></div>
    <div class="bg-white rounded-lg shadow-sm p-3">{{ __('land.non_saleable') }}<div class="text-lg font-semibold ltr-num">{{ $conv->format($area['non_saleable_sqft']) }}</div></div>
    <div class="bg-white rounded-lg shadow-sm p-3">{{ __('land.saleable') }}<div class="text-lg font-semibold ltr-num">{{ $conv->format($area['saleable_sqft']) }}</div></div>
    <div class="bg-white rounded-lg shadow-sm p-3">{{ __('land.unallocated') }}<div class="text-lg font-semibold ltr-num">{{ $conv->format(max(0, $area['unallocated_sqft'])) }}</div></div>
</div>

{{-- 1. Land purchase (ticks only) --}}
<section class="bg-white rounded-lg shadow-sm p-4 mb-6">
    <h2 class="font-semibold mb-3">{{ __('land.purchases') }}</h2>
    <table class="w-full text-sm">
        <tr class="text-slate-500 border-b"><th class="text-start py-1">{{ __('land.seller') }}</th><th class="text-start">{{ __('land.mauza') }} / {{ __('land.khasra') }}</th><th class="text-start">{{ __('land.area') }}</th><th>{{ __('land.payment_clear') }}</th><th>{{ __('land.intiqal_done') }}</th></tr>
        @forelse($purchases as $p)
            <tr class="border-b">
                <td class="py-1">{{ $p->seller_name }} <span class="ltr-num text-slate-500">{{ $p->seller_cnic }}</span></td>
                <td>{{ $p->mauza }} <span class="ltr-num">{{ $p->khasra_nos }}</span></td>
                <td class="ltr-num">{{ $conv->format($p->area_sqft) }}</td>
                @foreach(['payment_cleared', 'intiqal_done'] as $f)
                    <td class="text-center">
                        @if($canEdit)
                        <form method="POST" action="{{ route('land.purchases.tick', $p) }}">@csrf<input type="hidden" name="field" value="{{ $f }}">
                            <button class="text-lg" title="{{ $p->{$f.'_at'}?->format('d-m-Y') }}">{{ $p->{$f} ? '✅' : '⬜' }}</button></form>
                        @else {{ $p->{$f} ? '✅' : '⬜' }} @endif
                    </td>
                @endforeach
            </tr>
        @empty <tr><td colspan="5" class="py-2 text-slate-500">{{ __('app.nothing') }}</td></tr> @endforelse
    </table>
    @if($canEdit)
    <details class="mt-3"><summary class="cursor-pointer text-emerald-700 text-sm">+ {{ __('land.add_purchase') }}</summary>
        <form method="POST" action="{{ route('land.purchases.store') }}" class="grid md:grid-cols-4 gap-2 text-sm mt-2">@csrf
            <input name="seller_name" required placeholder="{{ __('land.seller') }}" class="border rounded px-2 py-1">
            <input name="seller_father_name" placeholder="{{ __('customers.father_name') }}" class="border rounded px-2 py-1">
            <input name="seller_cnic" placeholder="00000-0000000-0" class="border rounded px-2 py-1 ltr-num">
            <input name="seller_phone" placeholder="{{ __('customers.phone') }}" class="border rounded px-2 py-1 ltr-num">
            <input name="mauza" placeholder="{{ __('land.mauza') }}" class="border rounded px-2 py-1">
            <input name="khewat_no" placeholder="{{ __('land.khewat') }}" class="border rounded px-2 py-1 ltr-num">
            <input name="khatooni_no" placeholder="{{ __('land.khatooni') }}" class="border rounded px-2 py-1 ltr-num">
            <input name="khasra_nos" placeholder="{{ __('land.khasra') }}" class="border rounded px-2 py-1 ltr-num">
            @include('land.partials.area')
            <input type="date" name="agreement_date" class="border rounded px-2 py-1">
            <div><button class="bg-emerald-700 text-white rounded px-4 py-1">{{ __('app.save') }}</button></div>
        </form>
    </details>
    @endif
</section>

{{-- 2. Intiqals with balance --}}
<section class="bg-white rounded-lg shadow-sm p-4 mb-6">
    <h2 class="font-semibold mb-3">{{ __('land.intiqals') }}</h2>
    <table class="w-full text-sm">
        <tr class="text-slate-500 border-b"><th class="text-start py-1">{{ __('land.intiqal_no') }}</th><th class="text-start">{{ __('app.date') }}</th><th class="text-start">{{ __('land.holder') }}</th><th class="text-start">{{ __('land.area') }}</th><th class="text-start">{{ __('land.issued') }}</th><th class="text-start">{{ __('land.balance') }}</th></tr>
        @forelse($intiqals as $i)
            @php($issued = $i->issuedSqft())
            <tr class="border-b">
                <td class="py-1 ltr-num">{{ $i->intiqal_no }}</td><td class="ltr-num">{{ $i->intiqal_date?->format('d-m-Y') }}</td>
                <td>{{ $i->holder_name }} <span class="text-xs text-slate-500">{{ $i->holder_is_filer ? __('registry.filer') : __('registry.non_filer') }}</span></td>
                <td class="ltr-num">{{ $conv->format($i->area_sqft) }}</td><td class="ltr-num">{{ $conv->format($issued) }}</td>
                <td class="ltr-num font-medium">{{ $conv->format(max(0, $i->area_sqft - $issued)) }}</td>
            </tr>
        @empty <tr><td colspan="6" class="py-2 text-slate-500">{{ __('app.nothing') }}</td></tr> @endforelse
    </table>
    @if($canEdit)
    <details class="mt-3"><summary class="cursor-pointer text-emerald-700 text-sm">+ {{ __('land.add_intiqal') }}</summary>
        <form method="POST" action="{{ route('land.intiqals.store') }}" class="grid md:grid-cols-4 gap-2 text-sm mt-2">@csrf
            <input name="intiqal_no" required placeholder="{{ __('land.intiqal_no') }}" class="border rounded px-2 py-1 ltr-num">
            <input type="date" name="intiqal_date" class="border rounded px-2 py-1">
            <input name="holder_name" required placeholder="{{ __('land.holder') }}" class="border rounded px-2 py-1">
            <input name="holder_cnic" placeholder="00000-0000000-0" class="border rounded px-2 py-1 ltr-num">
            <label class="flex items-center gap-2"><input type="hidden" name="holder_is_filer" value="0"><input type="checkbox" name="holder_is_filer" value="1" checked> {{ __('registry.filer') }}</label>
            <label>{{ __('land.acquired_on') }} <input type="date" name="holder_acquired_on" class="border rounded px-2 py-1"></label>
            <select name="land_purchase_id" class="border rounded px-2 py-1"><option value="">{{ __('land.link_purchase') }}</option>
                @foreach($purchases as $p)<option value="{{ $p->id }}">{{ $p->seller_name }} – {{ $p->khasra_nos }}</option>@endforeach</select>
            <input name="khasra_nos" placeholder="{{ __('land.khasra') }}" class="border rounded px-2 py-1 ltr-num">
            @include('land.partials.area')
            <div><button class="bg-emerald-700 text-white rounded px-4 py-1">{{ __('app.save') }}</button></div>
        </form>
    </details>
    @endif
</section>

{{-- 3. Non-saleable --}}
<section class="bg-white rounded-lg shadow-sm p-4">
    <h2 class="font-semibold mb-3">{{ __('land.parcels') }}</h2>
    <table class="w-full text-sm">
        <tr class="text-slate-500 border-b"><th class="text-start py-1">{{ __('land.type') }}</th><th class="text-start">{{ __('customers.name') }}</th><th class="text-start">{{ __('land.area') }}</th><th class="text-start">{{ __('land.width') }}</th></tr>
        @forelse($parcels as $p)
            <tr class="border-b"><td class="py-1">{{ $p->type->label() }}</td><td>{{ $p->name }}</td><td class="ltr-num">{{ $conv->format($p->area_sqft) }}</td><td class="ltr-num">{{ $p->width_ft ? $p->width_ft.' ft' : '' }}</td></tr>
        @empty <tr><td colspan="4" class="py-2 text-slate-500">{{ __('app.nothing') }}</td></tr> @endforelse
    </table>
    @if($canEdit)
    <details class="mt-3"><summary class="cursor-pointer text-emerald-700 text-sm">+ {{ __('land.add_parcel') }}</summary>
        <form method="POST" action="{{ route('land.parcels.store') }}" class="grid md:grid-cols-4 gap-2 text-sm mt-2">@csrf
            <select name="type" class="border rounded px-2 py-1">@foreach($parcelTypes as $v => $l)<option value="{{ $v }}">{{ $l }}</option>@endforeach</select>
            <input name="name" required placeholder="{{ __('customers.name') }}" class="border rounded px-2 py-1">
            @include('land.partials.area')
            <input type="number" step="0.01" name="width_ft" placeholder="{{ __('land.width') }} (ft)" class="border rounded px-2 py-1 ltr-num">
            <div><button class="bg-emerald-700 text-white rounded px-4 py-1">{{ __('app.save') }}</button></div>
        </form>
    </details>
    @endif
</section>
@endsection
