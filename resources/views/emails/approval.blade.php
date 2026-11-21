{{-- Email to the director. Inline styles only (Gmail). --}}
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; max-width: 640px;">
    <p>Dear Sir,</p>
    @if($approval->type->value === 'fard')
        <p>I need approval for <b>Fard</b> of the following plot.</p>
    @else
        <p>I need approval for <b>Registry Expense</b>. Details below.</p>
    @endif

    <table cellpadding="6" style="border-collapse: collapse; width: 100%; margin: 12px 0;">
        <tr><td style="color:#64748b; width: 160px;">Location</td><td><b>{{ $case->plot->project->name }}</b></td></tr>
        <tr><td style="color:#64748b;">Plot No</td><td><b>{{ $case->plot->plot_no }}</b></td></tr>
        <tr><td style="color:#64748b;">Area</td><td>{{ $case->area_marla }} Marla</td></tr>
        <tr><td style="color:#64748b;">Registry Maliyat</td><td><b>Rs. {{ number_format($case->maliyat) }}/-</b></td></tr>
        <tr><td style="color:#64748b;">Buyer</td><td>{{ $case->customer?->displayName() }} {{ $case->customer?->cnic ? '('.$case->customer->cnic.')' : '' }}</td></tr>
        @if($case->seller_name)<tr><td style="color:#64748b;">Seller</td><td>{{ $case->seller_name }}</td></tr>@endif
        <tr><td style="color:#64748b;">Registry by</td><td>{{ $case->mode->value === 'company_managed' ? 'Company' : 'Client himself' }}</td></tr>
    </table>

    @if($expense)
        <table cellpadding="5" style="border-collapse: collapse; width: 100%; font-size: 13px;">
            <tr style="background:#f1f5f9;"><th align="left">Item</th><th align="right">Buyer Exp</th><th align="right">Seller Exp</th><th align="right">Rate</th><th align="left">&nbsp;</th></tr>
            @foreach($expense->lines as $l)
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td>{{ $l->label }}</td>
                    <td align="right">{{ $l->payer->value === 'buyer' ? number_format($l->amount) : '' }}</td>
                    <td align="right">{{ $l->payer->value === 'seller' ? number_format($l->amount) : '' }}</td>
                    <td align="right">{{ $l->rate !== null ? rtrim(rtrim(number_format($l->rate, 4), '0'), '.').'%' : '' }}</td>
                    <td>{{ $l->receipt ? 'Receipt' : 'No Receipt' }}</td>
                </tr>
            @endforeach
            <tr><td><b>Total</b></td><td align="right"><b>{{ number_format($expense->buyer_total) }}</b></td><td align="right"><b>{{ number_format($expense->seller_total) }}</b></td><td></td><td></td></tr>
            <tr><td><b>Grand Total</b></td><td colspan="2" align="right"><b>Rs. {{ number_format($expense->grand_total) }}/-</b></td><td></td><td></td></tr>
        </table>
        <p style="font-size: 12px; color:#64748b;">Buyer: {{ $expense->buyer_is_filer ? 'Filer' : 'Non-Filer' }} · Seller: {{ $expense->seller_is_filer ? 'Filer' : 'Non-Filer' }}</p>
    @endif

    <table cellpadding="0" cellspacing="0" style="margin: 20px 0;"><tr>
        <td><a href="{{ $approveUrl }}" style="background:#047857; color:#fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">✔ Approve</a></td>
        <td style="width: 16px;"></td>
        <td><a href="{{ $rejectUrl }}" style="background:#b91c1c; color:#fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">✖ Reject</a></td>
    </tr></table>

    <p style="font-size: 12px; color:#64748b;">Or simply reply to this email with <b>Approved</b> or <b>Rejected</b> (keep the subject as it is).</p>

    <p>Regards,<br>{{ $sender->name }}<br>{{ $sender->department ?? config('landms.approval.sender_department') }}</p>
    <p style="font-size: 11px; color:#94a3b8;">Ref: {{ $approval->reference }} / {{ $case->reference }}</p>
</div>
