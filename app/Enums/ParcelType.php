<?php

namespace App\Enums;

/** Non-saleable parts of the layout. */
enum ParcelType: string
{
    use HasLabel;

    case Road = 'road';
    case Park = 'park';
    case Masjid = 'masjid';
    case GreenBelt = 'green_belt';
    case Graveyard = 'graveyard';
    case PublicBuilding = 'public_building';
    case SolidWaste = 'solid_waste';
    case WaterCourse = 'water_course';
    case Other = 'other';
}
