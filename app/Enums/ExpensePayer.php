<?php

namespace App\Enums;

enum ExpensePayer: string
{
    use HasLabel;

    case Buyer = 'buyer';
    case Seller = 'seller';
}
