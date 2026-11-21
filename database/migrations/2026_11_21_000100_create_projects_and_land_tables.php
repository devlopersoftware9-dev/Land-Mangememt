<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Projects (societies), land purchase, intiqals, non-saleable parcels, streets.
 * NOTE: no purchase price columns on purpose - only ticks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();          // e.g. RG2
            $table->string('name');
            $table->string('name_ur')->nullable();
            $table->string('developer')->nullable();       // e.g. Rafiq Builders & Developers
            $table->string('location')->nullable();
            $table->string('mauza')->nullable();
            $table->unsignedSmallInteger('marla_sqft')->default(270);
            $table->string('map_file')->nullable();        // uploaded PDF / image of layout
            $table->string('map_svg')->nullable();         // generated SVG overlay
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('land_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('seller_name');
            $table->string('seller_name_ur')->nullable();
            $table->string('seller_father_name')->nullable();
            $table->string('seller_cnic', 15)->nullable();
            $table->string('seller_phone')->nullable();
            $table->string('mauza')->nullable();
            $table->string('khewat_no')->nullable();
            $table->string('khatooni_no')->nullable();
            $table->string('khasra_nos')->nullable();      // comma separated
            $table->decimal('area_sqft', 14, 2);           // total area bought
            $table->date('agreement_date')->nullable();
            // ticks only - no amounts
            $table->boolean('payment_cleared')->default(false);
            $table->timestamp('payment_cleared_at')->nullable();
            $table->foreignId('payment_cleared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('intiqal_done')->default(false);
            $table->timestamp('intiqal_done_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // An intiqal (mutation) through which land came to the company / owner.
        // Plots' fard is later issued from one or more intiqals; the system keeps
        // a running balance so more area than available is never issued.
        Schema::create('intiqals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('land_purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->string('intiqal_no');
            $table->date('intiqal_date')->nullable();
            $table->string('holder_name');                 // appears as SELLER in registry, e.g. Qamar Uz Zaman
            $table->string('holder_name_ur')->nullable();
            $table->string('holder_cnic', 15)->nullable();
            $table->boolean('holder_is_filer')->default(true);
            $table->date('holder_acquired_on')->nullable(); // for 236-C "purchased less than 3 years"
            $table->string('mauza')->nullable();
            $table->string('khasra_nos')->nullable();
            $table->decimal('area_sqft', 14, 2);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'intiqal_no']);
        });

        Schema::create('land_parcels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30);                    // App\Enums\ParcelType
            $table->string('name');                        // "Park 1", "St. 21 (30 ft)"
            $table->string('name_ur')->nullable();
            $table->decimal('area_sqft', 14, 2)->default(0);
            $table->decimal('width_ft', 8, 2)->nullable(); // roads / water course
            $table->json('map_shape')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('streets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('number', 20);                  // "21"
            $table->string('name')->nullable();
            $table->decimal('width_ft', 8, 2)->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('streets');
        Schema::dropIfExists('land_parcels');
        Schema::dropIfExists('intiqals');
        Schema::dropIfExists('land_purchases');
        Schema::dropIfExists('projects');
    }
};
