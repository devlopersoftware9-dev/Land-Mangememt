<?php

namespace App\Services\Area;

/**
 * Kanal / Marla / sq ft conversions. Local unit here: 1 marla = 270 sq ft, 1 kanal = 20 marla.
 * Pure PHP (no framework) so it can be unit-tested anywhere.
 */
final class AreaConverter
{
    public function __construct(
        private readonly int $marlaSqft = 270,
        private readonly int $marlaPerKanal = 20,
    ) {}

    public function toSqft(float $kanal = 0, float $marla = 0, float $sqft = 0): float
    {
        return ($kanal * $this->marlaPerKanal + $marla) * $this->marlaSqft + $sqft;
    }

    public function sqftToMarla(float $sqft): float
    {
        return round($sqft / $this->marlaSqft, 2);
    }

    /** @return array{kanal:int, marla:int, sqft:float} */
    public function split(float $sqft): array
    {
        $totalMarla = (int) floor($sqft / $this->marlaSqft);
        $rest = round($sqft - $totalMarla * $this->marlaSqft, 2);

        return [
            'kanal' => intdiv($totalMarla, $this->marlaPerKanal),
            'marla' => $totalMarla % $this->marlaPerKanal,
            'sqft' => $rest,
        ];
    }

    /** "1K-07M-246sft" (same style as the layout map). */
    public function format(float $sqft): string
    {
        $p = $this->split($sqft);
        $parts = [];
        if ($p['kanal'] > 0) {
            $parts[] = $p['kanal'].'K';
        }
        $parts[] = str_pad((string) $p['marla'], 2, '0', STR_PAD_LEFT).'M';
        if ($p['sqft'] > 0) {
            $parts[] = rtrim(rtrim(number_format($p['sqft'], 2, '.', ''), '0'), '.').'sft';
        }

        return implode('-', $parts);
    }
}
