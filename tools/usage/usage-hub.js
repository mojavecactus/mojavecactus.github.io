// SM ToolBox — Usage hub (anonymous in-app usage). Pasted VERBATIM as Usage.gs in the standalone syksmtoolbox
// Apps Script project "TBX Usage Hub", next to UsageCore.gs (= tools/usage/usage-core.js) and Code.gs
// (= tools/usage/usage-main.js, the doGet/doPost entry points). Separate from the backorder hub on purpose.
//
// First run (from the editor): usageSetup() → creates "SM ToolBox — Usage" (tab Events), the write key and the
// admin key (Script Properties USAGE_*), and logs them. Then deploy the web app (Execute as me · Anyone).
//
// API (POST text/plain JSON, like the other hubs):
//   {action:'u_ev', key: writeKey, d: deviceId, a: 0|1, b: batchId, e: [[ms, type, key, extra, session], …]}
//        → {ok, n}   (a repeated batch id is acknowledged and dropped — phones resend after a lost reply)
//   {action:'u_live',  key: adminKey, incl: 0|1}          → UCORE.live   (cached 15 s)
//   {action:'u_stats', key: adminKey, days: 1|7|30, incl} → UCORE.stats  (cached 60 s today / 5 min otherwise)
//   {action:'u_ping'} → {ok, v}
// incl=1 counts the admin's own devices (any device that has the admin key is flagged via a=1).

var U_PROPS = PropertiesService.getScriptProperties();
var U_TAB = 'Events';

function usageSetup() {
  var id = U_PROPS.getProperty('USAGE_SHEET_ID'), ss;
  if (id) { ss = SpreadsheetApp.openById(id); }
  else { ss = SpreadsheetApp.create('SM ToolBox — Usage'); U_PROPS.setProperty('USAGE_SHEET_ID', ss.getId()); }
  var sh = ss.getSheetByName(U_TAB) || ss.insertSheet(U_TAB);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, UCORE.COLS.length).setValues([UCORE.COLS]).setFontWeight('bold');
  sh.getRange(1, 1, sh.getMaxRows(), UCORE.COLS.length).setNumberFormat('@'); // plain text: part numbers like 24E01 must never become numbers
  sh.setFrozenRows(1);
  var s1 = ss.getSheetByName('Sheet1'); if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  if (!U_PROPS.getProperty('USAGE_WKEY')) U_PROPS.setProperty('USAGE_WKEY', uKey_(24));
  if (!U_PROPS.getProperty('USAGE_AKEY')) U_PROPS.setProperty('USAGE_AKEY', uKey_(32));
  var out = { sheet: ss.getUrl(), writeKey: U_PROPS.getProperty('USAGE_WKEY'), adminKey: U_PROPS.getProperty('USAGE_AKEY') };
  Logger.log('USAGE ' + JSON.stringify(out));
  return out;
}
function uKey_(n) { var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = ''; for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
function uSheet_() {
  var id = U_PROPS.getProperty('USAGE_SHEET_ID'); if (!id) throw new Error('run usageSetup() first');
  return SpreadsheetApp.openById(id).getSheetByName(U_TAB);
}
function uOut_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
function uJson_(o) { return uOut_(JSON.stringify(o)); }
function uAdmins_() { return String(U_PROPS.getProperty('USAGE_ADMIN_DEVICES') || '').split(',').filter(function (x) { return !!x; }); }
function uMarkAdmin_(d) {
  var a = uAdmins_(); if (a.indexOf(d) > -1) return;
  a.push(d); U_PROPS.setProperty('USAGE_ADMIN_DEVICES', a.slice(-50).join(','));
}

function uAppend_(rows) {
  var sh = uSheet_(), last = sh.getLastRow(), n = UCORE.COLS.length;
  if (last + rows.length > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), Math.max(rows.length, 2000));
  sh.getRange(last + 1, 1, rows.length, n).setNumberFormat('@').setValues(rows);
  if (last + rows.length > UCORE.MAX_ROWS) sh.deleteRows(2, UCORE.TRIM_ROWS); // ~a year and a half at team scale
}
// Rows since sinceMs (plus at least minRows of the newest), oldest first. Reads the tail in chunks and stops at
// the first row older than sinceMs − 2 days: ingest clamps event times to within 2 days of arrival, so nothing
// newer can sit above it.
function uRead_(sinceMs, minRows) {
  var sh = uSheet_(), last = sh.getLastRow(), n = UCORE.COLS.length;
  if (last < 2) return [];
  var since = new Date(sinceMs).toISOString(), cut = new Date(sinceMs - 2 * 86400000 - 120000).toISOString();
  var out = [], end = last, CH = 4000;
  while (end >= 2) {
    var start = Math.max(2, end - CH + 1), vals = sh.getRange(start, 1, end - start + 1, n).getValues(), stop = false;
    for (var i = vals.length - 1; i >= 0; i--) {
      var v0 = vals[i][0], ts = v0 instanceof Date ? v0.toISOString() : String(v0 || '');
      if (!ts) continue;
      if (ts >= since || out.length < minRows) { vals[i][0] = ts; out.push(vals[i]); continue; }
      if (ts < cut) { stop = true; break; }
    }
    if (stop) break;
    end = start - 1;
  }
  return out.reverse();
}

function uIngest_(p) {
  var wk = U_PROPS.getProperty('USAGE_WKEY');
  if (!wk || String(p.key || '') !== wk) return { ok: false, err: 'key' };
  var bid = String(p.b || '');
  if (!/^[a-z0-9]{8,16}$/.test(bid)) return { ok: false, err: 'batch' };
  var cache = CacheService.getScriptCache();
  if (cache.get('ub:' + bid)) return { ok: true, n: 0, dup: true };
  var r = UCORE.rowsFromBatch(p, Date.now());
  if (!r.ok) return r;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, err: 'busy' };
  try {
    if (cache.get('ub:' + bid)) return { ok: true, n: 0, dup: true };
    if (r.rows.length) uAppend_(r.rows);
    cache.put('ub:' + bid, '1', 21600);
    if (+p.a === 1) uMarkAdmin_(String(p.d));
  } finally { lock.releaseLock(); }
  return { ok: true, n: r.rows.length };
}

function usageHandle(p) {
  var a = String((p && p.action) || '');
  try {
    if (a === 'u_ev') return uJson_(uIngest_(p));
    if (a === 'u_ping') return uJson_({ ok: true, v: UCORE.VER });
    if (a === 'u_live' || a === 'u_stats') {
      var ak = U_PROPS.getProperty('USAGE_AKEY');
      if (!ak || String(p.key || '') !== ak) return uJson_({ ok: false, err: 'key' });
      var incl = +p.incl === 1, excl = {};
      if (!incl) uAdmins_().forEach(function (d) { excl[d] = 1; });
      var cache = CacheService.getScriptCache(), now = Date.now(), ck, hit, s;
      if (a === 'u_live') {
        ck = 'ul:' + (incl ? 1 : 0); hit = cache.get(ck);
        if (hit) return uOut_(hit);
        s = JSON.stringify(UCORE.live(uRead_(Math.min(UCORE.etDayStart(now), now - 20 * 60000), 80), { now: now, excl: excl }));
        try { cache.put(ck, s, 15); } catch (eC) {}
        return uOut_(s);
      }
      var days = [1, 7, 30].indexOf(+p.days) > -1 ? +p.days : 7;
      ck = 'us:' + days + ':' + (incl ? 1 : 0); hit = cache.get(ck);
      if (hit && !p.fresh) return uOut_(hit);
      s = JSON.stringify(UCORE.stats(uRead_(UCORE.windowStart(now, days), 0), { now: now, days: days, excl: excl }));
      try { cache.put(ck, s, days === 1 ? 60 : 300); } catch (eC2) {}
      return uOut_(s);
    }
    return uJson_({ ok: false, err: 'action' });
  } catch (err) {
    return uJson_({ ok: false, err: 'server', msg: String((err && err.message) || err).slice(0, 200) });
  }
}
