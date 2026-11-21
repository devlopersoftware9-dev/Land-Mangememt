<?php

namespace App\Enums;

enum ApprovalStatus: string
{
    use HasLabel;

    case Draft = 'draft';
    case Sent = 'sent';                     // waiting for director
    case DirectorApproved = 'director_approved'; // waiting our Check & Verify
    case DirectorRejected = 'director_rejected'; // waiting our Check & Verify
    case NeedsReview = 'needs_review';      // unclear reply / unknown sender - a human must look
    case Verified = 'verified';             // we verified an approval -> workflow moved on
    case Closed = 'closed';                 // we verified a rejection -> case returned
    case Expired = 'expired';
}
