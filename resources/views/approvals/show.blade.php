@extends('layouts.app')
@section('title', $approval->reference)
@section('content')
@php($case = $approval->registryCase)
<div class="flex flex-wrap items-center gap-3 mb-4">
    <h1 class="text-xl font-semibold"><span class="ltr-num">{{ $approval->reference }}</span> · {{ $approval->type->label() }}</h1>
    <span class="rounded-full px-3 py-0.5 text-sm bg-amber-100 text-amber-800">{{ $approval->status->label() }}</span>
    <a href="{{ route('registry.show', $case) }}" class="text-sm text-emerald-700">{{ $case->reference }} · {{ __('app.plot') }} <span class="ltr-num">{{ $case->plot->plot_no }}</span></a>
</div>

<div class="grid md:grid-cols-2 gap-6">
    <section class="bg-white rounded-lg shadow-sm p-4 text-sm space-y-1">
        <h2 class="font-semibold mb-2">{{ __('approval.email_sent') }}</h2>
        <div>{{ __('approval.to') }}: <span class="ltr-num">{{ $approval->to_email }}</span></div>
        @if($approval->cc)<div>CC: <span class="ltr-num">{{ implode(', ', $approval->cc) }}</span></div>@endif
        <div>{{ __('approval.subject') }}: <span class="ltr-num">{{ $approval->subject }}</span></div>
        <div>{{ __('approval.sent') }}: <span class="ltr-num">{{ $approval->sent_at?->format('d-m-Y H:i') }}</span> · {{ $approval->sender?->name }}</div>
        @if($approval->body_html)
            <details class="mt-2"><summary class="cursor-pointer text-emerald-700">{{ __('approval.view_email') }}</summary>
                <iframe class="w-full h-96 border mt-2" srcdoc="{{ $approval->body_html }}"></iframe>
            </details>
        @endif
    </section>

    <section class="bg-white rounded-lg shadow-sm p-4 text-sm space-y-2">
        <h2 class="font-semibold mb-2">{{ __('approval.director_decision') }}</h2>
        @if($approval->decision)
            <div class="text-lg font-semibold {{ $approval->decision === 'approved' ? 'text-emerald-700' : 'text-red-700' }}">{{ __('approval.decision.'.$approval->decision) }}</div>
            <div>{{ __('approval.channel') }}: {{ __('approval.channel_'.$approval->decision_channel) }} · <span class="ltr-num">{{ $approval->decided_from_email }} · {{ $approval->decided_at?->format('d-m-Y H:i') }}</span></div>
            @if($approval->director_remarks)<div class="bg-slate-50 rounded p-2">“{{ $approval->director_remarks }}”</div>@endif
        @else
            <p class="text-slate-500">{{ __('approval.no_decision_yet') }}</p>
        @endif

        @foreach($approval->inboundEmails as $in)
            <div class="border rounded p-2 text-xs">
                <div class="ltr-num">{{ $in->from_email }} · {{ $in->received_at?->format('d-m-Y H:i') }} · <b>{{ __('approval.result.'.$in->result) }}</b></div>
                <div class="text-slate-600 whitespace-pre-line mt-1">{{ \Illuminate\Support\Str::limit($in->body_text, 400) }}</div>
            </div>
        @endforeach

        {{-- Check & Review --}}
        @if(in_array($approval->status->value, ['director_approved', 'director_rejected']))
            <form method="POST" action="{{ route('approvals.verify', $approval) }}" class="border-t pt-3 space-y-2">@csrf
                <p>{{ $approval->status->value === 'director_approved' ? __('approval.verify_help_approved') : __('approval.verify_help_rejected') }}</p>
                <textarea name="remarks" class="border rounded px-2 py-1 w-full" placeholder="{{ __('app.notes') }}"></textarea>
                <label class="flex items-center gap-2"><input type="checkbox" required> {{ __('approval.i_checked') }}</label>
                <button class="bg-emerald-700 text-white rounded px-4 py-2">{{ __('approval.verify') }}</button>
            </form>
        @endif

        @if(in_array($approval->status->value, ['needs_review', 'sent']))
            <details class="border-t pt-3" @if($approval->status->value === 'needs_review') open @endif>
                <summary class="cursor-pointer">{{ __('approval.resolve_manually') }}</summary>
                <form method="POST" action="{{ route('approvals.resolve', $approval) }}" class="space-y-2 mt-2">@csrf
                    <p class="text-slate-500">{{ __('approval.resolve_help') }}</p>
                    <select name="decision" class="border rounded px-2 py-1">
                        <option value="approved">{{ __('approval.decision.approved') }}</option>
                        <option value="rejected">{{ __('approval.decision.rejected') }}</option>
                    </select>
                    <textarea name="remarks" required class="border rounded px-2 py-1 w-full" placeholder="{{ __('approval.how_confirmed') }}"></textarea>
                    <button class="bg-amber-600 text-white rounded px-4 py-2">{{ __('app.save') }}</button>
                </form>
            </details>
        @endif

        @if($approval->verified_at)
            <div class="border-t pt-2">{{ __('approval.verified') }}: {{ $approval->verifier?->name }} · <span class="ltr-num">{{ $approval->verified_at->format('d-m-Y H:i') }}</span>
                @if($approval->verify_remarks)<div class="text-slate-500">{{ $approval->verify_remarks }}</div>@endif</div>
        @endif
    </section>
</div>

@if($approval->expense)
    <section class="bg-white rounded-lg shadow-sm p-4 mt-6">
        @include('registry.partials.expense-table', ['expense' => $approval->expense])
    </section>
@endif
@endsection
