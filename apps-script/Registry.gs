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
    Auth.need(u, 'fard_demand');
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
        Auth.need(u, 'send_approval'); expect(c, ['demand']);
        Approval.createAndSend(u, c, 'fard', null);
        move(u, c, 'fard_approval_pending');
        return true;

      case 'fard_jari':
        Auth.need(u, 'fard_jari'); expect(c, ['fard_approved']);
        return fardJari(u, c, p.allocations || {}, required(p.message, 'message'));

      case 'fard_received':
        Auth.need(u, 'fard_received'); expect(c, ['fard_jari_issued']);
        Db.update('RegistryCases', c.id, { fard_no: str(p.fard_no), fard_received_on: validDate(p.date, 'date') });
        move(u, c, 'fard_received');
        return true;

      case 'hand_over_fard':
        Auth.need(u, 'hand_over_fard'); mode(c, 'client_self'); expect(c, ['fard_received']);
        Db.update('RegistryCases', c.id, { fard_handed_over_on: validDate(p.date, 'date') });
        move(u, c, 'fard_handed_over');
        return true;

      case 'client_registry':
        Auth.need(u, 'client_registry'); mode(c, 'client_self'); expect(c, ['fard_handed_over']);
        var d1 = validDate(p.registry_date, 'registry_date');
        Db.update('RegistryCases', c.id, { registry_no: required(p.registry_no, 'registry_no'), registry_date: d1, registry_office: str(p.registry_office), registry_copy_url: str(p.registry_copy_url) });
        move(u, c, 'client_registry_recorded');
        Plots.markRegistered(u, Db.get('Plots', c.plot_id), d1, str(p.registry_no));
        return true;

      case 'expense_save':
        return saveAndSendExpense(u, c, p);

      case 'expense_paid':
        Auth.need(u, 'expense_paid'); expect(c, ['expense_approved']);
        Db.update('RegistryCases', c.id, { expense_paid: true, expense_paid_at: nowIso(), expense_paid_by: u.id });
        move(u, c, 'expense_paid');
        return true;

      case 'registry_done':
        Auth.need(u, 'registry_done'); expect(c, ['expense_paid']);
        Db.update('RegistryCases', c.id, { registry_no: required(p.registry_no, 'registry_no'), registry_date: validDate(p.registry_date, 'registry_date'), registry_office: str(p.registry_office) });
        move(u, c, 'registry_done');
        return true;

      case 'record_in_office':
        Auth.need(u, 'record_in_office'); expect(c, ['registry_done']);
        var d2 = validDate(p.date, 'date');
        Db.update('RegistryCases', c.id, { registry_recorded_on: d2, buyer_intiqal_no: str(p.buyer_intiqal_no), registry_copy_url: str(p.registry_copy_url) });
        move(u, c, 'registry_recorded');
        Plots.markRegistered(u, Db.get('Plots', c.plot_id), c.registry_date || d2, c.registry_no);
        return true;

      case 'hand_over':
        Auth.need(u, 'hand_over'); expect(c, ['registry_recorded']);
        Db.update('RegistryCases', c.id, { handed_over_on: validDate(p.date, 'date') });
        move(u, c, 'handed_over');
        return true;

      case 'cancel':
        Auth.need(u, 'cancel_case');
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

  /** Live calculation. p.rates (optional) = unsaved edits from the Settings page, merged over saved rates. */
  function expensePreview(p) {
    var rates = Db.all('Rates');
    if (p.rates && p.rates.length) {
      var edits = {};
      p.rates.forEach(function (r) { edits[String(r.id)] = r; });
      rates = rates.map(function (r) {
        var e = edits[r.id]; if (!e) return r;
        return Object.assign({}, r, {
          rate: e.rate !== undefined ? e.rate : r.rate, non_filer_rate: e.non_filer_rate !== undefined ? e.non_filer_rate : r.non_filer_rate,
          fixed_amount: e.fixed_amount !== undefined ? e.fixed_amount : r.fixed_amount, params: e.params ? JSON.stringify(e.params) : r.params,
        });
      });
    }
    return ExpenseCalc.calculate(rates, expenseInput(p));
  }

  /** Save the expense sheet and email it to the director (same as the Google Sheet button). */
  function saveAndSendExpense(u, c, p) {
    Auth.need(u, 'expense');
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
    Auth.need(u, 'verify_approval');
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
    Auth.need(u, 'verify_approval');
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
