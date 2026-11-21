<?php

namespace App\Enums;

/** How one expense line is calculated from the maliyat. */
enum RateCalcType: string
{
    use HasLabel;

    case Percent = 'percent';                    // maliyat x rate (+ fixed add-on)
    case PercentFilerNonFiler = 'percent_filer'; // maliyat x (filer rate | non-filer rate)
    case Fixed = 'fixed';                        // fixed amount
    case Plra = 'plra';                          // base upto threshold, then +step per lakh
    case Excise = 'excise';                      // free upto N marla, fixed above
    case PercentOfLandValue = 'percent_land';    // e.g. makaan 2% of land value
}
