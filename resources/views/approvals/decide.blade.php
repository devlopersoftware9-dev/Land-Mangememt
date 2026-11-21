<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Approval</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
        .btn { display: block; width: 100%; padding: 14px; border: 0; border-radius: 8px; font-size: 17px; color: #fff; cursor: pointer; }
        .approve { background: #047857; } .reject { background: #b91c1c; }
        dt { color: #64748b; font-size: 13px; } dd { margin: 0 0 8px; font-weight: 600; }
    </style>
</head>
<body>
<div class="card">
    @if($error)
        <h2>⚠️ {{ $error }}</h2>
    @elseif(! empty($done))
        <h2>{{ $decision === 'approve' ? '✅ Approved' : '❌ Rejected' }}</h2>
        <p>Thank you. {{ $approval->reference }} has been recorded. The office will verify and proceed.</p>
    @else
        @php($case = $approval->registryCase)
        <h2>{{ $approval->type->label() }}</h2>
        <dl>
            <dt>Project / Plot</dt><dd>{{ $case->plot->project->code }} – Plot {{ $case->plot->plot_no }}</dd>
            <dt>Area</dt><dd>{{ $case->area_marla }} Marla</dd>
            <dt>Maliyat</dt><dd>Rs. {{ number_format($case->maliyat) }}</dd>
            <dt>Buyer</dt><dd>{{ $case->customer?->displayName() }}</dd>
            @if($approval->expense)<dt>Expense total</dt><dd>Rs. {{ number_format($approval->expense->grand_total) }}</dd>@endif
        </dl>
        <form method="POST" action="{{ route('approval.confirm', [$approval->reference, $decision, $token]) }}">
            @csrf
            <button class="btn {{ $decision === 'approve' ? 'approve' : 'reject' }}">
                Confirm {{ $decision === 'approve' ? 'APPROVE' : 'REJECT' }}
            </button>
        </form>
    @endif
</div>
</body>
</html>
