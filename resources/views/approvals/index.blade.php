@extends('layouts.app')
@section('title', __('nav.approvals'))
@section('content')
<h1 class="text-xl font-semibold mb-4">{{ __('nav.approvals') }}</h1>
<form class="mb-3 text-sm">
    <select name="status" class="border rounded px-2 py-1" onchange="this.form.submit()">
        <option value="">{{ __('app.all') }}</option>
        @foreach(\App\Enums\ApprovalStatus::options() as $v => $l)<option value="{{ $v }}" @selected(request('status') === $v)>{{ $l }}</option>@endforeach
    </select>
</form>
<div class="bg-white rounded-lg shadow-sm overflow-x-auto">
<table class="w-full text-sm">
    <thead class="bg-slate-100 text-slate-600"><tr>
        <th class="text-start p-2">{{ __('registry.reference') }}</th><th class="text-start p-2">{{ __('app.plot') }}</th>
        <th class="text-start p-2">{{ __('approval.type') }}</th><th class="text-start p-2">{{ __('approval.sent') }}</th>
        <th class="text-start p-2">{{ __('plots.status') }}</th><th class="text-start p-2">{{ __('approval.verified') }}</th>
    </tr></thead>
    <tbody>
    @forelse($approvals as $a)
        <tr class="border-t hover:bg-slate-50">
            <td class="p-2"><a class="text-emerald-700 ltr-num" href="{{ route('approvals.show', $a) }}">{{ $a->reference }}</a></td>
            <td class="p-2 ltr-num">{{ $a->registryCase->plot->plot_no }}</td>
            <td class="p-2">{{ $a->type->label() }}</td>
            <td class="p-2 ltr-num">{{ $a->sent_at?->format('d-m-Y H:i') }}</td>
            <td class="p-2">{{ $a->status->label() }}</td>
            <td class="p-2">{{ $a->verifier?->name }}</td>
        </tr>
    @empty
        <tr><td colspan="6" class="p-4 text-slate-500">{{ __('app.nothing') }}</td></tr>
    @endforelse
    </tbody>
</table>
</div>
<div class="mt-4">{{ $approvals->links() }}</div>
@endsection
