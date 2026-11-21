{{--
    Registry expense template (same as the Google Sheet). Live total via expense-preview;
    "Save & send" stores it and emails the director.
--}}
@php($formId = 'exp-'.$kind)
@php($sellerFiler = $case->intiqals->first()?->holder_is_filer ?? true)
<form id="{{ $formId }}" method="POST" action="{{ route('registry.step', [$case, 'expense-save']) }}" class="space-y-3 mt-2">@csrf
    <input type="hidden" name="kind" value="{{ $kind }}">
    <div class="flex flex-wrap gap-3 items-end">
        <label>{{ __('registry.maliyat') }}<br><input type="number" name="maliyat" value="{{ $case->maliyat }}" required class="border rounded px-2 py-1 ltr-num w-36"></label>
        <label>{{ __('registry.area_marla') }}<br><input type="number" step="0.01" name="area_marla" value="{{ $case->area_marla }}" required class="border rounded px-2 py-1 ltr-num w-24"></label>
        <label class="flex items-center gap-1"><input type="hidden" name="buyer_is_filer" value="0"><input type="checkbox" name="buyer_is_filer" value="1" @checked($case->customer?->is_filer)> {{ __('registry.buyer_filer') }}</label>
        <label class="flex items-center gap-1"><input type="hidden" name="seller_is_filer" value="0"><input type="checkbox" name="seller_is_filer" value="1" @checked($sellerFiler)> {{ __('registry.seller_filer') }}</label>
        <label>{{ __('registry.land_value') }}<br><input type="number" name="land_value" class="border rounded px-2 py-1 ltr-num w-36"></label>
    </div>

    <table class="w-full">
        <tr class="text-slate-500 border-b"><th></th><th class="text-start">{{ __('registry.expense_item') }}</th><th class="text-start">{{ __('registry.payer') }}</th><th class="text-end">{{ __('registry.calculated') }}</th><th class="text-start ps-2">{{ __('registry.override') }}</th></tr>
        @foreach($rates as $r)
            @continue($kind === 'seller_expense' && $r->payer->value !== 'seller')
            <tr class="border-b">
                <td><input type="hidden" name="enabled[{{ $r->code }}]" value="0"><input type="checkbox" name="enabled[{{ $r->code }}]" value="1" @checked($r->default_on)></td>
                <td class="py-1">{{ app()->getLocale() === 'ur' && $r->label_ur ? $r->label_ur : $r->label }}</td>
                <td>{{ $r->payer->label() }}</td>
                <td class="text-end ltr-num" data-amount="{{ $r->code }}">—</td>
                <td class="ps-2"><input type="number" min="0" name="manual[{{ $r->code }}]" class="border rounded px-2 py-0.5 w-28 ltr-num"></td>
            </tr>
        @endforeach
        <tr class="font-medium"><td></td><td class="py-1">{{ __('registry.buyer_exp') }} / {{ __('registry.seller_exp') }}</td><td></td><td class="text-end ltr-num" data-total="bs">—</td><td></td></tr>
        <tr class="font-semibold"><td></td><td class="py-1">{{ __('registry.grand_total') }}</td><td></td><td class="text-end ltr-num" data-total="grand">—</td><td></td></tr>
    </table>

    <button class="bg-purple-700 text-white rounded px-4 py-2" onclick="return confirm('{{ __('registry.confirm_send_expense') }}')">{{ __('registry.save_and_send') }}</button>
</form>

@push('scripts')
<script>
(() => {
    const form = document.getElementById(@json($formId));
    const url = @json(route('registry.step', [$case, 'expense-preview']));
    const fmt = n => Number(n).toLocaleString('en-PK');
    let t;
    async function refresh() {
        const res = await fetch(url, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        form.querySelectorAll('[data-amount]').forEach(td => td.textContent = '—');
        data.lines.forEach(l => { const td = form.querySelector(`[data-amount="${l.code}"]`); if (td) td.textContent = fmt(l.amount); });
        form.querySelector('[data-total="bs"]').textContent = fmt(data.buyer_total) + ' / ' + fmt(data.seller_total);
        form.querySelector('[data-total="grand"]').textContent = 'Rs. ' + fmt(data.grand_total);
    }
    form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, 300); });
    form.addEventListener('change', refresh);
    refresh();
})();
</script>
@endpush
