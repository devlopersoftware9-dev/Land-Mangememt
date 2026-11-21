@extends('layouts.app')
@section('title', __('nav.rates'))
@section('content')
<h1 class="text-xl font-semibold mb-1">{{ __('nav.rates') }}</h1>
<p class="text-sm text-slate-500 mb-4">{{ __('rates.help') }}</p>
<form method="POST" action="{{ route('rates.update') }}">@csrf @method('PUT')
<div class="bg-white rounded-lg shadow-sm overflow-x-auto">
<table class="w-full text-sm">
    <thead class="bg-slate-100 text-slate-600"><tr>
        <th class="text-start p-2">{{ __('registry.expense_item') }}</th><th class="text-start p-2">{{ __('registry.payer') }}</th>
        <th class="text-start p-2">{{ __('rates.filer_rate') }}</th><th class="text-start p-2">{{ __('rates.non_filer_rate') }}</th>
        <th class="text-start p-2">{{ __('rates.fixed') }}</th><th class="text-start p-2">{{ __('rates.params') }}</th>
        <th class="p-2">{{ __('rates.default_on') }}</th><th class="p-2">{{ __('registry.receipt') }}</th><th class="p-2">{{ __('rates.active') }}</th>
    </tr></thead>
    <tbody>
    @foreach($rates as $r)
        <tr class="border-t">
            <td class="p-2">{{ app()->getLocale() === 'ur' && $r->label_ur ? $r->label_ur : $r->label }}<div class="text-xs text-slate-400">{{ $r->calc_type->label() }}</div></td>
            <td class="p-2">{{ $r->payer->label() }}</td>
            <td class="p-2">@if(in_array($r->calc_type->value, ['percent', 'percent_filer', 'percent_land']))<input type="number" step="0.0001" name="rates[{{ $r->id }}][rate]" value="{{ $r->rate }}" class="border rounded px-2 py-0.5 w-20 ltr-num"> %@endif</td>
            <td class="p-2">@if($r->calc_type->value === 'percent_filer')<input type="number" step="0.0001" name="rates[{{ $r->id }}][non_filer_rate]" value="{{ $r->non_filer_rate }}" class="border rounded px-2 py-0.5 w-20 ltr-num"> %@endif</td>
            <td class="p-2">@if(in_array($r->calc_type->value, ['fixed', 'percent', 'excise']))<input type="number" name="rates[{{ $r->id }}][fixed_amount]" value="{{ $r->fixed_amount }}" class="border rounded px-2 py-0.5 w-24 ltr-num">@endif</td>
            <td class="p-2 text-xs">
                @foreach($r->params ?? [] as $k => $v)
                    <label class="block">{{ $k }} <input type="number" step="any" name="rates[{{ $r->id }}][params][{{ $k }}]" value="{{ $v }}" class="border rounded px-1 w-24 ltr-num"></label>
                @endforeach
            </td>
            @foreach(['default_on', 'receipt', 'is_active'] as $f)
                <td class="p-2 text-center"><input type="hidden" name="rates[{{ $r->id }}][{{ $f }}]" value="0"><input type="checkbox" name="rates[{{ $r->id }}][{{ $f }}]" value="1" @checked($r->{$f})></td>
            @endforeach
        </tr>
    @endforeach
    </tbody>
</table>
</div>
<button class="mt-4 bg-emerald-700 text-white rounded px-4 py-2">{{ __('app.save') }}</button>
</form>
@endsection
