<?php

namespace App\Enums;

enum PlotCategory: string
{
    use HasLabel;

    case Residential = 'residential';
    case Commercial = 'commercial';
}
