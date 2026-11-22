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
      perms: Auth.myPerms(u),
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
