<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customers, plots and the permanent ownership history.
 * NOTE: no sale price / installment columns on purpose.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('name_ur')->nullable();
            $table->string('relation', 5)->default('s/o');  // s/o, d/o, w/o
            $table->string('father_name')->nullable();
            $table->string('cnic', 15)->nullable()->unique();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->boolean('is_filer')->default(false);
            $table->string('nominee_name')->nullable();
            $table->string('nominee_cnic', 15)->nullable();
            $table->string('nominee_relation')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('plots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('street_id')->nullable()->constrained()->nullOnDelete();
            $table->string('plot_no', 20);                  // "21.45" or "P.01"
            $table->string('category', 20)->default('residential');
            $table->decimal('size_marla', 8, 2)->nullable();
            $table->decimal('area_sqft', 12, 2)->nullable();
            $table->decimal('width_ft', 8, 2)->nullable();
            $table->decimal('depth_ft', 8, 2)->nullable();
            $table->boolean('is_corner')->default(false);
            $table->boolean('is_park_facing')->default(false);
            $table->boolean('is_main_road')->default(false);
            $table->string('sale_status', 30)->default('available');
            $table->string('construction_status', 20)->default('empty');
            $table->foreignId('current_customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->date('sold_on')->nullable();
            $table->timestamp('payment_cleared_at')->nullable();
            $table->foreignId('payment_cleared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('map_shape')->nullable();          // SVG polygon points
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['project_id', 'plot_no']);
            $table->index(['project_id', 'sale_status']);
        });

        // One row per period in which somebody held the plot.
        // customer_id NULL = company held it.
        Schema::create('plot_ownerships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->date('started_on');
            $table->date('ended_on')->nullable();
            $table->string('start_event', 30);              // App\Enums\OwnershipEvent
            $table->string('end_event', 30)->nullable();
            $table->timestamps();
            $table->index(['plot_id', 'ended_on']);
        });

        // Append-only timeline of everything that happened to a plot.
        Schema::create('plot_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plot_id')->constrained()->cascadeOnDelete();
            $table->string('event', 30);                    // App\Enums\OwnershipEvent
            $table->foreignId('from_customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('to_customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->date('event_date');
            $table->string('reference')->nullable();        // file no, registry no, etc.
            $table->text('notes')->nullable();
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['plot_id', 'event_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plot_events');
        Schema::dropIfExists('plot_ownerships');
        Schema::dropIfExists('plots');
        Schema::dropIfExists('customers');
    }
};
