<?php

use App\Http\Controllers\ApprovalController;
use App\Http\Controllers\ApprovalDecisionController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ExpenseRateController;
use App\Http\Controllers\LandController;
use App\Http\Controllers\PlotController;
use App\Http\Controllers\PreferenceController;
use App\Http\Controllers\RegistryCaseController;
use Illuminate\Support\Facades\Route;

// ---------------------------------------------------------------- public
Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

// Director's one-click links from the email (no login). GET shows a confirm page, POST records.
Route::get('/a/{reference}/{decision}/{token}', [ApprovalDecisionController::class, 'show'])->name('approval.decide');
Route::post('/a/{reference}/{decision}/{token}', [ApprovalDecisionController::class, 'confirm'])
    ->middleware('throttle:20,1')->name('approval.confirm');

// Language switch works for everyone
Route::get('/lang/{locale}', [PreferenceController::class, 'locale'])->name('locale');

// ---------------------------------------------------------------- app
Route::middleware('auth')->group(function () {
    Route::get('/', [DashboardController::class, 'index'])->name('dashboard');
    Route::post('/project/switch', [PreferenceController::class, 'project'])->name('project.switch');

    // Plots
    Route::get('/plots', [PlotController::class, 'index'])->name('plots.index');
    Route::get('/plots/map', [PlotController::class, 'map'])->name('plots.map');
    Route::get('/plots/{plot}', [PlotController::class, 'show'])->name('plots.show');
    Route::middleware('role:accounts')->group(function () {
        Route::post('/plots/{plot}/sell', [PlotController::class, 'sell'])->name('plots.sell');
        Route::post('/plots/{plot}/payment-clear', [PlotController::class, 'clearPayment'])->name('plots.payment-clear');
        Route::post('/plots/{plot}/transfer', [PlotController::class, 'transfer'])->name('plots.transfer');
        Route::post('/plots/{plot}/cancel', [PlotController::class, 'cancel'])->name('plots.cancel');
        Route::post('/plots/{plot}/repurchase', [PlotController::class, 'repurchase'])->name('plots.repurchase');
        Route::post('/plots/{plot}/construction', [PlotController::class, 'construction'])->name('plots.construction');
    });

    // Customers
    Route::get('/customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::get('/customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
    Route::post('/customers', [CustomerController::class, 'store'])->middleware('role:accounts')->name('customers.store');

    // Land: purchases, intiqals, non-saleable parcels
    Route::get('/land', [LandController::class, 'index'])->name('land.index');
    Route::middleware('role:land_management')->group(function () {
        Route::post('/land/purchases', [LandController::class, 'storePurchase'])->name('land.purchases.store');
        Route::post('/land/purchases/{purchase}/tick', [LandController::class, 'tickPurchase'])->name('land.purchases.tick');
        Route::post('/land/intiqals', [LandController::class, 'storeIntiqal'])->name('land.intiqals.store');
        Route::post('/land/parcels', [LandController::class, 'storeParcel'])->name('land.parcels.store');
    });

    // Registry
    Route::get('/registry', [RegistryCaseController::class, 'index'])->name('registry.index');
    Route::get('/registry/{case}', [RegistryCaseController::class, 'show'])->name('registry.show');
    Route::post('/registry', [RegistryCaseController::class, 'store'])->name('registry.store');
    Route::post('/registry/{case}/{step}', [RegistryCaseController::class, 'step'])
        ->whereIn('step', [
            'send-fard-approval', 'fard-jari', 'fard-received', 'hand-over-fard', 'client-registry',
            'expense-preview', 'expense-save', 'expense-paid', 'registry-done', 'record-in-office', 'hand-over', 'cancel',
        ])->name('registry.step');

    // Approvals (our side: Check & Review / Verify)
    Route::get('/approvals', [ApprovalController::class, 'index'])->name('approvals.index');
    Route::get('/approvals/{approval}', [ApprovalController::class, 'show'])->name('approvals.show');
    Route::post('/approvals/{approval}/verify', [ApprovalController::class, 'verify'])->name('approvals.verify');
    Route::post('/approvals/{approval}/resolve', [ApprovalController::class, 'resolve'])->name('approvals.resolve');

    // Settings
    Route::middleware('role:admin')->group(function () {
        Route::get('/settings/rates', [ExpenseRateController::class, 'index'])->name('rates.index');
        Route::put('/settings/rates', [ExpenseRateController::class, 'update'])->name('rates.update');
    });
});
