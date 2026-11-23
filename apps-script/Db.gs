/**
 * Tiny table layer over sheet tabs. Row 1 = headers, column A = id.
 * Every cell is stored as plain text (tabs are formatted "@") so values like
 * plot no "21.10" or CNIC never get changed by Sheets. Use num()/bool() when reading.
 */
var SCHEMA = {
  Settings: ['key', 'value'],
  Projects: ['id', 'code', 'name', 'name_ur', 'developer', 'location', 'marla_sqft', 'is_active', 'created_at'],
  Users: ['id', 'name', 'email', 'role', 'department', 'locale', 'is_active', 'salt', 'password_hash', 'created_at'],
  Customers: ['id', 'name', 'name_ur', 'relation', 'father_name', 'cnic', 'phone', 'email', 'address', 'is_filer', 'nominee_name', 'nominee_cnic', 'nominee_relation', 'created_at'],
  Streets: ['id', 'project_id', 'number', 'width_ft'],
  Plots: ['id', 'project_id', 'street_id', 'plot_no', 'category', 'size_marla', 'area_sqft', 'width_ft', 'depth_ft', 'is_corner', 'is_park_facing', 'sale_status', 'construction_status', 'current_customer_id', 'sold_on', 'payment_cleared_at', 'payment_cleared_by', 'notes', 'created_at', 'updated_at', 'facing', 'payment_pending'],
  PlotEvents: ['id', 'plot_id', 'event', 'from_customer_id', 'to_customer_id', 'event_date', 'reference', 'notes', 'meta', 'created_by', 'created_at'],
  Ownerships: ['id', 'plot_id', 'customer_id', 'started_on', 'ended_on', 'start_event', 'end_event'],
  LandPurchases: ['id', 'project_id', 'seller_name', 'seller_father_name', 'seller_cnic', 'seller_phone', 'mauza', 'khewat_no', 'khatooni_no', 'khasra_nos', 'area_sqft', 'agreement_date', 'payment_cleared', 'payment_cleared_at', 'intiqal_done', 'intiqal_done_at', 'notes', 'created_at'],
  Intiqals: ['id', 'project_id', 'land_purchase_id', 'intiqal_no', 'intiqal_date', 'holder_name', 'holder_cnic', 'holder_is_filer', 'holder_acquired_on', 'khasra_nos', 'area_sqft', 'notes', 'created_at'],
  Parcels: ['id', 'project_id', 'type', 'name', 'area_sqft', 'width_ft', 'notes'],
  RegistryCases: ['id', 'reference', 'plot_id', 'customer_id', 'mode', 'status', 'demand_date', 'area_marla', 'area_sqft', 'maliyat', 'seller_name', 'fard_jari_at', 'fard_jari_by', 'fard_jari_message', 'fard_no', 'fard_received_on', 'fard_handed_over_on', 'registry_no', 'registry_date', 'registry_office', 'buyer_intiqal_no', 'registry_recorded_on', 'registry_copy_url', 'handed_over_on', 'expense_paid', 'expense_paid_at', 'expense_paid_by', 'notes', 'created_by', 'created_at', 'updated_at', 'payment_pending', 'pending_amount', 'pending_remarks'],
  CaseIntiqals: ['id', 'case_id', 'intiqal_id', 'area_sqft'],
  Approvals: ['id', 'reference', 'case_id', 'expense_id', 'type', 'status', 'to_email', 'cc', 'subject', 'sent_at', 'sent_by', 'approve_token_hash', 'reject_token_hash', 'tokens_expire_at', 'decision', 'decision_channel', 'decided_at', 'decided_from_email', 'director_remarks', 'verified_by', 'verified_at', 'verify_remarks', 'created_at'],
  InboundEmails: ['id', 'message_id', 'from_email', 'subject', 'body_text', 'auth_results', 'received_at', 'approval_id', 'result', 'processed_at'],
  Expenses: ['id', 'case_id', 'kind', 'maliyat', 'area_marla', 'buyer_is_filer', 'seller_is_filer', 'land_value', 'buyer_total', 'seller_total', 'grand_total', 'seller_name', 'buyer_name', 'created_by', 'created_at'],
  ExpenseLines: ['id', 'expense_id', 'code', 'label', 'payer', 'rate', 'amount', 'receipt', 'is_manual', 'sort'],
  Rates: ['id', 'code', 'label', 'label_ur', 'payer', 'calc_type', 'rate', 'non_filer_rate', 'fixed_amount', 'params', 'receipt', 'default_on', 'sort', 'is_active'],
  Notifications: ['id', 'user_id', 'approval_id', 'reason', 'detail', 'read_at', 'created_at'],
  Audit: ['id', 'at', 'user_id', 'action', 'table', 'record_id', 'details'],
};

/** Tabs nobody may edit by hand (history / evidence). */
var PROTECTED_TABS = ['PlotEvents', 'Ownerships', 'Audit', 'InboundEmails', 'Approvals'];

var Db = (function () {
  var cache = {};

  function sheet(table) {
    var sh = SpreadsheetApp.getActive().getSheetByName(table);
    if (!sh) fail('err.setup_missing', { table: table });
    return sh;
  }

  /** New columns added to SCHEMA after setup: add them to the sheet on the first write. */
  var widened = {};
  function wsheet(table) {
    var sh = sheet(table);
    if (widened[table]) return sh;
    var cols = SCHEMA[table], have = sh.getMaxColumns();
    if (have < cols.length) sh.insertColumnsAfter(have, cols.length - have);
    var head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
    if (String(head[cols.length - 1]) !== cols[cols.length - 1]) sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    widened[table] = true;
    return sh;
  }

  function toCell(v) {
    if (v === null || v === undefined) return '';
    if (v === true) return 'TRUE';
    if (v === false) return 'FALSE';
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Karachi', 'yyyy-MM-dd HH:mm:ss');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function fromCell(v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Karachi', 'yyyy-MM-dd');
    return v === null || v === undefined ? '' : String(v);
  }

  function all(table) {
    if (cache[table]) return cache[table];
    var cols = SCHEMA[table];
    var values = sheet(table).getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === '' && table !== 'Settings') continue;
      if (table === 'Settings' && values[i][0] === '') continue;
      var o = { _row: i + 1 };
      for (var c = 0; c < cols.length; c++) o[cols[c]] = fromCell(values[i][c]);
      rows.push(o);
    }
    cache[table] = rows;
    return rows;
  }

  function find(table, id) {
    id = String(id);
    for (var i = 0, rows = all(table); i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function get(table, id) {
    var r = find(table, id);
    if (!r) fail('err.not_found', { table: table, id: id });
    return r;
  }

  function where(table, field, value) {
    value = String(value);
    return all(table).filter(function (r) { return r[field] === value; });
  }

  /** Rows are appended in id order, so the last row holds the highest id (no full read needed). */
  function nextId(table) {
    var max = 0;
    if (!cache[table]) {
      var sh = sheet(table), last = sh.getLastRow();
      if (last <= 1) return '1';
      var v = parseInt(sh.getRange(last, 1).getValue(), 10);
      if (!isNaN(v)) return String(v + 1);
    }
    all(table).forEach(function (r) { var n = parseInt(r.id, 10); if (n > max) max = n; });
    return String(max + 1);
  }

  function insert(table, obj) {
    var cols = SCHEMA[table];
    var rec = {};
    if (cols[0] === 'id') rec.id = nextId(table);
    if (cols.indexOf('created_at') >= 0 && !obj.created_at) rec.created_at = nowIso();
    Object.keys(obj).forEach(function (k) { rec[k] = obj[k]; });
    var row = cols.map(function (c) { return toCell(rec[c]); });
    var sh = wsheet(table);
    // format as text BEFORE writing, so "21.10" / dates are never converted
    sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length).setNumberFormat('@').setValues([row]);
    delete cache[table];
    var out = {};
    cols.forEach(function (c, i) { out[c] = row[i]; });
    return out;
  }

  /** Insert many rows in one write (setup / seeding). */
  function insertMany(table, objs) {
    if (!objs.length) return;
    var cols = SCHEMA[table];
    var start = parseInt(nextId(table), 10);
    var rows = objs.map(function (o, i) {
      var rec = {};
      if (cols[0] === 'id') rec.id = String(start + i);
      if (cols.indexOf('created_at') >= 0) rec.created_at = nowIso();
      Object.keys(o).forEach(function (k) { rec[k] = o[k]; });
      return cols.map(function (c) { return toCell(rec[c]); });
    });
    var sh = wsheet(table);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, cols.length).setNumberFormat('@').setValues(rows);
    delete cache[table];
  }

  function update(table, id, patch) {
    if (PROTECTED_TABS.indexOf(table) >= 0 && table !== 'Approvals') fail('err.history_locked');
    var rec = get(table, id);
    var cols = SCHEMA[table];
    if (cols.indexOf('updated_at') >= 0) patch.updated_at = nowIso();
    Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
    var row = cols.map(function (c) { return toCell(rec[c]); });
    wsheet(table).getRange(rec._row, 1, 1, cols.length).setValues([row]);
    delete cache[table];
    return rec;
  }

  /** Only for Ownerships: close the open holding period. */
  function closeOwnership(id, endedOn, endEvent) {
    var rec = get('Ownerships', id);
    var cols = SCHEMA.Ownerships;
    sheet('Ownerships').getRange(rec._row, cols.indexOf('ended_on') + 1, 1, 2).setValues([[endedOn, endEvent]]);
    delete cache.Ownerships;
  }

  function setSetting(key, value) {
    var row = all('Settings').filter(function (r) { return r.key === key; })[0];
    if (row) sheet('Settings').getRange(row._row, 2).setValue(toCell(value));
    else {
      var sh = sheet('Settings');
      sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setNumberFormat('@').setValues([[key, toCell(value)]]);
    }
    delete cache.Settings;
  }

  return {
    all: all, find: find, get: get, where: where, insert: insert, insertMany: insertMany, update: update,
    closeOwnership: closeOwnership, setSetting: setSetting, clearCache: function () { cache = {}; },
  };
})();
