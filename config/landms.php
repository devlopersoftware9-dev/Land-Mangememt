<?php

/*
|--------------------------------------------------------------------------
| Land Management System settings
|--------------------------------------------------------------------------
| These are defaults. Most of them can be overridden per project / from the
| Settings page (stored in the `settings` table).
*/

return [

    // Local revenue unit used here: 1 marla = 270 sq ft, 1 kanal = 20 marla.
    'marla_sqft' => (int) env('LANDMS_MARLA_SQFT', 270),
    'marla_per_kanal' => 20,

    'approval' => [
        'director_email' => env('LANDMS_DIRECTOR_EMAIL'),
        'cc' => array_filter(array_map('trim', explode(',', (string) env('LANDMS_APPROVAL_CC', '')))),
        'sender_name' => env('LANDMS_SENDER_NAME', 'Accounts'),
        'sender_department' => env('LANDMS_SENDER_DEPARTMENT', 'Accounts'),

        // One-click Approve / Reject links expire after this many days.
        'link_valid_days' => (int) env('LANDMS_APPROVAL_LINK_DAYS', 7),

        // When true, only replies whose "Authentication-Results" header shows
        // SPF/DKIM/DMARC pass are trusted (protects against spoofed From).
        'require_authenticated_reply' => true,

        // Inbox folder the poller reads.
        'imap_folder' => 'INBOX',
    ],

    'request_prefix' => 'REQ-',
];
