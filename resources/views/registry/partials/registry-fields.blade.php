<div class="flex flex-wrap gap-2">
    <input name="registry_no" required placeholder="{{ __('registry.registry_no') }}" value="{{ old('registry_no', $case->registry_no) }}" class="border rounded px-2 py-1 ltr-num">
    <input type="date" name="registry_date" required value="{{ old('registry_date', $case->registry_date?->toDateString() ?? now()->toDateString()) }}" class="border rounded px-2 py-1">
    <input name="registry_office" placeholder="{{ __('registry.registry_office') }}" value="{{ old('registry_office', $case->registry_office) }}" class="border rounded px-2 py-1">
</div>
