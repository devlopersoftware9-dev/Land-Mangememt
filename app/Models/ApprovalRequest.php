<?php

namespace App\Models;

use App\Enums\ApprovalStatus;
use App\Enums\ApprovalType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalRequest extends Model
{
    protected $fillable = [
        'reference', 'registry_case_id', 'registry_expense_id', 'type', 'status', 'to_email', 'cc', 'subject', 'body_html', 'sent_by',
    ];

    protected $hidden = ['approve_token_hash', 'reject_token_hash'];

    protected function casts(): array
    {
        return [
            'type' => ApprovalType::class,
            'status' => ApprovalStatus::class,
            'cc' => 'array',
            'sent_at' => 'datetime',
            'tokens_expire_at' => 'datetime',
            'decided_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function registryCase(): BelongsTo { return $this->belongsTo(RegistryCase::class); }
    public function expense(): BelongsTo { return $this->belongsTo(RegistryExpense::class, 'registry_expense_id'); }
    public function sender(): BelongsTo { return $this->belongsTo(User::class, 'sent_by'); }
    public function verifier(): BelongsTo { return $this->belongsTo(User::class, 'verified_by'); }
    public function inboundEmails(): HasMany { return $this->hasMany(InboundEmail::class); }

    public static function nextReference(): string
    {
        $last = static::query()->orderByDesc('id')->value('reference');
        $n = $last ? ((int) substr($last, 4)) + 1 : 1;

        return 'APR-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    public function awaitingDirector(): bool
    {
        // NeedsReview still accepts a later, clear reply or link click from the director
        return in_array($this->status, [ApprovalStatus::Sent, ApprovalStatus::NeedsReview], true);
    }

    public function awaitingVerification(): bool
    {
        return in_array($this->status, [ApprovalStatus::DirectorApproved, ApprovalStatus::DirectorRejected, ApprovalStatus::NeedsReview], true);
    }
}
