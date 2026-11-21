<?php

namespace Database\Seeders;

use App\Enums\PlotCategory;
use App\Models\Plot;
use App\Models\Project;
use App\Models\Street;
use Illuminate\Database\Seeder;

/** RG2 project with streets 21-33 and draft plot list (see database/data/rg2_plots.php). */
class Rg2ProjectSeeder extends Seeder
{
    public function run(): void
    {
        $data = require database_path('data/rg2_plots.php');

        $project = Project::firstOrCreate(['code' => $data['project']['code']], $data['project']);

        $count = 0;
        foreach ($data['streets'] as $number => [$first, $last, $missing]) {
            $street = Street::firstOrCreate(['project_id' => $project->id, 'number' => (string) $number]);
            for ($n = $first; $n <= $last; $n++) {
                if (in_array($n, $missing, true)) {
                    continue;
                }
                $plotNo = $number.'.'.str_pad((string) $n, 2, '0', STR_PAD_LEFT);
                $plot = Plot::firstOrNew(['project_id' => $project->id, 'plot_no' => $plotNo]);
                if (! $plot->exists) {
                    $plot->fill(['street_id' => $street->id, 'category' => PlotCategory::Residential])->save();
                    $count++;
                }
            }
        }

        foreach ($data['commercial'] as $plotNo) {
            $plot = Plot::firstOrNew(['project_id' => $project->id, 'plot_no' => $plotNo]);
            if (! $plot->exists) {
                $plot->fill(['category' => PlotCategory::Commercial])->save();
                $count++;
            }
        }

        foreach ($data['parcels'] as $parcel) {
            $project->parcels()->firstOrCreate(['name' => $parcel['name']], $parcel + ['area_sqft' => 0]);
        }

        $this->command?->info("RG2: {$count} plots created (draft – verify against the map).");
    }
}
