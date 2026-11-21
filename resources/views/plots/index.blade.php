@extends('layouts.app')
@section('title', __('nav.plots'))
@section('content')
<div class="flex items-center justify-between mb-4">
    <h1 class="text-xl font-semibold">{{ __('nav.plots') }}</h1>
    <a href="{{ route('plots.map') }}" class="text-sm border rounded px-3 py-1">{{ __('nav.map') }}</a>
</div>

<form class="flex flex-wrap gap-2 mb-4 text-sm">
    <input name="q" value="{{ request('q') }}" placeholder="{{ __('plots.search') }}" class="border rounded px-3 py-1">
    <select name="status" class="border rounded px-2 py-1">
        <option value="">{{ __('plots.all_status') }}</option>
        @foreach($statuses as $v => $l)<option value="{{ $v }}" @selected(request('status') === $v)>{{ $l }}</option>@endforeach
    </select>
    <select name="street" class="border rounded px-2 py-1">
        <option value="">{{ __('plots.all_streets') }}</option>
        @foreach($streets as $s)<option value="{{ $s->id }}" @selected((int) request('street') === $s->id)>{{ __('plots.street') }} {{ $s->number }}</option>@endforeach
    </select>
    <select name="category" class="border rounded px-2 py-1">
        <option value="">{{ __('plots.all_categories') }}</option>
        @foreach(\App\Enums\PlotCategory::options() as $v => $l)<option value="{{ $v }}" @selected(request('category') === $v)>{{ $l }}</option>@endforeach
    </select>
    <button class="bg-slate-800 text-white rounded px-3">{{ __('app.filter') }}</button>
</form>

<div class="bg-white rounded-lg shadow-sm overflow-x-auto">
<table class="w-full text-sm">
    <thead class="bg-slate-100 text-slate-600">
        <tr>
            <th class="text-start p-2">{{ __('app.plot') }}</th>
            <th class="text-start p-2">{{ __('plots.size') }}</th>
            <th class="text-start p-2">{{ __('plots.category') }}</th>
            <th class="text-start p-2">{{ __('plots.status') }}</th>
            <th class="text-start p-2">{{ __('plots.customer') }}</th>
            <th class="text-start p-2">{{ __('plots.construction') }}</th>
        </tr>
    </thead>
    <tbody>
    @foreach($plots as $plot)
        <tr class="border-t hover:bg-slate-50">
            <td class="p-2"><a href="{{ route('plots.show', $plot) }}" class="text-emerald-700 font-medium ltr-num">{{ $plot->plot_no }}</a>
                @if($plot->is_corner)<span class="text-xs text-slate-500">· {{ __('plots.corner') }}</span>@endif
                @if($plot->is_park_facing)<span class="text-xs text-slate-500">· {{ __('plots.park_facing') }}</span>@endif
            </td>
            <td class="p-2 ltr-num">{{ $plot->size_marla ? rtrim(rtrim($plot->size_marla, '0'), '.').' M' : '—' }}</td>
            <td class="p-2">{{ $plot->category->label() }}</td>
            <td class="p-2"><span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background: {{ $plot->sale_status->color() }}"></span>{{ $plot->sale_status->label() }}</span></td>
            <td class="p-2">{{ $plot->currentCustomer?->name ?? '—' }}</td>
            <td class="p-2">{{ $plot->construction_status->label() }}</td>
        </tr>
    @endforeach
    </tbody>
</table>
</div>
<div class="mt-4">{{ $plots->links() }}</div>
@endsection
