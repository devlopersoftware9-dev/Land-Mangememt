<?php

namespace Tests\Unit;

use App\Services\Approval\ReplyParser;
use PHPUnit\Framework\TestCase;

class ReplyParserTest extends TestCase
{
    private ReplyParser $p;

    protected function setUp(): void
    {
        $this->p = new ReplyParser;
    }

    public function test_reference_from_subject(): void
    {
        $this->assertSame('APR-0045', $this->p->reference('Re: Fard Approval Request--Plot_21.45 RG2 [APR-0045]'));
        $this->assertNull($this->p->reference('Re: hello'));
    }

    public function test_decisions(): void
    {
        $quoted = "\n\nOn Sat, 21 Nov 2026 at 10:00, Office <office@gmail.com> wrote:\n> I Need Apporval ... Approve";

        $this->assertSame('approved', $this->p->decision('Approved'.$quoted));
        $this->assertSame('approved', $this->p->decision("ok\n\nSent from my iPhone"));
        $this->assertSame('approved', $this->p->decision('منظور ہے'));
        $this->assertSame('rejected', $this->p->decision('Rejected. Maliyat is too low'.$quoted));
        $this->assertSame('rejected', $this->p->decision('Not approved'));
        $this->assertSame('rejected', $this->p->decision('نامنظور'));
        $this->assertSame('unclear', $this->p->decision('Call me tomorrow'.$quoted));
        $this->assertSame('unclear', $this->p->decision(''.$quoted));
    }

    public function test_quoted_approve_button_text_is_ignored(): void
    {
        // the original email contains "Approve" – only the new text must count
        $this->assertSame('unclear', $this->p->decision("Let me check\n> ✔ Approve  ✖ Reject"));
    }
}
