<?php

return [
    'UserRole' => [
        'admin' => 'Admin', 'accounts' => 'Accounts', 'land_management' => 'Land Management',
        'registry_officer' => 'Registry Officer', 'viewer' => 'Viewer',
    ],
    'PlotSaleStatus' => [
        'available' => 'Available', 'sold' => 'Sold', 'payment_cleared' => 'Payment Clear',
        'registry_in_process' => 'Registry in process', 'registered' => 'Registered', 'blocked' => 'Blocked',
    ],
    'ConstructionStatus' => ['empty' => 'Empty plot', 'started' => 'Construction started', 'residence' => 'Residence'],
    'PlotCategory' => ['residential' => 'Residential', 'commercial' => 'Commercial'],
    'ParcelType' => [
        'road' => 'Road', 'park' => 'Park', 'masjid' => 'Masjid', 'green_belt' => 'Green belt', 'graveyard' => 'Graveyard',
        'public_building' => 'Public building', 'solid_waste' => 'Solid waste', 'water_course' => 'Water course', 'other' => 'Other',
    ],
    'OwnershipEvent' => [
        'sold' => 'Sold', 'payment_cleared' => 'Payment cleared', 'transferred' => 'Transferred', 'cancelled' => 'Sale cancelled',
        'repurchased' => 'Repurchased by company', 'registry_started' => 'Registry demand', 'registered' => 'Registered',
        'construction_changed' => 'Construction updated', 'note' => 'Note',
    ],
    'RegistryMode' => ['client_self' => 'Client himself (fard to client)', 'company_managed' => 'Company gets registry done'],
    'RegistryStatus' => [
        'demand' => 'Demand', 'fard_approval_pending' => 'Fard approval – with director', 'fard_approval_review' => 'Fard approval – check & verify',
        'fard_approved' => 'Fard approved – select intiqal', 'fard_jari_issued' => 'Fard jari message issued', 'fard_received' => 'Fard received',
        'fard_handed_over' => 'Fard handed to client', 'client_registry_recorded' => 'Client registry recorded',
        'expense_approval_pending' => 'Expense approval – with director', 'expense_approval_review' => 'Expense approval – check & verify',
        'expense_approved' => 'Expense approved', 'expense_paid' => 'Expense paid', 'registry_done' => 'Registry done',
        'registry_recorded' => 'Registry recorded in office', 'handed_over' => 'Registry handed over', 'cancelled' => 'Cancelled',
    ],
    'ApprovalType' => ['fard' => 'Fard approval', 'registry_expense' => 'Registry expense approval', 'seller_expense' => 'Seller expense approval'],
    'ApprovalStatus' => [
        'draft' => 'Draft', 'sent' => 'With director', 'director_approved' => 'Director approved – verify',
        'director_rejected' => 'Director rejected – verify', 'needs_review' => 'Needs review', 'verified' => 'Verified',
        'closed' => 'Closed (rejected)', 'expired' => 'Expired',
    ],
    'ExpensePayer' => ['buyer' => 'Buyer', 'seller' => 'Seller'],
    'RateCalcType' => [
        'percent' => '% of maliyat', 'percent_filer' => '% (filer / non-filer)', 'fixed' => 'Fixed amount',
        'plra' => 'PLRA slab', 'excise' => 'Free upto N marla', 'percent_land' => '% of land value',
    ],
];
