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

// ===================================================================== Excel export / old registry import
var DataIO = (function () {
  var yn = function (b) { return b ? 'Yes' : ''; };
  var m2 = function (v, ms) { return Math.round(num(v) / ms * 100) / 100; };

  function exportData(u, p) {
    var pid = required(p.project_id, 'project'), proj = Db.get('Projects', pid), ms = num(proj.marla_sqft || 270);
    if (p.kind === 'registries') {
      var plots = {}; Db.where('Plots', 'project_id', pid).forEach(function (x) { plots[x.id] = x; });
      var head = ['Ref', 'Plot No', 'Registry Area (Marla)', 'Registry By', 'Status', 'Buyer', 'CNIC', 'Demand Date', 'Maliyat', 'Payment Pending (Rs)',
        'Seller (intiqal holder)', 'Intiqals used', 'Fard No', 'Registry No', 'Registry Date', 'Registry Office', 'Buyer Intiqal No', 'Handed Over', 'Notes'];
      var rows = Db.all('RegistryCases').filter(function (c) { return plots[c.plot_id]; }).map(function (c) {
        var cu = c.customer_id ? Db.find('Customers', c.customer_id) : null;
        var ints = Db.where('CaseIntiqals', 'case_id', c.id).map(function (ci) { var i = Db.find('Intiqals', ci.intiqal_id); return (i ? i.intiqal_no : '?') + ' (' + m2(ci.area_sqft, ms) + ' M)'; }).join(', ');
        return [c.reference, plots[c.plot_id].plot_no, num(c.area_marla), c.mode === 'company_managed' ? 'Company' : 'Client', c.status, cu ? cu.name : '', cu ? cu.cnic : '',
          c.demand_date, int(c.maliyat), bool(c.payment_pending) ? int(c.pending_amount) : '', c.seller_name, ints, c.fard_no, c.registry_no, c.registry_date, c.registry_office,
          c.buyer_intiqal_no, c.handed_over_on, c.notes];
      });
      return { name: 'Registries', head: head, rows: rows };
    }
    var head2 = ['Plot No', 'Street', 'Size (Marla)', 'East / West', 'Category', 'Status', 'Customer', 'Father / Husband', 'CNIC', 'Phone', 'Sold On',
      'Payment Clear', 'Payment Pending', 'Registered (Marla)', 'Registry Pending (Marla)', 'Registry File', 'Construction'];
    var custs = {}; Db.all('Customers').forEach(function (c) { custs[c.id] = c; });
    var rows2 = Views.plotRows(pid).map(function (r) {
      var c = custs[r.customer_id] || {};
      var paid = ['payment_cleared', 'registry_in_process', 'registered'].indexOf(r.sale_status) >= 0 && !r.pay_pending;
      var regM = r.sale_status === 'registered' && !r.reg_m ? num(r.size_marla) : r.reg_m;
      return [r.plot_no, r.street, num(r.size_marla) || '', r.facing, r.category, r.sale_status, r.customer, c.father_name || '', r.cnic, r.phone, r.sold_on,
        yn(paid), yn(r.pay_pending), regM || '', r.pend_m || '', r.case_status, r.construction_status];
    });
    return { name: 'Plots', head: head2, rows: rows2 };
  }

  /** dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd -> yyyy-mm-dd */
  function looseDate(v, field) {
    var s = str(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    fail('err.date', { field: field });
  }
  function cnicOf(v) {
    var d = str(v).replace(/\D/g, '');
    if (!d) return '';
    if (d.length !== 13) fail('err.cnic');
    return d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12);
  }

  function importOne(u, pid, ms, r) {
    var no = required(r.plot_no, 'plot');
    var plot = Db.where('Plots', 'project_id', pid).filter(function (x) { return x.plot_no === no; })[0];
    if (!plot && /^\d+\.\d$/.test(no)) plot = Db.where('Plots', 'project_id', pid).filter(function (x) { return x.plot_no === no + '0'; })[0];   // Excel turned 21.10 into 21.1
    if (!plot) fail('err.not_found', { table: 'Plots', id: no });
    var date = looseDate(required(r.registry_date, 'registry_date'), 'registry_date');
    var regNo = required(r.registry_no, 'registry_no');
    var cnic = cnicOf(r.cnic), name = required(r.buyer_name, 'name');
    var areas = Registry.plotAreas(plot);
    if (areas.open_case_id) fail('err.case_open', { plot: no });
    if (areas.total <= 0) fail('err.plot_size_missing', { plot: no });
    var sqft = num(r.area_marla) > 0 ? Math.round(num(r.area_marla) * ms * 100) / 100 : areas.pending;
    if (sqft > areas.pending + 0.5) fail('err.area_more_than_pending', { pending: m2(areas.pending, ms) });
    if (sqft <= 0.5) fail('err.nothing_pending', { plot: no });
    if (['available', 'sold', 'payment_cleared', 'registered'].indexOf(plot.sale_status) < 0) fail('err.case_open', { plot: no });

    // buyer: by CNIC, else by name (+ father name), else new
    var cust = cnic ? Db.all('Customers').filter(function (c) { return c.cnic === cnic; })[0] : null;
    if (!cust) cust = Db.all('Customers').filter(function (c) {
      return c.name.toLowerCase().trim() === name.toLowerCase().trim() && (!r.father_name || c.father_name.toLowerCase().trim() === str(r.father_name).toLowerCase().trim());
    })[0];
    if (['sold', 'payment_cleared'].indexOf(plot.sale_status) >= 0 && plot.current_customer_id && (!cust || cust.id !== plot.current_customer_id))
      fail('err.plot_other_customer', { plot: no });
    var custId = cust ? cust.id : Plots.saveCustomer(u, { name: name, relation: str(r.relation).toLowerCase().replace(/\s/g, ''), father_name: str(r.father_name), cnic: cnic, phone: str(r.phone) });

    if (plot.sale_status === 'available') Plots.sell(u, { plot_id: plot.id, customer_id: custId, date: date, reference: 'Old record' });
    plot = Db.get('Plots', plot.id);
    if (plot.sale_status === 'sold') Plots.clearPayment(u, { plot_id: plot.id, date: date });

    var company = /comp/i.test(str(r.mode));
    var warn = '', alloc = null;
    if (str(r.seller_intiqal_no)) {
      // joint intiqal: prefer the holder named in "seller", else the first with enough balance
      var cands = Db.where('Intiqals', 'project_id', pid).filter(function (x) { return x.intiqal_no === str(r.seller_intiqal_no).trim(); });
      var sk = str(r.seller_name).toLowerCase().split(/\s+/)[0];
      var i = (sk && cands.filter(function (x) { return x.holder_name.toLowerCase().indexOf(sk) >= 0; })[0]) || cands.filter(function (x) { return Land.balance(x) + 0.5 >= sqft; })[0] || cands[0];
      if (!i) warn = 'intiqal ' + r.seller_intiqal_no + ' not found';
      else if (Land.balance(i) + 0.5 < sqft) warn = 'intiqal ' + i.intiqal_no + ' balance too low';
      else alloc = i;
    }
    var c = Db.insert('RegistryCases', {
      reference: 'OLD-' + ('000' + (Db.all('RegistryCases').filter(function (k) { return /^OLD-/.test(k.reference); }).length + 1)).slice(-4),
      plot_id: plot.id, customer_id: custId, mode: company ? 'company_managed' : 'client_self', status: company ? 'handed_over' : 'client_registry_recorded',
      demand_date: date, area_sqft: sqft, area_marla: m2(sqft, ms), maliyat: int(r.maliyat), seller_name: alloc ? alloc.holder_name : '',
      fard_no: str(r.fard_no), registry_no: regNo, registry_date: date, registry_office: str(r.registry_office), buyer_intiqal_no: str(r.buyer_intiqal_no),
      registry_recorded_on: date, handed_over_on: company ? date : '', expense_paid: company, notes: 'Imported old registry' + (r.notes ? ': ' + str(r.notes) : ''), created_by: u.id,
    });
    if (alloc) Db.insert('CaseIntiqals', { case_id: c.id, intiqal_id: alloc.id, area_sqft: sqft });
    Plots.markRegistryStarted(u, Db.get('Plots', plot.id), date, c.reference);
    Plots.markRegistered(u, Db.get('Plots', plot.id), date, regNo);
    audit(u, 'registry.imported', 'RegistryCases', c.id, r);
    var left = Registry.plotAreas(Db.get('Plots', plot.id)).pending;
    return c.reference + ' · ' + m2(sqft, ms) + ' M' + (left > 0.5 ? ' (pending ' + m2(left, ms) + ' M)' : '') + (warn ? ' · ⚠ ' + warn : '');
  }

  function importRegistries(u, p) {
    Auth.require(u, 'admin');
    var pid = required(p.project_id, 'project'), ms = num(Db.get('Projects', pid).marla_sqft || 270);
    return (p.rows || []).map(function (r, i) {
      try { return { row: i + 2, plot: str(r.plot_no), ok: true, msg: importOne(u, pid, ms, r) }; }
      catch (e) { Db.clearCache(); return { row: i + 2, plot: str(r.plot_no), ok: false, code: e.code || 'err.unknown', params: e.params || {}, msg: e.code ? '' : String(e.message || e) }; }
    });
  }

  // ------------------------------------------------------------------ full backup (all tables, no secrets)
  var SECRET = { Users: ['salt', 'password_hash'], Approvals: ['approve_token_hash', 'reject_token_hash'] };
  function backup(u) {
    Auth.require(u, 'admin');
    return Object.keys(SCHEMA).map(function (t) {
      var cols = SCHEMA[t].filter(function (c) { return (SECRET[t] || []).indexOf(c) < 0; });
      return { name: t, head: cols, rows: Db.all(t).map(function (r) { return cols.map(function (c) { return r[c]; }); }) };
    });
  }

  // ------------------------------------------------------------------ generic Excel import (one kind per file)
  var yes = function (v) { return /^(y|yes|true|1|haan|han|✓|✔)$/i.test(str(v)); };
  function one(list, test) { return list.filter(test)[0] || null; }

  function importRow(u, pid, ms, kind, r) {
    if (kind === 'customers') {
      var cnic = cnicOf(r.cnic), name = required(r.name, 'name');
      var c = cnic ? one(Db.all('Customers'), function (x) { return x.cnic === cnic; }) : one(Db.all('Customers'), function (x) { return x.name.toLowerCase() === name.toLowerCase() && (!r.father_name || x.father_name.toLowerCase() === str(r.father_name).toLowerCase()); });
      var data = { id: c ? c.id : '', name: name, relation: str(r.relation).toLowerCase().replace(/\s/g, '') || (c && c.relation), father_name: str(r.father_name) || (c && c.father_name), cnic: cnic || (c && c.cnic),
        phone: str(r.phone) || (c && c.phone), address: str(r.address) || (c && c.address), is_filer: r.is_filer !== '' && r.is_filer !== undefined ? yes(r.is_filer) : (c && bool(c.is_filer)) };
      Plots.saveCustomer(u, data);
      return c ? 'updated' : 'added';
    }
    if (kind === 'intiqals') {
      var no = required(r.intiqal_no, 'intiqal_no');
      var i = one(Db.where('Intiqals', 'project_id', pid), function (x) { return x.intiqal_no === no && (!r.holder_name || x.holder_name.toLowerCase() === str(r.holder_name).toLowerCase()); });
      Land.saveIntiqal(u, { id: i ? i.id : '', project_id: pid, intiqal_no: no, intiqal_date: r.intiqal_date ? looseDate(r.intiqal_date, 'date') : (i ? i.intiqal_date : ''),
        holder_name: r.holder_name || (i && i.holder_name), holder_cnic: r.holder_cnic ? cnicOf(r.holder_cnic) : (i ? i.holder_cnic : ''),
        holder_is_filer: r.holder_is_filer !== '' ? yes(r.holder_is_filer) : (i ? bool(i.holder_is_filer) : true), holder_acquired_on: r.holder_acquired_on ? looseDate(r.holder_acquired_on, 'date') : (i ? i.holder_acquired_on : ''),
        khasra_nos: str(r.khasra_nos) || (i && i.khasra_nos), kanal: r.kanal, marla: r.marla, sqft: (r.kanal || r.marla || r.sqft) ? r.sqft : (i ? i.area_sqft : 0), land_purchase_id: i ? i.land_purchase_id : '', notes: i ? i.notes : '' });
      return i ? 'updated' : 'added';
    }
    if (kind === 'purchases') {
      var seller = required(r.seller_name, 'seller');
      var lp = one(Db.where('LandPurchases', 'project_id', pid), function (x) { return x.seller_name.toLowerCase() === seller.toLowerCase() && x.khasra_nos === str(r.khasra_nos); });
      Land.savePurchase(u, { id: lp ? lp.id : '', project_id: pid, seller_name: seller, seller_father_name: str(r.seller_father_name), seller_cnic: r.seller_cnic ? cnicOf(r.seller_cnic) : '', seller_phone: str(r.seller_phone),
        mauza: str(r.mauza), khewat_no: str(r.khewat_no), khatooni_no: str(r.khatooni_no), khasra_nos: str(r.khasra_nos), kanal: r.kanal, marla: r.marla, sqft: r.sqft,
        agreement_date: r.agreement_date ? looseDate(r.agreement_date, 'date') : '' });
      var rec = lp || Db.where('LandPurchases', 'project_id', pid).slice(-1)[0];
      ['payment_cleared', 'intiqal_done'].forEach(function (f) { if (r[f] !== '' && yes(r[f]) !== bool(Db.get('LandPurchases', rec.id)[f])) Land.tickPurchase(u, { id: rec.id, field: f }); });
      return lp ? 'updated' : 'added';
    }
    if (kind === 'parcels') {
      var type = str(r.type).toLowerCase().replace(/[\s-]+/g, '_');
      var pname = required(r.name, 'name');
      var pc = one(Db.where('Parcels', 'project_id', pid), function (x) { return x.name.toLowerCase() === pname.toLowerCase(); });
      Land.saveParcel(u, { id: pc ? pc.id : '', project_id: pid, type: type, name: pname, kanal: r.kanal, marla: r.marla, sqft: r.sqft, width_ft: str(r.width_ft) });
      return pc ? 'updated' : 'added';
    }
    if (kind === 'plots') {
      var pno = required(r.plot_no, 'plot');
      var list = Db.where('Plots', 'project_id', pid);
      var x = one(list, function (q) { return q.plot_no === pno; }) || (/^\d+\.\d$/.test(pno) ? one(list, function (q) { return q.plot_no === pno + '0'; }) : null);
      if (!x) fail('err.not_found', { table: 'Plots', id: pno });
      var f = str(r.facing).toLowerCase();
      Plots.savePlot(u, { id: x.id, size_marla: str(r.size_marla) || x.size_marla, area_sqft: str(r.size_marla) ? '' : x.area_sqft, width_ft: x.width_ft, depth_ft: x.depth_ft,
        category: /comm/i.test(str(r.category)) ? 'commercial' : /res/i.test(str(r.category)) ? 'residential' : x.category, is_corner: bool(x.is_corner), is_park_facing: bool(x.is_park_facing),
        notes: str(r.notes) || x.notes, facing: f[0] === 'e' ? 'East' : f[0] === 'w' ? 'West' : x.facing });
      var msg = 'updated';
      if (str(r.customer_name)) {
        x = Db.get('Plots', x.id);
        if (x.sale_status !== 'available') return msg + ' (already ' + x.sale_status + ', sale not changed)';
        var cc = cnicOf(r.cnic), cust = cc ? one(Db.all('Customers'), function (q) { return q.cnic === cc; }) : one(Db.all('Customers'), function (q) { return q.name.toLowerCase() === str(r.customer_name).toLowerCase(); });
        var cid = cust ? cust.id : Plots.saveCustomer(u, { name: str(r.customer_name), relation: str(r.relation).toLowerCase().replace(/\s/g, ''), father_name: str(r.father_name), cnic: cc, phone: str(r.phone) });
        var d = looseDate(required(r.sold_on, 'date'), 'date');
        Plots.sell(u, { plot_id: x.id, customer_id: cid, date: d, reference: 'Excel import' });
        msg += ', sold';
        if (yes(r.payment_clear)) { Plots.clearPayment(u, { plot_id: x.id, date: r.payment_date ? looseDate(r.payment_date, 'date') : d }); msg += ', payment clear'; }
      }
      return msg;
    }
    fail('err.unknown_action');
  }

  function importKind(u, p) {
    Auth.require(u, 'admin');
    if (p.kind === 'registries') return importRegistries(u, p);
    var pid = required(p.project_id, 'project'), ms = num(Db.get('Projects', pid).marla_sqft || 270);
    var out = (p.rows || []).map(function (r, i) {
      try { return { row: i + 2, plot: str(r.plot_no || r.intiqal_no || r.name || r.seller_name), ok: true, msg: importRow(u, pid, ms, p.kind, r) }; }
      catch (e) { Db.clearCache(); return { row: i + 2, plot: str(r.plot_no || r.intiqal_no || r.name || r.seller_name), ok: false, code: e.code || 'err.unknown', params: e.params || {}, msg: e.code ? '' : String(e.message || e) }; }
    });
    try { refreshRegisters(); } catch (e) {}
    return out;
  }

  return { exportData: exportData, importRegistries: importRegistries, importKind: importKind, backup: backup };
})();


/**
 * Readable "register" tabs in the Google Sheet (Plot Register, Registry Register), rebuilt from the
 * database tabs every 10 minutes and after imports. Read-only views: edit through the app.
 */
function refreshRegisters() {
  var ss = SpreadsheetApp.getActive(), u = { id: 'system', role: 'admin' };
  Db.all('Projects').forEach(function (proj) {
    [['plots', 'Plot Register'], ['registries', 'Registry Register']].forEach(function (k) {
      var d = DataIO.exportData(u, { project_id: proj.id, kind: k[0] });
      var name = k[1] + (Db.all('Projects').length > 1 ? ' ' + proj.code : '');
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.clearContents();
      var data = [d.head].concat(d.rows.map(function (r) { return r.map(function (v) { return v === null || v === undefined ? '' : v; }); }));
      sh.getRange(1, 1, data.length, d.head.length).setNumberFormat('@').setValues(data.map(function (r) { return r.map(String); }));
      sh.getRange(1, 1, 1, d.head.length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      sh.getRange(data.length + 2, 1).setValue('Updated ' + nowIso() + ' – read only view, make changes in the app.').setFontColor('#64748b');
    });
  });
}
