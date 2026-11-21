<?php

namespace App\Enums;

enum RegistryMode: string
{
    use HasLabel;

    /** Raasta A: fard is handed to the client, client gets registry done himself. */
    case ClientSelf = 'client_self';

    /** Raasta B: company takes expenses from client and gets the registry done. */
    case CompanyManaged = 'company_managed';
}
