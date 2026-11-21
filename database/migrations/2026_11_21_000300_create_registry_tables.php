<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Registry cases (from demand to handover), intiqal allocation,
 * expense rates (editable) and calculated registry expenses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registry_cases', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 20)->unique();       // REQ-0045
            $table->foreignId('plot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained();  // buyer
            $table->string('mode', 20);                       // App\Enums\RegistryMode
            $table->string('status', 40)->default('demand');  // App\Enums\RegistryStatus
            $table->date('demand_date');
            $table->decimal('area_marla', 8, 2);
            $table->decimal('area_sqft', 12, 2);
            $table->unsignedBigInteger('maliyat');             // registry valuation (Rs)
            $table->string('seller_name')->nullable();         // filled from intiqal holder(s)

            // fard
            $table->timestamp('fard_jari_at')->nullable();
            $table->foreignId('fard_jari_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('fard_jari_message')->nullable();
            $table->string('fard_no')->nullable();
            $table->date('fard_received_on')->nullable();
            $table->date('fard_handed_over_on')->nullable();

            // registry (both modes record the registry details)
            $table->string('registry_no')->nullable();
            $table->date('registry_date')->nullable();
            $table->string('registry_office')->nullable();
            $table->string('buyer_intiqal_no')->nullable();     // mutation in buyer's name, if known
            $table->date('registry_recorded_on')->nullable();   // came to office (Raasta B)
            $table->date('handed_over_on')->nullable();

            // Raasta B
            $table->boolean('expense_paid')->default(false);
            $table->timestamp('expense_paid_at')->nullable();
            $table->foreignId('expense_paid_by')->nullable()->constrained('users')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('status');
        });

        // A plot's fard can come from 2-3 intiqals; area taken from each is stored.
        Schema::create('registry_case_intiqal', function (Blueprint $table) {
            $table->id();
            $table->foreignId('registry_case_id')->constrained()->cascadeOnDelete();
            $table->foreignId('intiqal_id')->constrained()->restrictOnDelete();
            $table->decimal('area_sqft', 12, 2);
            $table->timestamps();
            $table->unique(['registry_case_id', 'intiqal_id']);
        });

        // Editable rates - same lines as the Google Sheet "Registery Exp".
        Schema::create('expense_rates', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();            // stamp_paper, tma, 236k ...
            $table->string('label');
            $table->string('label_ur')->nullable();
            $table->string('payer', 10);                     // buyer | seller
            $table->string('calc_type', 20);                 // App\Enums\RateCalcType
            $table->decimal('rate', 8, 4)->nullable();        // percent, e.g. 1.0000 = 1%
            $table->decimal('non_filer_rate', 8, 4)->nullable();
            $table->unsignedBigInteger('fixed_amount')->default(0);
            $table->json('params')->nullable();               // plra / excise thresholds
            $table->boolean('receipt')->default(true);        // Receipt / No Receipt
            $table->boolean('default_on')->default(true);     // ticked by default on the form
            $table->unsignedSmallInteger('sort')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('registry_expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('registry_case_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20);                       // registry_expense | seller_expense
            $table->unsignedBigInteger('maliyat');
            $table->decimal('area_marla', 8, 2);
            $table->boolean('buyer_is_filer');
            $table->boolean('seller_is_filer');
            $table->unsignedBigInteger('land_value')->nullable(); // for makaan 2%
            $table->unsignedBigInteger('buyer_total');
            $table->unsignedBigInteger('seller_total');
            $table->unsignedBigInteger('grand_total');
            $table->string('seller_name')->nullable();
            $table->string('buyer_name')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('registry_expense_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('registry_expense_id')->constrained()->cascadeOnDelete();
            $table->string('code', 40);
            $table->string('label');
            $table->string('payer', 10);
            $table->decimal('rate', 8, 4)->nullable();
            $table->unsignedBigInteger('amount');
            $table->boolean('receipt')->default(true);
            $table->boolean('is_manual')->default(false);     // user overrode the calculated amount
            $table->unsignedSmallInteger('sort')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registry_expense_lines');
        Schema::dropIfExists('registry_expenses');
        Schema::dropIfExists('expense_rates');
        Schema::dropIfExists('registry_case_intiqal');
        Schema::dropIfExists('registry_cases');
    }
};
