<?php

/*
|--------------------------------------------------------------------------
| RG2 plot numbers – DRAFT
|--------------------------------------------------------------------------
| Read from the text layer of "RG2 Rates.pdf" (AutoCAD export) on 21-11-2026.
| The drawing itself was NOT seen yet, so sizes, corners and shapes are empty
| and a few numbers may be missing (listed in 'missing'). Verify against the
| map PDF, then fill sizes before going live.
|
| Format: street => [first, last, [numbers not found in the PDF text]]
*/

return [
    'project' => [
        'code' => 'RG2',
        'name' => 'Royal Garden 2',
        'name_ur' => 'رائل گارڈن 2',
        'developer' => 'Rafiq Builders & Developers',
        'location' => 'Chak 297 Road',
        'marla_sqft' => 270,
    ],

    'streets' => [
        '21' => [3, 74, [4, 6, 8, 10, 12, 71, 73]],
        '22' => [1, 13, [12]],
        '23' => [1, 15, []],
        '24' => [1, 17, []],
        '25' => [1, 18, []],
        '26' => [1, 18, []],
        '27' => [1, 25, [24]],
        '28' => [1, 22, [18]],
        '29' => [1, 21, []],
        '30' => [1, 19, []],
        '31' => [1, 18, []],
        '32' => [1, 26, [23, 25]],
        '33' => [1, 22, []],
    ],

    // Commercial plots (no street)
    'commercial' => ['P.01', 'P-2', 'P.03'],

    // Non-saleable areas seen on the map text (areas to be filled from the drawing)
    'parcels' => [
        ['type' => 'park', 'name' => 'Park (north)'],
        ['type' => 'park', 'name' => 'Park (south)'],
        ['type' => 'water_course', 'name' => 'Water Course', 'width_ft' => 11],
        ['type' => 'road', 'name' => 'Chak 297 Road'],
        ['type' => 'road', 'name' => 'Kacha Road'],
    ],
];
