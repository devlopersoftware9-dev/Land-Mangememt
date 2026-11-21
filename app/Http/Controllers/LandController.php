<?php

namespace App\Http\Controllers;

use App\Enums\ParcelType;
use App\Models\AuditLog;
use App\Models\LandPurchase;
use App\Services\Area\AreaConverter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Land purchase (ticks only), intiqals (with balance), non-saleable parcels. */
class LandController extends Controller
{
    public function index()
    {
        $project = $this->project();

        return view('land.index', [
            'project' => $project,
            'purchases' => $project->landPurchases()->latest()->get(),
            'intiqals' => $project->intiqals()->with('landPurchase')->get(),
            'parcels' => $project->parcels()->orderBy('type')->get(),
            'area' => $project->areaSummary(),
            'conv' => new AreaConverter($project->marla_sqft),
            'parcelTypes' => ParcelType::options(),
        ]);
    }

    public function storePurchase(Request $request)
    {
        $data = $request->validate([
            'seller_name' => 'required|string|max:150',
            'seller_father_name' => 'nullable|string|max:150',
            'seller_cnic' => ['nullable', 'regex:/^\d{5}-\d{7}-\d$/'],
            'seller_phone' => 'nullable|string|max:30',
            'mauza' => 'nullable|string|max:100',
            'khewat_no' => 'nullable|string|max:50',
            'khatooni_no' => 'nullable|string|max:50',
            'khasra_nos' => 'nullable|string|max:255',
            'kanal' => 'nullable|numeric|min:0',
            'marla' => 'nullable|numeric|min:0',
            'sqft' => 'nullable|numeric|min:0',
            'agreement_date' => 'nullable|date',
            'notes' => 'nullable|string',
        ]);
        $data['area_sqft'] = $this->sqft($data);
        $purchase = $this->project()->landPurchases()->create($data);
        AuditLog::record('land.purchase.created', $purchase);

        return back()->with('status', __('app.saved'));
    }

    /** The two ticks: "Payment Clear" and "Intiqal Done". */
    public function tickPurchase(Request $request, LandPurchase $purchase)
    {
        abort_unless($purchase->project_id === $this->project()->id, 404);
        $field = $request->validate(['field' => 'required|in:payment_cleared,intiqal_done'])['field'];
        $on = ! $purchase->{$field};
        $purchase->forceFill([
            $field => $on,
            $field.'_at' => $on ? now() : null,
        ] + ($field === 'payment_cleared' ? ['payment_cleared_by' => $on ? auth()->id() : null] : []))->save();
        AuditLog::record('land.purchase.'.$field, $purchase, [], [$field => $on]);

        return back()->with('status', __('app.saved'));
    }

    public function storeIntiqal(Request $request)
    {
        $project = $this->project();
        $data = $request->validate([
            'land_purchase_id' => ['nullable', Rule::exists('land_purchases', 'id')->where('project_id', $project->id)],
            'intiqal_no' => ['required', 'string', 'max:50', Rule::unique('intiqals')->where('project_id', $project->id)],
            'intiqal_date' => 'nullable|date',
            'holder_name' => 'required|string|max:150',
            'holder_cnic' => ['nullable', 'regex:/^\d{5}-\d{7}-\d$/'],
            'holder_is_filer' => 'boolean',
            'holder_acquired_on' => 'nullable|date',
            'mauza' => 'nullable|string|max:100',
            'khasra_nos' => 'nullable|string|max:255',
            'kanal' => 'nullable|numeric|min:0',
            'marla' => 'nullable|numeric|min:0',
            'sqft' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);
        $data['area_sqft'] = $this->sqft($data);
        $intiqal = $project->intiqals()->create($data);
        AuditLog::record('land.intiqal.created', $intiqal);

        return back()->with('status', __('app.saved'));
    }

    public function storeParcel(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', Rule::enum(ParcelType::class)],
            'name' => 'required|string|max:150',
            'name_ur' => 'nullable|string|max:150',
            'kanal' => 'nullable|numeric|min:0',
            'marla' => 'nullable|numeric|min:0',
            'sqft' => 'nullable|numeric|min:0',
            'width_ft' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ]);
        $data['area_sqft'] = $this->sqft($data);
        $this->project()->parcels()->create($data);

        return back()->with('status', __('app.saved'));
    }

    private function sqft(array &$data): float
    {
        $conv = new AreaConverter($this->project()->marla_sqft);
        $v = $conv->toSqft((float) ($data['kanal'] ?? 0), (float) ($data['marla'] ?? 0), (float) ($data['sqft'] ?? 0));
        unset($data['kanal'], $data['marla'], $data['sqft']);

        return $v;
    }
}
