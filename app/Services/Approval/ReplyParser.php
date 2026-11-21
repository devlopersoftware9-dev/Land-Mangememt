<?php

namespace App\Services\Approval;

/**
 * Reads a director's email reply and decides: approved / rejected / unclear.
 * Only the NEW text is read (quoted original email is cut off), and
 * "not approved" is checked before "approved". Pure PHP.
 */
final class ReplyParser
{
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';
    public const UNCLEAR = 'unclear';

    private const REJECT_WORDS = [
        'not approved', 'not approve', 'disapproved', 'rejected', 'reject', 'declined', 'decline', 'no',
        'na manzoor', 'namanzoor', 'نامنظور', 'منظور نہیں', 'مسترد',
    ];

    private const APPROVE_WORDS = [
        'approved', 'approve', 'ok', 'okay', 'yes', 'go ahead', 'done', 'proceed',
        'manzoor', 'منظور', 'ٹھیک ہے', 'theek hai', 'thik hai',
    ];

    /** Finds "[APR-0012]" in the subject. */
    public function reference(string $subject): ?string
    {
        return preg_match('/\[(APR-\d{3,})\]/i', $subject, $m) ? strtoupper($m[1]) : null;
    }

    public function decision(string $body): string
    {
        $text = $this->newText($body);
        if ($text === '') {
            return self::UNCLEAR;
        }

        $norm = ' '.mb_strtolower(preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $text)).' ';
        $norm = preg_replace('/\s+/u', ' ', $norm);

        $reject = $this->contains($norm, self::REJECT_WORDS);
        // remove reject phrases so "not approved" does not also count as "approved"
        $stripped = $norm;
        foreach (self::REJECT_WORDS as $w) {
            $stripped = str_replace(' '.$w.' ', ' ', $stripped);
        }
        $approve = $this->contains($stripped, self::APPROVE_WORDS);

        if ($approve && ! $reject) {
            return self::APPROVED;
        }
        if ($reject && ! $approve) {
            return self::REJECTED;
        }

        return self::UNCLEAR;
    }

    /** First few lines the director actually typed (above the quoted email). */
    public function newText(string $body): string
    {
        $lines = preg_split('/\r\n|\r|\n/', $body) ?: [];
        $kept = [];
        foreach ($lines as $line) {
            $t = trim($line);
            if (str_starts_with($t, '>')) {
                break;
            }
            if (preg_match('/^On .+wrote:?$/i', $t) || preg_match('/^-{2,}\s*Original Message/i', $t)
                || preg_match('/^From:\s/i', $t) || preg_match('/^Sent from my /i', $t)) {
                break;
            }
            if ($t !== '') {
                $kept[] = $t;
            }
            if (count($kept) >= 3) {
                break;
            }
        }

        return trim(implode(' ', $kept));
    }

    /** @param  string[]  $words */
    private function contains(string $haystack, array $words): bool
    {
        foreach ($words as $w) {
            if (str_contains($haystack, ' '.mb_strtolower($w).' ')) {
                return true;
            }
        }

        return false;
    }
}
