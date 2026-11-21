<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Director approvals by email (no login for the director).
 *  - one-click Approve/Reject links (token stored as a hash), or
 *  - reply "Approved"/"Rejected" read from the Gmail inbox.
 * Every incoming email is kept in inbound_emails as evidence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_requests', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 20)->unique();          // APR-0001 (also put in email subject)
            $table->foreignId('registry_case_id')->constrained()->cascadeOnDelete();
            $table->foreignId('registry_expense_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 30);                          // App\Enums\ApprovalType
            $table->string('status', 30)->default('draft');      // App\Enums\ApprovalStatus

            // email that went out
            $table->string('to_email');
            $table->json('cc')->nullable();
            $table->string('subject');
            $table->longText('body_html')->nullable();
            $table->string('outgoing_message_id')->nullable();   // to match replies by In-Reply-To
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();

            // one-click links
            $table->string('approve_token_hash', 64)->nullable();
            $table->string('reject_token_hash', 64)->nullable();
            $table->timestamp('tokens_expire_at')->nullable();

            // director decision
            $table->string('decision', 10)->nullable();          // approved | rejected
            $table->string('decision_channel', 10)->nullable();  // link | reply
            $table->timestamp('decided_at')->nullable();
            $table->string('decided_from_email')->nullable();
            $table->string('decided_ip', 45)->nullable();
            $table->text('director_remarks')->nullable();

            // our "Check & Review"
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->text('verify_remarks')->nullable();

            $table->timestamps();
            $table->index(['status', 'type']);
        });

        Schema::create('inbound_emails', function (Blueprint $table) {
            $table->id();
            $table->string('message_id')->unique();
            $table->string('in_reply_to')->nullable();
            $table->string('from_email');
            $table->string('subject')->nullable();
            $table->longText('body_text')->nullable();
            $table->text('auth_results')->nullable();            // Authentication-Results header
            $table->timestamp('received_at')->nullable();
            $table->foreignId('approval_request_id')->nullable()->constrained()->nullOnDelete();
            $table->string('result', 30);                        // approved | rejected | unclear | unknown_sender | unmatched | not_authenticated | ignored
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inbound_emails');
        Schema::dropIfExists('approval_requests');
    }
};
