/**
 * Reads a director's email reply: approved / rejected / unclear.
 * Only the newly typed lines are read (quoted original is cut), and
 * "not approved" is checked before "approved". Pure JS, Node-tested.
 */
var ReplyParser = (function () {
  var REJECT = ['not approved', 'not approve', 'disapproved', 'rejected', 'reject', 'declined', 'decline', 'no',
    'na manzoor', 'namanzoor', 'نامنظور', 'منظور نہیں', 'مسترد'];
  var APPROVE = ['approved', 'approve', 'ok', 'okay', 'yes', 'go ahead', 'done', 'proceed',
    'manzoor', 'منظور', 'ٹھیک ہے', 'theek hai', 'thik hai'];

  function reference(subject) {
    var m = /\[(APR-\d{3,})\]/i.exec(subject || '');
    return m ? m[1].toUpperCase() : null;
  }

  function newText(body) {
    var lines = String(body || '').split(/\r\n|\r|\n/), kept = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t.charAt(0) === '>') break;
      if (/^On .+wrote:?$/i.test(t) || /^-{2,}\s*Original Message/i.test(t) || /^From:\s/i.test(t) || /^Sent from my /i.test(t)) break;
      if (t !== '') kept.push(t);
      if (kept.length >= 3) break;
    }
    return kept.join(' ').trim();
  }

  function has(hay, words) {
    for (var i = 0; i < words.length; i++) if (hay.indexOf(' ' + words[i].toLowerCase() + ' ') >= 0) return true;
    return false;
  }

  function decision(body) {
    var text = newText(body);
    if (!text) return 'unclear';
    // keep letters (any script) and digits, everything else -> space
    var norm = (' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ') + ' ').replace(/\s+/g, ' ');
    var reject = has(norm, REJECT);
    var stripped = norm;
    REJECT.forEach(function (w) { stripped = stripped.split(' ' + w + ' ').join(' '); });
    var approve = has(stripped, APPROVE);
    if (approve && !reject) return 'approved';
    if (reject && !approve) return 'rejected';
    return 'unclear';
  }

  /** Gmail's Authentication-Results must show the sender passed DMARC (or SPF + DKIM). */
  function authenticated(header) {
    if (!header) return false;
    var h = String(header).toLowerCase();
    if (h.indexOf('dmarc=fail') >= 0 || h.indexOf('spf=fail') >= 0) return false;
    return h.indexOf('dmarc=pass') >= 0 || (h.indexOf('dkim=pass') >= 0 && h.indexOf('spf=pass') >= 0);
  }

  return { reference: reference, newText: newText, decision: decision, authenticated: authenticated };
})();

if (typeof module !== 'undefined') module.exports = { ReplyParser: ReplyParser };
