<?php

namespace App\Enums;

enum ConstructionStatus: string
{
    use HasLabel;

    case Empty = 'empty';
    case Started = 'started';
    case Residence = 'residence';
}
