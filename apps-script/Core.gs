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
