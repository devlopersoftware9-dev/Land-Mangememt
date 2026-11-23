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
    .addItem('Refresh Plot / Registry register tabs', 'refreshRegisters')
    .addItem('Email full backup now', 'sendScheduledBackup')
    .addItem('Install daily backup e-mails', 'installBackupTriggers')
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
    if (['pollApprovalInbox', 'expireApprovalLinks', 'refreshRegisters'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pollApprovalInbox').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('expireApprovalLinks').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('refreshRegisters').timeBased().everyMinutes(10).create();
  AutoBackup.install();
  refreshRegisters();
}

/** After deploying: stores the /exec URL so approval emails link to it. */
function saveWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  if (!url) { SpreadsheetApp.getUi().alert('Deploy the web app first (Deploy → New deployment → Web app).'); return; }
  Db.setSetting('web_app_url', url);
  SpreadsheetApp.getUi().alert('Saved. Open the app:\n' + url);
}
