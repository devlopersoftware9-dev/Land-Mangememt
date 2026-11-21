/**
 * Registry expense calculator – same as the Google Sheet "Registery Exp".
 * Pure JavaScript (no Apps Script services) so it is unit-tested with Node.
 *
 * rate / non_filer_rate are percents (1 = 1%).
 */
var DEFAULT_RATES = [
  { code: 'stamp_paper', label: 'Stamp Paper', label_ur: 'اسٹامپ پیپر', payer: 'buyer', calc_type: 'percent', rate: 1, fixed_amount: 1100, receipt: true, sort: 10 },
  { code: 'map_fee', label: 'Map Fee', label_ur: 'میپ فیس', payer: 'buyer', calc_type: 'fixed', fixed_amount: 0, receipt: true, sort: 20 },
  { code: 'tma_sale_tax', label: 'TMA - Sale Tax', label_ur: 'ٹی ایم اے سیل ٹیکس', payer: 'buyer', calc_type: 'percent', rate: 1, receipt: true, sort: 30 },
  { code: 'naksha_fee', label: 'Naksha Fee', label_ur: 'نقشہ فیس', payer: 'buyer', calc_type: 'fixed', fixed_amount: 0, receipt: true, sort: 40 },
  { code: 'intiqal_fee', label: 'Intiqal Fee', label_ur: 'انتقال فیس', payer: 'buyer', calc_type: 'fixed', fixed_amount: 1500, receipt: false, sort: 50 },
  { code: 'mix_exp', label: 'Mix Expense', label_ur: 'متفرق اخراجات', payer: 'buyer', calc_type: 'fixed', fixed_amount: 5000, receipt: false, sort: 60 },
  { code: 'excise_tax', label: 'Excise Tax (upto 5 marla free)', label_ur: 'ایکسائز ٹیکس (5 مرلہ تک فری)', payer: 'buyer', calc_type: 'excise', fixed_amount: 0, params: { free_upto_marla: 5 }, receipt: true, sort: 70 },
  { code: 'fbr_7e', label: '7E FBR (paid by seller)', label_ur: '7E ایف بی آر', payer: 'seller', calc_type: 'percent', rate: 1, receipt: true, default_on: false, sort: 80 },
  { code: 'tax_236c', label: '236-C Tax (held < 3 years)', label_ur: '236-C ٹیکس', payer: 'seller', calc_type: 'percent_filer', rate: 2.75, non_filer_rate: 11.5, receipt: true, sort: 90 },
  { code: 'cg_verification', label: 'CG Verification', label_ur: 'سی جی ویریفیکیشن', payer: 'buyer', calc_type: 'fixed', fixed_amount: 500, receipt: true, sort: 100 },
  { code: 'tax_236k', label: '236-K Tax', label_ur: '236-K ٹیکس', payer: 'buyer', calc_type: 'percent_filer', rate: 1.25, non_filer_rate: 10.5, receipt: true, sort: 110 },
  { code: 'la_commission', label: 'LA Commission', label_ur: 'ایل اے کمیشن', payer: 'buyer', calc_type: 'fixed', fixed_amount: 0, receipt: false, sort: 120 },
  { code: 'makaan', label: 'In case Makaan (2% of land value)', label_ur: 'مکان کی صورت میں (2٪)', payer: 'seller', calc_type: 'percent_land', rate: 2, receipt: true, default_on: false, sort: 130 },
  { code: 'plra', label: 'PLRA (3,600 upto 31 lac, +100 per lac)', label_ur: 'پی ایل آر اے فیس', payer: 'buyer', calc_type: 'plra', params: { base: 3600, upto: 3100000, step: 100, per: 100000 }, receipt: true, sort: 140 },
  { code: 'registration_fee', label: 'Registration Fee', label_ur: 'رجسٹریشن فیس', payer: 'buyer', calc_type: 'percent', rate: 0.5, receipt: false, sort: 150 },
];

var ExpenseCalc = (function () {
  function n(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
  function yes(v, dflt) {
    if (v === undefined || v === null || v === '') return dflt;
    return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
  }
  /** round half up to whole rupees, avoiding float noise */
  function rupees(v) { return Math.floor(v + 0.5 + 1e-6); }
  function params(r) {
    if (!r.params) return {};
    return typeof r.params === 'string' ? JSON.parse(r.params || '{}') : r.params;
  }

  function lineAmount(r, input) {
    var m = n(input.maliyat);
    var p = params(r);
    switch (r.calc_type) {
      case 'percent':
        return { rate: n(r.rate), amount: rupees(m * n(r.rate) / 100) + n(r.fixed_amount) };
      case 'percent_filer':
        var filer = r.payer === 'buyer' ? yes(input.buyer_is_filer, false) : yes(input.seller_is_filer, false);
        var rate = filer ? n(r.rate) : (r.non_filer_rate !== '' && r.non_filer_rate !== undefined ? n(r.non_filer_rate) : n(r.rate));
        return { rate: rate, amount: rupees(m * rate / 100) };
      case 'fixed':
        return { rate: null, amount: n(r.fixed_amount) };
      case 'plra':
        var base = n(p.base || 3600), upto = n(p.upto || 3100000), step = n(p.step || 100), per = Math.max(1, n(p.per || 100000));
        var extra = m > upto ? Math.ceil((m - upto) / per) : 0;
        return { rate: null, amount: base + extra * step };
      case 'excise':
        var free = p.free_upto_marla !== undefined ? n(p.free_upto_marla) : 5;
        return { rate: null, amount: n(input.area_marla) <= free ? 0 : n(r.fixed_amount) };
      case 'percent_land':
        return { rate: n(r.rate), amount: rupees(n(input.land_value) * n(r.rate) / 100) };
    }
    return { rate: null, amount: 0 };
  }

  /**
   * input: { maliyat, area_marla, buyer_is_filer, seller_is_filer, land_value,
   *          kind: 'registry_expense'|'seller_expense', enabled: {code:bool}, manual: {code:int} }
   */
  function calculate(rates, input) {
    var enabled = input.enabled || {}, manual = input.manual || {};
    var list = rates.filter(function (r) { return yes(r.is_active, true); })
      .slice().sort(function (a, b) { return n(a.sort) - n(b.sort); });
    var lines = [];
    list.forEach(function (r) {
      if (input.kind === 'seller_expense' && r.payer !== 'seller') return;
      var on = enabled.hasOwnProperty(r.code) ? yes(enabled[r.code], false) : yes(r.default_on, true);
      if (!on) return;
      var calc = lineAmount(r, input);
      var isManual = manual.hasOwnProperty(r.code) && manual[r.code] !== '' && manual[r.code] !== null;
      lines.push({
        code: r.code, label: r.label, label_ur: r.label_ur || '', payer: r.payer, rate: calc.rate,
        amount: isManual ? Math.max(0, Math.round(n(manual[r.code]))) : calc.amount,
        receipt: yes(r.receipt, true), is_manual: isManual, sort: n(r.sort),
      });
    });
    var buyer = 0, seller = 0;
    lines.forEach(function (l) { if (l.payer === 'buyer') buyer += l.amount; else seller += l.amount; });
    return { lines: lines, buyer_total: buyer, seller_total: seller, grand_total: buyer + seller };
  }

  return { calculate: calculate };
})();

if (typeof module !== 'undefined') module.exports = { ExpenseCalc: ExpenseCalc, DEFAULT_RATES: DEFAULT_RATES };
