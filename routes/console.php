<?php

use Illuminate\Support\Facades\Schedule;

// Reads the Gmail inbox for director replies ("Approved" / "Rejected").
// Server cron needed once:  * * * * * php /path/to/artisan schedule:run
Schedule::command('approvals:poll-inbox')->everyTwoMinutes()->withoutOverlapping();

// Marks expired one-click approval links.
Schedule::command('approvals:expire-links')->hourly();
