<?php

namespace App\Enums;

enum ApprovalType: string
{
    use HasLabel;

    case Fard = 'fard';                         // plot no, area, maliyat
    case RegistryExpense = 'registry_expense';  // buyer + seller expenses (Raasta B)
    case SellerExpense = 'seller_expense';      // seller side only, e.g. 236-C
}
