/**
 * Automatic e-mail backup: twice a day (times set in Settings) the whole database
 * is written into one Excel (.xlsx) file and e-mailed. Passwords and approval
 * tokens are left out. The .xlsx is built here by hand (it is a zip of XML files),
 * so no extra Google permission (Drive etc.) is needed.
 */
var AutoBackup = (function () {
  var SECRET = { Users: ['salt', 'password_hash'], Approvals: ['approve_token_hash', 'reject_token_hash'] };
  var HANDLER = 'sendScheduledBackup';

  function tables() {
    return Object.keys(SCHEMA).map(function (t) {
      var cols = SCHEMA[t].filter(function (c) { return (SECRET[t] || []).indexOf(c) < 0; });
      return { name: t, head: cols, rows: Db.all(t).map(function (r) { return cols.map(function (c) { return r[c]; }); }) };
    });
  }

  function hours() {
    var hs = str(setting('backup_times', '14,18')).split(/[^0-9:]+/).filter(String).map(function (x) { return parseInt(x.split(':')[0], 10); })
      .filter(function (h) { return h >= 0 && h <= 23; });
    hs = hs.filter(function (h, i) { return hs.indexOf(h) === i; });
    return hs.length ? hs.slice(0, 4) : [14, 18];
  }
  function recipients() {
    var list = str(setting('backup_emails', '')).split(/[\s,;]+/).filter(function (e) { return /@/.test(e); });
    if (!list.length) { try { list = [Session.getEffectiveUser().getEmail()]; } catch (e) {} }
    return list.filter(String);
  }
  function isOn() { return str(setting('backup_on', 'TRUE')).toUpperCase() !== 'FALSE'; }

  // ---- .xlsx writer (inline strings, numbers kept as numbers when safe)
  function xml(v) { return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function col(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function cell(v, r, c, style) {
    var ref = col(c) + (r + 1), st = style ? ' s="1"' : '';
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"' + st + '><v>' + (v ? 1 : 0) + '</v></c>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
    var s = String(v);
    if (/^-?(0|[1-9]\d{0,11})(\.\d+)?$/.test(s)) return '<c r="' + ref + '"' + st + '><v>' + s + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + xml(s.slice(0, 32000)) + '</t></is></c>';
  }
  function sheetXml(head, rows) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'];
    out.push('<row r="1">' + head.map(function (h, c) { return cell(h, 0, c, true); }).join('') + '</row>');
    rows.forEach(function (row, i) { out.push('<row r="' + (i + 2) + '">' + row.map(function (v, c) { return cell(v, i + 1, c); }).join('') + '</row>'); });
    out.push('</sheetData></worksheet>');
    return out.join('');
  }
  function xlsx(sheets, fileName) {
    var names = [], blobs = [];
    sheets.forEach(function (s) {
      var n = String(s.name).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31), k = n, i = 2;
      while (names.indexOf(k) >= 0) k = n.slice(0, 28) + ' ' + (i++);
      names.push(k);
    });
    var ns = 'http://schemas.openxmlformats.org/', rel = ns + 'officeDocument/2006/relationships';
    var b = function (path, text) { blobs.push(Utilities.newBlob(text, 'application/xml', path)); };
    b('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="' + ns + 'package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      names.map(function (n, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>');
    b('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + ns + 'package/2006/relationships"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    b('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + ns + 'spreadsheetml/2006/main" xmlns:r="' + rel + '"><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>');
    b('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + ns + 'package/2006/relationships">' +
      names.map(function (n, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + rel + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (names.length + 1) + '" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>');
    b('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="' + ns + 'spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/></patternFill></fill></fills>' +
      '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
    sheets.forEach(function (s, i) { b('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s.head, s.rows)); });
    var zip = Utilities.zip(blobs, fileName);
    return Utilities.newBlob(zip.getBytes(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName);
  }

  function build() {
    var data = tables(), stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Karachi', 'yyyy-MM-dd_HHmm');
    var summary = { name: 'Summary', head: ['Table', 'Rows'], rows: data.map(function (t) { return [t.name, t.rows.length]; }) };
    summary.rows.unshift(['Backup time', Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Karachi', 'dd MMM yyyy, hh:mm a')]);
    return { blob: xlsx([summary].concat(data), 'Land-Management-Backup_' + stamp + '.xlsx'), data: data, stamp: stamp };
  }

  function send(reason) {
    var to = recipients();
    if (!to.length) throw new AppError('err.backup_no_email');
    var b = build(), total = b.data.reduce(function (a, t) { return a + t.rows.length; }, 0);
    var subj = 'Land Management backup – ' + b.stamp.replace('_', ' ') + (reason === 'manual' ? ' (manual)' : '');
    var html = '<p>Full data backup of the Land Management app is attached (Excel, ' + b.data.length + ' tables, ' + total + ' rows).</p>' +
      '<table cellpadding="4" style="border-collapse:collapse;font:13px Arial">' + b.data.map(function (t) {
        return '<tr><td style="border-bottom:1px solid #eee">' + t.name + '</td><td style="border-bottom:1px solid #eee;text-align:right">' + t.rows.length + '</td></tr>'; }).join('') + '</table>' +
      '<p style="color:#64748b;font-size:12px">Passwords and approval tokens are not included. Keep this file safe – it has customer CNICs and phone numbers.</p>';
    GmailApp.sendEmail(to.join(','), subj, 'Full data backup attached.', { htmlBody: html, attachments: [b.blob], name: 'Land Management' });
    var info = { at: nowIso(), to: to.join(', '), rows: total, file: b.blob.getName(), reason: reason || 'scheduled' };
    Db.setSetting('backup_last', JSON.stringify(info));
    return info;
  }

  function install() {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === HANDLER) ScriptApp.deleteTrigger(t); });
    if (!isOn()) return [];
    var hs = hours();
    hs.forEach(function (h) { ScriptApp.newTrigger(HANDLER).timeBased().atHour(h).nearMinute(0).everyDays(1).inTimezone(Session.getScriptTimeZone() || 'Asia/Karachi').create(); });
    return hs;
  }

  function status() {
    var last = {}; try { last = JSON.parse(setting('backup_last', '') || '{}'); } catch (e) {}
    var n = 0; try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === HANDLER) n++; }); } catch (e) {}
    return { on: isOn(), hours: hours(), to: recipients(), last: last, triggers: n };
  }

  return { tables: tables, build: build, send: send, install: install, status: status, xlsx: xlsx };
})();

/** Time trigger entry point (twice a day). */
function sendScheduledBackup() {
  try { AutoBackup.send('scheduled'); }
  catch (e) { try { Db.setSetting('backup_last', JSON.stringify({ at: nowIso(), error: String(e && e.message || e) })); } catch (x) {} throw e; }
}
/** Run once from the editor/menu to (re)install the two daily backup triggers. */
function installBackupTriggers() { return AutoBackup.install(); }
