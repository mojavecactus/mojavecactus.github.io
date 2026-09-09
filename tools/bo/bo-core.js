// SM ToolBox — Backorder Report core.
// Pure functions shared by the Apps Script hub (pasted verbatim into Code.gs as BOCORE) and the Node
// test suite (tools/bo/test.js). No I/O here: HTML/subject in, normalized rows out; state in, state out.
//
// Source of truth is the weekly "Inventory Report: Week of M.D.YY" email from SportsMed Marketing
// Operations, forwarded by Nate to syksmtoolbox@gmail.com. Its HTML body carries three tables:
//   Inventory Controlled Products   (Segment · Product line · Item number · Item description · Message to the Sales Force)
//   New BOs since last report       (Segment · Product line · Item number · Item description)
//   Items cleared since last report (same)
// The full active list with clear dates/commentary exists only in the Highspot xlsx (seeded once; optional refresh).
var BOCORE = (function () {
  'use strict';

  // ---- text helpers ----
  var ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', deg: '°', trade: '™', reg: '®', copy: '©' };
  function decode(s) {
    return String(s || '')
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&([a-z]+);/gi, function (m, n) { var k = n.toLowerCase(); return ENT.hasOwnProperty(k) ? ENT[k] : m; });
  }
  function textOf(html) {
    return decode(String(html || '')
      .replace(/<\s*br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|tr|li|h\d)>/gi, ' ')
      .replace(/<[^>]+>/g, ''))
      .replace(/[ \s]+/g, ' ').trim();
  }
  function nrm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function keyZ(s) { return nrm(s).replace(/^0+/, ''); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  // "Inventory Report: Week of 9.7.26" -> "2026-09-07" (also 9/7/26, 9-7-2026, 09.07.26)
  function parseWeekOf(subject) {
    var m = /week\s+of\s+(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{2,4})/i.exec(String(subject || ''));
    if (!m) return '';
    var mo = +m[1], d = +m[2], y = +m[3]; if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return isoDate(y, mo, d);
  }
  function isReportSubject(subject) { return /inventory\s+report/i.test(String(subject || '')); }

  function highspotLink(html) {
    var m = /https?:\/\/stryker\.highspot\.com\/[^\s"'<>]+/i.exec(String(html || ''));
    return m ? decode(m[0]) : '';
  }

  // ---- HTML table walk ----
  // Every <tr> in the document, as an array of cell texts. Outlook nests spans/divs inside cells and pads
  // with &nbsp;; table nesting is not a concern for these reports (verified on the 9-7-26 sample), and
  // any layout rows that do slip through are ignored by the section state machine below.
  function rowsOf(html) {
    var rows = [], re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, m;
    while ((m = re.exec(html))) {
      var cells = [], cre = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, c;
      while ((c = cre.exec(m[1]))) cells.push(textOf(c[1]));
      rows.push(cells);
    }
    return rows;
  }
  var SECTIONS = [
    { id: 'controlled', re: /inventory\s+controlled/i },
    { id: 'newBOs', re: /new\s+bo/i },
    { id: 'cleared', re: /cleared\s+since|items?\s+cleared/i }
  ];
  var COLS = { seg: /^segment$/i, line: /^product\s*line$/i, sku: /^item\s*(number|#|no\.?)$/i, desc: /^item\s*description$|^description$/i, msg: /message|comment/i };
  function firstText(cells) { for (var i = 0; i < cells.length; i++) if (cells[i]) return cells[i]; return ''; }
  function sectionOf(cells) {
    var t = firstText(cells), nonEmpty = cells.filter(function (c) { return c; }).length;
    if (!t || nonEmpty > 2) return null; // title rows are one cell of text (Outlook sometimes adds an empty cell)
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].re.test(t)) return SECTIONS[i].id;
    return null;
  }
  function headerMap(cells) {
    var map = null;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i]; if (!c) continue;
      for (var k in COLS) if (COLS[k].test(c)) { map = map || {}; if (map[k] === undefined) map[k] = i; }
    }
    return map && map.sku !== undefined ? map : null;
  }
  // Returns { controlled:[{sku,desc,seg,line,msg}], newBOs:[{sku,desc,seg,line}], cleared:[...], highspot, sections:[ids seen] }
  function parseReportHtml(html) {
    var out = { controlled: [], newBOs: [], cleared: [], highspot: highspotLink(html), sections: [] };
    var rows = rowsOf(String(html || ''));
    var sec = null, map = null;
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r];
      var s = sectionOf(cells);
      if (s) { sec = s; map = null; if (out.sections.indexOf(s) < 0) out.sections.push(s); continue; }
      if (!sec) continue;
      if (!map) { var hm = headerMap(cells); if (hm) map = hm; continue; }
      var sku = String(cells[map.sku] || '').trim();
      if (!sku) continue;
      if (headerMap(cells)) { map = headerMap(cells); continue; } // repeated header
      var row = { sku: sku, desc: String(cells[map.desc] || '').trim(), seg: String(cells[map.seg] || '').trim(), line: String(cells[map.line] || '').trim() };
      if (sec === 'controlled') row.msg = String(map.msg !== undefined ? cells[map.msg] || '' : '').trim();
      out[sec].push(row);
    }
    return out;
  }
  function validateParsed(p) {
    var errs = [];
    if (p.sections.indexOf('controlled') < 0) errs.push('no "Inventory Controlled Products" table found');
    if (p.sections.indexOf('newBOs') < 0 && p.sections.indexOf('cleared') < 0) errs.push('no "New BOs" / "Items cleared" table found');
    if (p.sections.indexOf('controlled') >= 0 && !p.controlled.length) errs.push('controlled table has no rows');
    return errs;
  }

  // ---- snapshot rules ----
  // state = { controlled:[], backorders:[], cleared:[], log:[] }; every row carries sku/desc/seg/line and a k (keyZ).
  function withKey(r) { r.k = keyZ(r.sku); return r; }
  function byKey(list) { var m = {}; (list || []).forEach(function (r) { m[keyZ(r.sku)] = r; }); return m; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // meta = { weekOf, at (ISO timestamp), source: 'email'|'xlsx', active: [xlsx rows] (optional), reportDate (xlsx date, optional) }
  function applyReport(prev, parsed, meta) {
    var st = clone(prev || {}); st.controlled = st.controlled || []; st.backorders = st.backorders || []; st.cleared = st.cleared || []; st.log = st.log || [];
    var weekOf = meta.weekOf, at = meta.at || '', log = [];
    function ev(event, sku, detail) { log.push({ at: at, weekOf: weekOf, event: event, sku: sku, detail: detail || '' }); }

    // 1. Controlled: full replace, diff for the log
    var prevCtl = byKey(st.controlled), ctl = [];
    (parsed.controlled || []).forEach(function (r) {
      var k = keyZ(r.sku), p = prevCtl[k];
      var row = withKey({ sku: r.sku, desc: r.desc, seg: r.seg, line: r.line, msg: r.msg || '', since: p ? (p.since || weekOf) : weekOf, lastSeen: weekOf });
      if (!p) ev('ctl_add', r.sku, row.msg); else if ((p.msg || '') !== row.msg) ev('ctl_msg', r.sku, row.msg);
      ctl.push(row);
    });
    Object.keys(prevCtl).forEach(function (k) { if (!ctl.some(function (r) { return r.k === k; })) ev('ctl_remove', prevCtl[k].sku, ''); });
    st.controlled = ctl;

    // 2. Backorders
    var prevBO = byKey(st.backorders), bo = {};
    if (meta.active && meta.active.length) {
      // xlsx present: authoritative for desc / clearDate / clearText / note
      meta.active.forEach(function (r) {
        var k = keyZ(r.sku), p = prevBO[k];
        bo[k] = withKey({ sku: r.sku, desc: r.desc || (p && p.desc) || '', seg: r.seg || (p && p.seg) || '', line: r.line || (p && p.line) || '',
          since: p ? (p.since || '') : '', clearDate: r.clearDate || '', clearText: r.clearText || '', note: r.note || '',
          asOf: meta.reportDate || weekOf, lastSeen: weekOf, source: 'xlsx' });
        if (!p) ev('bo_new', r.sku, 'from report file');
      });
      Object.keys(prevBO).forEach(function (k) { if (!bo[k]) ev('bo_cleared', prevBO[k].sku, 'absent from report file'); });
    } else {
      Object.keys(prevBO).forEach(function (k) { var p = clone(prevBO[k]); p.lastSeen = weekOf; bo[k] = withKey(p); });
    }
    (parsed.newBOs || []).forEach(function (r) {
      var k = keyZ(r.sku);
      if (bo[k]) { if (!bo[k].since) bo[k].since = weekOf; return; }
      bo[k] = withKey({ sku: r.sku, desc: r.desc, seg: r.seg, line: r.line, since: weekOf, clearDate: '', clearText: '', note: '', asOf: '', lastSeen: weekOf, source: 'email' });
      ev('bo_new', r.sku, '');
    });
    var clearedRows = [];
    (parsed.cleared || []).forEach(function (r) {
      var k = keyZ(r.sku), p = bo[k];
      clearedRows.push(withKey({ sku: r.sku, desc: r.desc || (p && p.desc) || '', seg: r.seg || (p && p.seg) || '', line: r.line || (p && p.line) || '', clearedOn: weekOf, since: p ? (p.since || '') : '' }));
      if (p) { delete bo[k]; ev('bo_cleared', r.sku, ''); }
    });
    st.backorders = Object.keys(bo).map(function (k) { return bo[k]; });

    // 3. Cleared: replace this week's rows (re-ingest safe), keep older weeks
    st.cleared = st.cleared.filter(function (r) { return r.clearedOn !== weekOf; }).concat(clearedRows);
    st.log = st.log.concat(log);
    return { state: st, counts: { controlled: st.controlled.length, newBOs: (parsed.newBOs || []).length, cleared: clearedRows.length, active: st.backorders.length }, events: log };
  }

  // Seed the active list from the Highspot xlsx export (one-time). rows: [{sku,desc,seg,line,clearDate,clearText,note}]
  function seedState(seed) {
    var st = { controlled: [], backorders: [], cleared: [], log: [] };
    (seed.active || []).forEach(function (r) {
      st.backorders.push(withKey({ sku: r.sku, desc: r.desc || '', seg: r.seg || '', line: r.line || '', since: '', clearDate: r.clearDate || '', clearText: r.clearText || '', note: r.note || '', asOf: seed.reportDate || '', lastSeen: seed.weekOf || '', source: 'seed' }));
    });
    (seed.cleared || []).forEach(function (r) {
      st.cleared.push(withKey({ sku: r.sku, desc: r.desc || '', seg: r.seg || '', line: r.line || '', clearedOn: seed.weekOf || seed.reportDate || '', since: '' }));
    });
    return st;
  }

  // What the app receives. cleared is trimmed to the window; rows are slimmed.
  function buildApi(st, opts) {
    var days = +(opts && opts.clearedDays) || 30, now = (opts && opts.now) ? new Date(opts.now) : new Date();
    var cutoff = new Date(now.getTime() - days * 86400000);
    function keep(r) { if (!r.clearedOn) return false; var d = new Date(r.clearedOn + 'T12:00:00'); return !isNaN(d) && d >= cutoff; }
    return {
      ok: true, ver: 1, asOf: now.toISOString(), reportId: (opts && opts.reportId) || '', weekOf: (opts && opts.weekOf) || '', clearedDays: days, highspot: (opts && opts.highspot) || '',
      controlled: (st.controlled || []).map(function (r) { return { sku: r.sku, desc: r.desc, seg: r.seg, line: r.line, msg: r.msg || '', since: r.since || '' }; }),
      backorders: (st.backorders || []).map(function (r) { return { sku: r.sku, desc: r.desc, seg: r.seg, line: r.line, since: r.since || '', clearDate: r.clearDate || '', clearText: r.clearText || '', note: r.note || '', asOf: r.asOf || '' }; }),
      cleared: (st.cleared || []).filter(keep).map(function (r) { return { sku: r.sku, desc: r.desc, seg: r.seg, line: r.line, clearedOn: r.clearedOn, since: r.since || '' }; })
    };
  }

  return { decode: decode, textOf: textOf, nrm: nrm, keyZ: keyZ, parseWeekOf: parseWeekOf, isReportSubject: isReportSubject, highspotLink: highspotLink,
    rowsOf: rowsOf, parseReportHtml: parseReportHtml, validateParsed: validateParsed, applyReport: applyReport, seedState: seedState, buildApi: buildApi };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BOCORE;
