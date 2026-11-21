<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InboundEmail extends Model
{
    protected $fillable = ['message_id', 'in_reply_to', 'from_email', 'subject', 'body_text', 'auth_results', 'received_at', 'approval_request_id', 'result', 'processed_at'];

    protected function casts(): array
    {
        return ['received_at' => 'datetime', 'processed_at' => 'datetime'];
    }

    public function approvalRequest(): BelongsTo { return $this->belongsTo(ApprovalRequest::class); }
}
