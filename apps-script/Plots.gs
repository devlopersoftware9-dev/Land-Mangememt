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
    if (bool(plot.payment_pending)) {
      // registry already moving with director approval: only record that the money came in
      Db.update('Plots', plot.id, { payment_pending: false, payment_cleared_at: nowIso(), payment_cleared_by: u.id });
      event(u, plot, 'payment_cleared', plot.current_customer_id, plot.current_customer_id, date, '', p.notes);
      return true;
    }
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
  function markRegistryStarted(u, plot, date, ref, pending) {
    expect(plot, pending ? ['sold'] : ['payment_cleared', 'registered'], 'registry');
    Db.update('Plots', plot.id, { sale_status: 'registry_in_process', payment_pending: !!pending });
    event(u, plot, 'registry_started', plot.current_customer_id, plot.current_customer_id, date, ref, pending ? 'Payment pending – proceeding with director approval' : '');
  }
  function markRegistered(u, plot, date, registryNo) {
    expect(plot, ['registry_in_process'], 'register');
    Db.update('Plots', plot.id, { sale_status: 'registered' });
    event(u, plot, 'registered', plot.current_customer_id, plot.current_customer_id, date, registryNo);
  }
  function revertRegistry(u, plot, ref, reason) {
    if (plot.sale_status !== 'registry_in_process') return;
    var back = Registry.plotAreas(plot).registered > 0 ? 'registered' : bool(plot.payment_pending) ? 'sold' : 'payment_cleared';
    Db.update('Plots', plot.id, { sale_status: back, payment_pending: false });
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
    var data = {
      project_id: pid, seller_name: required(p.seller_name, 'seller'), seller_father_name: str(p.seller_father_name),
      seller_cnic: str(p.seller_cnic), seller_phone: str(p.seller_phone), mauza: str(p.mauza), khewat_no: str(p.khewat_no),
      khatooni_no: str(p.khatooni_no), khasra_nos: str(p.khasra_nos), area_sqft: sqft(pid, p), agreement_date: str(p.agreement_date),
      notes: str(p.notes),
    };
    if (p.id) {
      var old = Db.get('LandPurchases', p.id);
      Db.update('LandPurchases', p.id, data);
      audit(u, 'land.purchase.edited', 'LandPurchases', p.id, { before: { seller: old.seller_name, area_sqft: old.area_sqft, khasra: old.khasra_nos }, after: { seller: data.seller_name, area_sqft: data.area_sqft, khasra: data.khasra_nos } });
      return true;
    }
    var rec = Db.insert('LandPurchases', Object.assign(data, { payment_cleared: false, intiqal_done: false }));
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
    var holderKey = str(p.holder_name).toLowerCase();   // one intiqal no can be in the names of 2-3 holders (joint)
    if (Db.where('Intiqals', 'project_id', pid).some(function (i) { return i.intiqal_no === no && i.holder_name.toLowerCase() === holderKey && i.id !== String(p.id || ''); })) fail('err.duplicate', { field: 'intiqal_no' });
    var data = {
      project_id: pid, land_purchase_id: str(p.land_purchase_id), intiqal_no: no, intiqal_date: str(p.intiqal_date),
      holder_name: required(p.holder_name, 'holder'), holder_cnic: str(p.holder_cnic), holder_is_filer: bool(p.holder_is_filer),
      holder_acquired_on: str(p.holder_acquired_on), khasra_nos: str(p.khasra_nos), area_sqft: sqft(pid, p), notes: str(p.notes),
    };
    if (data.area_sqft <= 0) fail('err.area_required');
    if (p.id) {
      var used = issued(p.id);
      if (data.area_sqft + 0.01 < used) fail('err.area_below_issued', { issued: Math.round(used / num(Db.get('Projects', pid).marla_sqft || 270) * 100) / 100 });
      Db.update('Intiqals', p.id, data);
      audit(u, 'land.intiqal.edited', 'Intiqals', p.id, data);
      return true;
    }
    var rec = Db.insert('Intiqals', data);
    audit(u, 'land.intiqal', 'Intiqals', rec.id);
    return true;
  }

  function saveParcel(u, p) {
    var pid = required(p.project_id, 'project');
    if (ENUM.parcelType.indexOf(p.type) < 0) fail('err.required', { field: 'type' });
    var data = { project_id: pid, type: p.type, name: required(p.name, 'name'), area_sqft: sqft(pid, p), width_ft: str(p.width_ft), notes: str(p.notes) };
    if (p.id) { Db.update('Parcels', p.id, data); audit(u, 'land.parcel.edited', 'Parcels', p.id, data); return true; }
    Db.insert('Parcels', data);
    return true;
  }

  /** Delete a wrong entry. Blocked when other records depend on it (intiqal used for a fard, purchase linked to an intiqal). */
  function remove(u, p) {
    var table = { purchase: 'LandPurchases', intiqal: 'Intiqals', parcel: 'Parcels', tma: 'TmaTransfers' }[p.kind];
    if (!table) fail('err.unknown_action');
    var rec = Db.get(table, p.id);
    if (table === 'Intiqals' && (Db.where('CaseIntiqals', 'intiqal_id', rec.id).length || Db.where('TmaTransfers', 'intiqal_id', rec.id).length)) fail('err.in_use');
    if (table === 'LandPurchases' && Db.where('Intiqals', 'land_purchase_id', rec.id).length) fail('err.in_use');
    var sh = SpreadsheetApp.getActive().getSheetByName(table);
    sh.deleteRow(rec._row);
    Db.clearCache();
    audit(u, 'land.' + p.kind + '.deleted', table, rec.id, rec);
    return true;
  }

  /** Area already issued (fard jari) from an intiqal, excluding cancelled files. */
  function issued(intiqalId) {
    var total = 0;
    Db.where('CaseIntiqals', 'intiqal_id', intiqalId).forEach(function (ci) {
      var c = Db.find('RegistryCases', ci.case_id);
      if (c && c.status !== 'cancelled') total += num(ci.area_sqft);
    });
    Db.where('TmaTransfers', 'intiqal_id', intiqalId).forEach(function (t) { total += num(t.area_sqft); });
    return total;
  }

  function balance(intiqal) { return num(intiqal.area_sqft) - issued(intiqal.id); }

  /** Land transferred to TMA (roads / parks): taken out of an intiqal's balance. */
  function saveTma(u, p) {
    var i = Db.get('Intiqals', required(p.intiqal_id, 'intiqal'));
    var area = sqft(i.project_id, p);
    if (area <= 0) fail('err.area_required');
    var old = p.id ? Db.get('TmaTransfers', p.id) : null;
    var bal = balance(i) + (old && old.intiqal_id === i.id ? num(old.area_sqft) : 0);
    if (area > bal + 0.5) fail('err.intiqal_low', { no: i.intiqal_no, balance: Math.round(bal * 100) / 100 });
    var data = { project_id: i.project_id, intiqal_id: i.id, area_sqft: Math.round(area * 100) / 100, registry_no: str(p.registry_no),
      registry_date: p.registry_date ? validDate(p.registry_date, 'date') : '', tma_intiqal_no: str(p.tma_intiqal_no), notes: str(p.notes) };
    if (old) { Db.update('TmaTransfers', old.id, data); audit(u, 'land.tma.edited', 'TmaTransfers', old.id, data); return true; }
    var rec = Db.insert('TmaTransfers', Object.assign(data, { created_by: u.id }));
    audit(u, 'land.tma', 'TmaTransfers', rec.id, data);
    return true;
  }

  return { savePurchase: savePurchase, tickPurchase: tickPurchase, saveIntiqal: saveIntiqal, saveParcel: saveParcel, saveTma: saveTma, remove: remove, issued: issued, balance: balance };
})();

/** Settings: rates and approval emails. */
var Settings = (function () {
  var KEYS = ['director_email', 'approval_cc', 'sender_name', 'sender_department', 'link_valid_days', 'web_app_url', 'require_authenticated_reply', 'backup_emails', 'backup_times', 'backup_on'];

  function get() {
    var out = {};
    KEYS.forEach(function (k) { out[k] = setting(k, ''); });
    return out;
  }

  function save(u, p) {
    KEYS.forEach(function (k) { if (p.hasOwnProperty(k)) Db.setSetting(k, str(p[k])); });
    audit(u, 'settings.saved', 'Settings', '', p);
    if (['backup_emails', 'backup_times', 'backup_on'].some(function (k) { return p.hasOwnProperty(k); })) AutoBackup.install();
    return true;
  }

  function saveRates(u, rows) {
    (rows || []).forEach(function (r) {
      var rec = Db.get('Rates', r.id);
      var patch = {};
      ['rate', 'non_filer_rate', 'fixed_amount'].forEach(function (k) { if (r.hasOwnProperty(k)) patch[k] = str(r[k]); });
      ['default_on', 'receipt', 'is_active'].forEach(function (k) { if (r.hasOwnProperty(k)) patch[k] = bool(r[k]); });
      if (r.params) patch.params = JSON.stringify(r.params);
      Db.update('Rates', rec.id, patch);
    });
    audit(u, 'rates.saved', 'Rates', '', rows);
    return true;
  }

  return { get: get, save: save, saveRates: saveRates };
})();
