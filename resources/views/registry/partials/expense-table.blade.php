<table class="w-full text-sm">
    <tr class="text-slate-500 border-b">
        <th class="text-start py-1">{{ __('registry.expense_item') }}</th>
        <th class="text-end">{{ __('registry.rate') }}</th>
        <th class="text-end">{{ __('registry.buyer_exp') }}</th>
        <th class="text-end">{{ __('registry.seller_exp') }}</th>
        <th class="text-start ps-3">{{ __('registry.receipt') }}</th>
    </tr>
    @foreach($expense->lines as $l)
        <tr class="border-b">
            <td class="py-1">{{ $l->label }} @if($l->is_manual)<span class="text-xs text-amber-700">({{ __('registry.manual') }})</span>@endif</td>
            <td class="text-end ltr-num">{{ $l->rate !== null ? rtrim(rtrim(number_format($l->rate, 4), '0'), '.').'%' : '' }}</td>
            <td class="text-end ltr-num">{{ $l->payer->value === 'buyer' ? number_format($l->amount) : '' }}</td>
            <td class="text-end ltr-num">{{ $l->payer->value === 'seller' ? number_format($l->amount) : '' }}</td>
            <td class="ps-3">{{ $l->receipt ? __('registry.receipt') : __('registry.no_receipt') }}</td>
        </tr>
    @endforeach
    <tr class="font-medium border-b"><td class="py-1">{{ __('registry.total') }}</td><td></td>
        <td class="text-end ltr-num">{{ number_format($expense->buyer_total) }}</td><td class="text-end ltr-num">{{ number_format($expense->seller_total) }}</td><td></td></tr>
    <tr class="font-semibold"><td class="py-1">{{ __('registry.grand_total') }}</td><td></td><td colspan="2" class="text-end ltr-num">Rs. {{ number_format($expense->grand_total) }}</td><td></td></tr>
</table>
<div class="text-xs text-slate-500 mt-2">
    {{ __('registry.maliyat') }}: <span class="ltr-num">{{ number_format($expense->maliyat) }}</span> ·
    {{ __('registry.buyer') }}: {{ $expense->buyer_name }} ({{ $expense->buyer_is_filer ? __('registry.filer') : __('registry.non_filer') }}) ·
    {{ __('registry.seller') }}: {{ $expense->seller_name }} ({{ $expense->seller_is_filer ? __('registry.filer') : __('registry.non_filer') }})
</div>
