<?php

return [
    'UserRole' => [
        'admin' => 'ایڈمن', 'accounts' => 'اکاؤنٹس', 'land_management' => 'لینڈ مینجمنٹ',
        'registry_officer' => 'رجسٹری آفیسر', 'viewer' => 'صرف دیکھنے والا',
    ],
    'PlotSaleStatus' => [
        'available' => 'دستیاب', 'sold' => 'فروخت شدہ', 'payment_cleared' => 'پیمنٹ کلیئر',
        'registry_in_process' => 'رجسٹری جاری', 'registered' => 'رجسٹری مکمل', 'blocked' => 'روکا ہوا',
    ],
    'ConstructionStatus' => ['empty' => 'خالی پلاٹ', 'started' => 'تعمیر شروع', 'residence' => 'رہائش'],
    'PlotCategory' => ['residential' => 'رہائشی', 'commercial' => 'کمرشل'],
    'ParcelType' => [
        'road' => 'سڑک', 'park' => 'پارک', 'masjid' => 'مسجد', 'green_belt' => 'گرین بیلٹ', 'graveyard' => 'قبرستان',
        'public_building' => 'پبلک بلڈنگ', 'solid_waste' => 'سالڈ ویسٹ', 'water_course' => 'کھال', 'other' => 'دیگر',
    ],
    'OwnershipEvent' => [
        'sold' => 'فروخت', 'payment_cleared' => 'پیمنٹ کلیئر', 'transferred' => 'منتقلی', 'cancelled' => 'سیل منسوخ',
        'repurchased' => 'کمپنی نے واپس لیا', 'registry_started' => 'رجسٹری ڈیمانڈ', 'registered' => 'رجسٹری مکمل',
        'construction_changed' => 'تعمیر اپڈیٹ', 'note' => 'نوٹ',
    ],
    'RegistryMode' => ['client_self' => 'کلائنٹ خود (فرد کلائنٹ کو)', 'company_managed' => 'کمپنی رجسٹری کروائے'],
    'RegistryStatus' => [
        'demand' => 'ڈیمانڈ', 'fard_approval_pending' => 'فرد منظوری – ڈائریکٹر کے پاس', 'fard_approval_review' => 'فرد منظوری – چیک اور تصدیق',
        'fard_approved' => 'فرد منظور – انتقال منتخب کریں', 'fard_jari_issued' => 'فرد جاری کا پیغام', 'fard_received' => 'فرد وصول',
        'fard_handed_over' => 'فرد کلائنٹ کے حوالے', 'client_registry_recorded' => 'کلائنٹ کی رجسٹری درج',
        'expense_approval_pending' => 'اخراجات منظوری – ڈائریکٹر کے پاس', 'expense_approval_review' => 'اخراجات منظوری – چیک اور تصدیق',
        'expense_approved' => 'اخراجات منظور', 'expense_paid' => 'اخراجات ادا', 'registry_done' => 'رجسٹری ہو گئی',
        'registry_recorded' => 'رجسٹری دفتر میں درج', 'handed_over' => 'رجسٹری حوالے', 'cancelled' => 'منسوخ',
    ],
    'ApprovalType' => ['fard' => 'فرد منظوری', 'registry_expense' => 'رجسٹری اخراجات منظوری', 'seller_expense' => 'فروخت کنندہ اخراجات منظوری'],
    'ApprovalStatus' => [
        'draft' => 'ڈرافٹ', 'sent' => 'ڈائریکٹر کے پاس', 'director_approved' => 'ڈائریکٹر نے منظور کیا – تصدیق کریں',
        'director_rejected' => 'ڈائریکٹر نے نامنظور کیا – تصدیق کریں', 'needs_review' => 'جائزہ درکار', 'verified' => 'تصدیق شدہ',
        'closed' => 'بند (نامنظور)', 'expired' => 'مدت ختم',
    ],
    'ExpensePayer' => ['buyer' => 'خریدار', 'seller' => 'فروخت کنندہ'],
    'RateCalcType' => [
        'percent' => 'مالیت کا ٪', 'percent_filer' => '٪ (فائلر / نان فائلر)', 'fixed' => 'مقررہ رقم',
        'plra' => 'PLRA سلیب', 'excise' => 'N مرلہ تک فری', 'percent_land' => 'زمین کی قیمت کا ٪',
    ],
];
