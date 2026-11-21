<select name="customer_id" required class="border rounded px-2 py-1 w-full">
    <option value="">{{ __('plots.choose_customer') }}</option>
    @foreach($customers as $c)
        <option value="{{ $c->id }}" @selected(session('new_customer_id') === $c->id)>{{ $c->name }}{{ $c->father_name ? ' '.$c->relation.' '.$c->father_name : '' }} {{ $c->cnic ? '('.$c->cnic.')' : '' }}</option>
    @endforeach
</select>
<a href="{{ route('customers.index') }}#new" class="text-xs text-emerald-700">+ {{ __('customers.new') }}</a>
