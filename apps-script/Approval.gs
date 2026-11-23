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
    if (type === 'fard') return (bool(c.payment_pending) && bool(plot.payment_pending) ? 'PAYMENT PENDING Rs.' + int(c.pending_amount) + '/- -- ' : '') + 'Fard Approval Request--Plot_' + plot.plot_no + ' ' + project.code + ' ' + fmtMarla(c.area_marla) + ' Marla Maliyat Rs.' + int(c.maliyat) + '/- [' + ref + ']';
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
    if (bool(c.payment_pending) && bool(plot.payment_pending)) {
      h += '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 12px;margin:12px 0">' +
        '<b style="color:#b45309">&#9888; Payment Pending: Rs. ' + money(c.pending_amount) + '/-</b><br>' +
        'The full payment of this plot has not been received yet. With your approval, we are proceeding with its registry.' +
        (c.pending_remarks ? '<br><span style="color:#64748b">Remarks: ' + esc(c.pending_remarks) + '</span>' : '') + '</div>';
    }

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
