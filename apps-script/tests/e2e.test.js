// End-to-end test of the Apps Script backend in Node with in-memory mocks of
// Run:  node apps-script/tests/e2e.test.js apps-script
// SpreadsheetApp / Gmail / Cache / Lock / Utilities.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const dir = process.argv[2];

// ---------------- mocks
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  setValues(v) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, v[i][j]); return this; }
  setValue(v) { this.sh.set(this.r, this.c, v); return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); this.rows[r - 1][c - 1] = v; }
  getDataRange() { const w = Math.max(1, ...this.rows.map(r => r.length)); return { getValues: () => this.rows.map(r => Array.from({ length: w }, (_, i) => r[i] === undefined ? '' : r[i])) }; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
  getLastRow() { return this.rows.length; }
  appendRow(v) { this.rows.push(v.slice()); }
  getMaxColumns() { return 50; } getMaxRows() { return 1000; } setFrozenRows() {}
}
const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = new Sheet(n)),
  getSheets: () => Object.values(sheets), setSpreadsheetTimeZone() {},
};
const sent = [];
const cache = {};
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console,
  SpreadsheetApp: { getActive: () => ss, flush() {}, ProtectionType: { SHEET: 'S' } },
  Utilities: {
    formatDate: (d, tz, f) => { const x = new Date(d.getTime() + 5 * 3600e3); return f.replace('yyyy', x.getUTCFullYear()).replace('MM', pad(x.getUTCMonth() + 1)).replace('dd', pad(x.getUTCDate())).replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes())).replace('ss', pad(x.getUTCSeconds())); },
    computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
    DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    getUuid: () => crypto.randomUUID(), sleep() {},
  },
  CacheService: { getScriptCache: () => ({ put: (k, v) => cache[k] = v, get: k => cache[k] || null, remove: k => delete cache[k] }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  GmailApp: { sendEmail: (to, subject, body, opts) => sent.push({ to, subject, body, opts }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'office@gmail.com' }) },
  HtmlService: {},
};
vm.createContext(ctx);
for (const f of ['Core.gs', 'Db.gs', 'Auth.gs', 'Expense.gs', 'Parser.gs', 'Plots.gs', 'Registry.gs', 'Approval.gs', 'Views.gs', 'Setup.gs']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}

// ---------------- setup (without UI / protections / triggers)
vm.runInContext(`
  Object.keys(SCHEMA).forEach(function (n) { var sh = SpreadsheetApp.getActive().insertSheet(n); sh.getRange(1,1,1,SCHEMA[n].length).setValues([SCHEMA[n]]); });
  Db.setSetting('director_email','irfanbayg@gmail.com'); Db.setSetting('approval_cc','RGOFFICER1@gmail.com');
  Db.insertMany('Rates', DEFAULT_RATES.map(function (r) { return { code:r.code,label:r.label,label_ur:r.label_ur,payer:r.payer,calc_type:r.calc_type,
    rate:r.rate!==undefined?r.rate:'', non_filer_rate:r.non_filer_rate!==undefined?r.non_filer_rate:'', fixed_amount:r.fixed_amount||0,
    params:r.params?JSON.stringify(r.params):'', receipt:r.receipt!==false, default_on:r.default_on!==false, sort:r.sort, is_active:true }; }));
  var seeded = seedRg2();
  var adminMsg = ensureAdmin();
`, ctx);
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
ok(/RG2: 297 new plots/.test(ctx.seeded), ctx.seeded);
const pw = /password: (\S+)/.exec(ctx.adminMsg)[1];

const api = (tok, a, p) => { const r = ctx.api(tok, a, p); if (!r.ok) throw new Error(a + ' -> ' + r.code + ' ' + JSON.stringify(r.params)); return r.data; };
const apiErr = (tok, a, p) => ctx.api(tok, a, p);

// login + users
ok(!apiErr(null, 'login', { email: 'office@gmail.com', password: 'wrong' }).ok, 'wrong password rejected');
const admin = api(null, 'login', { email: 'office@gmail.com', password: pw }).token;
api(admin, 'saveUser', { name: 'M Ilyas', email: 'ilyas@x.com', role: 'accounts', department: 'Accounts', password: 'password123' });
api(admin, 'saveUser', { name: 'Land Mgr', email: 'land@x.com', role: 'land_management', password: 'password123' });
api(admin, 'saveUser', { name: 'RG Officer', email: 'officer@x.com', role: 'registry_officer', password: 'password123' });
const acc = api(null, 'login', { email: 'ilyas@x.com', password: 'password123' }).token;
const lm = api(null, 'login', { email: 'land@x.com', password: 'password123' }).token;
const ro = api(null, 'login', { email: 'officer@x.com', password: 'password123' }).token;

const boot = api(acc, 'bootstrap', {});
const pid = boot.projects[0].id;
const plots = api(acc, 'plots', { project_id: pid }).rows;
ok(plots.length === 297 && plots[0].plot_no === '21.03' && plots.some(p => p.plot_no === '21.20') && plots.some(p => p.plot_no === 'P.01'), 'plots listed, natural order, "21.20" kept as text');
const plot = plots.find(p => p.plot_no === '21.24');
ok(!apiErr(acc, 'savePlot', { id: plot.id, size_marla: 5 }).ok, 'accounts cannot edit plot details (admin only)');
api(admin, 'savePlot', { id: plot.id, size_marla: '6.25', category: 'residential' });

// customers + sale
const c1 = api(acc, 'saveCustomer', { name: 'Shakeel Ahmad', father_name: 'Ahmad Din', cnic: '33100-1234567-1', is_filer: 'TRUE' });
const c2 = api(acc, 'saveCustomer', { name: 'Bilal', cnic: '33100-7654321-1' });
ok(!apiErr(acc, 'saveCustomer', { name: 'X', cnic: '33100-1234567-1' }).ok, 'duplicate CNIC blocked');
api(acc, 'sell', { plot_id: plot.id, customer_id: c2, date: '2026-01-10' });
api(acc, 'transfer', { plot_id: plot.id, customer_id: c1, date: '2026-03-01', reference: 'TR-1' });
ok(!apiErr(acc, 'createDemand', { plot_id: plot.id, mode: 'company_managed', demand_date: '2026-11-21', maliyat: 3100000 }).ok, 'demand blocked before payment clear');
api(acc, 'clearPayment', { plot_id: plot.id, date: '2026-11-01' });

// land + intiqals (two intiqals combined)
api(lm, 'savePurchase', { project_id: pid, seller_name: 'Qamar Uz Zaman', kanal: 10 });
api(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '1001', holder_name: 'Qamar Uz Zaman', holder_is_filer: 'TRUE', marla: 4 });
api(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '1002', holder_name: 'Qamar Uz Zaman', holder_is_filer: 'TRUE', marla: 10 });

// registry: company managed
const caseId = api(acc, 'createDemand', { plot_id: plot.id, mode: 'company_managed', demand_date: '2026-11-21', maliyat: 3100000 });
api(acc, 'registryStep', { case_id: caseId, step: 'send_fard_approval' });
let mail = sent[sent.length - 1];
ok(mail.to === 'irfanbayg@gmail.com' && /Fard Approval Request--Plot_21.24 RG2 6.25 Marla Maliyat Rs.3100000\/- \[APR-0001\]/.test(mail.subject), 'fard email: ' + mail.subject);
const link = /href="([^"]+d=approve[^"]+)"/.exec(mail.opts.htmlBody)[1];
const q = new URL(link).searchParams;
ok(!ctx.confirmDecision(q.get('a'), 'approve', 'badtoken').ok, 'bad token rejected');
ok(ctx.confirmDecision(q.get('a'), 'approve', q.get('t')).ok, 'director approved by link');
ok(!ctx.confirmDecision(q.get('a'), 'approve', q.get('t')).ok, 'link is single use');
ok(/Check & Review: Plot 21.24/.test(sent[sent.length - 1].subject), 'reviewers notified: ' + sent[sent.length - 1].subject);
let cs = api(acc, 'registryCase', { id: caseId });
ok(cs.case.status === 'fard_approval_review', 'case waits for our verify');
ok(!apiErr(lm, 'verifyApproval', { id: cs.approvals[0].id }).ok, 'land mgmt cannot verify');
api(acc, 'verifyApproval', { id: cs.approvals[0].id });

const ints = api(lm, 'land', { project_id: pid }).intiqals;
ok(!apiErr(lm, 'registryStep', { case_id: caseId, step: 'fard_jari', message: 'm', allocations: { [ints[0].id]: 1687.5 } }).ok, 'intiqal over-balance blocked');
api(lm, 'registryStep', { case_id: caseId, step: 'fard_jari', message: 'Fard jari karwayen', allocations: { [ints[0].id]: 1080, [ints[1].id]: 607.5 } });
api(ro, 'registryStep', { case_id: caseId, step: 'fard_received', fard_no: 'F-77', date: '2026-11-22' });

const prev = api(acc, 'expensePreview', { kind: 'registry_expense', maliyat: 3100000, area_marla: 6.25, buyer_is_filer: 'TRUE', seller_is_filer: 'TRUE' });
ok(prev.buyer_total === 127950 && prev.seller_total === 85250 && prev.grand_total === 213200, 'expense matches sheet: ' + prev.grand_total);
api(acc, 'registryStep', { case_id: caseId, step: 'expense_save', kind: 'registry_expense', maliyat: 3100000, area_marla: 6.25, buyer_is_filer: 'TRUE', seller_is_filer: 'TRUE' });
mail = sent[sent.length - 1];
ok(/Request Approval--Registery Exp Rs.213200\/- Plot_21.24 \[APR-0002\]/.test(mail.subject), 'expense email: ' + mail.subject);

// director replies by email
const auth = 'mx.google.com; dkim=pass header.i=@gmail.com; spf=pass smtp.mailfrom=irfanbayg@gmail.com; dmarc=pass';
ok(ctx.Approval.handleMessage({ message_id: 'm0', from_email: 'someone@x.com', subject: 'Re: ' + mail.subject, body: 'Approved', auth }) === 'unknown_sender', 'reply from other email ignored');
ok(ctx.Approval.handleMessage({ message_id: 'm1', from_email: 'irfanbayg@gmail.com', subject: 'Re: ' + mail.subject, body: 'Approved', auth: 'spf=fail' }) === 'not_authenticated', 'spoofed reply not trusted');
cs = api(acc, 'registryCase', { id: caseId });
ok(cs.approvals[0].status === 'needs_review', 'needs review after unverified reply');
ok(ctx.Approval.handleMessage({ message_id: 'm2', from_email: 'irfanbayg@gmail.com', subject: 'Re: ' + mail.subject, body: 'Approved\n\nOn Sat wrote:\n> Reject', auth }) === 'approved', 'clear director reply approved');
cs = api(acc, 'registryCase', { id: caseId });
ok(cs.case.status === 'expense_approval_review', 'case waits for verify');
api(acc, 'verifyApproval', { id: cs.approvals[0].id, remarks: 'ok' });
api(acc, 'registryStep', { case_id: caseId, step: 'expense_paid' });
api(ro, 'registryStep', { case_id: caseId, step: 'registry_done', registry_no: 'R-5521', registry_date: '2026-11-25', registry_office: 'Gojra' });
api(acc, 'registryStep', { case_id: caseId, step: 'record_in_office', date: '2026-11-26' });
api(acc, 'registryStep', { case_id: caseId, step: 'hand_over', date: '2026-11-28' });
cs = api(acc, 'registryCase', { id: caseId });
ok(cs.case.status === 'handed_over' && cs.case.seller_name === 'Qamar Uz Zaman', 'registry handed over');

let pv = api(acc, 'plot', { id: plot.id });
ok(pv.plot.sale_status === 'registered', 'plot registered');
api(acc, 'repurchase', { plot_id: plot.id, date: '2026-12-01', reference: 'BB-1' });
pv = api(acc, 'plot', { id: plot.id });
ok(pv.plot.sale_status === 'available' && !pv.plot.current_customer_id, 'repurchased -> available');
ok(pv.ownerships.map(o => o.holder || 'Company').join(' > ') === 'Company > Bilal > Shakeel Ahmad s/o Ahmad Din > Company', 'chain: ' + pv.ownerships.map(o => o.holder || 'Company').join(' > '));
ok(pv.events.map(e => e.event).join(',') === 'sold,transferred,payment_cleared,registry_started,registered,repurchased', 'events: ' + pv.events.map(e => e.event).join(','));
const land = api(lm, 'land', { project_id: pid });
ok(land.intiqals[0].balance === 0 && land.intiqals[1].balance === 2092.5, 'intiqal balances updated');
const dash = api(acc, 'dashboard', { project_id: pid });
ok(dash.byStatus.available === 297, 'dashboard counts');
ok(!JSON.stringify(api(acc, 'approval', { id: cs.approvals[0].id })).includes('token_hash'), 'token hashes never sent to browser');
ok(api(acc, 'bootstrap', {}).unread > 0, 'in-app notifications recorded');

// Raasta A quick path + cancel
const p2 = plots.find(p => p.plot_no === '23.05');
api(admin, 'savePlot', { id: p2.id, size_marla: '5' });
api(acc, 'sell', { plot_id: p2.id, customer_id: c2, date: '2026-02-01' });
api(acc, 'clearPayment', { plot_id: p2.id, date: '2026-11-01' });
const case2 = api(acc, 'createDemand', { plot_id: p2.id, mode: 'client_self', demand_date: '2026-11-21', maliyat: 2500000 });
ok(!apiErr(acc, 'registryStep', { case_id: case2, step: 'cancel', reason: 'x' }).ok, 'only admin can cancel');
api(admin, 'registryStep', { case_id: case2, step: 'cancel', reason: 'client changed mind' });
ok(api(acc, 'plot', { id: p2.id }).plot.sale_status === 'payment_cleared', 'cancel returns plot to payment_cleared');

// history protected
ok(!apiErr(admin, 'savePlot', { id: p2.id, size_marla: '5' }).ok === false, 'admin edit still fine');
let threw = false; try { vm.runInContext("Db.update('PlotEvents','1',{notes:'x'})", ctx); } catch (e) { threw = true; } ok(threw, 'PlotEvents cannot be updated');


// ---------------- render every screen with real data (EN + UR)
{
  const ui = { document: { documentElement: {}, getElementById: () => ({ innerHTML: '' }), querySelectorAll: () => [] },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {} },
    google: { script: { run: {}, history: { setChangeHandler() {}, push() {} }, url: { getLocation() {} } } }, console, setTimeout, clearTimeout, URL };
  vm.createContext(ui);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Index.html'), 'utf8').split('<script>')[1].split('</script>')[0] + ';this.VIEWS=VIEWS;this.S=S;', ui);
  ui.S.enums = api(admin, 'bootstrap', {}).enums; ui.S.user = { role: 'admin', name: 'A' }; ui.S.projectId = pid;
  const screens = {
    dashboard: api(admin, 'dashboard', { project_id: pid }), plots: api(admin, 'plots', { project_id: pid }), plot: api(admin, 'plot', { id: plot.id }),
    registry: api(admin, 'registryList', { project_id: pid }), case: api(admin, 'registryCase', { id: caseId }), approvals: api(admin, 'approvals', { project_id: pid }),
    approval: api(admin, 'approval', { id: cs.approvals[0].id }), customers: api(admin, 'customers', {}), customer: api(admin, 'customer', { id: c1 }),
    land: api(admin, 'land', { project_id: pid }), settings: [api(admin, 'rates', {}), api(admin, 'getSettings', {}), api(admin, 'users', {})],
  };
  for (const lang of ['en', 'ur']) {
    ui.S.lang = lang;
    for (const [name, data] of Object.entries(screens)) {
      try { const html = ui.VIEWS[name](data); ok(html.length > 200 && !/undefined|\[object Object\]/.test(html.replace(/=== undefined|!== undefined/g, '')), `render ${lang} ${name} (${html.length} chars)`); }
      catch (e) { ok(false, `render ${lang} ${name}: ${e.message}`); }
    }
  }
  // case screen at every step type renders
  const c2 = api(admin, 'registryCase', { id: case2 });
  for (const st of ['demand','fard_approval_pending','fard_approval_review','fard_approved','fard_jari_issued','fard_received','fard_handed_over','expense_approved','expense_paid','registry_done','registry_recorded']) {
    for (const mode of ['client_self','company_managed']) {
      const d = JSON.parse(JSON.stringify(c2)); d.case.status = st; d.case.mode = mode;
      try { ui.VIEWS.case(d); } catch (e) { ok(false, `case view ${st}/${mode}: ${e.message}`); }
    }
  }
  ok(true, 'case view renders for every step');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
