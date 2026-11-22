/* Land Management System – single-file build (generated from apps-script/*.gs on 2026-11-22). Paste this as Code.gs. */

// ======================================================================== Core.gs
/**
 * Land Management System – Google Sheets + Apps Script edition.
 *
 * The Google Sheet is the database (one tab per table). The web app runs as the
 * sheet owner, so office users never need edit access to the sheet itself and
 * the history tabs can be protected.
 *
 * Core: enums, small helpers, errors, the web entry points and the API dispatcher.
 */

var ENUM = {
  roles: ['admin', 'accounts', 'land_management', 'registry_officer', 'viewer'],
  plotStatus: ['available', 'sold', 'payment_cleared', 'registry_in_process', 'registered', 'blocked'],
  construction: ['empty', 'started', 'residence'],
  category: ['residential', 'commercial'],
  parcelType: ['road', 'park', 'masjid', 'green_belt', 'graveyard', 'public_building', 'solid_waste', 'water_course', 'other'],
  registryMode: ['client_self', 'company_managed'],
  finalCase: ['client_registry_recorded', 'handed_over', 'cancelled'],
};

/** Who holds the file at each registry step (for the dashboard). */
var CASE_ACTOR = {
  demand: 'accounts', fard_approval_pending: 'accounts', fard_approval_review: 'accounts',
  fard_approved: 'land_management', fard_jari_issued: 'registry_officer', fard_received: 'registry_officer',
  fard_handed_over: 'accounts', expense_approval_pending: 'accounts', expense_approval_review: 'accounts',
  expense_approved: 'accounts', expense_paid: 'registry_officer', registry_done: 'registry_officer',
  registry_recorded: 'registry_officer',
};

/** Error with a translation code; the UI shows t(code, params). */
function AppError(code, params) {
  this.name = 'AppError';
  this.code = code;
  this.params = params || {};
  this.message = code;
}
AppError.prototype = Object.create(Error.prototype);

function fail(code, params) { throw new AppError(code, params); }

// ---------------------------------------------------------------- helpers
function nowIso() { return Utilities.formatDate(new Date(), 'Asia/Karachi', "yyyy-MM-dd HH:mm:ss"); }
function today() { return Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd'); }
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function int(v) { return Math.round(num(v)); }
function bool(v) { return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1'; }
function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function required(v, field) { if (str(v) === '') fail('err.required', { field: field }); return str(v); }
function validDate(v, field) {
  var s = required(v, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('err.date', { field: field });
  return s;
}
function sha256(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function randomToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

function setting(key, fallback) {
  var row = Db.all('Settings').filter(function (r) { return r.key === key; })[0];
  return row && str(row.value) !== '' ? row.value : fallback;
}

function webAppUrl() { return setting('web_app_url', '') || ScriptApp.getService().getUrl(); }

// ---------------------------------------------------------------- web entry points
/** Office app, or the director's one-click Approve/Reject page (?a=REF&d=approve&t=TOKEN). */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.a) {
    var tpl = HtmlService.createTemplateFromFile('Decide');
    tpl.view = Approval.decidePage(p.a, p.d, p.t);
    return tpl.evaluate().setTitle('Approval').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Land Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Director pressed "Confirm" on the decide page. Called with google.script.run. */
function confirmDecision(ref, decision, token) {
  return withLock(function () { return Approval.decideByLink(ref, decision, token); }, true);
}

/**
 * Single API entry used by the UI:  google.script.run.api(token, action, payload)
 * Returns {ok:true, data} or {ok:false, code, params}.
 */
function api(token, action, payload) {
  try {
    if (action === 'login') return { ok: true, data: Auth.login(payload.email, payload.password) };
    var user = Auth.userFromToken(token);
    var handler = API[action];
    if (!handler) fail('err.unknown_action');
    var data = handler.write
      ? withLock(function () { return handler.fn(user, payload || {}); })
      : handler.fn(user, payload || {});
    return { ok: true, data: data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, code: e.code, params: e.params };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, code: 'err.server', params: { msg: String(e && e.message || e) } };
  }
}

function withLock(fn, rethrowAppError) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail('err.busy');
  try {
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } catch (e) {
    if (rethrowAppError && e instanceof AppError) return { ok: false, code: e.code, params: e.params };
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** Include another HTML file (used by templates). */
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/** Action table. write:true runs under the script lock. */
var API = {
  logout: { fn: function (u) { Auth.logout(u); return true; } },
  me: { fn: function (u) { return Auth.publicUser(u); } },
  setLocale: { write: true, fn: function (u, p) { Db.update('Users', u.id, { locale: p.locale === 'ur' ? 'ur' : 'en' }); return true; } },
  changePassword: { write: true, fn: function (u, p) { return Auth.changePassword(u, p.current, p.password); } },

  bootstrap: { fn: function (u) { return Views.bootstrap(u); } },
  readNotifications: { write: true, fn: function (u) {
    Db.where('Notifications', 'user_id', u.id).filter(function (n) { return !n.read_at; })
      .forEach(function (n) { Db.update('Notifications', n.id, { read_at: nowIso() }); });
    return true;
  } },
  dashboard: { fn: function (u, p) { return Views.dashboard(p.project_id); } },
  plots: { fn: function (u, p) { return Views.plots(p); } },
  plotGrid: { fn: function (u, p) {
    return { rows: Views.plotRows(p.project_id), streets: Db.where('Streets', 'project_id', p.project_id).sort(function (a, b) { return num(a.number) - num(b.number); }),
      customers: Db.all('Customers').map(function (c) { return { id: c.id, label: c.name + (c.father_name ? ' ' + c.relation + ' ' + c.father_name : '') + (c.cnic ? ' (' + c.cnic + ')' : '') + (c.phone ? ' ' + c.phone : '') }; }) };
  } },
  /** Grid actions on one or many plots: op = sell | clearPayment | cancelSale | repurchase | demand. Returns fresh rows. */
  plotAction: { write: true, fn: function (u, p) {
    var ids = (p.plot_ids || []).map(String), done = [], errors = [], extra = null;
    Auth.require(u, 'accounts');
    var customerId = p.customer_id;
    if (p.op === 'sell' && !customerId && p.new_customer && str(p.new_customer.name)) customerId = Plots.saveCustomer(u, p.new_customer);
    ids.forEach(function (id) {
      var plot = Db.find('Plots', id);
      try {
        var a = Object.assign({}, p, { plot_id: id, customer_id: customerId });
        if (p.op === 'sell') Plots.sell(u, a);
        else if (p.op === 'clearPayment') Plots.clearPayment(u, a);
        else if (p.op === 'cancelSale') Plots.cancelSale(u, a);
        else if (p.op === 'repurchase') Plots.repurchase(u, a);
        else if (p.op === 'demand') extra = Registry.createDemand(u, a);
        else fail('err.unknown_action');
        done.push(id);
      } catch (e) {
        if (!(e instanceof AppError)) throw e;
        errors.push({ plot_no: plot ? plot.plot_no : id, code: e.code, params: e.params });
      }
    });
    var projectId = ids.length ? (Db.find('Plots', ids[0]) || {}).project_id : '';
    return { done: done, errors: errors, case_id: extra, customer_id: customerId || '', rows: projectId ? Views.plotRows(projectId, ids) : [] };
  } },
  plot: { fn: function (u, p) { return Views.plot(p.id); } },
  customers: { fn: function (u, p) { return Views.customers(p.q); } },
  customer: { fn: function (u, p) { return Views.customer(p.id); } },
  land: { fn: function (u, p) { return Views.land(p.project_id); } },
  registryList: { fn: function (u, p) { return Views.registryList(p.project_id, p.status); } },
  registryCase: { fn: function (u, p) { return Views.registryCase(p.id); } },
  approvals: { fn: function (u, p) { return Views.approvals(p.project_id, p.status); } },
  approval: { fn: function (u, p) { return Views.approval(p.id); } },
  rates: { fn: function () { return Db.all('Rates'); } },
  users: { fn: function (u) { Auth.require(u, 'admin'); return Db.all('Users').map(Auth.publicUser); } },

  // plots
  sell: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.sell(u, p); } },
  clearPayment: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.clearPayment(u, p); } },
  transfer: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.transfer(u, p); } },
  cancelSale: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.cancelSale(u, p); } },
  repurchase: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.repurchase(u, p); } },
  construction: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.construction(u, p); } },
  savePlot: { write: true, fn: function (u, p) { Auth.require(u, 'admin'); return Plots.savePlot(u, p); } },
  saveCustomer: { write: true, fn: function (u, p) { Auth.require(u, 'accounts'); return Plots.saveCustomer(u, p); } },

  // land
  savePurchase: { write: true, fn: function (u, p) { Auth.require(u, 'land_management'); return Land.savePurchase(u, p); } },
  tickPurchase: { write: true, fn: function (u, p) { Auth.require(u, 'land_management'); return Land.tickPurchase(u, p); } },
  saveIntiqal: { write: true, fn: function (u, p) { Auth.require(u, 'land_management'); return Land.saveIntiqal(u, p); } },
  saveParcel: { write: true, fn: function (u, p) { Auth.require(u, 'land_management'); return Land.saveParcel(u, p); } },

  // registry
  createDemand: { write: true, fn: function (u, p) { return Registry.createDemand(u, p); } },
  registryStep: { write: true, fn: function (u, p) { return Registry.step(u, p); } },
  expensePreview: { fn: function (u, p) { return Registry.expensePreview(p); } },

  // approvals
  verifyApproval: { write: true, fn: function (u, p) { return Registry.verifyApproval(u, p.id, p.remarks); } },
  resolveApproval: { write: true, fn: function (u, p) { return Registry.resolveManually(u, p.id, p.decision, p.remarks); } },

  // settings
  saveRates: { write: true, fn: function (u, p) { Auth.require(u, 'admin'); return Settings.saveRates(u, p.rates); } },
  saveUser: { write: true, fn: function (u, p) { Auth.require(u, 'admin'); return Auth.saveUser(u, p); } },
  saveTheme: { write: true, fn: function (u, p) { Auth.require(u, 'admin'); Db.setSetting('theme', JSON.stringify(p.theme || {})); audit(u, 'theme.saved', 'Settings', '', p.theme); return true; } },
  saveSettings: { write: true, fn: function (u, p) { Auth.require(u, 'admin'); return Settings.save(u, p); } },
  getSettings: { fn: function (u) { Auth.require(u, 'admin'); return Settings.get(); } },
};

function audit(user, action, table, id, details) {
  Db.insert('Audit', {
    at: nowIso(), user_id: user ? user.id : '', action: action, table: table || '', record_id: id || '',
    details: details ? JSON.stringify(details) : '',
  });
}

// ======================================================================== Db.gs
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
  Plots: ['id', 'project_id', 'street_id', 'plot_no', 'category', 'size_marla', 'area_sqft', 'width_ft', 'depth_ft', 'is_corner', 'is_park_facing', 'sale_status', 'construction_status', 'current_customer_id', 'sold_on', 'payment_cleared_at', 'payment_cleared_by', 'notes', 'created_at', 'updated_at', 'facing'],
  PlotEvents: ['id', 'plot_id', 'event', 'from_customer_id', 'to_customer_id', 'event_date', 'reference', 'notes', 'meta', 'created_by', 'created_at'],
  Ownerships: ['id', 'plot_id', 'customer_id', 'started_on', 'ended_on', 'start_event', 'end_event'],
  LandPurchases: ['id', 'project_id', 'seller_name', 'seller_father_name', 'seller_cnic', 'seller_phone', 'mauza', 'khewat_no', 'khatooni_no', 'khasra_nos', 'area_sqft', 'agreement_date', 'payment_cleared', 'payment_cleared_at', 'intiqal_done', 'intiqal_done_at', 'notes', 'created_at'],
  Intiqals: ['id', 'project_id', 'land_purchase_id', 'intiqal_no', 'intiqal_date', 'holder_name', 'holder_cnic', 'holder_is_filer', 'holder_acquired_on', 'khasra_nos', 'area_sqft', 'notes', 'created_at'],
  Parcels: ['id', 'project_id', 'type', 'name', 'area_sqft', 'width_ft', 'notes'],
  RegistryCases: ['id', 'reference', 'plot_id', 'customer_id', 'mode', 'status', 'demand_date', 'area_marla', 'area_sqft', 'maliyat', 'seller_name', 'fard_jari_at', 'fard_jari_by', 'fard_jari_message', 'fard_no', 'fard_received_on', 'fard_handed_over_on', 'registry_no', 'registry_date', 'registry_office', 'buyer_intiqal_no', 'registry_recorded_on', 'registry_copy_url', 'handed_over_on', 'expense_paid', 'expense_paid_at', 'expense_paid_by', 'notes', 'created_by', 'created_at', 'updated_at'],
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
    var sh = sheet(table);
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
    var sh = sheet(table);
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
    sheet(table).getRange(rec._row, 1, 1, cols.length).setValues([row]);
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

// ======================================================================== Auth.gs
/**
 * App login (the web app runs as the owner, so users log in with email + password
 * stored hashed in the Users tab). Sessions live 12 hours in the script cache.
 */
var Auth = (function () {
  var TTL = 12 * 60 * 60;

  function hash(password, salt) { return sha256(salt + '|' + password); }

  function login(email, password) {
    email = str(email).toLowerCase();
    var u = Db.all('Users').filter(function (r) { return r.email.toLowerCase() === email && bool(r.is_active); })[0];
    if (!u || hash(str(password), u.salt) !== u.password_hash) {
      Utilities.sleep(800);
      fail('err.login');
    }
    var token = randomToken();
    CacheService.getScriptCache().put('s_' + token, u.id, TTL);
    return { token: token, user: publicUser(u) };
  }

  function userFromToken(token) {
    var id = token && CacheService.getScriptCache().get('s_' + token);
    if (!id) fail('err.session');
    var u = Db.find('Users', id);
    if (!u || !bool(u.is_active)) fail('err.session');
    u._token = token;
    return u;
  }

  function logout(u) { CacheService.getScriptCache().remove('s_' + u._token); }

  function hasRole(u, role) { return u.role === 'admin' || u.role === role; }

  /** require(user, 'accounts', 'registry_officer') – admin always passes. */
  function require(u) {
    var roles = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < roles.length; i++) if (hasRole(u, roles[i])) return;
    fail('err.not_allowed');
  }

  function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, locale: u.locale || 'en', is_active: bool(u.is_active) };
  }

  function setPassword(id, password) {
    if (str(password).length < 8) fail('err.password_short');
    var salt = Utilities.getUuid();
    Db.update('Users', id, { salt: salt, password_hash: hash(password, salt) });
  }

  function changePassword(u, current, password) {
    if (hash(str(current), u.salt) !== u.password_hash) fail('err.login');
    setPassword(u.id, password);
    return true;
  }

  function saveUser(admin, p) {
    var email = required(p.email, 'email').toLowerCase();
    if (ENUM.roles.indexOf(p.role) < 0) fail('err.required', { field: 'role' });
    var dup = Db.all('Users').filter(function (r) { return r.email.toLowerCase() === email && r.id !== String(p.id || ''); })[0];
    if (dup) fail('err.duplicate', { field: 'email' });
    var data = { name: required(p.name, 'name'), email: email, role: p.role, department: str(p.department), is_active: p.is_active !== false };
    var id;
    if (p.id) { Db.update('Users', p.id, data); id = p.id; }
    else { id = Db.insert('Users', Object.assign(data, { locale: 'en' })).id; }
    if (str(p.password)) setPassword(id, p.password);
    else if (!p.id) fail('err.required', { field: 'password' });
    audit(admin, 'user.saved', 'Users', id, { email: email, role: p.role });
    return true;
  }

  return {
    login: login, userFromToken: userFromToken, logout: logout, hasRole: hasRole, require: require,
    publicUser: publicUser, setPassword: setPassword, changePassword: changePassword, saveUser: saveUser,
  };
})();

// ======================================================================== Expense.gs
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


// ======================================================================== Parser.gs
/**
 * Reads a director's email reply: approved / rejected / unclear.
 * Only the newly typed lines are read (quoted original is cut), and
 * "not approved" is checked before "approved". Pure JS, Node-tested.
 */
var ReplyParser = (function () {
  var REJECT = ['not approved', 'not approve', 'disapproved', 'rejected', 'reject', 'declined', 'decline', 'no',
    'na manzoor', 'namanzoor', 'نامنظور', 'منظور نہیں', 'مسترد'];
  var APPROVE = ['approved', 'approve', 'ok', 'okay', 'yes', 'go ahead', 'done', 'proceed',
    'manzoor', 'منظور', 'ٹھیک ہے', 'theek hai', 'thik hai'];

  function reference(subject) {
    var m = /\[(APR-\d{3,})\]/i.exec(subject || '');
    return m ? m[1].toUpperCase() : null;
  }

  function newText(body) {
    var lines = String(body || '').split(/\r\n|\r|\n/), kept = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t.charAt(0) === '>') break;
      if (/^On .+wrote:?$/i.test(t) || /^-{2,}\s*Original Message/i.test(t) || /^From:\s/i.test(t) || /^Sent from my /i.test(t)) break;
      if (t !== '') kept.push(t);
      if (kept.length >= 3) break;
    }
    return kept.join(' ').trim();
  }

  function has(hay, words) {
    for (var i = 0; i < words.length; i++) if (hay.indexOf(' ' + words[i].toLowerCase() + ' ') >= 0) return true;
    return false;
  }

  function decision(body) {
    var text = newText(body);
    if (!text) return 'unclear';
    // keep letters (any script) and digits, everything else -> space
    var norm = (' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ') + ' ').replace(/\s+/g, ' ');
    var reject = has(norm, REJECT);
    var stripped = norm;
    REJECT.forEach(function (w) { stripped = stripped.split(' ' + w + ' ').join(' '); });
    var approve = has(stripped, APPROVE);
    if (approve && !reject) return 'approved';
    if (reject && !approve) return 'rejected';
    return 'unclear';
  }

  /** Gmail's Authentication-Results must show the sender passed DMARC (or SPF + DKIM). */
  function authenticated(header) {
    if (!header) return false;
    var h = String(header).toLowerCase();
    if (h.indexOf('dmarc=fail') >= 0 || h.indexOf('spf=fail') >= 0) return false;
    return h.indexOf('dmarc=pass') >= 0 || (h.indexOf('dkim=pass') >= 0 && h.indexOf('spf=pass') >= 0);
  }

  return { reference: reference, newText: newText, decision: decision, authenticated: authenticated };
})();


// ======================================================================== Plots.gs
/**
 * Plots: sell, payment clear, transfer, cancel, repurchase, construction.
 * Every change writes PlotEvents (timeline) + Ownerships (who held it, from–to).
 * No sale price / repurchase amount is stored anywhere.
 */
var Plots = (function () {

  function expect(plot, allowed, action) {
    if (allowed.indexOf(plot.sale_status) < 0) fail('err.plot_status', { plot: plot.plot_no, status: plot.sale_status, action: action });
  }

  function event(user, plot, ev, from, to, date, ref, notes, meta) {
    Db.insert('PlotEvents', {
      plot_id: plot.id, event: ev, from_customer_id: from || '', to_customer_id: to || '', event_date: date,
      reference: ref || '', notes: notes || '', meta: meta || '', created_by: user ? user.id : '',
    });
    audit(user, 'plot.' + ev, 'Plots', plot.id, { to: to, ref: ref });
  }

  /** Close the open holding period and open a new one (customerId '' = company). */
  function changeHolder(plot, customerId, date, ev) {
    var periods = Db.where('Ownerships', 'plot_id', plot.id);
    var open = periods.filter(function (o) { return !o.ended_on; }).pop();
    if (open) {
      Db.closeOwnership(open.id, date, ev);
    } else if (!periods.length) {
      Db.insert('Ownerships', { plot_id: plot.id, customer_id: '', started_on: (plot.created_at || date).slice(0, 10), ended_on: date, start_event: 'note', end_event: ev });
    }
    Db.insert('Ownerships', { plot_id: plot.id, customer_id: customerId || '', started_on: date, ended_on: '', start_event: ev, end_event: '' });
  }

  function load(p) { return Db.get('Plots', required(p.plot_id, 'plot')); }
  function customer(id) { return Db.get('Customers', required(id, 'customer')); }

  function sell(u, p) {
    var plot = load(p), c = customer(p.customer_id), date = validDate(p.date, 'date');
    expect(plot, ['available'], 'sell');
    changeHolder(plot, c.id, date, 'sold');
    Db.update('Plots', plot.id, { sale_status: 'sold', current_customer_id: c.id, sold_on: date, payment_cleared_at: '', payment_cleared_by: '' });
    event(u, plot, 'sold', '', c.id, date, p.reference, p.notes);
    return true;
  }

  function clearPayment(u, p) {
    var plot = load(p), date = validDate(p.date, 'date');
    expect(plot, ['sold'], 'payment_clear');
    Db.update('Plots', plot.id, { sale_status: 'payment_cleared', payment_cleared_at: nowIso(), payment_cleared_by: u.id });
    event(u, plot, 'payment_cleared', plot.current_customer_id, plot.current_customer_id, date, '', p.notes);
    return true;
  }

  function transfer(u, p) {
    var plot = load(p), c = customer(p.customer_id), date = validDate(p.date, 'date');
    expect(plot, ['sold', 'payment_cleared'], 'transfer');
    if (plot.current_customer_id === c.id) fail('err.same_customer');
    var from = plot.current_customer_id;
    changeHolder(plot, c.id, date, 'transferred');
    Db.update('Plots', plot.id, { current_customer_id: c.id });
    event(u, plot, 'transferred', from, c.id, date, p.reference, p.notes);
    return true;
  }

  function backToCompany(u, plot, date, ev, ref, notes) {
    var from = plot.current_customer_id;
    changeHolder(plot, '', date, ev);
    Db.update('Plots', plot.id, { sale_status: 'available', current_customer_id: '', sold_on: '', payment_cleared_at: '', payment_cleared_by: '' });
    event(u, plot, ev, from, '', date, ref, notes);
    return true;
  }

  function cancelSale(u, p) {
    var plot = load(p);
    expect(plot, ['sold', 'payment_cleared'], 'cancel');
    return backToCompany(u, plot, validDate(p.date, 'date'), 'cancelled', '', p.notes);
  }

  /** Company takes the plot back ("wapas liya"). Not allowed while a registry file is open. */
  function repurchase(u, p) {
    var plot = load(p);
    expect(plot, ['sold', 'payment_cleared', 'registered'], 'repurchase');
    return backToCompany(u, plot, validDate(p.date, 'date'), 'repurchased', p.reference, p.notes);
  }

  function construction(u, p) {
    var plot = load(p);
    if (ENUM.construction.indexOf(p.status) < 0) fail('err.required', { field: 'status' });
    var old = plot.construction_status;
    Db.update('Plots', plot.id, { construction_status: p.status });
    event(u, plot, 'construction_changed', '', '', validDate(p.date, 'date'), '', p.notes, JSON.stringify({ from: old, to: p.status }));
    return true;
  }

  // ---- called by Registry
  function markRegistryStarted(u, plot, date, ref) {
    expect(plot, ['payment_cleared'], 'registry');
    Db.update('Plots', plot.id, { sale_status: 'registry_in_process' });
    event(u, plot, 'registry_started', plot.current_customer_id, plot.current_customer_id, date, ref);
  }
  function markRegistered(u, plot, date, registryNo) {
    expect(plot, ['registry_in_process'], 'register');
    Db.update('Plots', plot.id, { sale_status: 'registered' });
    event(u, plot, 'registered', plot.current_customer_id, plot.current_customer_id, date, registryNo);
  }
  function revertRegistry(u, plot, ref, reason) {
    if (plot.sale_status !== 'registry_in_process') return;
    Db.update('Plots', plot.id, { sale_status: 'payment_cleared' });
    event(u, plot, 'note', '', '', today(), ref, 'Registry file cancelled: ' + reason);
  }

  /** Admin: plot details (size, corner …) – not status. */
  function savePlot(u, p) {
    var data = {
      size_marla: str(p.size_marla), area_sqft: str(p.area_sqft), width_ft: str(p.width_ft), depth_ft: str(p.depth_ft),
      category: ENUM.category.indexOf(p.category) >= 0 ? p.category : 'residential',
      is_corner: bool(p.is_corner), is_park_facing: bool(p.is_park_facing), notes: str(p.notes),
      facing: ['East', 'West', ''].indexOf(str(p.facing)) >= 0 ? str(p.facing) : '',
    };
    if (data.size_marla && !data.area_sqft) {
      var plot0 = Db.get('Plots', p.id), proj = Db.get('Projects', plot0.project_id);
      data.area_sqft = String(num(data.size_marla) * num(proj.marla_sqft || 270));
    }
    if (p.id) { Db.update('Plots', p.id, data); audit(u, 'plot.edited', 'Plots', p.id, data); return true; }
    var projectId = required(p.project_id, 'project');
    var plotNo = required(p.plot_no, 'plot_no');
    if (Db.where('Plots', 'project_id', projectId).some(function (x) { return x.plot_no === plotNo; })) fail('err.duplicate', { field: 'plot_no' });
    var rec = Db.insert('Plots', Object.assign(data, { project_id: projectId, plot_no: plotNo, street_id: str(p.street_id), sale_status: 'available', construction_status: 'empty' }));
    audit(u, 'plot.created', 'Plots', rec.id, { plot_no: plotNo });
    return rec.id;
  }

  function saveCustomer(u, p) {
    var cnic = str(p.cnic);
    if (cnic && !/^\d{5}-\d{7}-\d$/.test(cnic)) fail('err.cnic');
    if (cnic && Db.all('Customers').some(function (c) { return c.cnic === cnic && c.id !== String(p.id || ''); })) fail('err.duplicate', { field: 'cnic' });
    var data = {
      name: required(p.name, 'name'), name_ur: str(p.name_ur), relation: ['s/o', 'd/o', 'w/o'].indexOf(p.relation) >= 0 ? p.relation : 's/o',
      father_name: str(p.father_name), cnic: cnic, phone: str(p.phone), email: str(p.email), address: str(p.address),
      is_filer: bool(p.is_filer), nominee_name: str(p.nominee_name), nominee_cnic: str(p.nominee_cnic), nominee_relation: str(p.nominee_relation),
    };
    var id = p.id ? Db.update('Customers', p.id, data).id : Db.insert('Customers', data).id;
    audit(u, 'customer.saved', 'Customers', id);
    return id;
  }

  return {
    sell: sell, clearPayment: clearPayment, transfer: transfer, cancelSale: cancelSale, repurchase: repurchase,
    construction: construction, markRegistryStarted: markRegistryStarted, markRegistered: markRegistered,
    revertRegistry: revertRegistry, savePlot: savePlot, saveCustomer: saveCustomer,
  };
})();

/** Land purchase (ticks only), intiqals (with balance), non-saleable parcels. */
var Land = (function () {
  function sqft(projectId, p) {
    var marla = num(Db.get('Projects', projectId).marla_sqft || 270);
    return (num(p.kanal) * 20 + num(p.marla)) * marla + num(p.sqft);
  }

  function savePurchase(u, p) {
    var pid = required(p.project_id, 'project');
    var rec = Db.insert('LandPurchases', {
      project_id: pid, seller_name: required(p.seller_name, 'seller'), seller_father_name: str(p.seller_father_name),
      seller_cnic: str(p.seller_cnic), seller_phone: str(p.seller_phone), mauza: str(p.mauza), khewat_no: str(p.khewat_no),
      khatooni_no: str(p.khatooni_no), khasra_nos: str(p.khasra_nos), area_sqft: sqft(pid, p), agreement_date: str(p.agreement_date),
      payment_cleared: false, intiqal_done: false, notes: str(p.notes),
    });
    audit(u, 'land.purchase', 'LandPurchases', rec.id);
    return true;
  }

  function tickPurchase(u, p) {
    var rec = Db.get('LandPurchases', p.id);
    var field = p.field === 'intiqal_done' ? 'intiqal_done' : 'payment_cleared';
    var on = !bool(rec[field]);
    var patch = {}; patch[field] = on; patch[field + '_at'] = on ? nowIso() : '';
    Db.update('LandPurchases', rec.id, patch);
    audit(u, 'land.' + field, 'LandPurchases', rec.id, { on: on });
    return true;
  }

  function saveIntiqal(u, p) {
    var pid = required(p.project_id, 'project');
    var no = required(p.intiqal_no, 'intiqal_no');
    if (Db.where('Intiqals', 'project_id', pid).some(function (i) { return i.intiqal_no === no; })) fail('err.duplicate', { field: 'intiqal_no' });
    var rec = Db.insert('Intiqals', {
      project_id: pid, land_purchase_id: str(p.land_purchase_id), intiqal_no: no, intiqal_date: str(p.intiqal_date),
      holder_name: required(p.holder_name, 'holder'), holder_cnic: str(p.holder_cnic), holder_is_filer: bool(p.holder_is_filer),
      holder_acquired_on: str(p.holder_acquired_on), khasra_nos: str(p.khasra_nos), area_sqft: sqft(pid, p), notes: str(p.notes),
    });
    audit(u, 'land.intiqal', 'Intiqals', rec.id);
    return true;
  }

  function saveParcel(u, p) {
    var pid = required(p.project_id, 'project');
    if (ENUM.parcelType.indexOf(p.type) < 0) fail('err.required', { field: 'type' });
    Db.insert('Parcels', { project_id: pid, type: p.type, name: required(p.name, 'name'), area_sqft: sqft(pid, p), width_ft: str(p.width_ft), notes: str(p.notes) });
    return true;
  }

  /** Area already issued (fard jari) from an intiqal, excluding cancelled files. */
  function issued(intiqalId) {
    var total = 0;
    Db.where('CaseIntiqals', 'intiqal_id', intiqalId).forEach(function (ci) {
      var c = Db.find('RegistryCases', ci.case_id);
      if (c && c.status !== 'cancelled') total += num(ci.area_sqft);
    });
    return total;
  }

  function balance(intiqal) { return num(intiqal.area_sqft) - issued(intiqal.id); }

  return { savePurchase: savePurchase, tickPurchase: tickPurchase, saveIntiqal: saveIntiqal, saveParcel: saveParcel, issued: issued, balance: balance };
})();

/** Settings: rates and approval emails. */
var Settings = (function () {
  var KEYS = ['director_email', 'approval_cc', 'sender_name', 'sender_department', 'link_valid_days', 'web_app_url', 'require_authenticated_reply'];

  function get() {
    var out = {};
    KEYS.forEach(function (k) { out[k] = setting(k, ''); });
    return out;
  }

  function save(u, p) {
    KEYS.forEach(function (k) { if (p.hasOwnProperty(k)) Db.setSetting(k, str(p[k])); });
    audit(u, 'settings.saved', 'Settings', '', p);
    return true;
  }

  function saveRates(u, rows) {
    (rows || []).forEach(function (r) {
      var rec = Db.get('Rates', r.id);
      var patch = {
        rate: str(r.rate), non_filer_rate: str(r.non_filer_rate), fixed_amount: str(r.fixed_amount),
        default_on: bool(r.default_on), receipt: bool(r.receipt), is_active: bool(r.is_active),
      };
      if (r.params) patch.params = JSON.stringify(r.params);
      Db.update('Rates', rec.id, patch);
    });
    audit(u, 'rates.saved', 'Rates', '', rows);
    return true;
  }

  return { get: get, save: save, saveRates: saveRates };
})();

// ======================================================================== Registry.gs
/**
 * Registry procedure:
 *  demand -> [email director: Fard] -> director answers -> we Check & Verify -> fard_approved
 *  -> Land Management selects 1-3 intiqals + "Fard Jari" message -> fard_jari_issued
 *  -> Registry Officer brings fard -> fard_received
 *     A client_self:      fard_handed_over -> client_registry_recorded (final)
 *     B company_managed:  expense sheet -> [email director] -> verify -> expense_approved
 *                         -> expense_paid -> registry_done -> registry_recorded -> handed_over (final)
 */
var Registry = (function () {

  function load(id) { return Db.get('RegistryCases', required(id, 'case')); }

  function move(u, c, to) {
    var from = c.status;
    Db.update('RegistryCases', c.id, { status: to });
    audit(u, 'registry.status', 'RegistryCases', c.id, { from: from, to: to });
  }

  function expect(c, allowed) {
    if (allowed.indexOf(c.status) < 0) fail('err.case_status', { ref: c.reference, status: c.status });
  }

  function mode(c, m) { if (c.mode !== m) fail('err.wrong_mode', { mode: c.mode }); }

  function nextRef(table, prefix) {
    var max = 0;
    Db.all(table).forEach(function (r) { var n = parseInt(String(r.reference).replace(prefix, ''), 10); if (n > max) max = n; });
    return prefix + ('000' + (max + 1)).slice(-4);
  }

  // ------------------------------------------------------------ 1. demand
  function createDemand(u, p) {
    Auth.require(u, 'accounts');
    var plot = Db.get('Plots', required(p.plot_id, 'plot'));
    if (plot.sale_status !== 'payment_cleared') fail('err.payment_not_cleared', { plot: plot.plot_no });
    if (ENUM.registryMode.indexOf(p.mode) < 0) fail('err.required', { field: 'mode' });
    var maliyat = int(p.maliyat);
    if (maliyat <= 0) fail('err.maliyat');
    var date = validDate(p.demand_date, 'date');
    var proj = Db.get('Projects', plot.project_id);
    var marlaSqft = num(proj.marla_sqft || 270);
    var sqft = num(plot.area_sqft) || num(plot.size_marla) * marlaSqft;
    if (sqft <= 0) fail('err.plot_size_missing', { plot: plot.plot_no });

    var c = Db.insert('RegistryCases', {
      reference: nextRef('RegistryCases', 'REQ-'), plot_id: plot.id, customer_id: plot.current_customer_id, mode: p.mode,
      status: 'demand', demand_date: date, area_sqft: sqft, area_marla: num(plot.size_marla) || Math.round(sqft / marlaSqft * 100) / 100,
      maliyat: maliyat, expense_paid: false, notes: str(p.notes), created_by: u.id,
    });
    Plots.markRegistryStarted(u, plot, date, c.reference);
    audit(u, 'registry.demand', 'RegistryCases', c.id);
    return c.id;
  }

  // ------------------------------------------------------------ steps
  function step(u, p) {
    var c = load(p.case_id);
    switch (p.step) {
      case 'send_fard_approval':
        Auth.require(u, 'accounts'); expect(c, ['demand']);
        Approval.createAndSend(u, c, 'fard', null);
        move(u, c, 'fard_approval_pending');
        return true;

      case 'fard_jari':
        Auth.require(u, 'land_management'); expect(c, ['fard_approved']);
        return fardJari(u, c, p.allocations || {}, required(p.message, 'message'));

      case 'fard_received':
        Auth.require(u, 'registry_officer'); expect(c, ['fard_jari_issued']);
        Db.update('RegistryCases', c.id, { fard_no: str(p.fard_no), fard_received_on: validDate(p.date, 'date') });
        move(u, c, 'fard_received');
        return true;

      case 'hand_over_fard':
        Auth.require(u, 'registry_officer', 'accounts'); mode(c, 'client_self'); expect(c, ['fard_received']);
        Db.update('RegistryCases', c.id, { fard_handed_over_on: validDate(p.date, 'date') });
        move(u, c, 'fard_handed_over');
        return true;

      case 'client_registry':
        Auth.require(u, 'accounts', 'registry_officer'); mode(c, 'client_self'); expect(c, ['fard_handed_over']);
        var d1 = validDate(p.registry_date, 'registry_date');
        Db.update('RegistryCases', c.id, { registry_no: required(p.registry_no, 'registry_no'), registry_date: d1, registry_office: str(p.registry_office), registry_copy_url: str(p.registry_copy_url) });
        move(u, c, 'client_registry_recorded');
        Plots.markRegistered(u, Db.get('Plots', c.plot_id), d1, str(p.registry_no));
        return true;

      case 'expense_save':
        return saveAndSendExpense(u, c, p);

      case 'expense_paid':
        Auth.require(u, 'accounts'); expect(c, ['expense_approved']);
        Db.update('RegistryCases', c.id, { expense_paid: true, expense_paid_at: nowIso(), expense_paid_by: u.id });
        move(u, c, 'expense_paid');
        return true;

      case 'registry_done':
        Auth.require(u, 'registry_officer'); expect(c, ['expense_paid']);
        Db.update('RegistryCases', c.id, { registry_no: required(p.registry_no, 'registry_no'), registry_date: validDate(p.registry_date, 'registry_date'), registry_office: str(p.registry_office) });
        move(u, c, 'registry_done');
        return true;

      case 'record_in_office':
        Auth.require(u, 'accounts', 'registry_officer'); expect(c, ['registry_done']);
        var d2 = validDate(p.date, 'date');
        Db.update('RegistryCases', c.id, { registry_recorded_on: d2, buyer_intiqal_no: str(p.buyer_intiqal_no), registry_copy_url: str(p.registry_copy_url) });
        move(u, c, 'registry_recorded');
        Plots.markRegistered(u, Db.get('Plots', c.plot_id), c.registry_date || d2, c.registry_no);
        return true;

      case 'hand_over':
        Auth.require(u, 'accounts', 'registry_officer'); expect(c, ['registry_recorded']);
        Db.update('RegistryCases', c.id, { handed_over_on: validDate(p.date, 'date') });
        move(u, c, 'handed_over');
        return true;

      case 'cancel':
        Auth.require(u, 'admin');
        if (ENUM.finalCase.indexOf(c.status) >= 0) fail('err.case_closed');
        var reason = required(p.reason, 'reason');
        Db.update('RegistryCases', c.id, { notes: (c.notes ? c.notes + '\n' : '') + 'Cancelled: ' + reason });
        move(u, c, 'cancelled');
        Plots.revertRegistry(u, Db.get('Plots', c.plot_id), c.reference, reason);
        return true;
    }
    fail('err.unknown_action');
  }

  /** allocations: {intiqal_id: sqft}. 1-3 intiqals; total must equal the plot area. */
  function fardJari(u, c, allocations, message) {
    var plot = Db.get('Plots', c.plot_id);
    var ids = Object.keys(allocations).filter(function (k) { return num(allocations[k]) > 0; });
    if (!ids.length) fail('err.select_intiqal');
    var total = 0, holders = [];
    ids.forEach(function (id) {
      var i = Db.get('Intiqals', id);
      if (i.project_id !== plot.project_id) fail('err.not_found', { table: 'Intiqals', id: id });
      var take = num(allocations[id]), bal = Land.balance(i);
      if (take > bal + 0.01) fail('err.intiqal_low', { no: i.intiqal_no, balance: Math.round(bal * 100) / 100 });
      total += take;
      if (holders.indexOf(i.holder_name) < 0) holders.push(i.holder_name);
    });
    if (Math.abs(total - num(c.area_sqft)) > 0.5) fail('err.allocation_mismatch', { total: total, needed: num(c.area_sqft) });

    ids.forEach(function (id) { Db.insert('CaseIntiqals', { case_id: c.id, intiqal_id: id, area_sqft: num(allocations[id]) }); });
    Db.update('RegistryCases', c.id, { seller_name: holders.join(', '), fard_jari_at: nowIso(), fard_jari_by: u.id, fard_jari_message: message });
    move(u, c, 'fard_jari_issued');
    return true;
  }

  // ------------------------------------------------------------ expense
  function expenseInput(p) {
    return {
      kind: p.kind === 'seller_expense' ? 'seller_expense' : 'registry_expense',
      maliyat: int(p.maliyat), area_marla: num(p.area_marla), land_value: int(p.land_value),
      buyer_is_filer: bool(p.buyer_is_filer), seller_is_filer: bool(p.seller_is_filer),
      enabled: p.enabled || {}, manual: p.manual || {},
    };
  }

  function expensePreview(p) {
    return ExpenseCalc.calculate(Db.all('Rates'), expenseInput(p));
  }

  /** Save the expense sheet and email it to the director (same as the Google Sheet button). */
  function saveAndSendExpense(u, c, p) {
    Auth.require(u, 'accounts');
    var input = expenseInput(p);
    if (input.maliyat <= 0) fail('err.maliyat');
    if (input.kind === 'registry_expense') { mode(c, 'company_managed'); expect(c, ['fard_received']); }
    else expect(c, ['fard_received', 'fard_handed_over', 'expense_approved', 'expense_paid']);

    var r = ExpenseCalc.calculate(Db.all('Rates'), input);
    var cust = c.customer_id ? Db.find('Customers', c.customer_id) : null;
    var exp = Db.insert('Expenses', {
      case_id: c.id, kind: input.kind, maliyat: input.maliyat, area_marla: input.area_marla,
      buyer_is_filer: input.buyer_is_filer, seller_is_filer: input.seller_is_filer, land_value: input.land_value || '',
      buyer_total: r.buyer_total, seller_total: r.seller_total, grand_total: r.grand_total,
      seller_name: c.seller_name, buyer_name: cust ? cust.name : '', created_by: u.id,
    });
    Db.insertMany('ExpenseLines', r.lines.map(function (l) {
      return { expense_id: exp.id, code: l.code, label: l.label, payer: l.payer, rate: l.rate === null ? '' : l.rate, amount: l.amount, receipt: l.receipt, is_manual: l.is_manual, sort: l.sort };
    }));

    if (input.kind === 'seller_expense') {
      Approval.createAndSend(u, c, 'seller_expense', exp);
    } else {
      Approval.createAndSend(u, c, 'registry_expense', exp);
      move(u, c, 'expense_approval_pending');
    }
    return exp.id;
  }

  // ------------------------------------------------------------ approvals → workflow
  function onDirectorDecision(a) {
    var c = Db.get('RegistryCases', a.case_id);
    if (a.type === 'fard' && c.status === 'fard_approval_pending') move(null, c, 'fard_approval_review');
    if (a.type === 'registry_expense' && c.status === 'expense_approval_pending') move(null, c, 'expense_approval_review');
  }

  function onApprovalExpired(a) {
    var c = Db.get('RegistryCases', a.case_id);
    if (a.type === 'fard' && c.status === 'fard_approval_pending') move(null, c, 'demand');
    if (a.type === 'registry_expense' && c.status === 'expense_approval_pending') move(null, c, 'fard_received');
  }

  /** "Check & Review": our user confirms the director's decision; only then the file moves. */
  function verifyApproval(u, id, remarks) {
    Auth.require(u, 'accounts');
    var a = Db.get('Approvals', id);
    if (a.status === 'needs_review') fail('err.needs_manual');
    if (['director_approved', 'director_rejected'].indexOf(a.status) < 0) fail('err.nothing_to_verify');
    var approved = a.status === 'director_approved';
    Db.update('Approvals', a.id, { status: approved ? 'verified' : 'closed', verified_by: u.id, verified_at: nowIso(), verify_remarks: str(remarks) });
    var c = Db.get('RegistryCases', a.case_id);
    if (a.type === 'fard') move(u, c, approved ? 'fard_approved' : 'demand');
    if (a.type === 'registry_expense') move(u, c, approved ? 'expense_approved' : 'fard_received');
    audit(u, 'approval.verified', 'Approvals', a.id, { approved: approved });
    return true;
  }

  /** Unclear reply: user confirmed with the director (phone etc.) and records it by hand. */
  function resolveManually(u, id, decision, remarks) {
    Auth.require(u, 'accounts');
    var a = Db.get('Approvals', id);
    if (['sent', 'needs_review'].indexOf(a.status) < 0) fail('err.nothing_to_verify');
    Approval.recordDecision(a, decision === 'approved' ? 'approved' : 'rejected', 'manual', u.email, required(remarks, 'remarks'), true);
    return verifyApproval(u, id, remarks);
  }

  return {
    createDemand: createDemand, step: step, expensePreview: expensePreview,
    onDirectorDecision: onDirectorDecision, onApprovalExpired: onApprovalExpired,
    verifyApproval: verifyApproval, resolveManually: resolveManually,
  };
})();

// ======================================================================== Approval.gs
/**
 * Director approval by email (the director never logs in).
 *  - Email has Approve / Reject buttons -> a confirm page (so Gmail's link scanner can't approve),
 *    tokens are random, stored hashed, single use, expire after N days.
 *  - Or the director replies "Approved" / "Rejected": pollInbox() (time trigger) reads Gmail.
 *  - Either way our users get a "Check & Review" email + in-app notice and must Verify.
 */
var Approval = (function () {

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function money(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtMarla(v) { return String(Math.round(num(v) * 100) / 100); }

  function nextRef() {
    var max = 0;
    Db.all('Approvals').forEach(function (r) { var n = parseInt(String(r.reference).replace('APR-', ''), 10); if (n > max) max = n; });
    return 'APR-' + ('000' + (max + 1)).slice(-4);
  }

  function typeLabel(t) {
    return { fard: 'Fard Approval', registry_expense: 'Registry Expense Approval', seller_expense: 'Seller Expense Approval' }[t] || t;
  }

  /** Same subject style as the Google Sheet, plus [APR-xxxx] to match replies. */
  function subject(type, ref, c, plot, project, exp) {
    if (type === 'fard') return 'Fard Approval Request--Plot_' + plot.plot_no + ' ' + project.code + ' ' + fmtMarla(c.area_marla) + ' Marla Maliyat Rs.' + int(c.maliyat) + '/- [' + ref + ']';
    if (type === 'registry_expense') return 'Request Approval--Registery Exp Rs.' + int(exp.grand_total) + '/- Plot_' + plot.plot_no + ' [' + ref + ']';
    return 'Rs.' + int(exp.seller_total) + '/- Request Approval--Seller Exp (236-C) Plot_' + plot.plot_no + ' [' + ref + ']';
  }

  function body(type, ref, c, plot, project, cust, exp, sender, approveUrl, rejectUrl) {
    var row = function (k, v) { return '<tr><td style="color:#64748b;width:160px;padding:4px">' + k + '</td><td style="padding:4px"><b>' + v + '</b></td></tr>'; };
    var h = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;max-width:640px">';
    h += '<p>Dear Sir,</p><p>I need approval for <b>' + (type === 'fard' ? 'Fard' : 'Registry Expense') + '</b>. Details below.</p>';
    h += '<table style="border-collapse:collapse;width:100%;margin:12px 0">';
    h += row('Location', esc(project.name)) + row('Plot No', esc(plot.plot_no)) + row('Area', fmtMarla(c.area_marla) + ' Marla');
    h += row('Registry Maliyat', 'Rs. ' + money(c.maliyat) + '/-');
    h += row('Buyer', esc(cust ? cust.name + (cust.father_name ? ' ' + cust.relation + ' ' + cust.father_name : '') + (cust.cnic ? ' (' + cust.cnic + ')' : '') : ''));
    if (c.seller_name) h += row('Seller', esc(c.seller_name));
    h += row('Registry by', c.mode === 'company_managed' ? 'Company' : 'Client himself');
    h += '</table>';

    if (exp) {
      var lines = Db.where('ExpenseLines', 'expense_id', exp.id).sort(function (a, b) { return num(a.sort) - num(b.sort); });
      h += '<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#f1f5f9"><th align="left" style="padding:4px">Item</th><th align="right">Buyer Exp</th><th align="right">Seller Exp</th><th align="right">Rate</th><th></th></tr>';
      lines.forEach(function (l) {
        h += '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:4px">' + esc(l.label) + '</td><td align="right">' + (l.payer === 'buyer' ? money(l.amount) : '') +
          '</td><td align="right">' + (l.payer === 'seller' ? money(l.amount) : '') + '</td><td align="right">' + (l.rate !== '' ? esc(l.rate) + '%' : '') +
          '</td><td style="padding-left:6px">' + (bool(l.receipt) ? 'Receipt' : 'No Receipt') + '</td></tr>';
      });
      h += '<tr><td style="padding:4px"><b>Total</b></td><td align="right"><b>' + money(exp.buyer_total) + '</b></td><td align="right"><b>' + money(exp.seller_total) + '</b></td><td></td><td></td></tr>';
      h += '<tr><td style="padding:4px"><b>Grand Total</b></td><td colspan="2" align="right"><b>Rs. ' + money(exp.grand_total) + '/-</b></td><td></td><td></td></tr></table>';
      h += '<p style="font-size:12px;color:#64748b">Buyer: ' + (bool(exp.buyer_is_filer) ? 'Filer' : 'Non-Filer') + ' · Seller: ' + (bool(exp.seller_is_filer) ? 'Filer' : 'Non-Filer') + '</p>';
    }

    var btn = function (url, bg, text) { return '<a href="' + url + '" style="background:' + bg + ';color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">' + text + '</a>'; };
    h += '<p style="margin:20px 0">' + btn(approveUrl, '#047857', '&#10004; Approve') + ' &nbsp; ' + btn(rejectUrl, '#b91c1c', '&#10006; Reject') + '</p>';
    h += '<p style="font-size:12px;color:#64748b">Or simply reply to this email with <b>Approved</b> or <b>Rejected</b> (keep the subject as it is).</p>';
    h += '<p>Regards,<br>' + esc(sender.name) + '<br>' + esc(sender.department || setting('sender_department', 'Accounts')) + '</p>';
    h += '<p style="font-size:11px;color:#94a3b8">Ref: ' + ref + ' / ' + esc(c.reference) + '</p></div>';
    return h;
  }

  function createAndSend(u, c, type, exp) {
    var director = str(setting('director_email', ''));
    if (!director) fail('err.director_email');
    var cc = str(setting('approval_cc', ''));
    var plot = Db.get('Plots', c.plot_id), project = Db.get('Projects', plot.project_id);
    var cust = c.customer_id ? Db.find('Customers', c.customer_id) : null;
    // re-read the case so the email shows fresh data (seller name etc.)
    c = Db.get('RegistryCases', c.id);

    var ref = nextRef(), approveTok = randomToken(), rejectTok = randomToken();
    var days = int(setting('link_valid_days', 7)) || 7;
    var expires = Utilities.formatDate(new Date(Date.now() + days * 86400000), 'Asia/Karachi', 'yyyy-MM-dd HH:mm:ss');
    var base = webAppUrl();
    var link = function (d, t) { return base + '?a=' + encodeURIComponent(ref) + '&d=' + d + '&t=' + t; };
    var subj = subject(type, ref, c, plot, project, exp);
    var html = body(type, ref, c, plot, project, cust, exp, u, link('approve', approveTok), link('reject', rejectTok));

    var opts = { htmlBody: html, name: str(setting('sender_name', u.name)) || u.name };
    if (cc) opts.cc = cc;
    GmailApp.sendEmail(director, subj, 'Please open this email in HTML view to Approve / Reject. Or reply "Approved" or "Rejected".', opts);

    var a = Db.insert('Approvals', {
      reference: ref, case_id: c.id, expense_id: exp ? exp.id : '', type: type, status: 'sent', to_email: director, cc: cc,
      subject: subj, sent_at: nowIso(), sent_by: u.id, approve_token_hash: sha256(approveTok), reject_token_hash: sha256(rejectTok),
      tokens_expire_at: expires,
    });
    audit(u, 'approval.sent', 'Approvals', a.id, { to: director, subject: subj });
    return a;
  }

  function awaitingDirector(a) { return a.status === 'sent' || a.status === 'needs_review'; }

  /** Data for the public decide page (no changes). */
  function decidePage(ref, d, t) {
    var a = Db.all('Approvals').filter(function (r) { return r.reference === String(ref); })[0];
    var v = { ref: ref, decision: d, token: t, error: '', info: null };
    if (!a || ['approve', 'reject'].indexOf(d) < 0) { v.error = 'This link is not valid.'; return v; }
    if (!awaitingDirector(a)) { v.error = 'This request has already been answered.'; return v; }
    if (a.tokens_expire_at && a.tokens_expire_at < nowIso()) { v.error = 'This link has expired. The office will send a new request.'; return v; }
    var c = Db.get('RegistryCases', a.case_id), plot = Db.get('Plots', c.plot_id), project = Db.get('Projects', plot.project_id);
    var cust = c.customer_id ? Db.find('Customers', c.customer_id) : null;
    var exp = a.expense_id ? Db.find('Expenses', a.expense_id) : null;
    v.info = {
      type: typeLabel(a.type), project: project.code + ' – ' + project.name, plot: plot.plot_no, area: fmtMarla(c.area_marla),
      maliyat: money(c.maliyat), buyer: cust ? cust.name : '', total: exp ? money(exp.grand_total) : '',
    };
    return v;
  }

  function decideByLink(ref, d, t) {
    var a = Db.all('Approvals').filter(function (r) { return r.reference === String(ref); })[0];
    if (!a || ['approve', 'reject'].indexOf(d) < 0) fail('This link is not valid.');
    var hash = d === 'approve' ? a.approve_token_hash : a.reject_token_hash;
    if (!hash || hash !== sha256(String(t))) fail('This link is not valid.');
    if (!awaitingDirector(a)) fail('This request has already been answered.');
    if (a.tokens_expire_at && a.tokens_expire_at < nowIso()) fail('This link has expired.');
    recordDecision(a, d === 'approve' ? 'approved' : 'rejected', 'link', a.to_email, '');
    return { ok: true, decision: d, ref: a.reference };
  }

  /** Store the director's decision and tell our users to Check & Review. */
  function recordDecision(a, decision, channel, fromEmail, remarks, silent) {
    Db.update('Approvals', a.id, {
      decision: decision, decision_channel: channel, decided_at: nowIso(), decided_from_email: fromEmail || '',
      director_remarks: remarks || '', status: decision === 'approved' ? 'director_approved' : 'director_rejected',
      approve_token_hash: '', reject_token_hash: '',
    });
    a = Db.get('Approvals', a.id);
    Registry.onDirectorDecision(a);
    audit(null, 'approval.decided', 'Approvals', a.id, { decision: decision, channel: channel, from: fromEmail });
    if (!silent) notifyReviewers(a, decision);
  }

  function markNeedsReview(a, reason) {
    if (awaitingDirector(a)) Db.update('Approvals', a.id, { status: 'needs_review' });
    audit(null, 'approval.needs_review', 'Approvals', a.id, { reason: reason });
    notifyReviewers(a, reason);
  }

  var REASON = {
    approved: ['Director APPROVED', 'ڈائریکٹر نے منظور کیا'],
    rejected: ['Director REJECTED', 'ڈائریکٹر نے نامنظور کیا'],
    unclear: ['Reply not clear', 'جواب واضح نہیں'],
    not_authenticated: ['Reply could not be verified', 'جواب کی تصدیق نہیں ہو سکی'],
    unknown_sender: ['Reply from unknown email', 'نامعلوم ای میل سے جواب'],
    expired: ['No answer, link expired', 'جواب نہیں آیا، لنک کی مدت ختم'],
  };

  /** "Check & Review" email + in-app notification to admin/accounts users and the sender. */
  function notifyReviewers(a, reason, detail) {
    var users = Db.all('Users').filter(function (x) { return bool(x.is_active) && (x.role === 'admin' || x.role === 'accounts' || (a && x.id === a.sent_by)); });
    var plotNo = '-', type = '';
    if (a) {
      var c = Db.find('RegistryCases', a.case_id);
      var plot = c ? Db.find('Plots', c.plot_id) : null;
      plotNo = plot ? plot.plot_no : '-';
      type = typeLabel(a.type);
    }
    var r = REASON[reason] || [reason, reason];
    var subj = 'Check & Review: Plot ' + plotNo + ' – ' + type + ' – ' + r[0] + (a ? ' [' + a.reference + ']' : '');
    var url = webAppUrl() + (a ? '#/approval/' + a.id : '');
    var html = '<div style="font-family:Arial,sans-serif;font-size:14px">' +
      '<p><b>' + r[0] + '</b> · Plot ' + esc(plotNo) + ' · ' + esc(type) + '</p>' +
      '<p dir="rtl" style="font-size:15px">' + r[1] + ' · پلاٹ ' + esc(plotNo) + '</p>' +
      (detail ? '<p>' + esc(detail) + '</p>' : '') +
      (a && a.director_remarks ? '<p>Director wrote: “' + esc(a.director_remarks) + '”</p>' : '') +
      '<p><a href="' + url + '" style="background:#b45309;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Open &amp; Check / کھولیں اور چیک کریں</a></p></div>';
    users.forEach(function (x) {
      Db.insert('Notifications', { user_id: x.id, approval_id: a ? a.id : '', reason: reason, detail: detail || '', read_at: '' });
    });
    var to = users.map(function (x) { return x.email; }).filter(String).join(',');
    if (to) GmailApp.sendEmail(to, subj, r[0] + ' – ' + url, { htmlBody: html, name: 'Land Management' });
  }

  /** Time trigger (every 5 min): read director replies from the Gmail inbox. */
  function pollInbox() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return;
    try {
      var me = Session.getEffectiveUser().getEmail().toLowerCase();
      var threads = GmailApp.search('in:inbox is:unread newer_than:14d subject:approval', 0, 50);
      threads.forEach(function (th) {
        th.getMessages().forEach(function (m) {
          if (!m.isUnread()) return;
          var from = parseEmail(m.getFrom());
          if (from === me) return;
          handleMessage({
            message_id: m.getId(), from_email: from, subject: m.getSubject(), body: m.getPlainBody(),
            auth: m.getHeader('Authentication-Results'), received_at: Utilities.formatDate(m.getDate(), 'Asia/Karachi', 'yyyy-MM-dd HH:mm:ss'),
          });
          m.markRead();
        });
      });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }

  function parseEmail(fromHeader) {
    var m = /<([^>]+)>/.exec(fromHeader || '');
    return (m ? m[1] : String(fromHeader || '')).trim().toLowerCase();
  }

  function handleMessage(msg) {
    if (Db.all('InboundEmails').some(function (r) { return r.message_id === msg.message_id; })) return 'duplicate';
    var ref = ReplyParser.reference(msg.subject);
    var a = ref ? Db.all('Approvals').filter(function (r) { return r.reference === ref; })[0] : null;
    var result;
    if (!a) result = 'unmatched';
    else if (msg.from_email !== str(setting('director_email', a.to_email)).toLowerCase()) result = 'unknown_sender';
    else if (!awaitingDirector(a)) result = 'already_decided';
    else if (setting('require_authenticated_reply', 'TRUE') !== 'FALSE' && !ReplyParser.authenticated(msg.auth)) result = 'not_authenticated';
    else result = ReplyParser.decision(msg.body);

    Db.insert('InboundEmails', {
      message_id: msg.message_id, from_email: msg.from_email, subject: msg.subject, body_text: String(msg.body || '').slice(0, 5000),
      auth_results: msg.auth || '', received_at: msg.received_at, approval_id: a ? a.id : '', result: result, processed_at: nowIso(),
    });

    var snippet = ReplyParser.newText(msg.body).slice(0, 300);
    if (result === 'approved' || result === 'rejected') recordDecision(a, result, 'reply', msg.from_email, snippet);
    else if (result === 'unclear' || result === 'not_authenticated') markNeedsReview(a, result);
    else if (result === 'unknown_sender') notifyReviewers(a, 'unknown_sender', msg.from_email + ': ' + msg.subject);
    return result;
  }

  /** Time trigger (hourly): unanswered links expire; file goes back one step; users are told. */
  function expireLinks() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return;
    try {
      var now = nowIso();
      Db.all('Approvals').filter(function (a) { return a.status === 'sent' && a.tokens_expire_at && a.tokens_expire_at < now; })
        .forEach(function (a) {
          Db.update('Approvals', a.id, { status: 'expired', approve_token_hash: '', reject_token_hash: '' });
          Registry.onApprovalExpired(a);
          notifyReviewers(a, 'expired');
        });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }

  return {
    createAndSend: createAndSend, decidePage: decidePage, decideByLink: decideByLink, recordDecision: recordDecision,
    markNeedsReview: markNeedsReview, notifyReviewers: notifyReviewers, pollInbox: pollInbox, expireLinks: expireLinks,
    handleMessage: handleMessage, typeLabel: typeLabel,
  };
})();

// Trigger entry points (ScriptApp triggers need global functions)
function pollApprovalInbox() { Approval.pollInbox(); }
function expireApprovalLinks() { Approval.expireLinks(); }

// ======================================================================== Views.gs
/** Read-only data for the screens. */
var Views = (function () {

  function nameOf(table, id) { var r = id ? Db.find(table, id) : null; return r ? r.name : ''; }
  function customerLabel(c) { return c ? c.name + (c.father_name ? ' ' + c.relation + ' ' + c.father_name : '') : ''; }

  function plotsOf(projectId) { return Db.where('Plots', 'project_id', projectId); }

  function natural(a, b) {
    var pa = String(a.plot_no).split(/[.\-]/), pb = String(b.plot_no).split(/[.\-]/);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = parseInt(pa[i], 10), y = parseInt(pb[i], 10);
      if (isNaN(x) || isNaN(y)) { var s = String(pa[i] || '').localeCompare(String(pb[i] || '')); if (s) return s; continue; }
      if (x !== y) return x - y;
    }
    return 0;
  }

  function casesOf(projectId) {
    var ids = {};
    plotsOf(projectId).forEach(function (p) { ids[p.id] = p; });
    return Db.all('RegistryCases').filter(function (c) { return ids[c.plot_id]; }).map(function (c) {
      var plot = ids[c.plot_id];
      return Object.assign({}, c, { plot_no: plot.plot_no, customer_name: nameOf('Customers', c.customer_id), actor: CASE_ACTOR[c.status] || '' });
    });
  }

  function approvalsOf(projectId) {
    var cases = {};
    casesOf(projectId).forEach(function (c) { cases[c.id] = c; });
    return Db.all('Approvals').filter(function (a) { return cases[a.case_id]; }).map(function (a) {
      return Object.assign(strip(a), { plot_no: cases[a.case_id].plot_no, case_ref: cases[a.case_id].reference, verifier: nameOf('Users', a.verified_by) });
    }).sort(function (x, y) { return y.created_at < x.created_at ? -1 : 1; });
  }

  /** never send token hashes to the browser */
  function strip(a) {
    var o = Object.assign({}, a);
    delete o.approve_token_hash; delete o.reject_token_hash; delete o._row;
    return o;
  }

  function areaSummary(projectId) {
    var total = 0, non = 0, sale = 0, byType = {};
    Db.where('LandPurchases', 'project_id', projectId).forEach(function (r) { total += num(r.area_sqft); });
    Db.where('Parcels', 'project_id', projectId).forEach(function (r) { non += num(r.area_sqft); byType[r.type] = (byType[r.type] || 0) + num(r.area_sqft); });
    plotsOf(projectId).forEach(function (r) { sale += num(r.area_sqft); });
    return { total: total, non_saleable: non, saleable: sale, by_type: byType, unallocated: total - non - sale };
  }

  function intiqalRows(projectId) {
    return Db.where('Intiqals', 'project_id', projectId).map(function (i) {
      var issued = Land.issued(i.id);
      return Object.assign({}, i, { issued: issued, balance: num(i.area_sqft) - issued });
    });
  }

  function bootstrap(u) {
    var unread = Db.where('Notifications', 'user_id', u.id).filter(function (n) { return !n.read_at; }).length;
    return {
      user: Auth.publicUser(u),
      projects: Db.all('Projects').filter(function (p) { return bool(p.is_active); }),
      enums: ENUM,
      unread: unread,
      theme: setting('theme', ''),
    };
  }

  function dashboard(projectId) {
    var plots = plotsOf(projectId), byStatus = {}, byConstruction = {};
    plots.forEach(function (p) {
      byStatus[p.sale_status] = (byStatus[p.sale_status] || 0) + 1;
      byConstruction[p.construction_status] = (byConstruction[p.construction_status] || 0) + 1;
    });
    var caseCounts = {};
    casesOf(projectId).forEach(function (c) { if (ENUM.finalCase.indexOf(c.status) < 0) caseCounts[c.status] = (caseCounts[c.status] || 0) + 1; });
    var approvals = approvalsOf(projectId);
    return {
      byStatus: byStatus, byConstruction: byConstruction, caseCounts: caseCounts, actors: CASE_ACTOR,
      toVerify: approvals.filter(function (a) { return ['director_approved', 'director_rejected', 'needs_review'].indexOf(a.status) >= 0; }),
      waitingDirector: approvals.filter(function (a) { return a.status === 'sent'; }).length,
      intiqals: intiqalRows(projectId), area: areaSummary(projectId),
      marla_sqft: num(Db.get('Projects', projectId).marla_sqft || 270),
    };
  }

  function plots(p) {
    var q = str(p.q).toLowerCase();
    var streets = {};
    Db.where('Streets', 'project_id', p.project_id).forEach(function (s) { streets[s.id] = s.number; });
    var customers = {};
    Db.all('Customers').forEach(function (c) { customers[c.id] = c; });
    var rows = plotsOf(p.project_id).filter(function (x) {
      if (p.status && x.sale_status !== p.status) return false;
      if (p.street && x.street_id !== String(p.street)) return false;
      if (p.category && x.category !== p.category) return false;
      if (q) {
        var c = customers[x.current_customer_id];
        var hay = (x.plot_no + ' ' + (c ? c.name + ' ' + c.cnic + ' ' + c.phone : '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(natural).map(function (x) {
      var c = customers[x.current_customer_id];
      return {
        id: x.id, plot_no: x.plot_no, street: streets[x.street_id] || '', size_marla: x.size_marla, category: x.category,
        sale_status: x.sale_status, construction_status: x.construction_status, customer: c ? c.name : '',
        is_corner: bool(x.is_corner), is_park_facing: bool(x.is_park_facing), facing: x.facing || '',
      };
    });
    var streetList = Db.where('Streets', 'project_id', p.project_id).sort(function (a, b) { return num(a.number) - num(b.number); });
    return { rows: rows, streets: streetList };
  }

  /** Rows for the plots grid. ids (optional) limits to those plots. */
  function plotRows(projectId, ids) {
    var only = ids ? {} : null;
    (ids || []).forEach(function (i) { only[String(i)] = true; });
    var streets = {};
    Db.where('Streets', 'project_id', projectId).forEach(function (s) { streets[s.id] = s.number; });
    var customers = {};
    Db.all('Customers').forEach(function (c) { customers[c.id] = c; });
    var openCase = {};
    Db.all('RegistryCases').forEach(function (c) { if (ENUM.finalCase.indexOf(c.status) < 0) openCase[c.plot_id] = c; });
    return plotsOf(projectId).filter(function (x) { return !only || only[x.id]; }).sort(natural).map(function (x) {
      var c = customers[x.current_customer_id], k = openCase[x.id];
      return {
        id: x.id, plot_no: x.plot_no, street: streets[x.street_id] || '', street_id: x.street_id, size_marla: x.size_marla,
        facing: x.facing || '', category: x.category, sale_status: x.sale_status, construction_status: x.construction_status,
        customer: c ? c.name : '', customer_id: x.current_customer_id || '', cnic: c ? c.cnic : '', phone: c ? c.phone : '',
        sold_on: x.sold_on, case_id: k ? k.id : '', case_status: k ? k.status : '', has_notes: !!x.notes,
      };
    });
  }

  function plot(id) {
    var x = Db.get('Plots', id);
    var c = x.current_customer_id ? Db.find('Customers', x.current_customer_id) : null;
    var street = x.street_id ? Db.find('Streets', x.street_id) : null;
    var ownerships = Db.where('Ownerships', 'plot_id', id).map(function (o) {
      return Object.assign({}, o, { holder: o.customer_id ? customerLabel(Db.find('Customers', o.customer_id)) : '' });
    });
    var events = Db.where('PlotEvents', 'plot_id', id).map(function (e) {
      return Object.assign({}, e, { from_name: nameOf('Customers', e.from_customer_id), to_name: nameOf('Customers', e.to_customer_id), by: nameOf('Users', e.created_by) });
    });
    var cases = Db.where('RegistryCases', 'plot_id', id);
    var active = cases.filter(function (k) { return ENUM.finalCase.indexOf(k.status) < 0; })[0] || null;
    return {
      plot: x, street: street ? street.number : '', customer: c, customer_label: customerLabel(c),
      ownerships: ownerships, events: events, cases: cases, active_case: active,
      customers: Db.all('Customers').map(function (k) { return { id: k.id, label: customerLabel(k) + (k.cnic ? ' (' + k.cnic + ')' : '') }; }),
    };
  }

  function customers(q) {
    q = str(q).toLowerCase();
    var counts = {};
    Db.all('Plots').forEach(function (p) { if (p.current_customer_id) counts[p.current_customer_id] = (counts[p.current_customer_id] || 0) + 1; });
    return Db.all('Customers').filter(function (c) {
      return !q || (c.name + ' ' + c.cnic + ' ' + c.phone).toLowerCase().indexOf(q) >= 0;
    }).map(function (c) { return Object.assign({}, c, { label: customerLabel(c), plots: counts[c.id] || 0 }); });
  }

  function customer(id) {
    var c = Db.get('Customers', id);
    var plotNo = function (pid) { var p = Db.find('Plots', pid); return p ? p.plot_no : ''; };
    return {
      customer: c, label: customerLabel(c),
      current: Db.where('Plots', 'current_customer_id', id),
      history: Db.where('Ownerships', 'customer_id', id).map(function (o) { return Object.assign({}, o, { plot_no: plotNo(o.plot_id) }); }),
    };
  }

  function land(projectId) {
    return {
      purchases: Db.where('LandPurchases', 'project_id', projectId),
      intiqals: intiqalRows(projectId),
      parcels: Db.where('Parcels', 'project_id', projectId),
      area: areaSummary(projectId),
      marla_sqft: num(Db.get('Projects', projectId).marla_sqft || 270),
    };
  }

  function registryList(projectId, status) {
    var customersById = {};
    Db.all('Customers').forEach(function (c) { customersById[c.id] = c; });
    var pending = plotsOf(projectId).filter(function (p) { return p.sale_status === 'payment_cleared'; }).sort(natural)
      .map(function (p) { return { id: p.id, plot_no: p.plot_no, customer: (customersById[p.current_customer_id] || {}).name || '' }; });
    var cases = casesOf(projectId).filter(function (c) {
      return status ? c.status === status : ENUM.finalCase.indexOf(c.status) < 0;
    }).sort(function (a, b) { return b.id - a.id; });
    return { pending: pending, cases: cases };
  }

  function registryCase(id) {
    var c = Db.get('RegistryCases', id);
    var plot = Db.get('Plots', c.plot_id), project = Db.get('Projects', plot.project_id);
    var cust = c.customer_id ? Db.find('Customers', c.customer_id) : null;
    var alloc = Db.where('CaseIntiqals', 'case_id', id).map(function (ci) {
      var i = Db.find('Intiqals', ci.intiqal_id);
      return { intiqal_no: i ? i.intiqal_no : '', holder: i ? i.holder_name : '', area_sqft: ci.area_sqft, holder_is_filer: i ? bool(i.holder_is_filer) : true };
    });
    var expenses = Db.where('Expenses', 'case_id', id).map(function (e) {
      return Object.assign({}, e, { lines: Db.where('ExpenseLines', 'expense_id', e.id).sort(function (a, b) { return num(a.sort) - num(b.sort); }) });
    }).reverse();
    return {
      case: c, plot: plot, project: project, customer: cust, customer_label: customerLabel(cust),
      allocations: alloc, intiqals: intiqalRows(project.id),
      approvals: Db.where('Approvals', 'case_id', id).map(function (a) { return Object.assign(strip(a), { verifier: nameOf('Users', a.verified_by) }); }).reverse(),
      expenses: expenses, rates: Db.all('Rates').filter(function (r) { return bool(r.is_active); }).sort(function (a, b) { return num(a.sort) - num(b.sort); }),
      marla_sqft: num(project.marla_sqft || 270),
    };
  }

  function approvals(projectId, status) {
    return approvalsOf(projectId).filter(function (a) { return !status || a.status === status; });
  }

  function approval(id) {
    var a = Db.get('Approvals', id);
    var c = Db.get('RegistryCases', a.case_id), plot = Db.get('Plots', c.plot_id);
    var exp = a.expense_id ? Db.find('Expenses', a.expense_id) : null;
    if (exp) exp = Object.assign({}, exp, { lines: Db.where('ExpenseLines', 'expense_id', exp.id).sort(function (x, y) { return num(x.sort) - num(y.sort); }) });
    return {
      approval: strip(a), case: c, plot_no: plot.plot_no, expense: exp,
      sender: nameOf('Users', a.sent_by), verifier: nameOf('Users', a.verified_by),
      inbound: Db.where('InboundEmails', 'approval_id', id),
    };
  }

  return {
    bootstrap: bootstrap, dashboard: dashboard, plots: plots, plot: plot, customers: customers, customer: customer,
    plotRows: plotRows, land: land, registryList: registryList, registryCase: registryCase, approvals: approvals, approval: approval,
  };
})();

// ======================================================================== Setup.gs
/**
 * One-time setup. In the sheet: menu "Land Management" → "1. Setup".
 * Creates every tab, protects history tabs, adds rates, the RG2 project
 * (draft plot list), an admin user and the email triggers. Safe to run again.
 */

var RG2 = {
  project: { code: 'RG2', name: 'Royal Garden 2', name_ur: 'رائل گارڈن 2', developer: 'Rafiq Builders & Developers', location: 'Chak 297 Road', marla_sqft: 270 },
  // street: [first, last, [numbers not found in the PDF text – verify on the map]]
  streets: {
    '21': [3, 74, [4, 6, 8, 10, 12, 71, 73]], '22': [1, 13, [12]], '23': [1, 15, []], '24': [1, 17, []],
    '25': [1, 18, []], '26': [1, 18, []], '27': [1, 25, [24]], '28': [1, 22, [18]], '29': [1, 21, []],
    '30': [1, 19, []], '31': [1, 18, []], '32': [1, 26, [23, 25]], '33': [1, 22, []],
  },
  commercial: ['P.01', 'P-2', 'P.03'],
  parcels: [
    { type: 'park', name: 'Park (north)' }, { type: 'park', name: 'Park (south)' },
    { type: 'water_course', name: 'Water Course', width_ft: 11 }, { type: 'road', name: 'Chak 297 Road' }, { type: 'road', name: 'Kacha Road' },
  ],
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Land Management')
    .addItem('1. Setup (first time)', 'setup')
    .addItem('2. Save web app URL', 'saveWebAppUrl')
    .addItem('Reset admin password', 'resetAdminPassword')
    .addItem('Check inbox now', 'pollApprovalInbox')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Karachi');

  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = SCHEMA[name];
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e2e8f0');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');   // everything plain text
    sh.setFrozenRows(1);
  });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  // history / evidence tabs: only the owner (the script) may edit
  var me = Session.getEffectiveUser();
  PROTECTED_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var prot = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0] || sh.protect();
    prot.setDescription('History – edit only through the app');
    prot.addEditor(me);
    prot.removeEditors(prot.getEditors().filter(function (e) { return e.getEmail() !== me.getEmail(); }));
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  });

  Db.clearCache();

  // settings
  var defaults = {
    director_email: 'irfanbayg@gmail.com',
    approval_cc: 'RGOFFICER1@gmail.com,ibaigmuhamd@gmail.com',
    sender_name: 'M Ilyas',
    sender_department: 'Accounts',
    link_valid_days: '7',
    require_authenticated_reply: 'TRUE',
  };
  Object.keys(defaults).forEach(function (k) { if (setting(k, null) === null) Db.setSetting(k, defaults[k]); });

  // rates
  var have = {};
  Db.all('Rates').forEach(function (r) { have[r.code] = true; });
  Db.insertMany('Rates', DEFAULT_RATES.filter(function (r) { return !have[r.code]; }).map(function (r) {
    return {
      code: r.code, label: r.label, label_ur: r.label_ur, payer: r.payer, calc_type: r.calc_type,
      rate: r.rate !== undefined ? r.rate : '', non_filer_rate: r.non_filer_rate !== undefined ? r.non_filer_rate : '',
      fixed_amount: r.fixed_amount || 0, params: r.params ? JSON.stringify(r.params) : '', receipt: r.receipt !== false,
      default_on: r.default_on !== false, sort: r.sort, is_active: true,
    };
  }));

  var plotsMsg = seedRg2();
  var adminMsg = ensureAdmin();
  installTriggers();

  SpreadsheetApp.getUi().alert('Setup done.\n\n' + plotsMsg + '\n' + adminMsg +
    '\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Then menu → "2. Save web app URL".');
}

function seedRg2() {
  var project = Db.all('Projects').filter(function (p) { return p.code === RG2.project.code; })[0];
  if (!project) project = Db.insert('Projects', Object.assign({ is_active: true }, RG2.project));
  var pid = project.id;

  var existing = {};
  Db.where('Plots', 'project_id', pid).forEach(function (p) { existing[p.plot_no] = true; });
  var streetIds = {};
  Db.where('Streets', 'project_id', pid).forEach(function (s) { streetIds[s.number] = s.id; });

  var newStreets = Object.keys(RG2.streets).filter(function (n) { return !streetIds[n]; });
  Db.insertMany('Streets', newStreets.map(function (n) { return { project_id: pid, number: n, width_ft: '' }; }));
  Db.where('Streets', 'project_id', pid).forEach(function (s) { streetIds[s.number] = s.id; });

  var rows = [];
  Object.keys(RG2.streets).forEach(function (n) {
    var def = RG2.streets[n];
    for (var i = def[0]; i <= def[1]; i++) {
      if (def[2].indexOf(i) >= 0) continue;
      var no = n + '.' + ('0' + i).slice(-2);
      if (!existing[no]) rows.push({ project_id: pid, street_id: streetIds[n], plot_no: no, category: 'residential', sale_status: 'available', construction_status: 'empty', is_corner: false, is_park_facing: false });
    }
  });
  RG2.commercial.forEach(function (no) {
    if (!existing[no]) rows.push({ project_id: pid, street_id: '', plot_no: no, category: 'commercial', sale_status: 'available', construction_status: 'empty', is_corner: false, is_park_facing: false });
  });
  Db.insertMany('Plots', rows);

  if (!Db.where('Parcels', 'project_id', pid).length) {
    Db.insertMany('Parcels', RG2.parcels.map(function (p) { return Object.assign({ project_id: pid, area_sqft: 0, width_ft: '' }, p); }));
  }
  return 'RG2: ' + rows.length + ' new plots (draft list – verify on the map).';
}

function ensureAdmin() {
  if (Db.all('Users').some(function (u) { return u.role === 'admin'; })) return 'Admin already exists.';
  var email = Session.getEffectiveUser().getEmail();
  var password = Utilities.getUuid().slice(0, 10);
  var u = Db.insert('Users', { name: 'Admin', email: email, role: 'admin', department: 'Admin', locale: 'en', is_active: true });
  Auth.setPassword(u.id, password);
  return 'Admin login: ' + email + '  password: ' + password + '  (change it after first login)';
}

function resetAdminPassword() {
  var admin = Db.all('Users').filter(function (u) { return u.role === 'admin'; })[0];
  if (!admin) { SpreadsheetApp.getUi().alert(ensureAdmin()); return; }
  var password = Utilities.getUuid().slice(0, 10);
  Auth.setPassword(admin.id, password);
  SpreadsheetApp.getUi().alert('New password for ' + admin.email + ': ' + password);
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['pollApprovalInbox', 'expireApprovalLinks'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pollApprovalInbox').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('expireApprovalLinks').timeBased().everyHours(1).create();
}

/** After deploying: stores the /exec URL so approval emails link to it. */
function saveWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  if (!url) { SpreadsheetApp.getUi().alert('Deploy the web app first (Deploy → New deployment → Web app).'); return; }
  Db.setSetting('web_app_url', url);
  SpreadsheetApp.getUi().alert('Saved. Open the app:\n' + url);
}

// ======================================================================== Import.gs
/**
 * One-time import of a project's existing plot list ("Master-Data" sheet).
 *
 * rows: [{ row, plot_no, area, area_pre_map, street, facing, rt, available ('Yes'|'No'),
 *          sale_to, agr_date ('yyyy-MM-dd' or ''), phone }]
 *
 * - Replaces the project's draft plots (only allowed while the project has no sale
 *   history and no registry files, so nothing real is ever overwritten).
 * - Sold rows ('No')  -> customer (deduplicated by name + phone), plot "sold", history Company -> customer.
 * - "Token Biana"     -> plot "blocked" with a note.
 * - RT (bought back)  -> plot "available" with a note in its history.
 * - Same plot no twice -> first row is used, the other row is written into the plot notes.
 * No amounts are imported.
 */
function importMasterData(projectCode, rows) {
  var project = Db.all('Projects').filter(function (p) { return p.code === projectCode; })[0];
  if (!project) throw new Error('Project ' + projectCode + ' not found – run Setup first.');
  var pid = project.id;
  var ms = num(project.marla_sqft || 270);

  // make sure the Plots header has every column (new: facing)
  var sh = SpreadsheetApp.getActive().getSheetByName('Plots');
  sh.getRange(1, 1, 1, SCHEMA.Plots.length).setValues([SCHEMA.Plots]).setFontWeight('bold').setBackground('#e2e8f0');

  var plotIds = {};
  Db.where('Plots', 'project_id', pid).forEach(function (p) { plotIds[p.id] = true; });
  var hasHistory = Db.all('PlotEvents').some(function (e) { return plotIds[e.plot_id]; }) ||
    Db.all('RegistryCases').some(function (c) { return plotIds[c.plot_id]; });
  if (hasHistory) throw new Error('This project already has sales/registry history. Import stopped so nothing is overwritten.');

  // 1. remove draft plots + streets of this project
  removeRows('Plots', function (r) { return r.project_id === pid; });
  removeRows('Streets', function (r) { return r.project_id === pid; });

  // 2. streets
  var streetNos = {};
  rows.forEach(function (r) { if (/^\d+$/.test(String(r.street))) streetNos[r.street] = true; });
  Db.insertMany('Streets', Object.keys(streetNos).sort(function (a, b) { return a - b; }).map(function (n) { return { project_id: pid, number: n, width_ft: '' }; }));
  var streetId = {};
  Db.where('Streets', 'project_id', pid).forEach(function (s) { streetId[s.number] = s.id; });

  // 3. plots (first row wins for duplicate numbers)
  var byNo = {}, order = [], dupNotes = {};
  rows.forEach(function (r) {
    if (byNo[r.plot_no]) {
      (dupNotes[r.plot_no] = dupNotes[r.plot_no] || []).push('Master sheet row ' + r.row + ' also lists ' + r.plot_no + ': ' + r.area + ' M, ' +
        (r.available === 'No' ? 'sold to ' + (r.sale_to || '?') + (r.agr_date ? ' on ' + r.agr_date : '') : 'available') + ' – please verify.');
      return;
    }
    byNo[r.plot_no] = r; order.push(r.plot_no);
  });

  // 3b. customers first, so plots can point to them (dedupe by name + phone, also re-use existing ones)
  var custKey = function (name, phone) { return String(name).toLowerCase().replace(/\s+/g, ' ').trim() + '|' + String(phone).replace(/\D/g, ''); };
  var custId = {};
  Db.all('Customers').forEach(function (c) { custId[custKey(c.name + (c.father_name ? ' ' + c.relation + ' ' + c.father_name : ''), c.phone)] = c.id; });
  var newCust = [], newKeys = {};
  order.forEach(function (no) {
    var r = byNo[no];
    if (!isSold(r)) return;
    var k = custKey(r.sale_to, r.phone);
    if (custId[k] || newKeys[k]) return;
    newKeys[k] = true;
    newCust.push(Object.assign(splitName(r.sale_to), { phone: r.phone || '', is_filer: false, notes: 'Imported from Master-Data' }));
  });
  Db.insertMany('Customers', newCust);
  Db.all('Customers').forEach(function (c) { custId[custKey(c.name + (c.father_name ? ' ' + c.relation + ' ' + c.father_name : ''), c.phone)] = c.id; });

  var today = Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd');
  var plots = order.map(function (no) {
    var r = byNo[no];
    var notes = [];
    if (r.area_pre_map && Math.abs(num(r.area_pre_map) - num(r.area)) > 0.001) notes.push('Area before map: ' + r.area_pre_map + ' M');
    if (r.rt) notes.push('RT: bought back by company' + (r.sale_to ? ' (earlier: ' + r.sale_to + ')' : ''));
    if (isToken(r)) notes.push('Token Biana (advance taken, buyer not entered)');
    (dupNotes[no] || []).forEach(function (n) { notes.push('⚠ ' + n); });
    var commercial = !/^\d+$/.test(String(r.street));
    return {
      project_id: pid, street_id: commercial ? '' : (streetId[r.street] || ''), plot_no: no,
      category: commercial ? 'commercial' : 'residential', size_marla: r.area || '',
      area_sqft: r.area ? Math.round(num(r.area) * ms * 100) / 100 : '', width_ft: '', depth_ft: '',
      is_corner: false, is_park_facing: false, facing: r.facing || '',
      sale_status: isSold(r) ? 'sold' : (isToken(r) ? 'blocked' : 'available'), construction_status: 'empty',
      current_customer_id: isSold(r) ? custId[custKey(r.sale_to, r.phone)] : '', sold_on: isSold(r) ? (r.agr_date || '') : '', notes: notes.join('\n'),
    };
  });
  Db.insertMany('Plots', plots);
  var plotByNo = {};
  Db.where('Plots', 'project_id', pid).forEach(function (p) { plotByNo[p.plot_no] = p; });

  // 5. sold plots: link customer, write ownership + events
  var own = [], events = [], soldCount = 0;
  order.forEach(function (no) {
    var r = byNo[no], p = plotByNo[no];
    if (isSold(r)) {
      var cid = custId[custKey(r.sale_to, r.phone)];
      var date = r.agr_date || today;
      own.push({ plot_id: p.id, customer_id: '', started_on: '', ended_on: date, start_event: 'note', end_event: 'sold' });
      own.push({ plot_id: p.id, customer_id: cid, started_on: date, ended_on: '', start_event: 'sold', end_event: '' });
      events.push({ plot_id: p.id, event: 'sold', from_customer_id: '', to_customer_id: cid, event_date: date,
        reference: 'Master-Data row ' + r.row, notes: r.agr_date ? 'Imported' : 'Imported – agreement date missing', created_by: '' });
      soldCount++;
    } else if (r.rt || isToken(r)) {
      events.push({ plot_id: p.id, event: 'note', from_customer_id: '', to_customer_id: '', event_date: r.agr_date || today,
        reference: 'Master-Data row ' + r.row, notes: r.rt ? 'RT – bought back by company' + (r.sale_to ? ', earlier buyer: ' + r.sale_to : '') : 'Token Biana', created_by: '' });
    }
  });
  Db.insertMany('Ownerships', own);
  Db.insertMany('PlotEvents', events);
  audit(null, 'import.master', 'Projects', pid, { plots: plots.length, sold: soldCount, customers: newCust.length });

  var msg = 'Imported ' + plots.length + ' plots (' + soldCount + ' sold), ' + newCust.length + ' new customers.' +
    (Object.keys(dupNotes).length ? ' Duplicates to verify: ' + Object.keys(dupNotes).join(', ') : '');
  console.log(msg);
  return msg;

  function isToken(r) { return /token\s*biana/i.test(r.sale_to || ''); }
  function isSold(r) { return r.available === 'No' && r.sale_to && !isToken(r); }
}

/** "Asif Javed S/O Javed Iqbal" -> {name, relation, father_name}. C/O stays in the name. */
function splitName(full) {
  var m = /^(.*?)\s+(s\/o|d\/o|w\/o)\s+(.*)$/i.exec(String(full || '').trim());
  if (!m) return { name: String(full || '').trim(), relation: 's/o', father_name: '' };
  return { name: m[1].trim(), relation: m[2].toLowerCase(), father_name: m[3].trim() };
}

/** Delete data rows matching a test. If every row matches, the data area is simply cleared. */
function removeRows(table, test) {
  var sh = SpreadsheetApp.getActive().getSheetByName(table);
  var all = Db.all(table);
  var rows = all.filter(test).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  if (rows.length && rows.length === all.length && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  } else {
    rows.forEach(function (n) { sh.deleteRow(n); });
  }
  Db.clearCache();
}
