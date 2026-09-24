// SM ToolBox — usage core: pure functions shared by the usage hub and the tests.
// Pasted VERBATIM into the syksmtoolbox Apps Script project (the "TBX Backorder Hub") as UsageCore.gs —
// keep the two identical (the hub has no build step). No Apps Script services in here.
//
// One row per event in the hub's Events tab:  ts (ISO, UTC) · device · session · type · key · extra
//   open   key boot|resume      extra platform|mode|appVersion   (e.g. "iPhone|app|4.142")
//   view   key screen           (home, cat/Implants, fam/…, bo, cc, fa2/use … — no ids, nothing typed)
//   card   key part number      extra '' | missing
//   search key the term         extra result count ("0" = nothing found)
//   scan   key part # / code    extra card | moved | nocard | unknown
//   fav    key part number      extra on | off
//   share  key part number      extra img | link | copy
//   error  key message          extra file:line
//   ping   (app open on screen, idle — keeps "using it now" honest)
// Devices are random ids made on the phone; sessions end after 30 idle minutes. Days/hours are US Eastern.
var UCORE = (function () {
  var VER = 1;
  var COLS = ['ts', 'device', 'session', 'type', 'key', 'extra'];
  var TYPES = { open: 1, view: 1, card: 1, search: 1, scan: 1, fav: 1, share: 1, error: 1, ping: 1 };
  var MAXB = 200;            // events accepted per batch
  var MAX_ROWS = 1500000;    // Events tab ceiling (≈9M cells of the 10M sheet limit) …
  var TRIM_ROWS = 250000;    // … when crossed, the oldest rows go
  var H = 3600000, DAY = 86400000, MIN = 60000;

  // ---- US Eastern time without Intl/Utilities (fast enough for 100k rows) ----
  function nthSunday(y, m, n) { var first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return Date.UTC(y, m, 1 + ((7 - first) % 7) + (n - 1) * 7); }
  function etOff(ms) { // EDT (UTC-4) from the 2nd Sunday of March 2:00 EST to the 1st Sunday of November 2:00 EDT
    var y = new Date(ms).getUTCFullYear();
    var a = nthSunday(y, 2, 2) + 7 * H, b = nthSunday(y, 10, 1) + 6 * H;
    return (ms >= a && ms < b) ? -4 * H : -5 * H;
  }
  function etDay(ms) { return new Date(ms + etOff(ms)).toISOString().slice(0, 10); }
  function etHour(ms) { return new Date(ms + etOff(ms)).getUTCHours(); }
  function etDayStart(ms) { // UTC ms of Eastern midnight for the day that contains ms
    var key = etDay(ms), base = Date.parse(key + 'T00:00:00Z');
    for (var o = 4; o <= 5; o++) { var t = base + o * H; if (etDay(t) === key && etHour(t) === 0) return t; }
    return base + 5 * H;
  }
  function addDays(key, n) { return new Date(Date.parse(key + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function windowStart(now, days) { // Eastern midnight, (days - 1) days before today
    var k = addDays(etDay(now), -(Math.max(1, days) - 1));
    return etDayStart(Date.parse(k + 'T12:00:00Z'));
  }

  // ---- ingest ----
  function clean(s, n) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^=+/, ''); // a leading "=" would be read by Sheets as a formula
    return s.slice(0, n || 80);
  }
  // Batch {d: deviceId, e: [[ms, type, key, extra, session], …]} → sheet rows. Timestamps are the phone's,
  // clamped to [received − 2 days, received + 2 min] so the Events tab stays close to time order.
  function rowsFromBatch(p, now) {
    var d = String((p && p.d) || '');
    if (!/^[a-z0-9]{10}$/.test(d)) return { ok: false, err: 'device' };
    var ev = p && p.e;
    if (!ev || typeof ev.length !== 'number') return { ok: false, err: 'events' };
    var rows = [], lo = now - 2 * DAY, hi = now + 2 * MIN;
    for (var i = 0; i < ev.length && rows.length < MAXB; i++) {
      var e = ev[i];
      if (!e || typeof e.length !== 'number') continue;
      var ty = String(e[1] || '');
      if (!TYPES.hasOwnProperty(ty)) continue;
      var t = +e[0];
      if (!(t > 0) || t > hi) t = now; else if (t < lo) t = lo;
      var s = String(e[4] || '');
      if (!/^[a-z0-9]{4,12}$/.test(s)) s = '';
      rows.push([new Date(t).toISOString(), d, s, ty, clean(e[2], 80), clean(e[3], 80)]);
    }
    return { ok: true, rows: rows };
  }

  // ---- read side ----
  function parse(rows, excl) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r[0]) continue;
      var d = String(r[1] || '');
      if (excl && excl[d]) continue;
      var t = r[0] instanceof Date ? r[0].getTime() : Date.parse(String(r[0]));
      if (!(t > 0)) continue;
      out.push({ t: t, d: d, s: String(r[2] || ''), ty: String(r[3] || ''), k: String(r[4] == null ? '' : r[4]), x: String(r[5] == null ? '' : r[5]) });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }
  function size(o) { var n = 0; for (var k in o) if (o.hasOwnProperty(k)) n++; return n; }
  function devInfo(evs) { var m = {}; for (var i = 0; i < evs.length; i++) if (evs[i].ty === 'open' && evs[i].x) m[evs[i].d] = evs[i].x; return m; }
  function top(map, n, extra) { // map key → {n, dev{}} → [{k, n, dev}] by count, then devices, then key
    var a = [];
    for (var k in map) if (map.hasOwnProperty(k)) {
      var o = { k: k, n: map[k].n, dev: size(map[k].dev) };
      if (extra) extra(o, map[k]);
      a.push(o);
    }
    a.sort(function (x, y) { return y.n - x.n || y.dev - x.dev || (x.k < y.k ? -1 : x.k > y.k ? 1 : 0); });
    return n ? a.slice(0, n) : a;
  }
  function bump(map, k, d, t) { var o = map[k] || (map[k] = { n: 0, dev: {}, last: 0 }); o.n++; o.dev[d] = 1; if (t > o.last) o.last = t; return o; }

  // Live panel: who is on now, today so far (Eastern), activity by hour, the latest events.
  function live(rows, o) {
    var now = o.now, evs = parse(rows, o.excl), t0 = etDayStart(now), hi = now + 2 * MIN;
    var devs = {}, sess = {}, c = {}, hours = [], zero = 0, i, e;
    for (i = 0; i < 24; i++) hours.push({});
    var act = {}, act15 = {}, lastDo = {};
    for (i = 0; i < evs.length; i++) {
      e = evs[i];
      if (e.t > hi) continue;
      if (e.t >= t0) {
        devs[e.d] = 1; if (e.s) sess[e.s] = 1;
        c[e.ty] = (c[e.ty] || 0) + 1;
        hours[etHour(e.t)][e.d] = 1;
        if (e.ty === 'search' && e.x === '0') zero++;
      }
      if (e.t >= now - 5 * MIN) act[e.d] = e.t;
      if (e.t >= now - 15 * MIN) act15[e.d] = 1;
      if (e.ty !== 'ping') lastDo[e.d] = [e.ty, e.k, e.x];
    }
    var info = devInfo(evs);
    var recent = [];
    for (i = evs.length - 1; i >= 0 && recent.length < 60; i--) {
      e = evs[i];
      if (e.ty === 'ping' || e.t > hi) continue;
      recent.push([e.t, e.d, e.ty, e.k, e.x]);
    }
    var nowList = Object.keys(act).sort(function (a, b) { return act[b] - act[a]; }).slice(0, 25)
      .map(function (d) { return { d: d, t: act[d], i: info[d] || '', last: lastDo[d] || null }; });
    var want = {}; nowList.forEach(function (x) { want[x.d] = 1; }); recent.forEach(function (r) { want[r[1]] = 1; });
    var inf = {}; for (var d in want) if (info[d]) inf[d] = info[d];
    return {
      ok: true, v: VER, asOf: now, day: etDay(now),
      now: { n5: size(act), n15: size(act15), list: nowList },
      today: { devices: size(devs), sessions: size(sess), opens: c.open || 0, views: c.view || 0, cards: c.card || 0,
        searches: c.search || 0, zero: zero, scans: c.scan || 0, favs: c.fav || 0, shares: c.share || 0, errors: c.error || 0 },
      hours: hours.map(size), hourNow: etHour(now), recent: recent, info: inf
    };
  }

  // Period report (1 = today, 7, 30 days — Eastern days ending today).
  function stats(rows, o) {
    var now = o.now, days = Math.max(1, +o.days || 7), t0 = windowStart(now, days), hi = now + 2 * MIN;
    var evs = parse(rows, o.excl).filter(function (e) { return e.t >= t0 && e.t <= hi; });
    var keys = [], per = {}, k0 = etDay(t0), i;
    for (i = 0; i < days; i++) { var kk = addDays(k0, i); keys.push(kk); per[kk] = { dev: {}, sess: {}, cards: 0, searches: 0, scans: 0, opens: 0 }; }
    var devs = {}, sess = {}, c = {}, cards = {}, searches = {}, scans = { card: 0, moved: 0, nocard: 0, unknown: 0 },
        scanned = {}, missing = {}, screens = {}, favOn = {}, favs = { on: 0, off: 0 }, shares = { img: 0, link: 0, copy: 0 },
        errors = {}, dv = {};
    for (i = 0; i < evs.length; i++) {
      var e = evs[i], dk = etDay(e.t), P = per[dk];
      devs[e.d] = 1; if (e.s) sess[e.s] = 1;
      c[e.ty] = (c[e.ty] || 0) + 1;
      var D = dv[e.d] || (dv[e.d] = { first: e.t, last: e.t, sess: {}, n: 0, cards: 0, searches: 0, scans: 0 });
      if (e.t > D.last) D.last = e.t; if (e.s) D.sess[e.s] = 1; if (e.ty !== 'ping') D.n++;
      if (P) { P.dev[e.d] = 1; if (e.s) P.sess[e.s] = 1; }
      if (e.ty === 'open') { if (P) P.opens++; }
      else if (e.ty === 'card') { bump(cards, e.k, e.d, e.t); D.cards++; if (P) P.cards++; }
      else if (e.ty === 'search') {
        var q = e.k.toLowerCase(), so = bump(searches, q, e.d, e.t);
        if (e.t >= so.last) so.res = e.x; // result count of the latest try — the catalog may have caught up
        D.searches++; if (P) P.searches++;
      } else if (e.ty === 'scan') {
        var oc = scans.hasOwnProperty(e.x) ? e.x : 'unknown'; scans[oc]++;
        if (oc === 'card' || oc === 'moved') bump(scanned, e.k, e.d, e.t);
        else { var mo = bump(missing, e.k, e.d, e.t); mo.kind = oc; }
        D.scans++; if (P) P.scans++;
      } else if (e.ty === 'view') bump(screens, e.k, e.d, e.t);
      else if (e.ty === 'fav') { if (e.x === 'on') { favs.on++; bump(favOn, e.k, e.d, e.t); } else favs.off++; }
      else if (e.ty === 'share') { if (shares.hasOwnProperty(e.x)) shares[e.x]++; }
      else if (e.ty === 'error') { var er = bump(errors, e.k, e.d, e.t); er.at = e.x; }
    }
    var info = devInfo(evs), plat = {}, vers = {};
    for (var d in dv) if (dv.hasOwnProperty(d)) {
      var parts = String(info[d] || '').split('|');
      var pk = info[d] ? (parts[0] || 'Other') + (parts[1] === 'app' ? ' app' : ' browser') : 'Unknown';
      (plat[pk] = plat[pk] || { n: 0, dev: {} }).n++; plat[pk].dev[d] = 1;
      var vk = parts[2] || '?'; (vers[vk] = vers[vk] || { n: 0, dev: {} }).n++; vers[vk].dev[d] = 1;
    }
    var zero = top(searches, 0, function (o, m) { o.res = m.res; }).filter(function (x) { return x.res === '0'; }).slice(0, 25);
    var devList = Object.keys(dv).map(function (d) {
      var x = dv[d]; return { d: d, first: x.first, last: x.last, sess: size(x.sess), n: x.n, cards: x.cards, searches: x.searches, scans: x.scans, i: info[d] || '' };
    }).sort(function (a, b) { return b.last - a.last; }).slice(0, 100);
    return {
      ok: true, v: VER, asOf: now, days: days, from: t0, dayKeys: keys,
      devices: size(devs), sessions: size(sess),
      counts: { open: c.open || 0, view: c.view || 0, card: c.card || 0, search: c.search || 0, scan: c.scan || 0, fav: c.fav || 0, share: c.share || 0, error: c.error || 0 },
      perDay: keys.map(function (k) { var p = per[k]; return { d: k, devices: size(p.dev), sessions: size(p.sess), opens: p.opens, cards: p.cards, searches: p.searches, scans: p.scans }; }),
      topCards: top(cards, 25),
      topSearches: top(searches, 25, function (o, m) { o.res = m.res; }),
      zeroSearches: zero,
      scans: scans,
      topScanned: top(scanned, 10),
      noCard: top(missing, 20, function (o, m) { o.kind = m.kind; }),
      screens: top(screens, 20),
      favs: favs, topFavs: top(favOn, 10), shares: shares,
      platforms: top(plat, 0).map(function (x) { return { k: x.k, n: x.dev }; }),
      versions: top(vers, 0).map(function (x) { return { k: x.k, n: x.dev }; }),
      errors: top(errors, 10, function (o, m) { o.at = m.at; o.last = m.last; }),
      deviceList: devList
    };
  }

  return { VER: VER, COLS: COLS, TYPES: TYPES, MAXB: MAXB, MAX_ROWS: MAX_ROWS, TRIM_ROWS: TRIM_ROWS,
    etOff: etOff, etDay: etDay, etHour: etHour, etDayStart: etDayStart, addDays: addDays, windowStart: windowStart,
    clean: clean, rowsFromBatch: rowsFromBatch, parse: parse, live: live, stats: stats };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UCORE;
