<?php

namespace App\Enums;

/**
 * Gives every backed enum a translated label, read from lang/{en,ur}/enums.php
 * e.g. __('enums.PlotSaleStatus.sold')
 */
trait HasLabel
{
    public function label(): string
    {
        $key = 'enums.'.class_basename(static::class).'.'.$this->value;
        $text = function_exists('__') ? __($key) : $key;

        return $text === $key ? ucwords(str_replace('_', ' ', $this->value)) : $text;
    }

    /** @return array<string,string> value => label, for <select> boxes */
    public static function options(): array
    {
        $out = [];
        foreach (self::cases() as $case) {
            $out[$case->value] = $case->label();
        }

        return $out;
    }
}
