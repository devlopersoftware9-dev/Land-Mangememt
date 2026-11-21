@extends('layouts.app')
@section('title', $case->reference)
@section('content')
@php($st = $case->status->value)
@php($u = auth()->user())
@php($isB = $case->mode->value === 'company_managed')
@php($conv = new \App\Services\Area\AreaConverter($case->plot->project->marla_sqft))

<div class="flex flex-wrap items-center gap-3 mb-4">
    <h1 class="text-xl font-semibold"><span class="ltr-num">{{ $case->reference }}</span> · {{ __('app.plot') }} <a class="text-emerald-700 ltr-num" href="{{ route('plots.show', $case->plot) }}">{{ $case->plot->plot_no }}</a></h1>
    <span class="rounded-full px-3 py-0.5 text-sm bg-purple-100 text-purple-800">{{ $case->status->label() }}</span>
    <span class="rounded-full px-3 py-0.5 text-sm bg-slate-200">{{ $case->mode->label() }}</span>
</div>

{{-- Progress --}}
@php($steps = $isB
    ? ['demand','fard_approval_pending','fard_approval_review','fard_approved','fard_jari_issued','fard_received','expense_approval_pending','expense_approval_review','expense_approved','expense_paid','registry_done','registry_recorded','handed_over']
    : ['demand','fard_approval_pending','fard_approval_review','fard_approved','fard_jari_issued','fard_received','fard_handed_over','client_registry_recorded'])
@php($pos = array_search($st, $steps))
<ol class="flex flex-wrap gap-1 mb-6 text-xs">
    @foreach($steps as $i => $s)
        <li class="px-2 py-1 rounded {{ $pos !== false && $i < $pos ? 'bg-emerald-100 text-emerald-800' : ($i === $pos ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500') }}">{{ \App\Enums\RegistryStatus::from($s)->label() }}</li>
    @endforeach
</ol>

<div class="grid md:grid-cols-3 gap-6">
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm space-y-1">
        <h2 class="font-semibold mb-2">{{ __('registry.file') }}</h2>
        <div>{{ __('plots.customer') }}: {{ $case->customer?->displayName() }} <span class="ltr-num text-slate-500">{{ $case->customer?->cnic }}</span></div>
        <div>{{ __('plots.size') }}: <span class="ltr-num">{{ $case->area_marla }} M ({{ $conv->format($case->area_sqft) }})</span></div>
        <div>{{ __('registry.maliyat') }}: <span class="ltr-num">Rs. {{ number_format($case->maliyat) }}</span></div>
        <div>{{ __('registry.demand_date') }}: <span class="ltr-num">{{ $case->demand_date->format('d-m-Y') }}</span></div>
        @if($case->seller_name)<div>{{ __('registry.seller') }}: {{ $case->seller_name }}</div>@endif
        @if($case->intiqals->isNotEmpty())
            <div>{{ __('registry.intiqals') }}:
                @foreach($case->intiqals as $i)<span class="ltr-num">{{ $i->intiqal_no }} ({{ $conv->format($i->pivot->area_sqft) }})</span>@if(! $loop->last), @endif @endforeach
            </div>
        @endif
        @if($case->fard_jari_message)<div class="bg-slate-50 rounded p-2 whitespace-pre-line">{{ $case->fard_jari_message }}</div>@endif
        @if($case->fard_no || $case->fard_received_on)<div>{{ __('registry.fard') }}: <span class="ltr-num">{{ $case->fard_no }} {{ $case->fard_received_on?->format('d-m-Y') }}</span></div>@endif
        @if($case->fard_handed_over_on)<div>{{ __('registry.fard_handed_over_on') }}: <span class="ltr-num">{{ $case->fard_handed_over_on->format('d-m-Y') }}</span></div>@endif
        @if($case->registry_no)<div>{{ __('registry.registry_no') }}: <span class="ltr-num">{{ $case->registry_no }} · {{ $case->registry_date?->format('d-m-Y') }}</span> {{ $case->registry_office }}</div>@endif
        @if($case->expense_paid)<div>{{ __('registry.expense_paid') }} ✔ <span class="ltr-num">{{ $case->expense_paid_at?->format('d-m-Y') }}</span></div>@endif
        @if($case->registry_recorded_on)<div>{{ __('registry.recorded_on') }}: <span class="ltr-num">{{ $case->registry_recorded_on->format('d-m-Y') }}</span></div>@endif
        @if($case->handed_over_on)<div>{{ __('registry.handed_over_on') }}: <span class="ltr-num">{{ $case->handed_over_on->format('d-m-Y') }}</span></div>@endif
        @foreach($case->documents as $d)<div>📎 {{ $d->original_name }}</div>@endforeach
    </section>

    {{-- Current step action --}}
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm md:col-span-2">
        <h2 class="font-semibold mb-3">{{ __('registry.next_step') }}</h2>

        @switch($st)
            @case('demand')
                <form method="POST" action="{{ route('registry.step', [$case, 'send-fard-approval']) }}">@csrf
                    <p class="mb-2">{{ __('registry.send_fard_help') }}</p>
                    <button class="bg-purple-700 text-white rounded px-4 py-2">{{ __('registry.send_fard_approval') }}</button>
                </form>
                @break

            @case('fard_approval_pending')
            @case('expense_approval_pending')
                <p>{{ __('registry.waiting_director') }}</p>
                @break

            @case('fard_approval_review')
            @case('expense_approval_review')
                @php($a = $case->approvals->first())
                <p class="mb-2">{{ __('registry.director_replied') }}</p>
                @if($a)<a href="{{ route('approvals.show', $a) }}" class="bg-amber-600 text-white rounded px-4 py-2 inline-block">{{ __('approval.open_and_verify') }}</a>@endif
                @break

            @case('fard_approved')
                @if($u->hasRole('land_management'))
                <form method="POST" action="{{ route('registry.step', [$case, 'fard-jari']) }}" class="space-y-2">@csrf
                    <p>{{ __('registry.fard_jari_help', ['area' => $conv->format($case->area_sqft), 'sqft' => $case->area_sqft]) }}</p>
                    <table class="w-full">
                        <tr class="text-slate-500"><th class="text-start">{{ __('land.intiqal_no') }}</th><th class="text-start">{{ __('land.holder') }}</th><th class="text-start">{{ __('land.balance') }}</th><th class="text-start">{{ __('registry.take_sqft') }}</th></tr>
                        @foreach($intiqals as $row)
                            <tr class="border-t">
                                <td class="py-1 ltr-num">{{ $row['intiqal']->intiqal_no }}</td>
                                <td>{{ $row['intiqal']->holder_name }}</td>
                                <td class="ltr-num">{{ $conv->format(max(0, $row['balance'])) }}</td>
                                <td><input type="number" step="0.01" min="0" max="{{ $row['balance'] }}" name="allocations[{{ $row['intiqal']->id }}]" class="border rounded px-2 py-1 w-32 ltr-num" @disabled($row['balance'] <= 0)></td>
                            </tr>
                        @endforeach
                    </table>
                    <textarea name="message" required rows="3" class="border rounded px-2 py-1 w-full" placeholder="{{ __('registry.fard_jari_message') }}">{{ old('message', __('registry.fard_jari_default', ['plot' => $case->plot->plot_no, 'area' => $conv->format($case->area_sqft), 'customer' => $case->customer?->displayName()])) }}</textarea>
                    <button class="bg-purple-700 text-white rounded px-4 py-2">{{ __('registry.issue_fard_jari') }}</button>
                </form>
                @else <p>{{ __('registry.waiting_role', ['role' => \App\Enums\UserRole::LandManagement->label()]) }}</p> @endif
                @break

            @case('fard_jari_issued')
                <form method="POST" action="{{ route('registry.step', [$case, 'fard-received']) }}" class="space-y-2">@csrf
                    <p>{{ __('registry.fard_received_help') }}</p>
                    <input name="fard_no" placeholder="{{ __('registry.fard_no') }}" class="border rounded px-2 py-1">
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1">
                    <button class="bg-purple-700 text-white rounded px-4 py-2">{{ __('registry.mark_fard_received') }}</button>
                </form>
                @break

            @case('fard_received')
                @if(! $isB)
                    <form method="POST" action="{{ route('registry.step', [$case, 'hand-over-fard']) }}" class="space-y-2 mb-4">@csrf
                        <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1">
                        <button class="bg-purple-700 text-white rounded px-4 py-2">{{ __('registry.hand_over_fard') }}</button>
                    </form>
                    <details class="border rounded p-2"><summary class="cursor-pointer">{{ __('registry.seller_expense_optional') }}</summary>
                        @include('registry.partials.expense-form', ['kind' => 'seller_expense'])
                    </details>
                @else
                    @include('registry.partials.expense-form', ['kind' => 'registry_expense'])
                @endif
                @break

            @case('fard_handed_over')
                <form method="POST" action="{{ route('registry.step', [$case, 'client-registry']) }}" class="space-y-2">@csrf
                    <p>{{ __('registry.client_registry_help') }}</p>
                    @include('registry.partials.registry-fields')
                    <button class="bg-blue-700 text-white rounded px-4 py-2">{{ __('registry.record_client_registry') }}</button>
                </form>
                @break

            @case('expense_approved')
                <form method="POST" action="{{ route('registry.step', [$case, 'expense-paid']) }}" onsubmit="return confirm('{{ __('app.are_you_sure') }}')">@csrf
                    <p class="mb-2">{{ __('registry.expense_paid_help') }}</p>
                    <label class="flex items-center gap-2 mb-2"><input type="checkbox" required> {{ __('registry.expense_paid') }}</label>
                    <button class="bg-purple-700 text-white rounded px-4 py-2">{{ __('app.save') }}</button>
                </form>
                @break

            @case('expense_paid')
                <form method="POST" action="{{ route('registry.step', [$case, 'registry-done']) }}" class="space-y-2">@csrf
                    @include('registry.partials.registry-fields')
                    <button class="bg-purple-700 text-white rounded px-4 py-2">{{ __('registry.mark_registry_done') }}</button>
                </form>
                @break

            @case('registry_done')
                <form method="POST" action="{{ route('registry.step', [$case, 'record-in-office']) }}" enctype="multipart/form-data" class="space-y-2">@csrf
                    <p>{{ __('registry.record_in_office_help') }}</p>
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1">
                    <input name="buyer_intiqal_no" placeholder="{{ __('registry.buyer_intiqal_no') }}" class="border rounded px-2 py-1">
                    <input type="file" name="registry_copy" accept=".pdf,.jpg,.jpeg,.png">
                    <button class="bg-blue-700 text-white rounded px-4 py-2">{{ __('registry.record_in_office') }}</button>
                </form>
                @break

            @case('registry_recorded')
                <form method="POST" action="{{ route('registry.step', [$case, 'hand-over']) }}" class="space-y-2">@csrf
                    <input type="date" name="date" value="{{ now()->toDateString() }}" class="border rounded px-2 py-1">
                    <button class="bg-blue-700 text-white rounded px-4 py-2">{{ __('registry.hand_over_registry') }}</button>
                </form>
                @break

            @default
                <p class="text-slate-500">{{ __('registry.file_closed') }}</p>
        @endswitch

        @if(! $case->status->isFinal() && $u->hasRole('admin'))
            <details class="mt-6"><summary class="text-red-600 cursor-pointer">{{ __('registry.cancel_case') }}</summary>
                <form method="POST" action="{{ route('registry.step', [$case, 'cancel']) }}" class="mt-2 space-y-2">@csrf
                    <textarea name="reason" required class="border rounded px-2 py-1 w-full" placeholder="{{ __('app.reason') }}"></textarea>
                    <button class="bg-red-600 text-white rounded px-3 py-1">{{ __('registry.cancel_case') }}</button>
                </form>
            </details>
        @endif
    </section>
</div>

{{-- Approvals history --}}
<section class="bg-white rounded-lg shadow-sm p-4 mt-6">
    <h2 class="font-semibold mb-3">{{ __('nav.approvals') }}</h2>
    <table class="w-full text-sm">
        <tr class="text-slate-500 border-b"><th class="text-start py-1">{{ __('registry.reference') }}</th><th class="text-start">{{ __('approval.type') }}</th><th class="text-start">{{ __('approval.sent') }}</th><th class="text-start">{{ __('approval.director') }}</th><th class="text-start">{{ __('approval.verified') }}</th><th class="text-start">{{ __('plots.status') }}</th></tr>
        @forelse($case->approvals as $a)
            <tr class="border-b">
                <td class="py-1"><a class="text-emerald-700 ltr-num" href="{{ route('approvals.show', $a) }}">{{ $a->reference }}</a></td>
                <td>{{ $a->type->label() }}</td>
                <td class="ltr-num">{{ $a->sent_at?->format('d-m-Y H:i') }}</td>
                <td>{{ $a->decision ? __('approval.decision.'.$a->decision) : '—' }} <span class="ltr-num text-slate-500">{{ $a->decided_at?->format('d-m-Y H:i') }}</span></td>
                <td>{{ $a->verifier?->name }} <span class="ltr-num text-slate-500">{{ $a->verified_at?->format('d-m-Y H:i') }}</span></td>
                <td>{{ $a->status->label() }}</td>
            </tr>
        @empty
            <tr><td colspan="6" class="py-2 text-slate-500">{{ __('app.nothing') }}</td></tr>
        @endforelse
    </table>
</section>

{{-- Saved expense sheets --}}
@foreach($case->expenses as $exp)
    <section class="bg-white rounded-lg shadow-sm p-4 mt-6">
        <h2 class="font-semibold mb-2">{{ $exp->kind === 'seller_expense' ? __('registry.seller_expense') : __('registry.registry_expense') }} · <span class="ltr-num">{{ $exp->created_at->format('d-m-Y H:i') }}</span></h2>
        @include('registry.partials.expense-table', ['expense' => $exp])
    </section>
@endforeach
@endsection
