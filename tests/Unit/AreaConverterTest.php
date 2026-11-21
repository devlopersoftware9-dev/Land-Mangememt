<?php

namespace Tests\Unit;

use App\Services\Area\AreaConverter;
use PHPUnit\Framework\TestCase;

class AreaConverterTest extends TestCase
{
    public function test_270_sqft_marla(): void
    {
        $c = new AreaConverter(270);
        $this->assertSame(1350.0, $c->toSqft(0, 5));
        $this->assertSame(5400.0, $c->toSqft(1));
        $this->assertSame(['kanal' => 1, 'marla' => 7, 'sqft' => 246.0], $c->split(5400 + 7 * 270 + 246));
        $this->assertSame('1K-07M-246sft', $c->format(5400 + 7 * 270 + 246));
        $this->assertSame('05M', $c->format(1350));
    }
}
