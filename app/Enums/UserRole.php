<?php

namespace App\Enums;

enum UserRole: string
{
    use HasLabel;

    case Admin = 'admin';
    case Accounts = 'accounts';                 // sales entry, payment clear, demands, approvals, expense calc
    case LandManagement = 'land_management';    // land purchase, intiqals, selects intiqal + "Fard Jari" message
    case RegistryOfficer = 'registry_officer';  // fard received, registry done, handover
    case Viewer = 'viewer';                     // read only
}
