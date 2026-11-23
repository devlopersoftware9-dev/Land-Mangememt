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
  getValue() { const row = this.sh.rows[this.r - 1] || []; return row[this.c - 1] === undefined ? '' : row[this.c - 1]; }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; out.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j])); } return out; }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); this.rows[r - 1][c - 1] = v; }
  getDataRange() { const w = Math.max(1, ...this.rows.map(r => r.length)); return { getValues: () => this.rows.map(r => Array.from({ length: w }, (_, i) => r[i] === undefined ? '' : r[i])) }; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
  getLastRow() { return this.rows.length; }
  appendRow(v) { this.rows.push(v.slice()); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  getMaxColumns() { return 50; } getMaxRows() { return 1000; } setFrozenRows() {} clearContents() { this.rows = []; }
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
for (const f of ['Core.gs', 'Db.gs', 'Auth.gs', 'Expense.gs', 'Parser.gs', 'Plots.gs', 'Registry.gs', 'Approval.gs', 'Views.gs', 'Setup.gs', 'Import.gs']) {
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
// edit / delete land records
const pur = land.purchases[0];
api(lm, 'savePurchase', { id: pur.id, project_id: pid, seller_name: 'Qamar Zaman', kanal: 12 });
let land2 = api(lm, 'land', { project_id: pid });
ok(land2.purchases.length === 1 && land2.purchases[0].seller_name === 'Qamar Zaman' && Number(land2.purchases[0].area_sqft) === 12 * 20 * 270, 'purchase edited: ' + JSON.stringify(land2.purchases[0].area_sqft));
ok(apiErr(lm, 'saveIntiqal', { id: land.intiqals[0].id, project_id: pid, intiqal_no: '1001', holder_name: 'Q', marla: 1 }).code === 'err.area_below_issued', 'intiqal area below issued blocked');
ok(apiErr(lm, 'deleteLand', { kind: 'intiqal', id: land.intiqals[0].id }).code === 'err.in_use', 'used intiqal cannot be deleted');
api(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '1003', holder_name: 'Temp', land_purchase_id: pur.id, marla: 2 });
ok(apiErr(lm, 'deleteLand', { kind: 'purchase', id: pur.id }).code === 'err.in_use', 'linked purchase cannot be deleted');
const tmp = api(lm, 'land', { project_id: pid }).intiqals.find(i => i.intiqal_no === '1003');
api(lm, 'saveIntiqal', { id: tmp.id, project_id: pid, intiqal_no: '1003', holder_name: 'Temp2', marla: 3 });
ok(api(lm, 'land', { project_id: pid }).intiqals.find(i => i.id === tmp.id).holder_name === 'Temp2', 'intiqal edited');
api(lm, 'deleteLand', { kind: 'intiqal', id: tmp.id });
ok(!api(lm, 'land', { project_id: pid }).intiqals.some(i => i.id === tmp.id), 'unused intiqal deleted');
api(lm, 'saveParcel', { project_id: pid, type: 'road', name: 'Raasta X', marla: 5 });
const par = api(lm, 'land', { project_id: pid }).parcels.find(x => x.name === 'Raasta X');
api(lm, 'saveParcel', { id: par.id, project_id: pid, type: 'park', name: 'Park X', marla: 6 });
ok(api(lm, 'land', { project_id: pid }).parcels.find(x => x.id === par.id).name === 'Park X', 'parcel edited');
api(lm, 'deleteLand', { kind: 'parcel', id: par.id });
ok(!api(lm, 'land', { project_id: pid }).parcels.some(x => x.id === par.id), 'parcel deleted');
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

// payment pending: registry proceeds with director approval
const p3 = plots.find(p => p.plot_no === '23.06');
api(admin, 'savePlot', { id: p3.id, size_marla: '5' });
api(acc, 'sell', { plot_id: p3.id, customer_id: c2, date: '2026-02-01' });
ok(apiErr(acc, 'createDemand', { plot_id: p3.id, mode: 'company_managed', demand_date: '2026-11-22', maliyat: 2500000 }).code === 'err.payment_not_cleared', 'no pending tick -> blocked');
ok(apiErr(acc, 'createDemand', { plot_id: p3.id, mode: 'company_managed', demand_date: '2026-11-22', maliyat: 2500000, payment_pending: 'TRUE' }).code === 'err.pending_amount', 'pending amount required');
const case3 = api(acc, 'createDemand', { plot_id: p3.id, mode: 'company_managed', demand_date: '2026-11-22', maliyat: 2500000, payment_pending: 'TRUE', pending_amount: '500000', pending_remarks: 'balance by 30 Dec' });
let g3 = api(acc, 'plotGrid', { project_id: pid }).rows.find(r => r.id === p3.id);
ok(g3.sale_status === 'registry_in_process' && g3.pay_pending === true, 'pending plot in registry: ' + JSON.stringify(g3));
api(acc, 'registryStep', { case_id: case3, step: 'send_fard_approval' });
mail = sent[sent.length - 1];
ok(/^PAYMENT PENDING Rs.500000\/- -- Fard Approval Request--Plot_23.06/.test(mail.subject), 'pending subject: ' + mail.subject);
ok(/Payment Pending: Rs. 500,000\/-/.test(mail.opts.htmlBody) && /proceeding with its registry/.test(mail.opts.htmlBody) && /balance by 30 Dec/.test(mail.opts.htmlBody), 'pending box in email');
api(acc, 'clearPayment', { plot_id: p3.id, date: '2026-12-15' });
g3 = api(acc, 'plotGrid', { project_id: pid }).rows.find(r => r.id === p3.id);
ok(g3.sale_status === 'registry_in_process' && g3.pay_pending === false, 'payment cleared later, registry continues');
const cv3 = api(acc, 'registryCase', { id: case3 });
ok(cv3.case.pending_amount === '500000', 'case keeps pending record');

// partial registry: 5 M plot, fard jari for 3 M only -> 2 M pending -> second registry for the rest
const p4 = plots.find(p => p.plot_no === '23.07');
api(admin, 'savePlot', { id: p4.id, size_marla: '5' });
api(acc, 'sell', { plot_id: p4.id, customer_id: c2, date: '2026-02-01' });
api(acc, 'clearPayment', { plot_id: p4.id, date: '2026-03-01' });
ok(apiErr(acc, 'createDemand', { plot_id: p4.id, mode: 'client_self', demand_date: '2026-11-22', maliyat: 1000000, area_marla: 6 }).code === 'err.area_more_than_pending', 'demand area > plot blocked');
const case4 = api(acc, 'createDemand', { plot_id: p4.id, mode: 'client_self', demand_date: '2026-11-22', maliyat: 1000000 });
vm.runInContext(`Db.update('RegistryCases', '${case4}', { status: 'fard_approved' })`, ctx);
api(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '2001', holder_name: 'Big Holder', kanal: 5 });
const big = api(lm, 'land', { project_id: pid }).intiqals.find(i => i.intiqal_no === '2001');
api(lm, 'registryStep', { case_id: case4, step: 'fard_jari', allocations: { [big.id]: 810 }, message: 'fard 3 M' });
let cv4 = api(acc, 'registryCase', { id: case4 }).case;
ok(Number(cv4.area_sqft) === 810 && Number(cv4.area_marla) === 3, 'partial fard jari saves 3 M: ' + cv4.area_marla);
api(admin, 'registryStep', { case_id: case4, step: 'fard_received', fard_no: 'F1', date: '2026-11-23' });
api(admin, 'registryStep', { case_id: case4, step: 'hand_over_fard', date: '2026-11-23' });
api(admin, 'registryStep', { case_id: case4, step: 'client_registry', registry_no: 'R-9', registry_date: '2026-11-23' });
let g4 = api(acc, 'plotGrid', { project_id: pid }).rows.find(r => r.id === p4.id);
ok(g4.sale_status === 'registered' && g4.reg_m === 3 && g4.pend_m === 2, 'partly registered: ' + g4.reg_m + ' / pending ' + g4.pend_m);
ok(api(acc, 'plot', { id: p4.id }).areas.pending === 540, 'plot view pending area');
const case4b = api(acc, 'createDemand', { plot_id: p4.id, mode: 'client_self', demand_date: '2026-11-25', maliyat: 700000 });
ok(Number(api(acc, 'registryCase', { id: case4b }).case.area_marla) === 2, 'second demand defaults to pending 2 M');
ok(apiErr(acc, 'createDemand', { plot_id: p4.id, mode: 'client_self', demand_date: '2026-11-25', maliyat: 1 }).code === 'err.case_open', 'one open file per plot');
api(admin, 'registryStep', { case_id: case4b, step: 'cancel', reason: 'later' });
ok(api(acc, 'plot', { id: p4.id }).plot.sale_status === 'registered', 'cancel of 2nd part keeps plot registered');

// old registries import + export
const p5 = plots.find(p => p.plot_no === '23.08'), p6 = plots.find(p => p.plot_no === '23.09');
api(admin, 'savePlot', { id: p5.id, size_marla: '5' }); api(admin, 'savePlot', { id: p6.id, size_marla: '10' });
const imp = api(admin, 'importRegistries', { project_id: pid, rows: [
  { plot_no: '23.08', buyer_name: 'Old Buyer', father_name: 'Old Father', cnic: '3520212345671', registry_no: 'OR-1', registry_date: '15-03-2025', maliyat: '2000000', mode: 'Client' },
  { plot_no: '23.09', area_marla: '6', buyer_name: 'Part Buyer', registry_no: 'OR-2', registry_date: '2025-04-01', mode: 'Company', seller_intiqal_no: '9999' },
  { plot_no: '99.99', buyer_name: 'X', registry_no: '1', registry_date: '01-01-2025' },
  { plot_no: '23.08', buyer_name: 'Again', registry_no: '2', registry_date: '01-01-2025' },
] });
ok(imp[0].ok && imp[1].ok && !imp[2].ok && imp[2].code === 'err.not_found' && !imp[3].ok && imp[3].code === 'err.nothing_pending', 'import results: ' + JSON.stringify(imp));
ok(/pending 4 M/.test(imp[1].msg) && /not found/.test(imp[1].msg), 'partial import msg: ' + imp[1].msg);
const g56 = api(acc, 'plotGrid', { project_id: pid }).rows.filter(r => r.id === p5.id || r.id === p6.id);
ok(g56.every(r => r.sale_status === 'registered') && g56.find(r => r.id === p6.id).pend_m === 4, 'imported plots registered');
ok(apiErr(acc, 'importRegistries', { project_id: pid, rows: [] }).code === 'err.not_allowed', 'import admin only');
const ex1 = api(acc, 'exportData', { project_id: pid, kind: 'plots' }), ex2 = api(acc, 'exportData', { project_id: pid, kind: 'registries' });
ok(ex1.rows.length === 297 && ex1.rows[0].length === ex1.head.length && ex2.rows.some(r => r[0] === 'OLD-0001') && ex2.rows[0].length === ex2.head.length, 'export plots + registries');

// generic Excel import + backup + register tabs
const ik = (kind, rows) => api(admin, 'importKind', { project_id: pid, kind, rows });
let r1 = ik('customers', [{ name: 'Excel Person', relation: 's/o', father_name: 'Dad', cnic: '35202-7777777-1', phone: '0300', is_filer: 'Yes' }, { name: 'Excel Person 2', cnic: '123' }]);
ok(r1[0].ok && r1[0].msg === 'added' && !r1[1].ok && r1[1].code === 'err.cnic', 'customers import: ' + JSON.stringify(r1));
r1 = ik('customers', [{ name: 'Excel Person', cnic: '3520277777771', phone: '0311' }]);
ok(r1[0].msg === 'updated', 'customer matched by CNIC');
r1 = ik('intiqals', [{ intiqal_no: '3001', holder_name: 'Excel Holder', holder_is_filer: 'No', kanal: '2', intiqal_date: '01-02-2024' }, { intiqal_no: '3002', holder_name: 'No Area' }]);
ok(r1[0].ok && !r1[1].ok && r1[1].code === 'err.area_required', 'intiqal import: ' + JSON.stringify(r1));
ok(Number(api(lm, 'land', { project_id: pid }).intiqals.find(i => i.intiqal_no === '3001').area_sqft) === 10800, 'intiqal area from kanal');
r1 = ik('intiqals', [{ intiqal_no: '3001', holder_name: 'Excel Holder', marla: '30' }]);
ok(r1[0].msg === 'updated' && Number(api(lm, 'land', { project_id: pid }).intiqals.find(i => i.intiqal_no === '3001').area_sqft) === 8100, 'intiqal updated');
r1 = ik('purchases', [{ seller_name: 'Excel Seller', khasra_nos: '77', kanal: '4', payment_cleared: 'Yes' }]);
ok(r1[0].ok && api(lm, 'land', { project_id: pid }).purchases.find(x => x.seller_name === 'Excel Seller').payment_cleared === 'TRUE', 'purchase import with tick');
r1 = ik('parcels', [{ type: 'Green Belt', name: 'GB-1', marla: '12' }, { type: 'xyz', name: 'bad' }]);
ok(r1[0].ok && !r1[1].ok, 'parcel import: ' + JSON.stringify(r1));
const p7 = plots.find(p => p.plot_no === '23.10');
r1 = ik('plots', [{ plot_no: '23.1', size_marla: '6', facing: 'west', customer_name: 'Excel Buyer', cnic: '35202-8888888-1', sold_on: '05-05-2025', payment_clear: 'yes' }, { plot_no: '77.77' }]);
ok(r1[0].ok && /sold, payment clear/.test(r1[0].msg) && !r1[1].ok, 'plot import: ' + JSON.stringify(r1));
const g7 = api(acc, 'plot', { id: p7.id }).plot;
ok(g7.sale_status === 'payment_cleared' && g7.size_marla === '6' && g7.facing === 'West' && g7.sold_on === '2025-05-05', 'plot imported: ' + JSON.stringify([g7.sale_status, g7.size_marla, g7.facing]));
ok(apiErr(acc, 'importKind', { project_id: pid, kind: 'customers', rows: [] }).code === 'err.not_allowed', 'generic import admin only');
const bk = api(admin, 'backup', {});
ok(bk.length === Object.keys(ctx.SCHEMA).length && !JSON.stringify(bk).includes('password_hash') && bk.find(t => t.name === 'Plots').rows.length >= 297, 'backup: all tables, no secrets');
ok(apiErr(acc, 'backup', {}).code === 'err.not_allowed', 'backup admin only');
vm.runInContext('refreshRegisters()', ctx);
ok(sheets['Plot Register'] && sheets['Plot Register'].rows.length >= 298 && sheets['Registry Register'].rows[0][0] === 'Ref', 'register tabs written');

// joint intiqal (same number, two holders) + TMA transfer
api(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '5000', holder_name: 'Irfan Baig', kanal: 10 });
api(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '5000', holder_name: 'Qamar-uz-Zaman', kanal: 10 });
ok(apiErr(lm, 'saveIntiqal', { project_id: pid, intiqal_no: '5000', holder_name: 'Irfan Baig', kanal: 1 }).code === 'err.duplicate', 'same no + same holder blocked');
let j5 = api(lm, 'land', { project_id: pid }).intiqals.filter(i => i.intiqal_no === '5000');
ok(j5.length === 2, 'joint intiqal stored twice');
const irf = j5.find(i => /Irfan/.test(i.holder_name));
ok(apiErr(lm, 'saveTma', { intiqal_id: irf.id, kanal: 11 }).code === 'err.intiqal_low', 'TMA more than balance blocked');
api(lm, 'saveTma', { intiqal_id: irf.id, marla: 63.5, registry_no: '581', registry_date: '2025-02-18', tma_intiqal_no: '18796' });
let l5 = api(lm, 'land', { project_id: pid });
ok(l5.tma.length === 1 && l5.intiqals.find(i => i.id === irf.id).balance === (200 - 63.5) * 270, 'TMA reduces balance');
ok(apiErr(lm, 'deleteLand', { kind: 'intiqal', id: irf.id }).code === 'err.in_use', 'intiqal with TMA cannot be deleted');
api(admin, 'savePlot', { id: plots.find(p => p.plot_no === '23.11').id, size_marla: '5' });
const r5 = api(admin, 'importRegistries', { project_id: pid, rows: [{ plot_no: '23.11', buyer_name: 'Joint Buyer', registry_no: 'J1', registry_date: '2025-05-05', seller_intiqal_no: '5000', seller_name: 'Qamar' }] });
ok(r5[0].ok && !/not found|low/.test(r5[0].msg), 'registry from joint intiqal: ' + JSON.stringify(r5));
ok(api(lm, 'land', { project_id: pid }).intiqals.find(i => /Qamar-uz/.test(i.holder_name) && i.intiqal_no === '5000').issued > 0, 'issued from the named holder');
api(lm, 'deleteLand', { kind: 'tma', id: l5.tma[0].id });
ok(api(lm, 'land', { project_id: pid }).tma.length === 0, 'TMA deleted');

// history protected
ok(!apiErr(admin, 'savePlot', { id: p2.id, size_marla: '5' }).ok === false, 'admin edit still fine');
let threw = false; try { vm.runInContext("Db.update('PlotEvents','1',{notes:'x'})", ctx); } catch (e) { threw = true; } ok(threw, 'PlotEvents cannot be updated');



// permissions: admin removes 'sell' from accounts -> accounts blocked, then restore
api(admin, 'savePermissions', { map: { sell: ['registry_officer'] } });
ok(!apiErr(acc, 'plotAction', { op: 'sell', plot_ids: [plots.find(p => p.plot_no === '24.01').id], customer_id: c1, date: '2026-11-22' }).ok, 'permission removed -> accounts cannot sell');
ok(api(acc, 'bootstrap', {}).perms.indexOf('sell') < 0, 'bootstrap perms reflect settings');
ok(api(ro, 'plotAction', { op: 'sell', plot_ids: [plots.find(p => p.plot_no === '24.01').id], customer_id: c1, date: '2026-11-22' }).done.length === 1, 'registry officer now allowed to sell');
api(admin, 'savePermissions', { map: {} });
ok(api(acc, 'bootstrap', {}).perms.indexOf('sell') < 0, 'empty map = nobody but admin');
api(admin, 'savePermissions', { map: { sell: ['accounts'], payment_clear: ['accounts'], fard_demand: ['accounts'], cancel_sale: ['accounts'], repurchase: ['accounts'], transfer: ['accounts'], construction: ['accounts'], customers: ['accounts'], land: ['land_management'], send_approval: ['accounts'], verify_approval: ['accounts'], fard_jari: ['land_management'], fard_received: ['registry_officer'], hand_over_fard: ['registry_officer', 'accounts'], client_registry: ['accounts', 'registry_officer'], expense: ['accounts'], expense_paid: ['accounts'], registry_done: ['registry_officer'], record_in_office: ['accounts', 'registry_officer'], hand_over: ['accounts', 'registry_officer'] } });
// settings calculator with unsaved rate edit
const rr = api(admin, 'rates', {}); const tma = rr.find(r => r.code === 'tma_sale_tax');
const pv1 = api(admin, 'expensePreview', { kind: 'registry_expense', maliyat: 3100000, area_marla: 6.25, buyer_is_filer: true, seller_is_filer: true });
const pv2 = api(admin, 'expensePreview', { kind: 'registry_expense', maliyat: 3100000, area_marla: 6.25, buyer_is_filer: true, seller_is_filer: true, rates: [{ id: tma.id, rate: '2', fixed_amount: '0' }] });
ok(pv1.grand_total === 213200 && pv2.grand_total === 213200 + 31000, 'settings calculator uses unsaved edits: ' + pv2.grand_total);

// Apps Script strips "//..." from served pages even inside strings: page JS must never contain a double slash in code
{
  const page = fs.readFileSync(path.join(dir, 'Index.html'), 'utf8').split('<body')[1];
  const bad = page.split('\n').filter(l => { const i = l.indexOf('//'); return i >= 0 && /['"`]/.test(l.slice(0, i)) && /['"`]/.test(l.slice(i)); }).filter(l => !/^\s*\/\//.test(l) && /['"`][^'"`]*\/\//.test(l));
  ok(!bad.length, 'no // inside strings in Index.html: ' + bad.map(l => l.trim().slice(0, 80)).join(' | '));
}

// ---------------- render every screen with real data (EN + UR)
{
  const ui = { document: { documentElement: {}, getElementById: () => ({ innerHTML: '' }), querySelectorAll: () => [], addEventListener() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {} },
    google: { script: { run: {}, history: { setChangeHandler() {}, push() {} }, url: { getLocation() {} } } }, console, setTimeout, clearTimeout, URL };
  vm.createContext(ui);
  vm.runInContext(fs.readFileSync(path.join(dir, 'Index.html'), 'utf8').split('<script>').pop().split('</script>')[0] + ';this.VIEWS=VIEWS;this.S=S;', ui);
  ui.S.enums = api(admin, 'bootstrap', {}).enums; ui.S.user = { role: 'admin', name: 'A' }; ui.S.projectId = pid;
  const screens = {
    dashboard: api(admin, 'dashboard', { project_id: pid }), plots: api(admin, 'plots', { project_id: pid }), plot: api(admin, 'plot', { id: plot.id }),
    registry: api(admin, 'registryList', { project_id: pid }), case: api(admin, 'registryCase', { id: caseId }), approvals: api(admin, 'approvals', { project_id: pid }),
    approval: api(admin, 'approval', { id: cs.approvals[0].id }), customers: api(admin, 'customers', {}), customer: api(admin, 'customer', { id: c1 }),
    land: api(admin, 'land', { project_id: pid }), settings: [api(admin, 'rates', {}), api(admin, 'getSettings', {}), api(admin, 'users', {}), api(admin, 'getPermissions', {})],
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
