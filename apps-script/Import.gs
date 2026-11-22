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
