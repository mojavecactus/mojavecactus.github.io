(function () {
  // P4: heal = delete the app-shell cache (tbx-vNNN-…) and reload — only when our own site answers (never offline, never
  // behind a captive portal), never any other cache, and never unregister the service worker.
  function heal() {
    if (window.__tbxBootErr) return;           // the start-up failure is already on screen (Try again); a reload can't fix a data bug
    try {
      if (sessionStorage.getItem('tbx_healed')) return;
      sessionStorage.setItem('tbx_healed', '1');
    } catch (e) {}
    var probe = window.TBX_PROBE ? window.TBX_PROBE(4000) : Promise.resolve(navigator.onLine !== false);
    probe.then(function (on) {
      if (!on) { if (window.TBX_FAIL && !window.__tbxRouted) window.TBX_FAIL('boot', new Error('start error while offline')); return; }
      function go() { location.reload(); }
      if (!(window.caches && caches.keys)) return go();
      caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return /^tbx-v\d+-/.test(k); }).map(function (k) { return caches.delete(k); }));
      }).then(go, go);
    });
  }
  // Auto-heal only covers a broken boot (cache/SW corruption). Once the app has
  // routed successfully, a runtime error is a bug, not a cache problem — wiping
  // every cache and reloading would just loop. Also rate-limited across sessions.
  function healOK() {
    if (window.__tbxRouted) return false;
    try {
      var last = +(localStorage.getItem('tbx_heal_ts') || 0);
      if (Date.now() - last < 600000) return false;
      localStorage.setItem('tbx_heal_ts', String(Date.now()));
    } catch (e) {}
    return true;
  }
  // P50: lib/inflate.js and lib/zxing-reader.js are deferred, so they now run after this listener exists. An error in one
  // of them (the scanner / .xlsx libraries) never started a repair before, and doesn't now.
  window.addEventListener('error', function (e) { try { if (e && /\/lib\/[^\/]+\.js/.test(String(e.filename || ''))) return; } catch (x) {} if (healOK()) heal(); });
  window.__tbxHeal = function () { if (healOK()) heal(); };
})();
window.TBX_BOOT = function () {
  if (window.__tbxBooted) return;
  window.__tbxBooted = true;
  var D = window.TOOLBOX,
      title = document.getElementById('title'), backBtn = document.getElementById('back'),
      homeBtn = document.getElementById('home'), toast = document.getElementById('toast');
  var content, qInput, CURQ = '', LAST_BROWSE = '', LAST_TITLE = '', CUR_IT = null;
  var APPVER = '4.154';
  if (!D) { return; }
  if (!document.getElementById('content') || !document.getElementById('q') ||
      !document.getElementById('glosspanel')) {
    window.__tbxHeal(); return;
  }
  try {   // P4: after a repair (shell cache deleted) ask the SW to re-download the whole shell so CC/F&A stay offline-ready
    if ((sessionStorage.getItem('tbx_healed') || sessionStorage.getItem('tbx_failsafe')) && navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('PRECACHE');
    sessionStorage.removeItem('tbx_healed');
  } catch (e) {}
  var FILT = {}, CURVIEW = null, CURCOUNT = null;
var GLOSS = {
  "UHMWPE": "Ultra-high molecular weight polyethylene — the high-strength fiber used in modern surgical sutures like Force Fiber and XBraid.",
  "Force Fiber": "Stryker's UHMWPE suture line.",
  "XBraid TT": "Tieable tape — flat UHMWPE tape that ties like a suture while spreading load over a broader footprint.",
  "XBraid S": "Stryker round UHMWPE suture.",
  "IntelliBraid": "Color-coded braid patterns for quick arthroscopic identification of strands.",
  "HA+": "Dual coating of hydroxyapatite and bioglass on the sheath, designed to accelerate early bone healing.",
  "hydroxyapatite": "Osteoconductive calcium-phosphate mineral — the same mineral that makes up bone.",
  "bioglass": "Bioactive glass that bonds to bone and stimulates healing as it dissolves.",
  "\u03b2-TCP": "Beta-tricalcium phosphate — an osteoconductive ceramic that resorbs as bone grows in.",
  "PLLA": "Poly-L-lactide — a resorbable polymer that provides initial fixation strength, then gradually gives way to bone.",
  "PEEK": "Polyether ether ketone — a rigid, inert, non-resorbable implant polymer.",
  "Biocomposite": "85% PLLA + 15% \u03b2-TCP blend — resorbable, with an osteoconductive mineral phase.",
  "polyester": "Braided polyester — the flexible sheath material of all-suture anchors.",
  "Positive stop": "A hard mechanical stop that sets insertion depth automatically — no eyeballing.",
  "Reposable": "Sterile-packed instrument that can be sold as capital or as a disposable \u2014 use once, or re-sterilize in central sterile for additional cases.",
  "swaged": "Suture permanently fixed to the anchor at manufacture; it cannot slide.",
  "Non-sliding": "Suture fixed relative to the anchor — tension is set without strand sliding.",
  "Locked": "Rep term for non-sliding — the suture is fixed to the anchor rather than free-running.",
  "dual-thread": "Two thread pitches on one screw — engineered to engage both cortical and cancellous bone.",
  "Self-punching": "The anchor and inserter create their own path — no pilot hole needed in soft or medium bone.",
  "fishmouth": "A notched guide tip that seats securely on curved bone surfaces.",
  "17-4PH": "Precipitation-hardened stainless steel — high strength to resist bending.",
  "osteoconductive": "Provides a scaffold that bone can grow along.",
  "osteostimulative": "Actively encourages new bone formation.",
  "trocar": "A three-faceted piercing tip.",
  "laser line": "A black line on the shaft indicating proper chuck alignment or insertion depth.",
  "venting": "Open ports in the anchor body allowing blood and marrow exchange at the site.",
  "cannulation": "A hollow core through the implant or instrument.",
  "eyelet": "The suture-carrying loop of the anchor.",
  "tails": "The free suture ends passed through the eyelet.",
  "retention suture": "The pre-loaded suture that couples the eyelet to the anchor until final tensioning.",
  "Cobra Black": "300-series stainless needles \u2014 roughly twice the ductility and superior sharpness vs standard needles, with reduced glare for visibility in blood.",
  "DualBraid": "Suture whose colors transition mid-length, for easy intra-operative identification of which tail is which.",
  "NiceLoop": "Pre-looped suture dedicated to the Nice Knot \u2014 a sliding, self-stabilizing knot doubled over suture for higher knot strength.",
  "Brummel": "A spliced center loop in the suture used for shuttling grafts.",
  "co-braid": "Two-color braid pattern woven into the suture for visibility.",
  "whip stitch": "A running locking stitch along a tendon end \u2014 pre-formed loops make multi-strand tendon repairs faster."
};

  var GKEYS = Object.keys(GLOSS).sort(function (a, b) { return b.length - a.length; });
  var FAMSHORT = { "Iconix all-suture anchor": "Iconix", "AlphaVent suture anchor": "AlphaVent",
    "AlphaVent Knotless anchor": "AlphaVent Knotless", "NanoTack suture anchor": "NanoTack",
    "Omega knotless anchor": "Omega", "CinchLock knotless anchor": "CinchLock" };


  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); } // P16: "1 item", "2 items"
  function skel(n, cls) { var o = ''; for (var i = 0; i < (n || 3); i++) o += '<div class="skel ' + (cls || 'row') + '"></div>'; return o; }
  function emptyHTML(icon, title, sub, action) {
    return '<div class="emp">' + (icon ? '<div class="ei">' + icon + '</div>' : '') + '<b>' + esc(title) + '</b>' +
      (sub ? '<span>' + esc(sub) + '</span>' : '') + (action ? '<div class="ea">' + action + '</div>' : '') + '</div>';
  }
  // "2m ago" style; elements with data-since tick every 30s
  function sinceText(ts) {
    var t = typeof ts === 'number' ? ts : Date.parse(ts); if (!t) return '';
    var d = Math.max(0, Date.now() - t), m = Math.round(d / 60000);
    if (d < 45000) return 'just now';
    if (m < 60) return m + 'm ago';
    var hh = Math.round(m / 60); if (hh < 24) return hh + 'h ago';
    return Math.round(hh / 24) + 'd ago';
  }
  function sinceHTML(ts, label) { var n = typeof ts === 'number' ? ts : Date.parse(ts); return n ? '<span class="since" data-since="' + n + '" data-label="' + esc(label || 'Synced') + '">' + esc(label || 'Synced') + ' ' + sinceText(n) + '</span>' : ''; }
  setInterval(function () {
    var els = document.querySelectorAll('[data-since]');
    for (var i = 0; i < els.length; i++) els[i].textContent = els[i].getAttribute('data-label') + ' ' + sinceText(+els[i].getAttribute('data-since'));
  }, 30000);
  function setTitle(a, b, cls) { title.innerHTML = b ? esc(a) + '<em' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(b) + '</em>' : esc(a); }
  function nrm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function qparam(qs, key) {
    if (!qs) return '';
    var parts = qs.split('&');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      var k = eq > -1 ? parts[i].slice(0, eq) : parts[i];
      if (k === key) { try { return decodeURIComponent(eq > -1 ? parts[i].slice(eq + 1) : ''); } catch (e) { return ''; } }
    }
    return '';
  }

  // ---- part-number resolver ----
  var BYPN = {};
  D.items.forEach(function (it, i) { BYPN[nrm(it.sku)] = { kind: 'item', idx: i }; });
  D.probes.forEach(function (p, i) { if (!BYPN[nrm(p.sku)]) BYPN[nrm(p.sku)] = { kind: 'probe', idx: i }; });
  D.shavers.forEach(function (s, i) { if (!BYPN[nrm(s.sku)]) BYPN[nrm(s.sku)] = { kind: 'shaver', idx: i }; });
  function pnRoute(sku) { return '#/pn/' + encodeURIComponent(sku); }
  function skuOf(entry) {
    if (!entry) return null;
    var pool = entry.kind === 'item' ? D.items : entry.kind === 'probe' ? D.probes : D.shavers;
    return (pool[entry.idx] || {}).sku || null;
  }
  function recOf(entry) {
    if (!entry) return null;
    return entry.kind === 'item' ? D.items[entry.idx] : entry.kind === 'probe' ? D.probes[entry.idx] : D.shavers[entry.idx];
  }

  // ---- Backorder Report (weekly Stryker Inventory Report, served by the syksmtoolbox backorder hub) ----
  // Read path only. The hub is fetched at most every 30 min and cached in localStorage so the status pills
  // and the report work offline. Everything here is guarded: a hub problem must never touch the catalog,
  // the scanner, or the cycle-count screens (which share nothing with this module).
  var BOH = null; try { if (D.bo && D.bo.url && D.bo.key && !D.bo.off) BOH = D.bo; } catch (eBo0) {} // bo.off = feature switched off (payload flag)
  var BO = { data: null, by: {}, at: 0, busy: false, err: '', redraw: null };
  var BO_AUTO_MS = 30 * 60000, BO_STALE_MS = 5 * 60000;
  var BO_PILL = { bo: 'Backorder', ctl: 'Controlled', clr: 'Cleared' };
  var BO_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function boOn() { return !!BOH; }
  function boKeyZ(s) { return nrm(s).replace(/^0+/, ''); }
  function boDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function boFmt(iso) { var d = boDate(iso); if (!d) return ''; var s = BO_MON[d.getMonth()] + ' ' + d.getDate(); if (d.getFullYear() !== new Date().getFullYear()) s += ', ' + d.getFullYear(); return s; }
  function boShort(iso) { var d = boDate(iso); return d ? (d.getMonth() + 1) + '/' + d.getDate() : ''; }
  function boPast(iso) { var d = boDate(iso); if (!d) return false; var t = new Date(); t.setHours(0, 0, 0, 0); return d < t; }
  function boAgo(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago';
  }
  var BYPNZ = {};
  Object.keys(BYPN).forEach(function (k) { var z = k.replace(/^0+/, ''); if (!BYPNZ[z] || k === z) BYPNZ[z] = BYPN[k]; });
  // Retired part numbers still in circulation: a hidden stub card with `moved` (e.g. Samurai CAT00227 -> CAT00229).
  // The old number keeps scanning, searching and opening — it lands on the current card with a "part number
  // changed" popup (pnMoveShow). Its barcodes still resolve to the OLD number, so cycle counts are unchanged.
  function movedOf(sku) {
    var n = nrm(sku); if (!n) return null;
    var e = BYPN[n] || BYPNZ[n.replace(/^0+/, '')];
    var it = e && e.kind === 'item' ? D.items[e.idx] : null;
    return it && it.hidden && it.moved && BYPN[nrm(it.moved)] ? it : null;
  }
  function boCatalog(sku) {
    var e = BYPN[nrm(sku)] || BYPNZ[boKeyZ(sku)]; if (!e) return null;
    var rec = recOf(e);
    if (rec && rec.hidden && rec.moved && BYPN[nrm(rec.moved)]) return { rec: rec, route: pnRoute(rec.sku) }; // old number: its own row, opened through the change popup
    return (rec && !rec.hidden) ? { rec: rec, route: pnRoute(rec.sku) } : null;
  }
  function boIndex() {
    var by = {}, d = BO.data;
    function put(kind, r) {
      if (!r || !r.sku) return;
      var k = nrm(r.sku), kz = 'z' + boKeyZ(r.sku);
      var e = by[k] || by[kz] || { st: {} };
      e.st[kind] = 1; e[kind] = r; by[k] = e; by[kz] = e;
    }
    if (d) {
      (d.backorders || []).forEach(function (r) { put('bo', r); });
      (d.controlled || []).forEach(function (r) { put('ctl', r); });
      (d.cleared || []).forEach(function (r) { put('clr', r); });
    }
    BO.by = by;
  }
  function boFor(sku) { if (!sku || !BO.data) return null; return BO.by[nrm(sku)] || BO.by['z' + boKeyZ(sku)] || null; }
  function boKinds(e) { var a = []; if (!e) return a; if (e.st.bo) a.push('bo'); if (e.st.ctl) a.push('ctl'); if (e.st.clr && !e.st.bo) a.push('clr'); return a; }
  (function boLoad() {
    try {
      if (!boOn()) { localStorage.removeItem('tbx_bo'); return; }
      var j = JSON.parse(localStorage.getItem('tbx_bo') || 'null');
      if (j && j.data && j.data.ok && j.data.backorders) { BO.data = j.data; BO.at = +j.at || 0; boIndex(); }
    } catch (e) {}
  })();
  function boSave() { try { localStorage.setItem('tbx_bo', JSON.stringify({ at: BO.at, data: BO.data })); } catch (e) {} }
  function boFetch(cb) {
    if (!boOn() || BO.busy) { if (cb) cb(false); return; }
    if (navigator.onLine === false) { BO.err = 'offline'; if (cb) cb(false); return; }
    BO.busy = true;
    var ac = null; try { if (typeof AbortController !== 'undefined') ac = new AbortController(); } catch (e0) {}
    var to = ac ? setTimeout(function () { try { ac.abort(); } catch (e1) {} }, 9000) : null;
    var done = function (ok) { BO.busy = false; if (to) clearTimeout(to); if (cb) cb(ok); };
    try {
      fetch(BOH.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'bo', key: BOH.key }), signal: ac ? ac.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok || !j.backorders || !j.controlled) throw new Error('bad');
          BO.data = j; BO.at = Date.now(); BO.err = ''; boIndex(); boSave(); done(true);
        })
        .catch(function () { BO.err = 'net'; done(false); });
    } catch (e2) { BO.err = 'net'; done(false); }
  }
  function boRefresh(force, cb) {
    if (!boOn()) { if (cb) cb(false); return; }
    if (!force && BO.data && Date.now() - BO.at < BO_AUTO_MS) { if (cb) cb(false); return; }
    boFetch(function (ok) { boPaint(); if (cb) cb(ok); });
  }
  function boPaint() { // refresh what is on screen without re-routing: home tile counts, or the report list
    try {
      var n = document.querySelector('.tile-bo .n'); if (n) n.innerHTML = boTileSub();
      if ((location.hash || '#/').split('?')[0] === '#/bo' && typeof BO.redraw === 'function') BO.redraw();
    } catch (e) {}
  }
  function boPillsHTML(sku, max) {
    var e = boFor(sku); if (!e) return '';
    return boKinds(e).slice(0, max || 3).map(function (k) { return '<span class="bopill ' + k + '">' + BO_PILL[k] + '</span>'; }).join('');
  }
  function boWhen(r) { // one line for a backordered row
    var w;
    if (r.clearDate) w = boPast(r.clearDate) ? '<span class="bo-late">Clear date passed</span> (was ' + boFmt(r.clearDate) + ')' : 'Est. full clear ' + boFmt(r.clearDate); // P47: overdue in red
    else if (r.clearText) w = 'Est. full clear ' + esc(r.clearText);
    else return r.since ? 'On backorder since week of ' + boFmt(r.since) : 'No clear date given';
    if (r.asOf) w += ' <span class="bo-asof">per ' + boShort(r.asOf) + ' report</span>';
    return w;
  }
  function boBannerHTML(sku) {
    var e = boFor(sku); if (!e) return '';
    var lines = [];
    if (e.st.bo) lines.push('<div class="bo-line"><span class="bopill bo">Backorder</span><span class="bo-w">' + boWhen(e.bo) + '</span></div>' + (e.bo.note ? '<div class="bo-msg">' + esc(e.bo.note) + '</div>' : ''));
    if (e.st.ctl) lines.push('<div class="bo-line"><span class="bopill ctl">Controlled</span><span class="bo-w">Inventory controlled · 24–36 hr shipping delay</span></div>' + (e.ctl.msg ? '<div class="bo-msg">' + esc(e.ctl.msg) + '</div>' : ''));
    if (e.st.clr && !e.st.bo) lines.push('<div class="bo-line"><span class="bopill clr">Cleared</span><span class="bo-w">Cleared backorder · week of ' + boFmt(e.clr.clearedOn) + '</span></div>');
    return '<div class="bobanner">' + lines.join('') + '<button class="bo-more" data-go="' + boReportRoute(sku) + '">Backorder Report &#x203A;</button></div>';
  }
  function boReportRoute(sku) { return '#/bo?bq=' + encodeURIComponent(sku || ''); } // P46: the report, filtered to this part
  function boTileSub() {
    var d = BO.data;
    if (!d) return BO.err === 'offline' ? 'Offline — report not loaded yet' : 'Weekly report · tap to load';
    return esc(plural(d.backorders.length, 'product')); // Nate, 2026-09-24: the tile says Backorder, the number on backorder beneath it
  }
  function boTileHTML() {
    if (!boOn()) return '';
    return '<button class="tile tile-bo" data-go="#/bo">' +
      '<span class="tico">' + catSvg('bo') + '</span>' +
      '<span class="tl"><b><span class="tlt">Backorder</span></b><span class="n">' + boTileSub() + '</span></span>' +
      '<span class="ct">&#x203A;</span></button>';
  }
  function boEntryHTML(kind, r) {
    var cat = boCatalog(r.sku), title = cat ? (cat.rec.t || cat.rec.name || r.desc) : r.desc;
    var meta = kind === 'bo' ? boWhen(r) : kind === 'ctl' ? 'Inventory controlled · 24–36 hr shipping delay' : 'Cleared backorder · week of ' + boFmt(r.clearedOn);
    var text = kind === 'bo' ? r.note : kind === 'ctl' ? r.msg : '';
    var pills = boPillsHTML(r.sku, 3) || '<span class="bopill ' + kind + '">' + BO_PILL[kind] + '</span>';
    var inner = '<div class="rl"><div class="bo-top">' + pills + '<span class="bo-sku mono">' + esc(r.sku) + '</span>' + (cat ? '' : '<span class="bo-nocat">Not in ToolBox</span>') + '</div>' +
      '<b class="ti">' + esc(title) + '</b>' +
      (cat && r.desc && nrm(r.desc) !== nrm(title) ? '<span class="ld bo-desc">' + esc(r.desc) + '</span>' : '') +
      '<span class="ld bo-meta">' + meta + '</span>' +
      (text ? '<div class="bo-note">' + esc(text) + '</div>' : '') + '</div>';
    return cat ? '<button class="rowitem bo-row" data-go="' + cat.route + '">' + inner + '<div class="ct">&#x203A;</div></button>'
      : '<div class="rowitem bo-row bo-nolink">' + inner + '</div>';
  }
  function boSorted(kind, list) {
    var a = list.slice();
    function tt(r) { var c = boCatalog(r.sku); return ((c && (c.rec.t || c.rec.name)) || r.desc || '').toLowerCase(); }
    if (kind === 'bo') a.sort(function (x, y) {
      var gx = x.clearDate ? 0 : x.clearText ? 1 : 2, gy = y.clearDate ? 0 : y.clearText ? 1 : 2;
      if (gx !== gy) return gx - gy;
      if (gx === 0 && x.clearDate !== y.clearDate) return x.clearDate < y.clearDate ? -1 : 1;
      var a1 = tt(x), b1 = tt(y); return a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
    });
    if (kind === 'clr') a.sort(function (x, y) { if (x.clearedOn !== y.clearedOn) return x.clearedOn < y.clearedOn ? 1 : -1; var a1 = tt(x), b1 = tt(y); return a1 < b1 ? -1 : a1 > b1 ? 1 : 0; });
    return a;
  }
  // P46/P47: the filter and section live in the entry (BOV, restored by route() from its record or ?bq= / ?bs=), the
  // filter takes words in any order, and the header is one status line (Highspot inline) + one scrolling row of chips.
  function boScreen() {
    setTitle('Backorder Report', ''); backBtn.hidden = false; // P41: plain screen title
    if (!boOn()) { render(emptyHTML(ICON.box, 'Backorder Report isn’t set up', 'This build has no report hub configured.', '')); return; }
    var q = String(BOV.q || '').trim(), sec = /^(bo|ctl|clr)$/.test(BOV.sec || '') ? BOV.sec : 'all', urlT = null, myNav = NAV.cur;
    BOV = { q: q, sec: sec };
    render('<div class="card bo-card">' +
      '<div class="bo-head"><div class="bo-hl"><div class="bo-title">Weekly Stryker Inventory Report</div><div class="cc-sub bo-sub" id="bo-sub"></div></div>' +
      '<button id="bo-refresh" class="ct-help bo-rf" type="button" aria-label="Refresh">' + ICON.refresh + '</button></div>' +
      '<input id="bo-q" class="cc-in" type="search" autocomplete="off" placeholder="Filter by part number or description…" aria-label="Filter the report" value="' + esc(q) + '">' +
      '<div class="bo-chips" id="bo-chips" role="group" aria-label="Report sections"></div>' +
      boSkelHead() + '</div><div id="bo-body"></div><div class="bo-src" id="bo-src">Updated automatically from the weekly Inventory Report email.</div>');
    afterPaint(function () { // R7: a View Transition (N2 / N11c) paints a frame after render() — wire the new screen then
    NAV.extra = function () { return { bq: q, bs: sec }; }; // this entry's record keeps the live filter (the URL may lag by 300 ms)
    function subLine() {
      var d = BO.data, s = '';
      if (!d) return BO.busy ? 'Loading…' : BO.err === 'offline' ? 'Offline — not loaded yet' : BO.err ? 'Couldn’t reach the report hub' : 'Loading…'; // P15
      if (d.weekOf) s = 'Week of ' + boFmt(d.weekOf);
      if (BO.busy) s += (s ? ' · ' : '') + 'refreshing…';
      else if (BO.at) s += (s ? ' · ' : '') + 'updated ' + boAgo(BO.at);
      if (BO.err === 'offline') s += ' · offline';
      else if (BO.err === 'net' && d) s += ' · hub unreachable, showing saved report';
      return s || 'Loading…';
    }
    function matches(r) { // P46: the whole query (dash- and zero-tolerant part numbers), or every word, in any order
      if (!q) return true;
      var cat = boCatalog(r.sku), hay = [r.sku, r.desc, r.note || '', r.msg || '', cat ? (cat.rec.t || cat.rec.name || '') : ''].join(' ');
      var nq = nrm(q), nz = boKeyZ(q), nh = nrm(hay), low = hay.toLowerCase();
      if ((nq && nh.indexOf(nq) > -1) || (nz.length > 1 && nh.indexOf(nz) > -1) || low.indexOf(q.toLowerCase()) > -1) return true;
      var words = q.toLowerCase().split(/\s+/).filter(Boolean);
      return words.length > 1 && words.every(function (t) {
        var nt = nrm(t), zt = nt.replace(/^0+/, '');
        return low.indexOf(t) > -1 || (nt && nh.indexOf(nt) > -1) || (zt.length > 1 && nh.indexOf(zt) > -1);
      });
    }
    function syncURL() { // ?bq= / ?bs= in this entry's URL (Back, reload, shared links) — never another entry's
      clearTimeout(urlT); urlT = null;
      if (NAV.cur !== myNav || (location.hash || '').split('?')[0] !== '#/bo') return;
      BOV = { q: q, sec: sec }; stWrite();
    }
    function draw() {
      var body = document.getElementById('bo-body'), sub = document.getElementById('bo-sub'), chips = document.getElementById('bo-chips');
      if (!body) return;
      var d = BO.data;
      // P47: the status line carries the Highspot link; the "Updated automatically" note is the footer (#bo-src)
      if (sub) sub.innerHTML = esc(subLine()) + (d && d.highspot ? '<span class="bo-dot"> · </span><a class="bo-hs" href="' + esc(d.highspot) + '" target="_blank" rel="noopener">Highspot&nbsp;&#x203A;</a>' : '');
      var qiD = document.getElementById('bo-q'); if (qiD) qiD.hidden = !d; if (chips) chips.hidden = !d; // P15: nothing to filter until a report exists
      var src = document.getElementById('bo-src'); if (src) src.hidden = !d;
      var loading = !d && (BO.busy || !BO.err); // N14: never fetched yet or fetching now → placeholders (not the retry state)
      var skh = document.getElementById('bo-skh'); if (skh) skh.hidden = !loading;
      if (!d) {
        if (chips) chips.innerHTML = '';
        body.innerHTML = loading ? boSkelHTML()
          : BO.err === 'offline' ? emptyHTML(ICON.offline, 'Offline', 'No report is saved on this phone yet — open this once with signal and it works offline after that.', '')
          : emptyHTML(ICON.box, 'Couldn’t reach the report hub', 'Check your signal and try again.', '<button class="footlink" data-bo-retry="1">Try again &#x203A;</button>');
        return;
      }
      var lists = { bo: boSorted('bo', d.backorders.filter(matches)), ctl: (d.controlled || []).filter(matches), clr: boSorted('clr', (d.cleared || []).filter(matches)) };
      var tot = lists.bo.length + lists.ctl.length + lists.clr.length, sl = chips ? chips.scrollLeft : 0;
      if (chips) {
        chips.innerHTML = '<button class="bochip' + (sec === 'all' ? ' on' : '') + '" data-bo-sec="all" aria-pressed="' + (sec === 'all') + '">All · ' + tot + '</button>' +
          [['bo', 'Backorder'], ['ctl', 'Controlled'], ['clr', 'Cleared']].map(function (p) {
            return '<button class="bochip' + (sec === p[0] ? ' on' : '') + '" data-bo-sec="' + p[0] + '" aria-pressed="' + (sec === p[0]) + '">' + p[1] + ' · ' + lists[p[0]].length + '</button>';
          }).join('');
        chips.scrollLeft = sl;
      }
      var html = '', wk = d.weekOf ? ' as of the week of ' + boFmt(d.weekOf) : '';
      function section(kind, label, empty) {
        if (sec !== 'all' && sec !== kind) return;
        var L = lists[kind];
        html += '<div class="grouphead bo-gh ' + kind + '">' + label + ' · ' + L.length + (kind === 'clr' ? ' <span class="bo-win">last ' + (d.clearedDays || 30) + ' days</span>' : '') + '</div>';
        html += L.length ? '<div class="list">' + L.map(function (r) { return boEntryHTML(kind, r); }).join('') + '</div>'
          : '<div class="cc-empty">' + (q ? 'No matches here.' : empty + wk + '.') + '</div>';
      }
      section('bo', 'On backorder', 'Nothing on backorder');
      section('ctl', 'Inventory controlled', 'No inventory-controlled products');
      section('clr', 'Recently cleared', 'Nothing cleared recently');
      swapIn(body, html);
    }
    BO.redraw = draw;
    draw();
    var qi = document.getElementById('bo-q');
    if (qi) qi.addEventListener('input', function () { q = qi.value.trim(); BOV = { q: q, sec: sec }; draw(); clearTimeout(urlT); urlT = setTimeout(syncURL, 300); });
    var card = content.querySelector('.bo-card');
    if (card) card.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-bo-sec]') : null; if (!b) return;
      sec = b.getAttribute('data-bo-sec'); BOV = { q: q, sec: sec }; draw(); syncURL();
    });
    var rb = document.getElementById('bo-refresh'), bodyEl = document.getElementById('bo-body');
    function refresh(cb) {
      if (rb) { rb.disabled = true; rb.classList.add('spin'); }
      draw();
      var t0 = Date.now();
      boFetch(function () {
        // keep the spin visible for at least half a turn so a fast (cached) answer still reads as a refresh
        setTimeout(function () { if (rb) { rb.disabled = false; rb.classList.remove('spin'); } draw(); if (cb) cb(); }, Math.max(0, 600 - (Date.now() - t0)));
      });
    }
    if (rb) rb.addEventListener('click', function () { refresh(); });
    if (bodyEl) bodyEl.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-bo-retry]')) refresh(); });
    CURREFRESH = function () { return new Promise(function (res) { refresh(res); }); }; // P48: pull down to refresh (the refresh arrow spins too)
    if (!BO.data || Date.now() - BO.at > BO_STALE_MS) refresh();
    });
  }
  // R7 N14 — while the first report loads: placeholders made of the real markup (filter box, chips, a section and its
  // rows, text hidden), so nothing jumps when it arrives; the report then crossfades in once (later refreshes are instant)
  function boSkelHead() {
    return '<div id="bo-skh" aria-hidden="true" hidden><input class="cc-in skt" type="search" disabled tabindex="-1" aria-hidden="true">' +
      '<div class="bo-chips"><button type="button" class="bochip skt" disabled tabindex="-1">All · 000</button><button type="button" class="bochip skt" disabled tabindex="-1">Backorder · 00</button>' +
      '<button type="button" class="bochip skt" disabled tabindex="-1">Controlled · 00</button></div></div>';
  }
  function boSkelHTML() {
    var row = '<div class="rowitem bo-row skrow" aria-hidden="true"><div class="rl"><div class="bo-top"><span class="bopill bo skt">Backorder</span><span class="bo-sku mono skt">3910500000</span></div>' +
      '<b class="ti"><span class="skt">Product name placeholder</span></b><span class="ld bo-meta"><span class="skt">Since Sep 7 · clears about Oct 15</span></span></div></div>';
    return '<div class="grouphead bo-gh bo sk" aria-hidden="true"><span class="skt">On backorder · 00</span></div><div class="list">' + row + row + row + row + '</div>';
  }
  function swapIn(el, html) { // N14: the first data fades in over its placeholder (220 ms), which fades out (120 ms) and goes
    if (!el.querySelector('.skrow') || !el.animate || motionRM()) { el.innerHTML = html; return; }
    var old = document.createElement('div'), nu = document.createElement('div');
    old.className = 'sk-old'; old.setAttribute('aria-hidden', 'true');
    while (el.firstChild) old.appendChild(el.firstChild);
    nu.innerHTML = html; el.classList.add('sk-stack'); el.appendChild(old); el.appendChild(nu);
    try {
      old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      nu.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } catch (e) {}
    setTimeout(function () {
      if (old.parentNode === el) el.removeChild(old);
      if (nu.parentNode === el) { while (nu.firstChild) el.insertBefore(nu.firstChild, nu); el.removeChild(nu); }
      el.classList.remove('sk-stack');
    }, 240);
  }

  // ---- Usage (anonymous): what gets opened, searched and scanned → the syksmtoolbox usage hub ----
  // No names and nothing typed into forms: a random device id (tbx_uid), a session id that rolls over after 30 idle
  // minutes, the screen / card / search term / scan outcome. Events wait in memory (saved when the app is hidden,
  // restored on the next launch) and go out in batches with a batch id the hub de-duplicates — never on the render
  // path, never blocking anything. Config = TOOLBOX.usage {url, key} in the encrypted payload; no config or
  // usage.off = completely inert. The dashboard (#/usage) needs the admin key, which is NOT in the payload.
  var UGH = null; try { if (D.usage && D.usage.url && D.usage.key && !D.usage.off) UGH = D.usage; } catch (eUg0) {}
  var UG = { q: [], fly: null, busy: false, timer: null, at: 0, back: 0, last: 0, lastAny: 0, started: false,
    view: '', viewT: 0, sq: null, sqT: null, qSeen: {}, errs: 0, errSeen: {}, mem: '', mute: 0 };
  var UG_SESS_MS = 30 * 60000, UG_MAXQ = 400, UG_BATCH = 100;
  // Real people only. Nothing is recorded in automated or test browsers (WebDriver: Playwright, Puppeteer, Selenium;
  // headless Chrome, jsdom, Electron; an iPhone / iPad / Mac user agent on a Linux or Windows machine = Playwright WebKit
  // or device emulation), in a browser switched off on the dashboard ("Don’t count this device" → localStorage
  // tbx_unotrack = 1, which Lock this device keeps) or after machine-speed navigation (ugRoute). The dashboard still
  // works in all of them: it only needs UGH.
  var UG_OFF = ugOffWhy();
  function ugOffWhy() {
    try {
      var n = navigator, w = window, ua = String(n.userAgent || ''), pf = String(n.platform || ''), de = document.documentElement;
      if (n.webdriver === true) return 'auto';
      if (/HeadlessChrome|PhantomJS|jsdom|Electron\//i.test(ua)) return 'auto';
      if (/iPhone|iPad|Macintosh/.test(ua) && /Linux|Win/i.test(pf)) return 'auto';
      if (w.__playwright__binding__ || w.__pwInitScripts || w.callPhantom || w._phantom || w.__nightmare || w.domAutomation || w.domAutomationController || w._selenium || w.callSelenium) return 'auto';
      if (de && (de.getAttribute('webdriver') || de.getAttribute('selenium') || de.getAttribute('driver'))) return 'auto';
    } catch (e) {}
    try { if (localStorage.getItem('tbx_unotrack') === '1') return 'flag'; } catch (e2) {}
    return '';
  }
  function ugOn() { return !!UGH && !UG_OFF; }
  function ugRnd(n) {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '', r = null;
    try { r = window.crypto.getRandomValues(new Uint8Array(n)); } catch (e) {}
    for (var i = 0; i < n; i++) s += a.charAt((r ? r[i] : Math.floor(Math.random() * 256)) % 36);
    return s;
  }
  function ugId() {
    try { var id = localStorage.getItem('tbx_uid'); if (!/^[a-z0-9]{10}$/.test(id || '')) { id = ugRnd(10); localStorage.setItem('tbx_uid', id); } return id; }
    catch (e) { return UG.mem || (UG.mem = ugRnd(10)); }
  }
  function ugAdmin() { try { return localStorage.getItem('tbx_uadm') || ''; } catch (e) { return ''; } }
  function ugSess(now) {
    var s = null; try { s = JSON.parse(localStorage.getItem('tbx_usess') || 'null'); } catch (e) {}
    if (!s || !s.id || now - (+s.at || 0) > UG_SESS_MS) s = { id: ugRnd(8), at: now }; else s.at = now;
    try { localStorage.setItem('tbx_usess', JSON.stringify(s)); } catch (e2) {}
    return s.id;
  }
  function ugPlat() {
    var ua = navigator.userAgent || '', sa = false;
    var p = /iPhone/.test(ua) ? 'iPhone' : (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 'iPad' :
      /Android/.test(ua) ? 'Android' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
    try { sa = navigator.standalone === true || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches); } catch (e) {}
    return p + '|' + (sa ? 'app' : 'web') + '|' + APPVER;
  }
  function ugEv(type, key, extra) {
    if (!ugOn()) return;
    try {
      var now = Date.now();
      UG.q.push([now, type, String(key == null ? '' : key).slice(0, 80), String(extra == null ? '' : extra).slice(0, 80), ugSess(now)]);
      if (UG.q.length > UG_MAXQ) UG.q.splice(0, UG.q.length - UG_MAXQ);
      UG.lastAny = now; if (type !== 'ping') UG.last = now;
      ugSoon(UG.q.length === 1 && !UG.fly ? 2500 : 15000); // the first event of a burst goes out quickly (live view)
    } catch (e) {}
  }
  function ugSoon(ms) {
    if (!ugOn() || !UG.started) return;
    var at = Date.now() + ms;
    if (UG.timer && UG.at <= at) return;
    if (UG.timer) clearTimeout(UG.timer);
    UG.at = at; UG.timer = setTimeout(function () { UG.timer = null; ugFlush(false); }, ms);
  }
  function ugSave() { if (UG_OFF) { try { localStorage.removeItem('tbx_uq'); } catch (e0) {} return; } try { localStorage.setItem('tbx_uq', JSON.stringify({ q: UG.q.slice(-UG_MAXQ), fly: UG.fly })); } catch (e) {} }
  // stop recording on this page and drop what hasn't gone out (why: 'flag' = switched off here, 'fast' = machine speed)
  function ugHalt(why) {
    UG_OFF = why; UG.q = []; UG.fly = null; UG.sq = null;
    if (UG.timer) { clearTimeout(UG.timer); UG.timer = null; }
    if (UG.sqT) { clearTimeout(UG.sqT); UG.sqT = null; }
    try { localStorage.removeItem('tbx_uq'); } catch (e) {}
  }
  function ugLoad() {
    try {
      var j = JSON.parse(localStorage.getItem('tbx_uq') || 'null'); localStorage.removeItem('tbx_uq');
      if (j && j.fly && j.fly.b && j.fly.e && j.fly.e.length) UG.fly = j.fly;
      if (j && j.q && j.q.length) UG.q = j.q.concat(UG.q).slice(-UG_MAXQ);
    } catch (e) {}
  }
  function ugFlush(bye) {
    if (!ugOn() || !UG.started || UG.busy) return;
    if (!UG.fly) { if (!UG.q.length) return; UG.fly = { b: ugRnd(12), e: UG.q.splice(0, UG_BATCH) }; }
    if (navigator.onLine === false) { ugSoon(60000); return; }
    var body = JSON.stringify({ action: 'u_ev', key: UGH.key, d: ugId(), a: ugAdmin() ? 1 : 0, b: UG.fly.b, e: UG.fly.e });
    if (bye) { // app going to the background / closing: send without waiting; the batch stays saved until the hub confirms
      ugSave();
      try {
        var fb = UG.fly.b;
        fetch(UGH.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.ok && UG.fly && UG.fly.b === fb) { UG.fly = null; if (document.hidden) ugSave(); } })
          .catch(function () {});
      } catch (e) {}
      return;
    }
    UG.busy = true;
    var ac = null; try { if (typeof AbortController !== 'undefined') ac = new AbortController(); } catch (e0) {}
    var to = ac ? setTimeout(function () { try { ac.abort(); } catch (e1) {} }, 15000) : null;
    var fin = function (ok) {
      UG.busy = false; if (to) clearTimeout(to);
      if (ok) { UG.fly = null; UG.back = 0; if (UG.q.length) ugSoon(1500); }
      else { UG.back = Math.min(300000, UG.back ? UG.back * 2 : 20000); ugSoon(UG.back); }
    };
    try {
      fetch(UGH.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, signal: ac ? ac.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (j) { fin(!!(j && j.ok)); })
        .catch(function () { fin(false); });
    } catch (e2) { fin(false); }
  }
  function ugStart() {
    if (!ugOn() || UG.started) return;
    UG.started = true;
    ugLoad();
    ugEv('open', 'boot', ugPlat());
    try { if (qInput) qInput.addEventListener('input', ugSearchInput); } catch (e) {}
    document.addEventListener('visibilitychange', function () {
      try {
        if (document.hidden) { ugSearchCommit(); ugSave(); if (!UG.busy) ugFlush(true); return; }
        try { localStorage.removeItem('tbx_uq'); } catch (e1) {} // back in front: memory is the truth again
        if (Date.now() - UG.last > UG_SESS_MS) ugEv('open', 'resume', ugPlat());
        ugSoon(2000);
      } catch (e2) {}
    });
    window.addEventListener('pagehide', function () { try { ugSearchCommit(); ugSave(); if (!UG.busy) ugFlush(true); } catch (e) {} });
    window.addEventListener('online', function () { ugSoon(1500); });
    setInterval(function () { try { if (!document.hidden && Date.now() - UG.lastAny > 4 * 60000 - 5000) ugEv('ping'); } catch (e) {} }, 60000);
  }
  // route() calls this first thing on every navigation (hash links, Back, and the in-place variant chips alike).
  function ugRoute() {
    if (!ugOn()) return;
    try {
      if (!UG.started) ugStart();
      ugSearchCommit();
      var h = (location.hash || '#/').split('?')[0], m, ty = 'view', key = '', x = '';
      var dec = function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } };
      if ((m = h.match(/^#\/pn\/(.+)$/))) {
        var sku = dec(m[1]);
        if (movedOf(sku)) return; // a retired number: the redirect logs the current card
        var e = BYPN[nrm(sku)] || BYPNZ[nrm(sku).replace(/^0+/, '')];
        ty = 'card'; key = e ? (skuOf(e) || sku) : sku; x = e ? '' : 'missing';
      } else key = ugViewKey(h, dec);
      if (!key || key === 'usage') return;
      var now = Date.now();
      if (UG.mute) { var mu = UG.mute; UG.mute = 0; if (now - mu < 3000) return; } // N9 "Search it" on the dashboard: the owner's look, not a visit
      if (ty + ':' + key === UG.view && now - UG.viewT < 1500) return; // a re-render, not a new visit
      UG.view = ty + ':' + key; UG.viewT = now;
      // 15 screens / cards inside 5 s is a script driving the page, not a person: nothing more from this launch
      var rt = UG.rt || (UG.rt = []); rt.push(now); if (rt.length > 15) rt.shift();
      if (rt.length === 15 && now - rt[0] < 5000) { ugHalt('fast'); return; }
      ugEv(ty, key, x);
    } catch (e2) {}
  }
  function ugViewKey(h, dec) {
    if (h === '#/' || h === '#' || h === '') return 'home';
    var parts = h.replace(/^#\/?/, '').split('/');
    // Cycle count / F&A / territories: screen names only (territory codes are fine; nothing typed is recorded)
    if (/^(cc|ct|fa|fa2|teams|signup|team)$/.test(parts[0])) return parts.slice(0, 3).join('/').slice(0, 60);
    return parts.map(dec).join('/').slice(0, 80);
  }
  function ugSearchInput() {
    try {
      var v = (qInput.value || '').trim();
      if (UG.sqT) { clearTimeout(UG.sqT); UG.sqT = null; }
      UG.sq = v || null;
      if (v) UG.sqT = setTimeout(ugSearchCommit, 2000); // the term people settle on, not every keystroke
    } catch (e) {}
  }
  function ugSearchCommit() {
    if (UG.sqT) { clearTimeout(UG.sqT); UG.sqT = null; }
    var v = UG.sq; UG.sq = null;
    if (!v || !ugOn()) return;
    var k = v.toLowerCase().replace(/\s+/g, ' ').slice(0, 60), now = Date.now();
    if (k.length < 2 || now - (UG.qSeen[k] || 0) < 60000) return; // the same term again within a minute is one search
    for (var qk in UG.qSeen) if (now - UG.qSeen[qk] > 60000) delete UG.qSeen[qk];
    UG.qSeen[k] = now;
    var n = 0; try { n = searchAll(v).length; } catch (e) {}
    ugEv('search', k, String(n));
  }
  function ugScan(r, txt) { // catalog scanner outcome (the cycle-count scanner is not tracked)
    if (!ugOn() || !r) return;
    try {
      if (r.sku) {
        var e = BYPN[nrm(r.sku)] || BYPNZ[nrm(r.sku).replace(/^0+/, '')];
        if (!e) { ugEv('scan', r.sku, 'nocard'); return; }
        var it = recOf(e);
        ugEv('scan', (it && it.sku) || r.sku, it && it.hidden && it.moved ? 'moved' : 'card');
        return;
      }
      if ((r.p && r.p.gtin) || nrm(txt).length >= 4) ugEv('scan', (r.p && r.p.gtin) || nrm(txt).slice(0, 40), 'unknown');
    } catch (e2) {}
  }
  function ugErr(msg, file, line) {
    if (!ugOn() || UG.errs >= 5) return;
    var k = String(msg || 'error').slice(0, 120);
    if (UG.errSeen[k]) return;
    UG.errSeen[k] = 1; UG.errs++;
    ugEv('error', k, String(file || '').split('/').pop().split('?')[0].slice(0, 40) + ':' + (line || 0));
  }
  try {
    window.addEventListener('error', function (ev) { try { ugErr(ev && ev.message, ev && ev.filename, ev && ev.lineno); } catch (e) {} });
    window.addEventListener('unhandledrejection', function (ev) { try { var r = ev && ev.reason; ugErr('Unhandled: ' + ((r && r.message) || r), '', 0); } catch (e) {} });
    // five quick taps on the version number at the foot of Home open the dashboard (owner only — it asks for the key)
    var ugTaps = [];
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-ugtap]') : null;
      if (!t) return;
      var now = Date.now(); ugTaps.push(now); ugTaps = ugTaps.filter(function (x) { return now - x < 2500; });
      if (ugTaps.length >= 5) { ugTaps = []; location.hash = '#/usage'; }
    });
  } catch (eUg1) {}

  // ---- Usage dashboard (#/usage) ----
  var UGD = { live: null, liveAt: 0, stats: {}, statsAt: {}, days: 7, incl: false, busyL: false, busyS: false, errL: '', errS: '', gen: 0, more: {},
    // N9 "To review" (u_queue / u_mark): the last answer and for which "Include my devices"; qNow = what this phone's catalog
    // says about a row now (memo); qMarks = marks waiting to be sent, one at a time; qOver = marks made here that a queue
    // answer may predate (re-applied until the hub has them); qDraw = the dashboard on screen
    q: null, qIncl: -1, qAt: 0, qNext: 0, qBusy: false, qErr: '', qOff: false, qTab: 'search', qAll: false, qMore: {}, qNow: {}, qEdit: '',
    qPend: 0, qMarks: [], qSending: false, qOver: {}, qDraw: null };
  function ugApi(action, extra, cb, keyOverride) {
    var ak = keyOverride || ugAdmin();
    if (!UGH || !ak) { cb(null, 'key'); return; }
    var body = { action: action, key: ak }; for (var k in extra) if (extra.hasOwnProperty(k)) body[k] = extra[k];
    var ac = null; try { if (typeof AbortController !== 'undefined') ac = new AbortController(); } catch (e0) {}
    var to = ac ? setTimeout(function () { try { ac.abort(); } catch (e1) {} }, 30000) : null;
    var done = false, fin = function (j, err) { if (done) return; done = true; if (to) clearTimeout(to); cb(j, err); };
    try {
      fetch(UGH.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: ac ? ac.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j || !j.ok) fin(null, (j && j.err) || 'bad'); else fin(j, ''); })
        .catch(function () { fin(null, navigator.onLine === false ? 'offline' : 'net'); });
    } catch (e2) { fin(null, 'net'); }
  }
  // ---- N9: review-queue marks (Done / Ignore / Reopen / Note). Optimistic on screen; sent one at a time; a failed mark
  // puts the row back as it was. Kept outside usageScreen so a redraw (P6 soft route, Back) never loses one in flight.
  function rqId(t, r) { return t + '\t' + (t === 'part' ? r.id : r.k); }
  function rqCur(t, r) { // the row object in the current answer (a reload replaces them), else the one that was tapped
    var a = (UGD.q && UGD.q[t]) || [], id = rqId(t, r);
    for (var i = 0; i < a.length; i++) if (rqId(t, a[i]) === id) return a[i];
    return r;
  }
  function rqSet(t, r, s) {
    [r, rqCur(t, r)].forEach(function (x) { x.st = s.st; x.at = s.at; x.back = s.back || 0; if (s.note) x.note = s.note; else delete x.note; });
  }
  function rqMark(t, r, st, note, toastText, undoable) {
    var prev = { st: r.st, note: r.note || '', at: r.at, back: r.back || 0 }, id = rqId(t, r);
    var nn = note == null ? (r.note || '') : note;
    var o = { st: st, note: nn, at: new Date().toISOString(), ok: 0 };
    rqSet(t, r, o); UGD.qOver[id] = o;
    UGD.qMarks.push({ t: t, k: t === 'part' ? r.id : r.k, st: st, note: note, id: id, o: o, prev: prev, r: r });
    if (UGD.qDraw) UGD.qDraw();
    if (toastText) rqToast(toastText, undoable ? function () {
      // Undo: an open row (no decision, todo, or done-but-back) goes back to todo; a closed one to its old status
      var wasOpen = !prev.st || prev.st === 'todo' || (prev.st === 'done' && prev.back);
      rqMark(t, r, wasOpen ? 'todo' : prev.st, prev.note, '', false);
    } : null);
    rqPump();
  }
  function rqPump() {
    if (UGD.qSending || !UGD.qMarks.length) return;
    var m = UGD.qMarks[0], body = { t: m.t, k: m.k, st: m.st };
    if (m.note != null) body.note = m.note;
    UGD.qSending = true;
    ugApi('u_mark', body, function (j, err) {
      UGD.qSending = false;
      if (!j && err === 'busy' && !m.retried) { m.retried = 1; setTimeout(rqPump, 1500); return; } // the hub was writing events: once more
      UGD.qMarks.shift();
      var cur = UGD.qOver[m.id] === m.o; // no later mark on this row has replaced this one
      if (j) { m.o.ok = Date.now(); if (cur && j.at) { m.o.at = j.at; rqSet(m.t, m.r, m.o); } }
      else {
        if (cur) { delete UGD.qOver[m.id]; rqSet(m.t, m.r, m.prev); }
        if (err === 'key') { try { localStorage.removeItem('tbx_uadm'); } catch (e) {} }
        rqToast(err === 'full' ? 'Couldn’t save — the Review tab is full (5,000 rows).' : 'Couldn’t save — check your signal and try again.', null);
      }
      if (UGD.qDraw) UGD.qDraw();
      rqPump();
    });
  }
  // A queue answer may predate marks made here (still being sent, or confirmed after the request left): keep them on top.
  function rqApply(Q, t0) {
    for (var id in UGD.qOver) if (UGD.qOver.hasOwnProperty(id)) {
      var o = UGD.qOver[id];
      if (o.ok && o.ok < t0) { delete UGD.qOver[id]; continue; } // the hub had it when it answered
      var t = id.slice(0, id.indexOf('\t')), a = Q[t] || [];
      for (var i = 0; i < a.length; i++) if (rqId(t, a[i]) === id) { a[i].st = o.st; a[i].at = o.at; a[i].back = 0; if (o.note) a[i].note = o.note; else delete a[i].note; }
    }
  }
  // one review toast at a time: a newer mark replaces the one on screen (its Undo) instead of queueing 4-s toasts behind it
  function rqToast(text, undo) {
    TQ = TQ.filter(function (x) { return !(x.opts && x.opts.rq); });
    if (TCUR && TCUR.opts && TCUR.opts.rq && toast.classList.contains('on')) { clearTimeout(TTIMER); hideToast(); }
    toastMsg(text, undo ? 5000 : 3200, undo ? { rq: 1, action: { label: 'Undo', fn: undo } } : { rq: 1 });
  }
  function ugNum(n) { n = +n || 0; return n >= 10000 ? (Math.round(n / 100) / 10) + 'K' : n.toLocaleString('en-US'); }
  function ugTitle(sku) { var e = BYPN[nrm(sku)] || BYPNZ[nrm(sku).replace(/^0+/, '')], r = e ? recOf(e) : null; return r ? (r.t || r.name || '') : ''; }
  function ugHasCard(sku) { return !!(BYPN[nrm(sku)] || BYPNZ[nrm(sku).replace(/^0+/, '')]); }
  function ugDev(d, info) {
    if (d === ugId()) return 'This device';
    var p = String(info || '').split('|');
    return (p[0] || 'Device') + (p[0] && p[1] !== 'app' ? ' browser' : '') + ' · ' + String(d).slice(-4);
  }
  var UG_SCREENS = { home: 'Home', bo: 'Backorder Report', about: 'About', scan: 'Scanner', probes: 'Probes', shavers: 'Shavers',
    'top/implants': 'Implants', 'top/arthroscopy': 'Arthroscopy', teams: 'Territory Cycle Counts', 'teams/help': 'Cycle count help',
    'teams/help/view': 'Cycle count guide', signup: 'Territory sign-up', cc: 'Cycle count (CT)', 'cc/fops': 'Field Ops count sheets',
    ct: 'CT team', fa2: 'F&A inventory', 'fa2/add': 'F&A — add', 'fa2/add2': 'F&A — add items', 'fa2/use': 'F&A — use',
    'fa2/return': 'F&A — return', 'fa2/send': 'F&A — send', 'fa2/trans': 'F&A — transactions', 'fa2/admin': 'F&A — admin',
    'fa2/onhand': 'F&A — on hand', 'fa2/history': 'F&A — history' };
  function ugScreen(k) {
    if (UG_SCREENS[k]) return UG_SCREENS[k];
    var p = String(k).split('/'), m;
    if (p[0] === 'cat' || p[0] === 'dgrp' || p[0] === 'shaverfam') return p.slice(1).join('/');
    if (p[0] === 'fam') return p.slice(2).join('/') || p[1];
    if (p[0] === 'sub') return p.slice(2).join(' › ');
    if (p[0] === 'instr') return 'Instrumentation · ' + p[1];
    if (p[0] === 'parts') return 'Parts · ' + p[1];
    if ((m = /^team\/([a-z0-9]+)(\/cc)?/.exec(k))) return (m[2] ? 'Cycle count' : 'Territory') + ' · ' + m[1].toUpperCase();
    return k;
  }
  function ugAgo(t) { var s = sinceText(t); return s === 'just now' ? 'now' : s.replace(' ago', ''); }
  function ugHourLbl(h) { return h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'; }
  function ugHourLong(h) { return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); }
  function ugDayLbl(k, long) {
    var d = new Date(Date.parse(k + 'T12:00:00Z')), mo = BO_MON[d.getUTCMonth()];
    return long ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ', ' + mo + ' ' + d.getUTCDate() : (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }
  function ugNice(v) { // an even top, so the midline tick is a whole number of people
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), st = [1, 2, 4, 6, 8, 10];
    for (var i = 0; i < st.length; i++) if (st[i] * p >= v && (st[i] * p) % 2 === 0) return st[i] * p;
    return 10 * p;
  }
  // Columns: one series (people), 4px rounded tops on a shared baseline, 2px gaps, hairline grid, value on the peak,
  // tap/hover/focus shows the exact number; the <details> table under it carries every value too.
  function ugColumns(vals, labels, tips, opts) {
    opts = opts || {};
    var n = vals.length, mx = 0, peak = -1, i;
    for (i = 0; i < n; i++) if (vals[i] != null && vals[i] > mx) { mx = vals[i]; peak = i; }
    var top = ugNice(Math.max(mx, 1)), cols = '';
    for (i = 0; i < n; i++) {
      var v = vals[i], h = v ? Math.max(2, Math.round(v / top * 1000) / 10) : 0;
      cols += '<button type="button" class="ug-col' + (v == null ? ' none' : '') + (i === opts.hi ? ' hi' : '') + '" data-tip="' + esc(tips[i]) + '" aria-label="' + esc(tips[i]) + '">' +
        (v ? '<i style="height:' + h + '%"></i>' : '') + (i === peak && v ? '<span class="ug-pk" style="bottom:' + h + '%">' + v + '</span>' : '') + '</button>';
    }
    var xl = labels.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('');
    return '<div class="ug-chart"><div class="ug-ya"><span>' + top + '</span><span>' + (top / 2) + '</span><span>0</span></div>' +
      '<div class="ug-pw"><div class="ug-plot"><div class="ug-g g1"></div><div class="ug-g g2"></div><div class="ug-g g3"></div>' + cols + '</div>' +
      '<div class="ug-xa">' + xl + '</div></div><div class="ug-tip" hidden></div></div>';
  }
  function ugTable(head, rows) {
    return '<details class="ug-tbl"><summary>Show the numbers</summary><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(String(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></details>';
  }
  function ugTiles(list) {
    return '<div class="ug-tiles">' + list.map(function (t) { return '<div class="ug-tile"><span>' + esc(t[0]) + '</span><b>' + ugNum(t[1]) + '</b></div>'; }).join('') + '</div>';
  }
  function ugFeedText(ty, k, x) { // returns [html, route]
    var t = ugTitle(k), card = t ? '<b>' + esc(t) + '</b> <span class="mono ug-sku">' + esc(k) + '</span>' : '<span class="mono ug-sku">' + esc(k) + '</span>';
    var go = ugHasCard(k) ? pnRoute(k) : '';
    if (ty === 'open') return [k === 'resume' ? 'came back to the app' : 'opened the app', ''];
    if (ty === 'view') return ['browsed <b>' + esc(ugScreen(k)) + '</b>', ''];
    if (ty === 'card') return ['opened ' + card + (x === 'missing' ? ' <span class="ug-pill warn">no card</span>' : ''), go];
    if (ty === 'search') return ['searched <b>“' + esc(k) + '”</b> ' + (x === '0' ? '<span class="ug-pill warn">no results</span>' : '<span class="ug-dim">→ ' + esc(x) + ' result' + (x === '1' ? '' : 's') + '</span>'), ''];
    if (ty === 'scan') {
      if (x === 'card' || x === 'moved') return ['scanned ' + card, go];
      if (x === 'nocard') return ['scanned <span class="mono ug-sku">' + esc(k) + '</span> <span class="ug-pill warn">no card</span>', ''];
      return ['scanned an unknown barcode <span class="mono ug-sku">' + esc(k) + '</span>', ''];
    }
    if (ty === 'fav') return [(x === 'off' ? 'unfavorited ' : 'favorited ') + card, go];
    if (ty === 'share') return ['shared ' + card + ' <span class="ug-dim">' + (x === 'img' ? 'as an image' : x === 'link' ? 'as a link' : 'as text') + '</span>', go];
    if (ty === 'error') return ['hit an error <span class="ug-dim">' + esc(k) + (x ? ' · ' + esc(x) : '') + '</span>', ''];
    return [esc(ty) + ' ' + esc(k), ''];
  }
  function ugSkelHTML() { // R7 N14: the live card's shape while it loads (hero number + six tiles, text hidden)
    var t = '<div class="ug-tile skrow"><span class="skt">People</span><b class="skt">00</b></div>';
    return '<div class="ug-hero skrow" aria-hidden="true"><b class="skt">00</b><span class="skt">people using it right now</span></div>' +
      '<div class="ug-sub" aria-hidden="true"><span class="skt">Today so far</span></div><div class="ug-tiles" aria-hidden="true">' + t + t + t + t + t + t + '</div>';
  }
  function usageGate(msg) {
    render('<div class="card ug-gate"><div class="ug-gt">Team usage</div>' +
      '<div class="cc-sub">Live numbers on how the team uses ToolBox. Enter the admin key once on this device — it isn’t part of the app, so nobody else can open this.</div>' +
      '<input id="ug-key" class="cc-in" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Admin key">' +
      '<button id="ug-go" class="cc-btn">Unlock</button><div id="ug-gmsg" class="ug-gmsg">' + esc(msg || '') + '</div></div>');
    var inp = document.getElementById('ug-key'), go = document.getElementById('ug-go'), m = document.getElementById('ug-gmsg');
    function tryKey() {
      var k = (inp.value || '').trim(); if (!k) { inp.focus(); return; }
      go.disabled = true; go.textContent = 'Checking…'; m.textContent = '';
      ugApi('u_live', {}, function (j, err) {
        go.disabled = false; go.textContent = 'Unlock';
        if (j) { try { localStorage.setItem('tbx_uadm', k); } catch (e) {} UGD.live = j; UGD.liveAt = Date.now(); UGD.errL = ''; if ((location.hash || '').split('?')[0] === '#/usage') usageScreen(); return; }
        m.textContent = err === 'key' ? 'That key didn’t work.' : err === 'offline' ? 'You’re offline — try again with signal.' : 'Couldn’t reach the usage hub — try again.';
      }, k);
    }
    go.addEventListener('click', tryKey);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryKey(); });
  }
  function ugSelfHTML() { // this device on the dashboard foot: counted or not, and the switch
    if (UG_OFF === 'flag') return 'This device isn’t counted. <button class="footlink" id="ug-self-on">Count it again</button>';
    if (UG_OFF === 'fast') return 'This visit isn’t counted: it moved faster than a person.';
    if (UG_OFF) return 'This browser isn’t counted: it’s automated.';
    return '<button class="footlink" id="ug-self-off">Don’t count this device</button>';
  }
  function usageScreen() {
    setTitle('Team Usage', ''); backBtn.hidden = false;
    if (!UGH) { render(emptyHTML(ICON.chart, 'Usage isn’t set up', 'This build has no usage hub configured.', '')); return; }
    if (!ugAdmin()) { usageGate(''); return; }
    var gen = ++UGD.gen;
    render('<div class="ug">' +
      '<div class="card ug-live"><div class="ug-lh"><span class="ug-dot" aria-hidden="true"></span><span class="ug-lt">Live</span><span class="ug-upd" id="ug-upd"></span>' +
      '<button id="ug-rf" class="ct-help ug-rf" type="button" aria-label="Refresh">' + ICON.refresh + '</button></div>' +
      '<div id="ug-livebody"></div></div>' +
      '<div id="ug-rq" class="ug-rq"></div>' +
      '<div class="grouphead ug-gh">Latest activity</div><div class="card ug-feed" id="ug-feed"></div>' +
      '<div class="ug-filters" id="ug-filters"></div>' +
      '<div id="ug-period"></div>' +
      '<div class="ug-foot">Anonymous: each phone is a random id — no names, nothing typed into forms. Test and automated browsers are never counted.<br>' +
      '<span id="ug-self">' + ugSelfHTML() + '</span><br>' +
      '<button class="footlink" id="ug-forget">Forget the key on this device</button></div></div>');
    var root = content.querySelector('.ug');
    if (!root) return; // #/usage?q=… paints search results instead (render → resultsHTML): nothing of the dashboard to wire up
    var alive = function () { return gen === UGD.gen && (location.hash || '').split('?')[0] === '#/usage' && document.getElementById('ug-livebody'); };
    function drawLive() {
      if (!alive()) return;
      var L = UGD.live, body = document.getElementById('ug-livebody'), feed = document.getElementById('ug-feed');
      var upd = document.getElementById('ug-upd');
      if (upd) upd.textContent = UGD.busyL && !L ? 'loading…' : UGD.errL && !L ? '' : UGD.liveAt ? 'updated ' + sinceText(UGD.liveAt) + (UGD.errL ? ' · hub unreachable' : '') : '';
      if (!L) {
        body.innerHTML = UGD.busyL ? ugSkelHTML() :
          emptyHTML(ICON.offline, UGD.errL === 'offline' ? 'Offline' : 'Couldn’t reach the usage hub', 'Check your signal and tap Refresh.', '');
        feed.innerHTML = ''; return;
      }
      body.classList.toggle('ug-stale', !!UGD.busyL);
      var hrs = [], lbl = [], tips = [];
      for (var h = 0; h < 24; h++) {
        var v = h <= L.hourNow ? L.hours[h] : null;
        hrs.push(v); lbl.push(h % 6 === 0 ? ugHourLbl(h) : '');
        tips.push(ugHourLong(h) + ' · ' + (v == null ? 'still ahead' : v + (v === 1 ? ' person' : ' people')));
      }
      swapIn(body,
        '<div class="ug-hero"><b>' + L.now.n5 + '</b><span>' + (L.now.n5 === 1 ? 'person' : 'people') + ' using it right now' +
          (L.now.n15 > L.now.n5 ? '<br><em>' + L.now.n15 + ' in the last 15 minutes</em>' : '') + '</span></div>' +
        '<div class="ug-sub">Today so far</div>' +
        ugTiles([['People', L.today.devices], ['Sessions', L.today.sessions], ['Cards opened', L.today.cards], ['Searches', L.today.searches], ['Scans', L.today.scans], ['App opens', L.today.opens]]) +
        (L.today.zero ? '<div class="ug-note">' + L.today.zero + ' search' + (L.today.zero === 1 ? '' : 'es') + ' today found nothing — see the list below.</div>' : '') +
        '<div class="ug-sub">People by hour, today (Eastern)</div>' + ugColumns(hrs, lbl, tips, { hi: L.hourNow }) +
        ugTable(['Hour', 'People'], hrs.map(function (v, i) { return [ugHourLong(i), v == null ? '—' : v]; }).slice(0, L.hourNow + 1)));
      var R = L.recent || [];
      var FEED = UGD.more.feed ? 40 : 12;
      feed.innerHTML = R.length ? '<div class="ug-rows">' + R.slice(0, FEED).map(function (r) {
        var ft = ugFeedText(r[2], r[3], r[4]);
        return '<' + (ft[1] ? 'button type="button" data-go="' + esc(ft[1]) + '"' : 'div') + ' class="ug-ev">' +
          '<span class="ug-when">' + esc(ugAgo(r[0])) + '</span><span class="ug-what"><span class="ug-who">' + esc(ugDev(r[1], L.info[r[1]])) + '</span>' + ft[0] + '</span>' +
          (ft[1] ? '<span class="ct">&#x203A;</span>' : '') + '</' + (ft[1] ? 'button' : 'div') + '>';
      }).join('') + '</div>' + (R.length > FEED ? '<button type="button" class="ug-more" data-ug-more="feed">Show more &#x203A;</button>' : '') : '<div class="cc-empty">No activity yet.</div>';
    }
    function drawFilters() {
      var f = document.getElementById('ug-filters'); if (!f) return;
      f.innerHTML = [[1, 'Today'], [7, '7 days'], [30, '30 days']].map(function (p) {
        return '<button type="button" class="bochip ug-chip' + (UGD.days === p[0] ? ' on' : '') + '" data-ug-days="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '<label class="ug-incl"><input type="checkbox" id="ug-incl"' + (UGD.incl ? ' checked' : '') + '> Include my devices</label>';
    }
    function list(title, rows, empty) { // ten rows, the rest behind "Show all"
      var all = UGD.more[title] || rows.length <= 10;
      return '<div class="grouphead ug-gh">' + title + '</div><div class="card ug-list">' + (rows.length ? (all ? rows : rows.slice(0, 10)).join('') +
        (all ? '' : '<button type="button" class="ug-more" data-ug-more="' + esc(title) + '">Show all ' + rows.length + ' &#x203A;</button>') : '<div class="cc-empty">' + empty + '</div>') + '</div>';
    }
    function lrow(main, count, sub, go) {
      return '<' + (go ? 'button type="button" data-go="' + esc(go) + '"' : 'div') + ' class="ug-lr"><span class="ug-lm">' + main + (sub ? '<span class="ug-ls">' + sub + '</span>' : '') + '</span>' +
        '<span class="ug-lc">' + count + '</span>' + (go ? '<span class="ct">&#x203A;</span>' : '') + '</' + (go ? 'button' : 'div') + '>';
    }
    function ppl(n) { return n + (n === 1 ? ' person' : ' people'); }
    function drawPeriod() {
      if (!alive()) return;
      var el = document.getElementById('ug-period'), key = UGD.days + ':' + (UGD.incl ? 1 : 0), S = UGD.stats[key];
      if (!S) {
        el.innerHTML = UGD.busyS ? '<div class="cc-empty">Loading the ' + (UGD.days === 1 ? 'day' : UGD.days + '-day report') + '…</div>' :
          '<div class="cc-empty">Couldn’t load this report. <button class="footlink" data-ug-retry="1">Try again &#x203A;</button></div>';
        return;
      }
      var lbl = UGD.days === 1 ? 'Today' : 'Last ' + UGD.days + ' days', h = '';
      h += '<div class="card ug-pcard' + (UGD.busyS ? ' ug-stale' : '') + '"><div class="ug-sub">' + lbl + ' · as of ' + esc(sinceText(S.asOf)) + '</div>' +
        ugTiles([['People', S.devices], ['Sessions', S.sessions], ['Cards opened', S.counts.card], ['Searches', S.counts.search], ['Scans', S.counts.scan], ['Favorited', S.favs.on]]);
      if (S.days > 1) {
        var pd = S.perDay || [], today = pd.length - 1;
        h += '<div class="ug-sub">People per day</div>' +
          ugColumns(pd.map(function (x) { return x.devices; }), pd.map(function (x, i) { return (S.days <= 7 || i % 7 === today % 7) ? ugDayLbl(x.d) : ''; }),
            pd.map(function (x) { return ugDayLbl(x.d, true) + ' · ' + ppl(x.devices) + ' · ' + x.sessions + ' session' + (x.sessions === 1 ? '' : 's'); }), { hi: today }) +
          ugTable(['Day', 'People', 'Sessions', 'Cards', 'Searches', 'Scans'], pd.slice().reverse().map(function (x) { return [ugDayLbl(x.d, true), x.devices, x.sessions, x.cards, x.searches, x.scans]; }));
      }
      h += '</div>';
      h += list('Most opened cards', (S.topCards || []).map(function (c, i) {
        var t = ugTitle(c.k);
        return lrow('<b>' + (i + 1) + '. ' + esc(t || c.k) + '</b>', ugNum(c.n), '<span class="mono">' + esc(c.k) + '</span> · ' + ppl(c.dev), ugHasCard(c.k) ? pnRoute(c.k) : '');
      }), 'No cards opened yet.');
      h += list('Top searches', (S.topSearches || []).map(function (s) {
        return lrow('<b>“' + esc(s.k) + '”</b>' + (s.res === '0' ? ' <span class="ug-pill warn">no results</span>' : ''), ugNum(s.n), ppl(s.dev) + (s.res && s.res !== '0' ? ' · ' + esc(s.res) + ' results' : ''), '');
      }), 'No searches yet.');
      h += list('Searches that found nothing', (S.zeroSearches || []).map(function (s) {
        return lrow('<b>“' + esc(s.k) + '”</b>', ugNum(s.n), ppl(s.dev), '');
      }), 'Every search found something.');
      var sc = S.scans || {}, st = (sc.card || 0) + (sc.moved || 0) + (sc.nocard || 0) + (sc.unknown || 0);
      h += list('Scans', [lrow('<b>Opened a card</b>', ugNum((sc.card || 0) + (sc.moved || 0)), '', ''),
        lrow('<b>Part number with no card</b>', ugNum(sc.nocard || 0), '', ''),
        lrow('<b>Barcode not recognized</b>', ugNum(sc.unknown || 0), '', '')].concat((S.noCard || []).map(function (x) {
          return lrow('<span class="mono">' + esc(x.k) + '</span> ' + (x.kind === 'nocard' ? '<span class="ug-pill warn">no card</span>' : '<span class="ug-pill">unknown barcode</span>'), ugNum(x.n), ppl(x.dev), '');
        })), 'No scans yet.').replace('<div class="card ug-list">', '<div class="card ug-list"><div class="ug-sub">' + ugNum(st) + ' scan' + (st === 1 ? '' : 's') + '</div>');
      h += list('Most visited screens', (S.screens || []).map(function (s) { return lrow('<b>' + esc(ugScreen(s.k)) + '</b>', ugNum(s.n), ppl(s.dev), ''); }), 'Nothing yet.');
      var fv = S.favs || {}, sh = S.shares || {};
      h += list('Favorites & shares', [lrow('<b>Favorites added</b>', ugNum(fv.on || 0), (fv.off ? fv.off + ' removed' : ''), ''),
        lrow('<b>Cards shared</b>', ugNum((sh.img || 0) + (sh.link || 0) + (sh.copy || 0)), (sh.img || 0) + ' image · ' + (sh.link || 0) + ' link · ' + (sh.copy || 0) + ' text', '')]
        .concat((S.topFavs || []).map(function (c) { var t = ugTitle(c.k); return lrow(ICON.starOn + ' ' + esc(t || c.k), ugNum(c.n), '<span class="mono">' + esc(c.k) + '</span>', ugHasCard(c.k) ? pnRoute(c.k) : ''); })), '');
      h += list('Phones & app versions', (S.platforms || []).map(function (p) { return lrow('<b>' + esc(p.k) + '</b>', ugNum(p.n), '', ''); })
        .concat((S.versions || []).map(function (v) { return lrow('App v' + esc(v.k) + (v.k === APPVER ? ' <span class="ug-pill ok">current</span>' : ''), ugNum(v.n), '', ''); })), 'No devices yet.');
      h += list('Most active phones', (S.deviceList || []).slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 12).map(function (d) {
        return lrow('<b>' + esc(ugDev(d.d, d.i)) + '</b>', ugNum(d.n), d.sess + ' session' + (d.sess === 1 ? '' : 's') + ' · ' + d.cards + ' cards · ' + d.searches + ' searches · last seen ' + esc(sinceText(d.last)), '');
      }), 'No devices yet.');
      if ((S.errors || []).length) h += list('Errors on phones', S.errors.map(function (e) { return lrow('<span class="ug-err">' + esc(e.k) + '</span>', ugNum(e.n), esc(e.at || '') + ' · ' + ppl(e.dev) + ' · last ' + esc(sinceText(e.last)), ''); }), '');
      el.innerHTML = h;
    }
    function loadLive() {
      if (UGD.busyL) return; UGD.busyL = true; drawLive();
      ugApi('u_live', { incl: UGD.incl ? 1 : 0 }, function (j, err) {
        UGD.busyL = false;
        if (err === 'key') { try { localStorage.removeItem('tbx_uadm'); } catch (e) {} if (alive()) usageGate('The saved key stopped working — enter it again.'); return; }
        if (j) { UGD.live = j; UGD.liveAt = Date.now(); UGD.errL = ''; } else UGD.errL = err;
        drawLive();
      });
    }
    function loadStats(fresh) {
      var key = UGD.days + ':' + (UGD.incl ? 1 : 0);
      if (UGD.busyS) return; UGD.busyS = true; drawPeriod();
      ugApi('u_stats', { days: UGD.days, incl: UGD.incl ? 1 : 0, fresh: fresh ? 1 : 0 }, function (j, err) {
        UGD.busyS = false;
        if (j) { UGD.stats[key] = j; UGD.statsAt[key] = Date.now(); UGD.errS = ''; } else UGD.errS = err;
        drawPeriod();
        if (UGD.qPend) { var qf = UGD.qPend === 2; UGD.qPend = 0; loadQueue(qf); } // N9: the queue's 30-day read follows the report's, not beside it
        if (key !== UGD.days + ':' + (UGD.incl ? 1 : 0)) loadStats(false); // the period changed while this was loading
      });
    }
    function statsStale() { var k = UGD.days + ':' + (UGD.incl ? 1 : 0); return !UGD.stats[k] || Date.now() - (UGD.statsAt[k] || 0) > (UGD.days === 1 ? 60000 : 300000); }

    // ---- N9 "To review": searches, barcodes and part numbers people didn't find in the last 30 days (u_queue), ranked by
    // people then tries, with Search it / Copy / Done / Ignore / Note. Every value from the hub is escaped; buttons carry an
    // index into RQV (the rows on screen), never a key. An older hub (no u_queue) gets one quiet line instead.
    var RQT = [['search', 'Searches'], ['barcode', 'Barcodes'], ['part', 'Missing cards']];
    var RQI = { search: 'Searches that still find nothing, most people first. Add a keyword, an alias or a card, then tap Done.',
      barcode: 'Barcodes the scanner didn’t recognize. Look them up with the FDA lookup, then add them to the next barcode update.',
      part: 'Part numbers scanned or opened from a link that have no card.' };
    var RQE = { search: 'Every search in the last 30 days found something.', barcode: 'No unknown barcodes in the last 30 days.',
      part: 'No part numbers without a card in the last 30 days.' };
    var RQV = [], chk = null;
    function rqStale() { return Date.now() >= (UGD.qNext || 0) && (UGD.qIncl !== (UGD.incl ? 1 : 0) || Date.now() - UGD.qAt > 300000); }
    function rqDay(ts) { var d = new Date(typeof ts === 'number' ? ts : Date.parse(ts)); return isNaN(d.getTime()) ? '' : BO_MON[d.getMonth()] + ' ' + d.getDate(); }
    function rqNow(t, r) { // what this phone's catalog says now: shipped data and barcode maps only, never its own taught barcodes
      var id = rqId(t, r), e = null, sku = '';
      if (UGD.qNow.hasOwnProperty(id)) return UGD.qNow[id];
      if (t === 'search') return undefined;                    // searchAll costs 25–80 ms a term: rqCheck does these one per tick
      if (t === 'barcode') {
        if (/^\d{14}$/.test(r.k)) sku = (window.TBX_GTIN14 || {})[r.k] || (window.TBX_GTIN || {})[r.k.slice(1, 13)] || '';
        else e = BYPN[nrm(r.k)] || BYPNZ[nrm(r.k).replace(/^0+/, '')];
      } else e = BYPN[nrm(r.k)] || BYPNZ[String(r.id || '')];
      if (e) sku = skuOf(e) || '';
      return (UGD.qNow[id] = sku ? { sku: sku } : null);
    }
    function rqOpen(t, r) { // needs a look: no decision yet, "todo", or done but it happened again and this phone still can't answer it
      if (!r.st || r.st === 'todo') return true;
      return r.st === 'done' && !!r.back && !rqNow(t, r);
    }
    function rqGtins() { return ((UGD.q && UGD.q.barcode) || []).filter(function (r) { return /^\d{14}$/.test(r.k) && rqOpen('barcode', r); }).map(function (r) { return r.k; }); }
    function rqCheck() { // "now finds N": one catalog search per tick, only for the rows on screen and "back" rows, then one redraw
      if (chk || !UGD.q) return;
      var want = [], seen = {};
      var add = function (k) { var id = 'search\t' + k; if (!seen[id] && !UGD.qNow.hasOwnProperty(id)) { seen[id] = 1; want.push(k); } };
      (UGD.q.search || []).forEach(function (r) { if (r.st === 'done' && r.back) add(r.k); });
      RQV.forEach(function (x) { if (x.t === 'search') add(x.r.k); });
      if (!want.length) return;
      chk = setTimeout(function step() {
        chk = null;
        if (!alive()) return;
        var k = want.shift(), n = 0;
        try { n = searchAll(k).length; } catch (e) {}
        UGD.qNow['search\t' + k] = n ? { n: n } : null;
        if (want.length) chk = setTimeout(step, 0); else drawQueue();
      }, 0);
    }
    function rqRow(t, r, i) {
      var open = rqOpen(t, r), now = rqNow(t, r), p = '', sub = [], a = '';
      var b = function (act, label) { return '<button type="button" class="ug-rqb" data-rq-act="' + act + '" data-rq-i="' + i + '">' + label + '</button>'; };
      if (open && r.st === 'done' && r.back) p += ' <span class="ug-pill warn">Back</span>';
      if (now) p += ' <span class="ug-pill ok">' + (t === 'search' ? 'Now finds ' + (+now.n || 0) : t === 'barcode' ? 'Maps to ' + esc(now.sku) : 'Has a card now') + '</span>';
      if (!open) p += ' <span class="ug-pill">' + (r.st === 'ignore' ? 'Ignored' : 'Done') + '</span>';
      sub.push(ppl(+r.dev || 0));
      if (t === 'search') { sub.push(plural(+r.n || 0, 'try', 'tries')); if (r.ok) sub.push((+r.ok || 0) + ' found something'); }
      else if (t === 'barcode') sub.push(plural(+r.n || 0, 'scan'));
      else { if (r.scan) sub.push('scanned ' + (+r.scan || 0)); if (r.link) sub.push('from a link ' + (+r.link || 0)); }
      sub.push('last ' + sinceText(r.last));
      if (r.first && rqDay(r.first) !== rqDay(r.last)) sub.push('since ' + rqDay(r.first));
      if (r.st === 'done' && r.back) sub.push('done ' + rqDay(r.at) + ' — asked again since');
      if (r.note) sub.push('“' + r.note + '”');
      if (UGD.qEdit === rqId(t, r)) {
        a = '<div class="ug-rqe"><input id="ug-rqnote" class="cc-in" type="text" maxlength="140" autocomplete="off" placeholder="A note for yourself" aria-label="Note" value="' + esc(r.note || '') + '">' +
          b('save', 'Save') + b('cancel', 'Cancel') + '</div>';
      } else {
        if (t !== 'barcode') a += b('go', 'Search it');
        if (now && now.sku) a += b('card', 'Open card');
        a += '<button type="button" class="ug-rqb" data-copy="' + esc(r.k) + '">Copy</button>';
        a += open ? b('done', 'Done') + b('ignore', 'Ignore') : b('reopen', 'Reopen');
        a += b('note', r.note ? 'Edit note' : 'Note');
        a = '<div class="ug-rqa">' + a + '</div>';
      }
      return '<div class="ug-rqr' + (open ? '' : ' closed') + '"><div class="ug-rqm">' + (t === 'search' ? '<b>“' + esc(r.k) + '”</b>' : '<span class="mono">' + esc(r.k) + '</span>') + p + '</div>' +
        '<div class="ug-rqs">' + sub.map(esc).join(' · ') + '</div>' + a + '</div>';
    }
    function drawQueue() {
      var el = document.getElementById('ug-rq');
      if (!el || !alive()) return;
      if (UGD.qEdit && el.querySelector('#ug-rqnote')) return;  // a note being typed is never wiped by a refresh (redrawn on Save / Cancel)
      var Q = UGD.q, tab = UGD.qTab, head = '<div class="grouphead ug-gh">To review · last 30 days</div>';
      if (!Q) {
        RQV = [];
        el.innerHTML = UGD.qOff ? '<div class="grouphead ug-gh">To review</div><div class="ug-rqoff">The review list needs the usage-hub update.</div>' :
          head + '<div class="card ug-list">' + (UGD.qErr && !UGD.qBusy ? '<div class="cc-empty">Couldn’t load the review list. <button type="button" class="footlink" data-rq-act="retry">Try again &#x203A;</button></div>' :
            '<div class="cc-empty">Loading the review list…</div>') + '</div>';
        return;
      }
      var open = {}, list = Q[tab] || [], rows = [], closed = 0, h;
      RQT.forEach(function (x) { open[x[0]] = (Q[x[0]] || []).filter(function (r) { return rqOpen(x[0], r); }).length; });
      list.forEach(function (r) { var o = rqOpen(tab, r); if (!o) closed++; if (o || UGD.qAll) rows.push(r); });
      var all = UGD.qMore[tab] || rows.length <= 10, shown = all ? rows : rows.slice(0, 10), gt = tab === 'barcode' ? rqGtins().length : 0;
      RQV = shown.map(function (r) { return { t: tab, r: r }; });
      h = head + '<div class="card ug-list ug-rqcard' + (UGD.qBusy || UGD.qIncl !== (UGD.incl ? 1 : 0) ? ' ug-stale' : '') + '">' +
        '<div class="ug-rqc" role="group" aria-label="Review lists">' + RQT.map(function (x) {
          return '<button type="button" class="bochip ug-chip' + (x[0] === tab ? ' on' : '') + '" data-rq-tab="' + x[0] + '" aria-pressed="' + (x[0] === tab) + '">' + x[1] + '<b>' + open[x[0]] + '</b></button>';
        }).join('') + '</div><div class="ug-rqi">' + RQI[tab] + '</div>';
      h += shown.length ? shown.map(function (r, i) { return rqRow(tab, r, i); }).join('') :
        '<div class="cc-empty">' + (closed ? 'Nothing open here — ' + closed + ' done or ignored.' : RQE[tab]) + '</div>';
      if (!all) h += '<button type="button" class="ug-more" data-rq-act="more">Show all ' + rows.length + ' &#x203A;</button>';
      if ((+(Q.tot || {})[tab] || 0) > list.length) h += '<div class="ug-rqi">Showing the top ' + list.length + ' of ' + (+Q.tot[tab]) + '.</div>';
      if (closed || gt) h += '<div class="ug-rqf">' + (closed ? '<label class="ug-incl ug-rqt"><input type="checkbox" id="ug-rqall"' + (UGD.qAll ? ' checked' : '') + '> Show done &amp; ignored (' + closed + ')</label>' : '') +
        (gt ? '<button type="button" class="footlink ug-rqg" data-rq-act="gtins">Copy GTINs for the FDA lookup &#x203A;</button>' : '') + '</div>';
      el.innerHTML = h + '</div>';
      rqCheck();
    }
    function loadQueue(fresh) {
      if (UGD.qBusy) return;
      var incl = UGD.incl ? 1 : 0, t0 = Date.now();
      UGD.qBusy = true; drawQueue();
      ugApi('u_queue', { days: 30, incl: incl, fresh: fresh ? 1 : 0 }, function (j, err) {
        UGD.qBusy = false; UGD.qNext = 0;
        if (err === 'key') { try { localStorage.removeItem('tbx_uadm'); } catch (e) {} UGD.q = null; if (alive()) usageGate('The saved key stopped working — enter it again.'); return; }
        if (j) { rqApply(j, t0); UGD.q = j; UGD.qIncl = incl; UGD.qAt = Date.now(); UGD.qErr = ''; UGD.qOff = false; }
        else if (err === 'action') { UGD.q = null; UGD.qIncl = incl; UGD.qAt = Date.now(); UGD.qErr = ''; UGD.qOff = true; } // hub older than the review queue
        else { UGD.qErr = err || 'bad'; UGD.qNext = Date.now() + 60000; }                                                      // on its own again in a minute
        if (UGD.qDraw) UGD.qDraw();
        if (incl !== (UGD.incl ? 1 : 0)) loadQueue(false); // "Include my devices" changed while this was loading
      });
    }
    function rqAct(act, x) {
      if (UGD.qEdit && act !== 'save' && act !== 'note') { UGD.qEdit = ''; if (act !== 'cancel') drawQueue(); } // any other tap closes an open note
      if (act === 'retry') { loadQueue(false); return; }
      if (act === 'more') { UGD.qMore[UGD.qTab] = true; drawQueue(); return; }
      if (act === 'gtins') { var g = rqGtins(); copyToClip(JSON.stringify(g)).then(function () { toastMsg('Copied ' + plural(g.length, 'GTIN') + ' for the FDA lookup', 2400); }); return; }
      if (!x) return;
      var t = x.t, r = x.r;
      if (act === 'go') { UG.mute = Date.now(); location.hash = '#/?q=' + encodeURIComponent(r.k); return; } // a look, not a search: nothing is logged
      if (act === 'card') { var nw = rqNow(t, r); if (nw && nw.sku) location.hash = pnRoute(nw.sku); return; }
      if (act === 'done') { rqMark(t, r, 'done', null, 'Marked done', true); return; }
      if (act === 'ignore') { rqMark(t, r, 'ignore', null, 'Ignored', true); return; }
      if (act === 'reopen') { rqMark(t, r, 'todo', null, 'Reopened', true); return; }
      if (act === 'cancel') { UGD.qEdit = ''; drawQueue(); return; }
      if (act === 'note') {
        UGD.qEdit = rqId(t, r); drawQueue();
        var inp = document.getElementById('ug-rqnote'); // focused inside the tap, so the iPhone keyboard comes up
        if (inp) { try { inp.focus({ preventScroll: true }); var n = inp.value.length; inp.setSelectionRange(n, n); } catch (eF) {} }
        return;
      }
      if (act === 'save') {
        var v = ((document.getElementById('ug-rqnote') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 140);
        UGD.qEdit = '';
        rqMark(t, r, rqOpen(t, r) ? 'todo' : r.st, v, 'Note saved', false); // an open row stays open, a closed one closed
      }
    }
    UGD.qDraw = drawQueue; UGD.qEdit = ''; // a fresh dashboard never opens with a note half-typed
    drawLive(); drawFilters(); drawPeriod(); drawQueue();
    if (!UGD.live || Date.now() - UGD.liveAt > 10000) loadLive();
    var qStale = rqStale();
    if (statsStale()) { if (qStale && !UGD.qBusy) UGD.qPend = 1; loadStats(false); }
    else if (qStale) setTimeout(function () { if (alive() && rqStale() && !UGD.qBusy) loadQueue(false); }, 1500); // stats from memory
    var tick = setInterval(function () {
      if (!alive()) { clearInterval(tick); return; }
      if (document.hidden) return;
      if (Date.now() - UGD.liveAt >= 20000) loadLive(); else drawLive(); // live every 20 s; relabel "updated …" between
      if (statsStale()) loadStats(false);
      else if (rqStale() && !UGD.qBusy && !UGD.qPend && !UGD.qMarks.length && !UGD.qEdit) loadQueue(false); // the queue every 5 min
    }, 5000);
    root.addEventListener('click', function (e) {
      var t = e.target;
      var d = t.closest && t.closest('[data-ug-days]');
      if (d) { UGD.days = +d.getAttribute('data-ug-days'); drawFilters(); drawPeriod(); if (statsStale()) loadStats(false); return; }
      if (t.closest && t.closest('#ug-rf')) { var rf = document.getElementById('ug-rf'); rf.classList.add('spin'); setTimeout(function () { rf.classList.remove('spin'); }, 800); UGD.liveAt = 0; loadLive(); UGD.qPend = 2; loadStats(true); return; }
      if (t.closest && t.closest('[data-ug-retry]')) { loadStats(false); return; }
      var mo = t.closest && t.closest('[data-ug-more]');
      if (mo) { var mk = mo.getAttribute('data-ug-more'); UGD.more[mk] = true; if (mk === 'feed') drawLive(); else drawPeriod(); return; }
      if (t.closest && t.closest('#ug-self-off')) {
        try { localStorage.setItem('tbx_unotrack', '1'); } catch (e5) {}
        ugHalt('flag'); var so = document.getElementById('ug-self'); if (so) so.innerHTML = ugSelfHTML(); return;
      }
      if (t.closest && t.closest('#ug-self-on')) {
        try { localStorage.removeItem('tbx_unotrack'); } catch (e6) {}
        UG_OFF = ugOffWhy(); var sn = document.getElementById('ug-self'); if (sn) sn.innerHTML = ugSelfHTML(); return;
      }
      if (t.closest && t.closest('#ug-forget')) {
        try { localStorage.removeItem('tbx_uadm'); } catch (e2) {}
        UGD.live = null; UGD.stats = {}; UGD.q = null; UGD.qIncl = -1; UGD.qAt = 0; UGD.qOff = false; UGD.qErr = ''; UGD.qEdit = ''; UGD.qOver = {}; UGD.qMarks = [];
        usageGate('Key removed from this device.'); return;
      }
      var rt = t.closest && t.closest('[data-rq-tab]');
      if (rt) { UGD.qTab = rt.getAttribute('data-rq-tab'); UGD.qEdit = ''; drawQueue(); return; }
      var ra = t.closest && t.closest('[data-rq-act]');
      if (ra) { rqAct(ra.getAttribute('data-rq-act'), RQV[+ra.getAttribute('data-rq-i')]); return; }
      var col = t.closest && t.closest('.ug-col');
      if (col) { ugTipShow(col); return; }
    });
    root.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'ug-incl') {
        UGD.incl = !!e.target.checked; UGD.liveAt = 0; loadLive(); drawPeriod(); drawQueue();
        if (statsStale()) { UGD.qPend = 1; loadStats(false); } else loadQueue(false); // the queue follows "Include my devices" too
      }
      if (e.target && e.target.id === 'ug-rqall') { UGD.qAll = !!e.target.checked; UGD.qEdit = ''; drawQueue(); }
    });
    root.addEventListener('keydown', function (e) {
      if (!e.target || e.target.id !== 'ug-rqnote') return;
      if (e.key === 'Enter') { e.preventDefault(); var sv = root.querySelector('.ug-rqe [data-rq-act="save"]'); if (sv) sv.click(); }
      else if (e.key === 'Escape') { UGD.qEdit = ''; drawQueue(); }
    });
    root.addEventListener('mouseover', function (e) { var col = e.target.closest && e.target.closest('.ug-col'); if (col) ugTipShow(col); });
    root.addEventListener('focusin', function (e) { var col = e.target.closest && e.target.closest('.ug-col'); if (col) ugTipShow(col); });
    root.addEventListener('mouseleave', function () { var ts = root.querySelectorAll('.ug-tip'); for (var i = 0; i < ts.length; i++) ts[i].hidden = true; });
  }
  function ugTipShow(col) {
    var ch = col.closest('.ug-chart'), tip = ch && ch.querySelector('.ug-tip'); if (!tip) return;
    var cols = ch.querySelectorAll('.ug-col'); for (var i = 0; i < cols.length; i++) cols[i].classList.toggle('on', cols[i] === col);
    tip.textContent = col.getAttribute('data-tip') || '';
    tip.hidden = false;
    var cr = ch.getBoundingClientRect(), br = col.getBoundingClientRect(), w = tip.offsetWidth || 120;
    tip.style.left = Math.max(0, Math.min(cr.width - w, br.left - cr.left + br.width / 2 - w / 2)) + 'px';
  }

  // ---- favorites (per device) with permalink migration ----
  function favs() { try { return JSON.parse(localStorage.getItem('tbx_favs') || '[]'); } catch (e) { return []; } }
  (function migrateFavs() {
    var list = favs(), changed = false;
    list.forEach(function (f) {
      var sku = f.it && f.it.sku;
      if (sku && f.route !== pnRoute(sku)) { f.route = pnRoute(sku); changed = true; }
    });
    if (changed) { try { localStorage.setItem('tbx_favs', JSON.stringify(list)); } catch (e) {} }
  })();
  function isFav(route) { return favs().some(function (f) { return f.route === route; }); }
  function toggleFav(f) {
    var list = favs();
    if (list.some(function (x) { return x.route === f.route; })) {
      list = list.filter(function (x) { return x.route !== f.route; });
    } else { list.unshift(f); }
    try { localStorage.setItem('tbx_favs', JSON.stringify(list.slice(0, 40))); } catch (e) {}
    try { ugEv('fav', (f.it && f.it.sku) || f.pn || decodeURIComponent(String(f.route || '').replace(/^#\/pn\//, '')), isFav(f.route) ? 'on' : 'off'); } catch (eUg) {}
  }

  // ---- copy ----
  function copy(text, btn) { // P18: through the toast queue; R7 N12: the card's Copy icon turns into a check mark for 1.2 s instead
    copyToClip(text).then(function () {
      if (btn && btn.classList && btn.classList.contains('cd-copy')) {
        btn.classList.add('done'); btn.setAttribute('aria-label', 'Copied');
        clearTimeout(btn.__done); btn.__done = setTimeout(function () { btn.classList.remove('done'); btn.setAttribute('aria-label', 'Copy part number'); }, 1200);
        return;
      }
      toastMsg('Copied', 1200);
    });
  }

  document.addEventListener('click', function (e) {
    var gp = document.getElementById('glosspanel');
    if (!gp) return;
    var gt = e.target.closest('.gterm');
    if (gt) {
      var key = gt.getAttribute('data-g');
      gp.innerHTML = '<b>' + esc(key) + '</b>' + esc(GLOSS[key] || '');
      gp.hidden = false; document.body.classList.add('gloss-on'); e.stopPropagation(); return;
    }
    if (!gp.hidden) { gp.hidden = true; document.body.classList.remove('gloss-on'); if (e.target.closest('#glosspanel')) return; } // P18: close AND act on the tap
    var fc = e.target.closest('[data-filt]');
    if (fc) {
      var ft = fc.getAttribute('data-filt');
      if (FILT[ft]) { delete FILT[ft]; }
      else {
        var XG = [['Needled', 'Non-needled'], ['Sliding', 'Non-sliding']];
        XG.forEach(function (g) {
          if (g.indexOf(ft) !== -1) g.forEach(function (o) { if (o !== ft) delete FILT[o]; });
        });
        FILT[ft] = 1;
        if (CURCOUNT && CURCOUNT() === 0) { var fp0 = FILT.fp; FILT = {}; FILT[ft] = 1; if (fp0) FILT.fp = fp0; }
      }
      if (CURVIEW) CURVIEW();
      stWrite(); // P5: the chips live in the entry's URL (?t=…) as well as its record
      return;
    }
    var fpc = e.target.closest('[data-fp]');
    if (fpc) {
      FILT.fp = fpc.getAttribute('data-fp');
      stWrite(); // ?fp=… (keeps the entry's nav id)
      if (CURVIEW) CURVIEW();
      return;
    }
    var b = e.target.closest('[data-copy]'); if (b) { copy(b.getAttribute('data-copy'), b); return; }
    var uf = e.target.closest('[data-unfav-route]');
    if (uf) {
      var rt = uf.getAttribute('data-unfav-route');
      var wasFav = favs().filter(function (x) { return x.route === rt; })[0];
      try { localStorage.setItem('tbx_favs', JSON.stringify(favs().filter(function (x) { return x.route !== rt; }))); } catch (e2) {}
      try { ugEv('fav', (wasFav && wasFav.it && wasFav.it.sku) || decodeURIComponent(rt.replace(/^#\/pn\//, '')), 'off'); } catch (eUg) {}
      var uw = uf.closest('.rowwrap');
      if (uw) { uf.innerHTML = ICON.star; uf.classList.add('off'); } else uf.hidden = true; // P14: "Remove from Favorites" on the not-found screen
      setTimeout(function () {
        if (uw) uw.classList.add('bye');
        setTimeout(function () { if (content.classList.contains('homeview')) home(); }, 280);
      }, 240);
      if (wasFav) toastMsg('Removed from Favorites', 3000, { action: { label: 'Undo', fn: function () { toggleFav(wasFav); if (content.classList.contains('homeview')) home(); else if (!uw) uf.hidden = false; } } });
      return;
    }
    var fa = e.target.closest('[data-favall]');
    if (fa) { navX().favAll = fa.getAttribute('data-favall') === '1'; home(); return; } // P37: per history entry — Back keeps it open
    var fso = e.target.closest('[data-fsort]');
    if (fso) { try { localStorage.setItem('tbx_fsort', fso.getAttribute('data-fsort')); } catch (e8) {} home(); return; }
    var cr = e.target.closest('[data-clearrec]');
    if (cr) {
      var hadRec = recents();
      try { localStorage.removeItem('tbx_recents'); } catch (e6) {}
      if (hadRec.length) toastMsg('Recents cleared', 3000, { action: { label: 'Undo', fn: function () { try { localStorage.setItem('tbx_recents', JSON.stringify(hadRec)); } catch (e9) {} if (content.classList.contains('homeview')) home(); } } });
      var rws = content.querySelectorAll('[data-unrec]');
      for (var ri = 0; ri < rws.length; ri++) { var rw = rws[ri].closest('.rowwrap'); if (rw) rw.classList.add('bye'); }
      setTimeout(function () { if (content.classList.contains('homeview')) home(); }, 300);
      return;
    }
    var ur = e.target.closest('[data-unrec]');
    if (ur) {
      var sk = ur.getAttribute('data-unrec');
      var hadRec2 = recents();
      try {
        localStorage.setItem('tbx_recents', JSON.stringify(recents().filter(function (x) { return x.sku !== sk; })));
      } catch (e3) {}
      toastMsg('Removed from Recents', 3000, { action: { label: 'Undo', fn: function () { try { localStorage.setItem('tbx_recents', JSON.stringify(hadRec2)); } catch (e9) {} if (content.classList.contains('homeview')) home(); } } });
      var uw2 = ur.closest('.rowwrap');
      if (uw2) uw2.classList.add('bye');
      setTimeout(function () { if (content.classList.contains('homeview')) home(); }, 300);
      return;
    }
    var fv = e.target.closest('[data-fav]');
    if (fv) {
      var f = JSON.parse(fv.getAttribute('data-fav'));
      toggleFav(f);
      if (fv.classList.contains('cd-ico')) {
        var favNow = isFav(f.route); fv.classList.toggle('on', favNow); fv.setAttribute('aria-pressed', String(favNow));
        fv.classList.remove('pop', 'unpop'); void fv.offsetWidth; fv.classList.add(favNow ? 'pop' : 'unpop'); // N12: pop + burst / shrink
        clearTimeout(fv.__pop); fv.__pop = setTimeout(function () { fv.classList.remove('pop', 'unpop'); }, 460);
        toastMsg(favNow ? 'Added to Favorites' : 'Removed from Favorites', 1600); return;
      }
      fv.classList.toggle('on', isFav(f.route));
      fv.innerHTML = isFav(f.route) ? ICON.starOn + 'Favorited' : ICON.star + 'Favorite';
      return;
    }
    var lm = e.target.closest('[data-lmenu]');
    if (lm) { openLinkMenu(JSON.parse(lm.getAttribute('data-lmenu'))); return; }
    var nav = e.target.closest('[data-go]');
    if (nav) {
      var go = nav.getAttribute('data-go');
      // variant chips ('chip link') swap the card in place, so Back exits to the list, not the prior variant
      var ti = nav.classList.contains('rowitem') && /^#\/pn\//.test(go) ? nav.querySelector('.ti') : null;
      VT_FROM = ti || null;
      VT_CAT = (!ti && !CURQ && nav.classList.contains('tile') && CATGO[go]) ? nav : null;
      if (nav.classList.contains('link')) { history.replaceState(null, '', go); route(); }
      else location.hash = go;
    }
  });

  // ---- search index ----
  var IMPLANT_CATS = ['Iconix', 'Artelon', 'Corkscrew Anchors', 'NanoTack',
    'Knee/Meniscus Anchors', 'Knotless Anchors', 'Other', 'Screws'];
  var INDEX = [];
  function wordsOf(s) {
    var seen = {}, out = [];
    String(s || '').toUpperCase().split(/[^A-Z0-9]+/).forEach(function (w) {
      if (w.length > 2 && !seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out;
  }
  function bucketsOf(it) {
    var b = [], cats = [it.cat, it.cat2].filter(Boolean);
    cats.forEach(function (c) {
      if (c === 'Instruments' && b.indexOf('Instruments') === -1) b.push('Instruments');
      if (c === 'Capital' && b.indexOf('Capital') === -1) b.push('Capital');
      if (c === 'Disposables' && b.indexOf('Disposables') === -1) b.push('Disposables');
      if (c === 'Allografts & Biologics' && b.indexOf('Biologics') === -1) b.push('Biologics');
      if (c === 'Suture' && b.indexOf('Suture') === -1) b.push('Suture');
      if (IMPLANT_CATS.indexOf(c) !== -1 && b.indexOf('Implants') === -1) b.push('Implants');
    });
    if (it.fam === 'CrossFlow arthroscopy pump' && b.indexOf('Arthroscopy') === -1) b.push('Arthroscopy');
    return b;
  }
  D.items.forEach(function (it) {
    if (it.hidden) return;
    var sl = slOf(it);
    var extra = (it.specs || []).map(function (s) { return s[1]; }).join(' ') + ' ' + (it.alt || []).join(' ') +
      (sl === 'Sliding' ? ' sliding' : '') + (/^Non-sliding/.test(sl) ? ' nonsliding locked' : '');
    var raw = (it.name || '') + ' ' + it.sku + ' ' + it.fam + ' ' + (it.sub || '') + ' ' + it.cat + ' ' + extra;
    INDEX.push({ hay: nrm(raw), skun: nrm(it.sku), buckets: bucketsOf(it), raw: raw,
      it: it, rec: it, sub: it.cat + ' · ' + it.fam, route: pnRoute(it.sku) });
  });
  D.probes.forEach(function (p) {
    var raw = p.name + ' ' + p.sku + ' probe wand serfas arthro ' + p.fam;
    INDEX.push({ hay: nrm(raw), skun: nrm(p.sku), buckets: ['Arthroscopy'], raw: raw,
      it: { t: p.name, sku: p.sku, uom: p.uom, tags: p.tags }, rec: p, sub: 'SERFAS RF Wands · ' + p.fam, route: pnRoute(p.sku) });
  });
  D.shavers.forEach(function (s) {
    var raw = s.name + ' ' + s.sku + ' shaver blade bur';
    INDEX.push({ hay: nrm(raw), skun: nrm(s.sku), buckets: ['Arthroscopy'], raw: raw,
      it: { t: s.name, sku: s.sku, uom: s.uom, tags: s.tags }, rec: s, sub: 'Shaver blades', route: pnRoute(s.sku) });
  });
  INDEX.forEach(function (e) { e.skuz = e.skun.replace(/^0+/, ''); });

  // ---- search spec filters (field-based: they read the card's own fields, never the free-text haystack) ----
  var SPECF = {};
  var FACETLBL = { dia: 'Diameter', len: 'Length', mat: 'Material', atype: 'Anchor type', needle: 'Needle', strands: 'Strands', stype: 'Suture', ssize: 'Size', slen: 'Length' };
  var BUCKETFACETS = {
    Implants: ['dia', 'len', 'mat', 'atype', 'needle', 'strands', 'stype'],
    Suture: ['ssize', 'slen', 'needle', 'stype'],
    Instruments: ['dia'], Disposables: ['dia'], Arthroscopy: ['dia'], Biologics: [], Capital: []
  };
  function spv(r, k) { var v = null; (r.specs || []).some(function (s) { if (s[0] === k) { v = String(s[1]); return true; } return false; }); return v; }
  function numLbl(n, unit) { return (Math.round(n * 100) / 100) + unit; }
  function mmVal(str) { // first mm (or cm) measurement in a field value
    var m = /(\d+(?:\.\d+)?)\s*(mm|cm)\b/i.exec(String(str || ''));
    if (!m) return null;
    var n = parseFloat(m[1]); var mm = m[2].toLowerCase() === 'cm' ? n * 10 : n;
    return { k: 'mm:' + (Math.round(mm * 100) / 100), l: numLbl(n, m[2].toLowerCase()), n: mm };
  }
  function inVal(str) {
    var m = /(\d+(?:\.\d+)?)\s*(″|"|in\b)/.exec(String(str || ''));
    return m ? { k: 'in:' + parseFloat(m[1]), l: parseFloat(m[1]) + '″', n: parseFloat(m[1]) } : null;
  }
  function one(v) { return v ? [v] : []; }
  // P25: first label whose value parses (the 6 Gravity anchors say "Diameter: 2.7" and must fall through to sz "2.7mm");
  // the retired spellings stay readable until the label merge ships in the payload, then they are simply never found.
  function mmFirst(r, ks) { for (var i = 0; i < ks.length; i++) { var m = mmVal(spv(r, ks[i])); if (m) return m; } return null; }
  function inFirst(r, ks) { for (var i = 0; i < ks.length; i++) { var m = inVal(spv(r, ks[i])); if (m) return m; } return null; }
  function sutOf(r) { return spv(r, 'Suture') || spv(r, 'Working suture'); }
  function needleOf(r) { return spv(r, 'Needle') || spv(r, 'Needles'); }
  function sizeOrder(sz) { // suture sizes: 4-0 < 2-0 < #0 < #2 < #5 < 1.2mm tape …
    var m;
    if ((m = /^(\d+(?:\.\d+)?)mm$/.exec(sz))) return 1000 + parseFloat(m[1]);
    if ((m = /^#?(\d+)-0$/.exec(sz))) return -parseInt(m[1], 10);
    if ((m = /^#(\d+)/.exec(sz))) return parseInt(m[1], 10);
    return 500;
  }
  var FACETFN = {
    dia: function (r, b) {
      if (b === 'Implants') {
        return one(mmFirst(r, ['Anchor size', 'Diameter', 'Anchor diameter']) || mmVal(/^\d+(\.\d+)?mm$/.test(r.sz || '') ? r.sz : ''));
      }
      return one(mmFirst(r, ['Diameter', 'Drill diameter', 'Drill bit diameter', 'Cutting-head diameter', 'Cutting diameter'].concat(b === 'Arthroscopy' ? ['Outer diameter'] : [])) ||
        mmVal(/^\d+(\.\d+)?mm$/.test(r.sz || '') ? r.sz : ''));
    },
    len: function (r) { return one(mmFirst(r, ['Length', 'Total length', 'Anchor length'])); },
    mat: function (r) {
      var m = spv(r, 'Material'); if (!m) return [];
      var l = /β-TCP|biocomposite/i.test(m) ? 'Biocomposite' : /HA \(25%\)\/PLLA|HA\/PLLA/i.test(m) ? 'HA/PLLA' : /PLA \+ poly/i.test(m) ? 'Bioabsorbable PLA/PCL' :
        /PEEK/.test(m) ? 'PEEK' : /titanium/i.test(m) ? 'Titanium' : /polyester braided sheath/i.test(m) ? 'All-suture' : /PUUR|polyurethane/i.test(m) ? 'PUUR scaffold' : 'Other';
      return [{ k: l, l: l }];
    },
    atype: function (r) {
      var c = r.cat, l = c === 'Knotless Anchors' ? 'Knotless' : c === 'Iconix' ? (r.sub === 'Iconix Knotless' ? 'All-suture knotless' : 'All-suture') :
        c === 'Corkscrew Anchors' ? 'Knotted suture anchor' : c === 'Screws' ? 'Screw' : c === 'NanoTack' ? 'NanoTack' :
        c === 'Knee/Meniscus Anchors' ? 'Knee / meniscus fixation' : c === 'Artelon' ? 'Artelon' : 'Other';
      return [{ k: l, l: l }];
    },
    needle: function (r, b) {
      var n = needleOf(r);
      if (b !== 'Suture' && n) return /^Non-needled/i.test(n) ? [{ k: 'No needles', l: 'No needles' }] : [{ k: 'With needles', l: 'With needles' }];
      if (b === 'Suture') {
        if (!n) return [];
        if (/^Non-needled/i.test(n)) return [{ k: 'Non-needled', l: 'Non-needled' }];
        var code = (/^(DA\s+)?([A-Z]{1,4}-?\d{0,3}(?:\s+Blunt)?)/.exec(n) || [])[2] || 'Needled';
        if (/both ends|double-armed|^DA\s/i.test(n)) code += ' double-armed';
        return [{ k: code, l: code }];
      }
      var t = (r.name || '') + ' ' + (r.ld || '') + ' ' + (r.sub || '') + ' ' + (sutOf(r) || '');
      return /needle/i.test(t) && !/non-needled/i.test(t) ? [{ k: 'With needles', l: 'With needles' }] : [{ k: 'No needles', l: 'No needles' }];
    },
    strands: function (r) {
      var t = (r.ld || '') + ' ' + (sutOf(r) || ''), n = 0, m, re = /(\d)\s*(?:strands?\b|×)/g;
      while ((m = re.exec(r.ld || ''))) n += +m[1];
      if (!n) { re.lastIndex = 0; while ((m = re.exec(sutOf(r) || ''))) n += +m[1]; }
      if (!n) { if (/\b(one|single)\s+strand/i.test(t)) n = 1; else if (/\b(two|double)\s+strands?/i.test(t)) n = 2; else if (/\bthree\s+strands/i.test(t)) n = 3; }
      return n ? [{ k: 'n' + n, l: n + (n === 1 ? ' strand' : ' strands'), n: n }] : [];
    },
    stype: function (r, b) {
      if (b === 'Suture') { var f = String(r.fam || '').replace(/ suture( tape)?$/i, '').replace(/ suture and tape$/i, ''); return f ? [{ k: f, l: f }] : []; }
      var t = (r.name || '') + ' ' + (r.ld || '') + ' ' + (sutOf(r) || ''), out = [];
      if (/XBraid TT|tape/i.test(t)) out.push({ k: 'XBraid TT', l: 'XBraid TT tape' });
      if (/XBraid S\b/.test(t)) out.push({ k: 'XBraid S', l: 'XBraid S' });
      if (/Force Fiber/i.test(t)) out.push({ k: 'Force Fiber', l: 'Force Fiber' });
      if (/polyester/i.test(sutOf(r) || '')) out.push({ k: 'Polyester', l: 'Polyester' });
      return out;
    },
    ssize: function (r) { return r.sz ? [{ k: r.sz, l: r.sz, n: sizeOrder(r.sz) }] : []; },
    slen: function (r) { return one(inFirst(r, ['Strand length', 'Total length', 'Overall length', 'Loop length'])); }
  };
  function facetVals(h, k, b) {
    h.fx = h.fx || {};
    var key = k + '|' + b;
    if (!h.fx[key]) { try { h.fx[key] = FACETFN[k](h.rec || h.it, b) || []; } catch (eF) { h.fx[key] = []; } }
    return h.fx[key];
  }
  function specPass(h, b, skip) {
    return Object.keys(SPECF).every(function (k) {
      if (k === skip) return true;
      return facetVals(h, k, b).some(function (v) { return v.k === SPECF[k]; });
    });
  }
  function editLE(a, b, maxD) {
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > maxD) return false;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var rowMin = i;
      for (j = 1; j <= lb; j++) {
        var c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > maxD) return false;
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[lb] <= maxD;
  }
  function termFuzzy(e, t) {
    if (!/^[A-Z]{4,}$/.test(t)) return false;
    var maxD = t.length >= 7 ? 2 : 1;
    var ws = e.words || (e.words = wordsOf(e.raw));   // P50: built on the first typo-tolerant search, not for every card at boot
    for (var i = 0; i < ws.length; i++) {
      if (editLE(t, ws[i], maxD)) return true;
    }
    return false;
  }
  // ---- search matching (P1 plurals, P9 short and sized terms, P22 fuzzy flag) ----
  // sParse turns the query into terms; each term is one of:
  //   l  4+ letters, 3+ digits, or letters+digits (names, part numbers): a substring of the punctuation-free haystack, exactly
  //      as before, plus a plural retry (…ies -> …y, …sses/…xes/…ches/…shes -> drop es, …s) before the term is rejected, and
  //      a small bonus when it is a whole word ("Hip cannula" ranks above "Cannulated drill").
  //   a  1-3 letters: 1-2 letters must be a whole word ("tt" no longer hits "LefT Trochlea"); 3 letters must start a word or a
  //      CamelCase part ("oca" no longer hits "trOCAr"; "tap" still finds PunchTap); glued to its neighbour also counts
  //      ("punch tap" = "Punchtap").
  //   i  1-2 digits: a number with that integer part (6 -> 6, 6.5).   d  "4.7" -> 4.7, 4.75;  "2.0" -> exactly 2.
  //   u  number+unit: exact, with "N.0" = "N" ("4mm" = "4.0mm"; "10mm" never hits 11.0mm or 110mm).   h "#2"   z "2-0"
  // Each non-legacy term is one regex, compiled once per search and run on the entry's raw text: no index, nothing at boot.
  // Older iOS: no lookbehind anywhere (Safari < 16.4 would throw on it).
  var S_UNIT = { MM: 'mm', CM: 'cm', IN: 'in', INCH: 'in', INCHES: 'in', '\u2033': 'in', '"': 'in' };
  var S_URX = { mm: 'mm\\b', cm: 'cm\\b', 'in': '(?:\u2033|"|in\\b|inch)' };
  function sEsc(n) { return String(n).replace('.', '\\.'); }
  function sCI(t) { return t.replace(/[A-Z]/g, function (c) { return '[' + c + c.toLowerCase() + ']'; }); } // TAP -> [Tt][Aa][Pp]
  function sParse(q) {
    var AL = { LOCKED: 'NONSLIDING', FF: 'FORCEFIBER', BIO: 'BIOCOMPOSITE', BIOCOMP: 'BIOCOMPOSITE', AVK: 'ALPHAVENTKNOTLESS',
      AV: 'ALPHAVENT', XB: 'XBRAID', NANO: 'NANOTACK', FIBRE: 'FIBER', PT: 'PUNCHTAP', ICX: 'ICONIX' };
    var s = String(q || '').replace(/(\d(?:\.\d+)?(?:mm|cm)?)\s*[xX\u00d7]\s*(?=\d)/g, '$1 ')     // 8x20, 8mm x 20mm -> two sizes
      .replace(/(\d)\s+(mm|cm|inch(?:es)?|in|\u2033|")(?![A-Za-z])/gi, '$1$2');                    // "10 mm" -> "10mm"
    var out = [], m;
    s.split(/\s+/).forEach(function (raw) {
      raw = raw.replace(/[,;:!?\-\u2013]+$/, '');
      if (/\.$/.test(raw) && !/^\d+\.$/.test(raw)) raw = raw.slice(0, -1);
      if (!raw) return;
      var n, u, re = null, c;
      if ((m = /^#?(\d+)-0$/.exec(raw))) { c = 'z'; re = '(?:^|[^\\d.])#?' + (+m[1]) + '\\s?-\\s?0(?!\\d)'; }
      else if ((m = /^#(\d+)$/.exec(raw))) { c = 'h'; re = '#\\s?' + (+m[1]) + '(?!\\d|\\s?-\\s?0(?!\\d))'; }
      else if ((m = /^(\d+(?:\.\d+)?)(mm|cm|inch(?:es)?|in|\u2033|")$/i.exec(raw))) {
        c = 'u'; n = sEsc(String(parseFloat(m[1]))) + '(?:\\.0+)?'; u = S_URX[S_UNIT[m[2].toUpperCase()]];
        re = '(?:^|[^\\d.])' + n + '\\s*' + u + (u.charAt(0) === 'm' || u.charAt(0) === 'c'
          ? '|(?:^|[^\\d.])' + n + '\\s*(?:x|\u00d7|\\/|-|\u2013|to)\\s*\\d+(?:\\.\\d+)?\\s*' + u : '');   // 8.3 x 3.5mm: 8.3 is mm too
      }
      else if ((m = /^(\d+)\.(\d*)$/.exec(raw))) {
        c = 'd';
        if (!m[2]) re = '(?:^|[^A-Za-z0-9.])' + (+m[1]) + '(?:\\.\\d+)?(?!\\d)';                    // "4." while typing = "4"
        else if (/^0+$/.test(m[2])) re = '(?:^|[^A-Za-z0-9.])' + (+m[1]) + '(?:\\.0+)?(?![\\d.])'; // "2.0" = exactly 2
        else re = '(?:^|[^A-Za-z0-9.])' + (+m[1]) + '\\.' + m[2] + '\\d*(?!\\d)';                  // "4.7" = 4.7, 4.75
      }
      else if (/^\d{1,2}$/.test(raw)) { c = 'i'; re = '(?:^|[^A-Za-z0-9.])' + (+raw) + '(?:\\.\\d+)?(?!\\d)'; }
      if (re) { out.push({ c: c, t: nrm(raw), rx: new RegExp(re, 'i') }); return; }
      var t = nrm(raw); if (!t) return;
      t = AL[t] || t;
      // 1-3 letters typed on their own (not "g-lo", which is part of a hyphenated name) follow the word rules
      if (/^[A-Z]{1,3}$/.test(t) && !/[A-Za-z][^A-Za-z]+[A-Za-z]/.test(raw)) {
        var ci = sCI(t), camel = t.charAt(0) + t.slice(1).toLowerCase(), pl = t.length === 3 ? '(?:[Ee]?[Ss])?' : '';
        out.push({ c: 'a', t: t,
          rw: new RegExp('(?:(?:^|[^A-Za-z])' + ci + pl + '(?![A-Za-z]))' + (pl ? '|[a-z]' + camel + '(?:e?s)?(?![a-z])' : '')),  // whole word (3 letters: + plural, CamelCase part)
          rp: new RegExp('(?:^|[^A-Za-z])' + ci + '|[A-Za-z]' + camel) });                          // start of a word or CamelCase part
        return;
      }
      var cand = [t].concat(sStems(t));
      out.push({ c: 'l', t: t, cand: cand, bw: cand.map(function (w) {                                  // whole-word bonus test per form
        return /^[A-Z]{4,}$/.test(w) ? new RegExp('(?:(?:^|[^A-Za-z])' + sCI(w) + '|[a-z]' + w.charAt(0) + w.slice(1).toLowerCase() + ')(?:[Ee]?[Ss])?(?![a-z])') : null; }) });
    });
    var merged = [];
    for (var i = 0; i < out.length; i++) {
      if (out[i].t === 'NON' && out[i + 1] && out[i + 1].t === 'SLIDING') { merged.push({ c: 'l', t: 'NONSLIDING', cand: ['NONSLIDING'], bw: [null] }); i++; }
      else merged.push(out[i]);
    }
    return merged;
  }
  function sStems(t) { // P1: SHAVERS -> SHAVER, BOXES -> BOX, ASSEMBLIES -> ASSEMBLY; never ACCESS -> ACCES
    if (!/^[A-Z]{4,}S$/.test(t) || /SS$/.test(t)) return [];
    var o = [];
    if (/IES$/.test(t)) o.push(t.slice(0, -3) + 'Y');
    if (/(SS|X|Z|CH|SH)ES$/.test(t)) o.push(t.slice(0, -2));
    o.push(t.slice(0, -1));
    return o;
  }
  function sPos(p) { return 30 - Math.min(25, p / 10); }
  function sAt(e, m) { return nrm((e.raw || '').slice(0, m.index)).length; } // raw offset -> haystack offset (same scale as before)
  function sHit(e, x, loose, prev, next) { // score for one term on one entry, or -1
    var t = x.t, k, p, m, r = e.raw || '';
    if (x.c === 'l') {
      if (t === 'SLIDING') return (e.hay.indexOf('SLIDING') !== -1 && e.hay.indexOf('NONSLIDING') === -1) ? 20 : -1;
      for (k = 0; k < x.cand.length; k++) {
        p = e.hay.indexOf(x.cand[k]); if (p === -1) continue;
        return sPos(p) - (k ? 2 : 0) + (x.bw[k] && x.bw[k].test(r) ? 4 : 0);
      }
      // part numbers: leading zeros are optional (0242200025 finds 242200025, 295724120 finds 0295724120)
      if (/^0+\d{5,}$/.test(t) && e.skuz.indexOf(t.replace(/^0+/, '')) === 0) return 30;
      return -1;
    }
    if (x.c === 'a') {
      if ((m = x.rw.exec(r))) return sPos(sAt(e, m));
      if ((t.length === 3 || loose) && (m = x.rp.exec(r))) return 1 + (sPos(sAt(e, m)) - 5) / 5;         // prefix only: always below a whole word
      if (prev && /^[A-Z]+$/.test(prev.t) && (p = e.hay.indexOf(prev.t + t)) !== -1) return sPos(p) - 4;   // "punch tap" = PUNCHTAP
      if (next && /^[A-Z]+$/.test(next.t) && (p = e.hay.indexOf(t + next.t)) !== -1) return sPos(p) - 4;
      return -1;
    }
    if ((m = x.rx.exec(r))) return sPos(sAt(e, m));
    if (loose && x.c === 'i' && (p = e.hay.indexOf(t)) !== -1) return sPos(p) - 6;                 // "39…" while typing a part number
    return -1;
  }
  function searchAll(q) {
    var terms = sParse(q);
    if (!terms.length) return [];
    var qn = nrm(q), qnz = qn.replace(/^0+/, '');
    function collect(mode) { // 0 strict, 1 loose (1-2 letter words as prefixes, 1-2 digit numbers as substrings), 2 fuzzy
      var out = [];
      for (var k = 0; k < INDEX.length; k++) {
        var e = INDEX[k], score = 0, ok = true;
        for (var m = 0; m < terms.length; m++) {
          var sc = sHit(e, terms[m], mode === 1, terms[m - 1], terms[m + 1]);
          if (sc < 0 && mode === 2 && terms[m].c === 'l' && termFuzzy(e, terms[m].t)) sc = 6;
          if (sc < 0) { ok = false; break; }
          score += sc;
        }
        if (!ok) continue;
        if (e.skun === qn || (qnz.length >= 5 && e.skuz === qnz)) score += 500;
        else if (qn.length >= 4 && (e.skun.indexOf(qn) === 0 || (qnz.length >= 5 && e.skuz.indexOf(qnz) === 0))) score += 180;
        e.score = score;
        out.push(e);
      }
      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    }
    var res = collect(0);
    if (!res.length && terms.some(function (x) { return (x.c === 'a' && x.t.length < 3) || x.c === 'i'; })) res = collect(1);
    if (!res.length) { res = collect(2); res.fuzzy = res.length > 0; }
    return res;
  }

  // ---- shared fragments ----
  // P39: title with the size inline, the status / tag pills under it, then two lines of description. Text only: list rows
  // never carry product photos (Nate's rule). P38: {stack:true} (Favorites / Recents) puts the part number above the title.
  function rowHTML(route, it, subline, hideSz, opt) {
    var t = it.t || it.name || '', sz = hideSz ? '' : (it.sz || ''), ld = it.ld || '', uom = it.uom || '';
    var tags = boPillsHTML(it.sku, 2) + (it.tags || []).map(function (tg) { return '<span class="subtag">' + esc(tg) + '</span>'; }).join('');
    var line2 = ld ? '<span class="ld">' + esc(ld) + '</span>' :
                (subline ? '<span class="ld dim2">' + esc(subline) + '</span>' : '');
    var head = '<b class="ti">' + esc(t) + (sz ? ' <span class="sz">' + esc(sz) + '</span>' : '') + '</b>' + (tags ? '<span class="rtags">' + tags + '</span>' : '');
    if (opt && opt.stack)
      return '<button class="rowitem stack" data-go="' + route + '"><div class="rl"><span class="pnS mono">' + esc(it.sku || '') +
        (uom ? '<span class="uomS"> · ' + esc(uom) + '</span>' : '') + '</span>' + head + line2 + '</div></button>';
    return '<button class="rowitem" data-go="' + route + '">' +
      '<div class="pnL mono">' + esc(it.sku || '') + (uom ? '<span class="uomL">' + esc(uom) + '</span>' : '') + '</div>' +
      '<div class="rl">' + head + line2 + '</div></button>';
  }
  // P38: a saved favorite / recent shows the card's current title (renamed cards), falling back to what was saved;
  // a retired number shows its new card's title and keeps its own number (tapping it explains the change)
  function liveIt(sku, saved) {
    saved = saved || {};
    if (!sku) return saved;
    var e = BYPN[nrm(sku)] || BYPNZ[nrm(sku).replace(/^0+/, '')], r = e ? recOf(e) : null;
    if (r && r.hidden && r.moved && BYPN[nrm(r.moved)]) r = recOf(BYPN[nrm(r.moved)]);
    if (!r) return saved;
    return { t: r.t || r.name || saved.t, sz: r.sz || '', ld: r.ld || '', sku: saved.sku || sku, uom: r.uom || '', tags: r.tags || [] };
  }
  var SFILT = null, SSORT = 'rel', SALL = false;
  function askHTML(q, inline) { // P23: only when the payload has somewhere to send feedback (same test TBX_FEEDBACK_INIT uses)
    if (!D.fb || !(D.fb.url || D.fb.email) || !q) return '';
    return '<button type="button" class="' + (inline ? 'askin' : 'footlink askn') + '" data-act="asknate" data-q="' + esc(q) + '">Ask Nate to add “' + esc(q) + '” &#x203A;</button>';
  }
  var SBUCKETS = ['Arthroscopy', 'Biologics', 'Capital', 'Disposables', 'Implants', 'Instruments', 'Suture'];
  function resultsHTML() {
    var hits = searchAll(CURQ);
    var mvq = movedOf(CURQ); // the query IS a retired number: say what replaced it (the new card is in the hits via its alt)
    var mvn = mvq ? '<button class="pnm-sr" data-pnm="' + esc(mvq.sku) + '"><b class="mono">' + esc(mvq.sku) + '</b> is now <b class="mono">' + esc(mvq.moved) +
      '</b> \u2014 same product, new part number. <span class="pnm-why">Why &#x203A;</span></button>' : '';
    if (!hits.length) {
      SFILT = null;
      return mvn + emptyHTML(ICON.search, 'No matches for \u201c' + CURQ + '\u201d', 'Try fewer letters or a part-number fragment \u2014 dashes are optional.', askHTML(CURQ) + '<button class="footlink" data-act="scan">Scan the barcode instead &#x203A;</button>');
    }
    var counts = {};
    hits.forEach(function (h) { (h.buckets || []).forEach(function (b) { counts[b] = (counts[b] || 0) + 1; }); });
    var avail = SBUCKETS.filter(function (b) { return counts[b]; });
    if (SFILT && !counts[SFILT]) SFILT = null;
    var shown = SFILT ? hits.filter(function (h) { return (h.buckets || []).indexOf(SFILT) !== -1; }) : hits;
    // spec filters belong to one bucket (Implants, Suture, …): the picked chip, or the only bucket in the results
    var fb = SFILT || (avail.length === 1 ? avail[0] : null), fks = fb ? (BUCKETFACETS[fb] || []) : [];
    Object.keys(SPECF).forEach(function (k) { if (fks.indexOf(k) === -1) delete SPECF[k]; });
    var fbase = shown, fon = Object.keys(SPECF).length > 0;
    if (fon) shown = shown.filter(function (h) { return specPass(h, fb, null); });
    var fn = shown.length, frow = fks.length ? facetRowHTML(fbase, fb, fks, shown.length) : '';
    if (SSORT === 'sku') shown = shown.slice().sort(function (a, b) { return a.skun < b.skun ? -1 : a.skun > b.skun ? 1 : 0; });
    // P21: the match count lives in the bucket chip ("Implants · 28 of 192"); with one bucket it is a plain count, not a chip
    var chips = '<div class="schips">' +
      (avail.length > 1 ? '<button class="schip' + (!SFILT ? ' on' : '') + '" data-sf="" aria-pressed="' + !SFILT + '">All &middot; ' + hits.length + '</button>' +
        avail.map(function (b) {
          return '<button class="schip' + (SFILT === b ? ' on' : '') + '" data-sf="' + esc(b) + '" aria-pressed="' + (SFILT === b) + '">' + esc(b) + ' &middot; ' + (fon && b === fb ? fn + ' of ' + counts[b] : counts[b]) + '</button>';
        }).join('') : '<span class="scount">' + (fon ? fn + ' of ' + hits.length : plural(hits.length, 'result')) + '</span>') +
      '<button class="schip sort' + (SSORT === 'sku' ? ' on' : '') + '" data-ssort="1" aria-pressed="' + (SSORT === 'sku') + '">' + (SSORT === 'sku' ? 'Part # A\u2013Z' : 'Best match') + ICON.sort + '</button>' +
      '</div>';
    var fz = hits.fuzzy ? '<div class="sfuzzy" data-sfuzzy="1" role="status">No exact match \u2014 close spellings' + askHTML(CURQ, true) + '</div>' : ''; // P22
    var CAP = SALL ? shown.length : 60;
    if (!shown.length) return mvn + chips + frow + '<div class="empty">No results match these filters. <button class="footlink" data-sfclear="1">Clear filters</button></div>';
    return mvn + fz + chips + frow + '<div class="list" style="margin-top:8px">' +
      shown.slice(0, CAP).map(function (h) { return rowHTML(h.route, h.it, h.sub); }).join('') + '</div>' +
      (shown.length > CAP ? '<button class="showall" data-sall="1">Show all ' + shown.length + ' &#x203A;</button>' : '');
  }
  // P21: re-render the results but keep both chip rows where the rep left them (a pill far right must not jump away),
  // and mirror the state into the URL
  function resultsRerender() {
    var a = content.querySelector('.schips'), b = content.querySelector('.sfrow'), la = a ? a.scrollLeft : 0, lb = b ? b.scrollLeft : 0;
    content.innerHTML = resultsHTML();
    a = content.querySelector('.schips'); b = content.querySelector('.sfrow');
    if (a) a.scrollLeft = la; if (b) b.scrollLeft = lb;
    stWrite();
  }
  // P21: every spec filter in one horizontally scrolling row of pills; the pill shows its value, the real <select> covers
  // the whole pill (a tap anywhere opens the native picker), and "Clear · N" leads the row while any filter is on
  function facetRowHTML(base, b, fks, nShown) {
    var html = '', any = false, nOn = 0;
    fks.forEach(function (k) {
      var pool = base.filter(function (h) { return specPass(h, b, k); }), vals = {}, order = [];
      pool.forEach(function (h) {
        facetVals(h, k, b).forEach(function (v) {
          if (!vals[v.k]) { vals[v.k] = { l: v.l, n: v.n, c: 0 }; order.push(v.k); }
          vals[v.k].c++;
        });
      });
      var act = SPECF[k];
      if (order.length < 2 && !act) return; // nothing to choose between
      order.sort(function (x, y) {
        var a = vals[x], c = vals[y];
        if (a.n !== undefined && c.n !== undefined && a.n !== c.n) return a.n - c.n;
        return String(a.l).localeCompare(String(c.l));
      });
      if (act) { any = true; nOn++; }
      var vl = act && vals[act] ? vals[act].l : 'Any';
      html += '<label class="sfsel' + (act ? ' on' : '') + '"><span class="sfk">' + esc(FACETLBL[k]) + '</span>' +
        '<span class="sfv">' + esc(vl) + '</span>' +
        '<select data-sfk="' + k + '" aria-label="' + esc(FACETLBL[k] + ': ' + vl) + '"><option value="">Any</option>' +
        order.map(function (vk) {
          return '<option value="' + esc(vk) + '"' + (vk === act ? ' selected' : '') + '>' + esc(vals[vk].l) + ' (' + vals[vk].c + ')</option>';
        }).join('') + '</select></label>';
    });
    if (!html) return '';
    return '<div class="sfrow" role="group" aria-label="Filter results">' +
      (any ? '<button type="button" class="sfx" data-sfclear="1" aria-label="Clear ' + plural(nOn, 'filter') + '">' + ICON.close + '<span>Clear · ' + nOn + '</span></button>' : '') +
      html + '</div>';
  }
  try { SSORT = localStorage.getItem('tbx_ssort') === 'sku' ? 'sku' : 'rel'; } catch (e0) {}
  // ---- line icons (24 grid, 1.8 stroke, currentColor) for catalog UI; CC/F&A keep their own glyphs ----
  // P41: one set replaces the emoji and symbol glyphs on catalog screens. fill is an attribute, never style= (CSP).
  var ICON = (function () {
    function s(d) { return '<svg class="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
    var starP = '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>';
    return {
      search: s('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/>'),
      scan: s('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10.5 8v8M13.5 8v5M16.5 8v8"/>'),
      share: s('<path d="M12 3.5v11"/><path d="M8.2 7.2L12 3.5l3.8 3.7"/><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>'),
      more: s('<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3"/>'),
      close: s('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
      box: s('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
      offline: s('<path d="M5 12.6a10 10 0 0 1 5.2-2.5M13.7 10.1a10 10 0 0 1 5.3 2.5M1.9 9a15 15 0 0 1 5.3-3.2M11 4.6A15 15 0 0 1 22.1 9M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01" stroke-width="2.6"/><path d="M3 3l18 18"/>'),
      chart: s('<path d="M3 20.5h18"/><path d="M6 17v-6M11 17V6M16 17v-9"/>'),
      refresh: s('<path d="M20 11.5A8 8 0 1 1 17.7 6"/><path d="M20 4v5h-5"/>'),
      star: s(starP),
      starOn: s(starP.replace('<path ', '<path fill="currentColor" ')),
      warn: s('<path d="M10.3 4.2L2.6 17.6A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5"/><path d="M12 17.2h.01" stroke-width="2.6"/>'),
      clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
      sort: s('<path d="M8 20V4M4.5 7.5L8 4l3.5 3.5M16 4v16M12.5 16.5L16 20l3.5-3.5"/>')
    };
  })();
  // P41: one drill-down component below Home (category → groups → families): title, "N items", chevron
  function drillRowHTML(go, title, n) {
    return '<button class="rowitem drill" data-go="' + go + '"><div class="rl"><b class="ti">' + esc(title) + '</b>' +
      '<span class="ld dim2">' + plural(n, 'item') + '</span></div><div class="ct">&#x203A;</div></button>';
  }

  // ---- P35/P5 navigation state: one record per catalog history entry ----
  // history.state.nav holds the entry's id; its record (scroll + the first row on screen, search text / bucket chip /
  // spec filters / Show all, family chips, the Backorder Report filter + section, per-screen extras) lives in
  // sessionStorage 'tbx_nav' for this launch (it survives the update-banner reload, never leaves the phone).
  // route() saves the entry it leaves and restores the one it lands on once render() has painted it.
  // Cycle count / F&A entries (routeIsCT) are never tracked: no id, scrollRestoration stays 'auto', scroll-to-top as today.
  var NAV = { cur: null, pending: null, store: null, seq: 0, x: {}, extra: null, run: null };
  var NAV_KEY = 'tbx_nav', NAV_MAX = 60;
  function navLoad() {
    if (NAV.store) return NAV.store;
    try { NAV.store = JSON.parse(sessionStorage.getItem(NAV_KEY) || '{}') || {}; } catch (e) { NAV.store = {}; }
    if (typeof NAV.store !== 'object') NAV.store = {};
    return NAV.store;
  }
  function navPersist() { // capped at NAV_MAX entries (oldest write goes first); memory stays the truth if storage throws
    var s = navLoad(), ids = Object.keys(s);
    if (ids.length > NAV_MAX) ids.sort(function (a, b) { return (s[a].t || 0) - (s[b].t || 0); }).slice(0, ids.length - NAV_MAX).forEach(function (k) { delete s[k]; });
    try { sessionStorage.setItem(NAV_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function navClone(o) { var r = {}; if (o && typeof o === 'object') for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  function navX() { return NAV.x || (NAV.x = {}); } // per-entry extras: Home "Show all favorites" (favAll); cards may keep open sections here
  function navDocTop(el) { var y = 0; while (el) { y += el.offsetTop || 0; el = el.offsetParent; } return y; } // layout top: the .vt fade-in transform can't skew it
  function navHdr() { try { return document.getElementById('bar').getBoundingClientRect().bottom; } catch (e) { return 0; } }
  function navAnchor() { // the first row / link fully below the header: a target that survives content above it changing height
    if (!content) return null;
    var top = navHdr(), els = content.querySelectorAll('[data-go]'), seen = {}, sy = window.scrollY || 0;
    for (var i = 0; i < els.length; i++) {
      var go = els[i].getAttribute('data-go'); seen[go] = (seen[go] || 0) + 1;
      var vt = navDocTop(els[i]) - sy;
      if (vt > window.innerHeight) break;
      if (els[i].offsetHeight && vt >= top) return { go: go, n: seen[go] - 1, dy: Math.round(vt) };
    }
    return null;
  }
  function navFind(a) {
    var els = content.querySelectorAll('[data-go]'), n = 0;
    for (var i = 0; i < els.length; i++) if (els[i].getAttribute('data-go') === a.go) { if (n === a.n) return els[i]; n++; }
    return null;
  }
  function navSave(id) { // the entry being left: read before anything in route() changes the page or the globals
    if (!id) return;
    var s = navLoad(), r = s[id] || {};
    r.y = Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0));
    r.a = navAnchor(); r.t = Date.now(); r.sx = navRowsX();
    r.f = { q: CURQ, sf: SFILT, sp: navClone(SPECF), sa: !!SALL, ft: navClone(FILT), x: NAV.x || {} };
    if (typeof NAV.extra === 'function') { try { r.f.xs = NAV.extra(); } catch (e) {} }
    s[id] = r; navPersist();
  }
  var NAV_ROWS = ['.schips', '.sfrow', '#bo-chips']; // sideways-scrolling chip rows: bucket chips, filter pills, report sections
  function navRowsX() {
    if (!content) return null;
    var x = NAV_ROWS.map(function (sel) { var el = content.querySelector(sel); return el ? Math.round(el.scrollLeft || 0) : 0; });
    return x.some(function (v) { return v > 0; }) ? x : null;
  }
  function navNoteBrowse() { // P6: where the screen under the results was when a search started on this entry
    if (!NAV.cur) return;
    var s = navLoad(), r = s[NAV.cur] || (s[NAV.cur] = {});
    r.by = Math.round(window.scrollY || 0); r.ba = navAnchor(); r.t = Date.now(); navPersist();
  }
  function navEnter(track, keepX) { // -> this entry's saved record (Back / Forward / reload) or null (a new entry)
    if (!track) { NAV.cur = null; NAV.x = {}; return null; }
    var st = null; try { st = history.state; } catch (e) {}
    var id = st && typeof st === 'object' ? st.nav : null, rec = id ? (navLoad()[id] || null) : null;
    if (!id) {
      id = (Date.now() % 1e9).toString(36) + '-' + (++NAV.seq).toString(36) + Math.random().toString(36).slice(2, 5);
      try { var ns = navClone(st); ns.nav = id; history.replaceState(ns, '', location.href); } catch (e) {}
    }
    NAV.cur = id;
    if (!keepX) { try { NAV.x = rec && rec.f && rec.f.x ? JSON.parse(JSON.stringify(rec.f.x)) : {}; } catch (e) { NAV.x = {}; } }
    return rec;
  }
  function navCancel() { if (NAV.run) { clearInterval(NAV.run.iv); NAV.run = null; } }
  function navRestore(r) { // scroll to the saved row (else y), and keep following it while late photos / data grow the page
    navCancel();
    if (r && r.sx) NAV_ROWS.forEach(function (sel, i) { var el = r.sx[i] && content.querySelector(sel); if (el) el.scrollLeft = r.sx[i]; }); // the chip rows too
    if (!r || !(r.y > 0 || r.a)) return;
    var t0 = Date.now(), last = -1, stable = 0, id = t0 + Math.random();
    function maxY() { return Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight); }
    function target() {
      if (r.a) { var el = navFind(r.a); if (el) return Math.max(0, navDocTop(el) - r.a.dy); }
      return r.y || 0;
    }
    function pending() { // photos at or above the viewport that are still loading
      var im = content.querySelectorAll('img');
      for (var i = 0; i < im.length; i++) if (!im[i].complete && navDocTop(im[i]) < (window.scrollY || 0) + window.innerHeight) return true;
      return false;
    }
    function step() {
      if (!NAV.run || NAV.run.id !== id) return;
      var y = target(), m = maxY(), el = Date.now() - t0;
      window.scrollTo(0, Math.min(y, m));
      stable = (y === last && m >= y && Math.abs((window.scrollY || 0) - y) <= 2) ? stable + 1 : 0; last = y;
      if ((el >= 1000 && stable >= 3 && !pending()) || el > 3000) navCancel(); // follow for at least 1 s, at most 3 s
    }
    NAV.run = { id: id, step: step, iv: setInterval(step, 80) };
    step();
  }
  // a photo landing re-aims at once (load does not bubble: capture on the document)
  document.addEventListener('load', function (e) { if (NAV.run && e.target && e.target.tagName === 'IMG') NAV.run.step(); }, true);
  // user intent wins: a touch, wheel, key or click while a restore is still settling ends it (no late jump)
  ['touchstart', 'wheel', 'keydown', 'mousedown'].forEach(function (evn) {
    document.addEventListener(evn, function () { if (NAV.run) navCancel(); }, { passive: true, capture: true });
  });

  // ---- search & filter state in the URL (g1 state model; P5, P21) ----
  //   #/<screen>?q=omega&c=Implants&dia=2.3mm&strands=2&all=1   search over any screen
  //   #/fam/<cat>/<fam>?t=Needled,Sliding   #/fam/Disposables/FlowPort?fp=Touch   browse chips
  //   #/bo?bq=<filter>&bs=bo|ctl|clr   the Backorder Report's own filter + section (q stays the global search)
  // Fixed parameter order, so the same state always gives the same URL; replaceState only (no extra Back steps), and it
  // keeps history.state (the entry's nav id). Precedence on arrival: the entry's own record (Back / Forward / reload),
  // then these URL parameters (shared links, a record pruned or lost), then the defaults.
  var ST_F = ['dia', 'len', 'mat', 'atype', 'needle', 'strands', 'stype', 'ssize', 'slen'];
  var BOV = { q: '', sec: 'all' }; // the Backorder Report's filter + section, while #/bo is on screen
  function stEnc(k, v) {
    v = String(v);
    if ((k === 'dia' || k === 'len') && /^mm:/.test(v)) return v.slice(3) + 'mm';
    if (k === 'slen' && /^in:/.test(v)) return v.slice(3) + 'in';
    if (k === 'strands' && /^n\d+$/.test(v)) return v.slice(1);
    return v;
  }
  function stDec(k, v) {
    var m;
    if ((k === 'dia' || k === 'len') && (m = /^(\d+(?:\.\d+)?)mm$/.exec(v))) return 'mm:' + parseFloat(m[1]);
    if (k === 'slen' && (m = /^(\d+(?:\.\d+)?)in$/.exec(v))) return 'in:' + parseFloat(m[1]);
    if (k === 'strands' && /^\d+$/.test(v)) return 'n' + (+v);
    return v;
  }
  function stRead(query) {
    var o = { q: qparam(query, 'q'), c: qparam(query, 'c') || null, f: {}, all: qparam(query, 'all') === '1', t: [], fp: qparam(query, 'fp') || '',
      bq: qparam(query, 'bq'), bs: qparam(query, 'bs') };
    if (o.c && SBUCKETS.indexOf(o.c) === -1) o.c = null;
    ST_F.forEach(function (k) { var v = qparam(query, k); if (v) o.f[k] = stDec(k, v); });
    var t = qparam(query, 't'); if (t) o.t = t.split(',').filter(function (x) { return FTOKENS.some(function (tk) { return tk.t === x; }); });
    if (!/^(bo|ctl|clr)$/.test(o.bs)) o.bs = '';
    return o;
  }
  function stQuery(o) {
    var p = [];
    if (o.q) p.push('q=' + encodeURIComponent(o.q));
    if (o.q && o.c) p.push('c=' + encodeURIComponent(o.c));
    if (o.q) ST_F.forEach(function (k) { if (o.f && o.f[k]) p.push(k + '=' + encodeURIComponent(stEnc(k, o.f[k]))); });
    if (o.q && o.all) p.push('all=1');
    if (!o.q && o.t && o.t.length) p.push('t=' + o.t.map(encodeURIComponent).join(','));
    if (o.fp) p.push('fp=' + encodeURIComponent(o.fp));
    if (o.bq) p.push('bq=' + encodeURIComponent(o.bq));
    if (o.bs && o.bs !== 'all') p.push('bs=' + o.bs);
    return p.join('&');
  }
  function stWrite() { // mirror the live state into this entry's URL
    try {
      var base = (location.hash || '#/').split('?')[0];
      if (routeIsCT(base)) return;
      var bo = base === '#/bo';
      var qs = stQuery({ q: CURQ, c: SFILT, f: SPECF, all: SALL, t: Object.keys(FILT).filter(function (k) { return k !== 'fp' && FILT[k]; }), fp: FILT.fp || '',
        bq: bo ? BOV.q : '', bs: bo ? BOV.sec : '' });
      var next = base + (qs ? '?' + qs : '');
      if (next !== (location.hash || '#/')) history.replaceState(history.state, '', next);
    } catch (eS) {}
  }

  // ---- R7 screen changes: N2 (a Home tile becomes its page, Back reverses), N11 (a card opens from its row with its
  // photo and returns to your place), N11a (the old snapshot is taken where you tapped: scroll happens after it) ----
  // A View Transition morphs a few named pieces; everything else swaps at once (::view-transition-*(root) in index.html).
  // Names go on old elements before the call and on new ones inside the update callback, and are cleared when it
  // finishes. Without the API (iOS < 18) or with Reduce Motion the screen swaps with today's #content.vt fade (the landing
  // page still gets its header icon). The callback runs a frame after render(): a screen whose code touches its own new
  // DOM after render() puts that code in afterPaint(). Only catalog rows and Home tiles set a pending transition, so
  // cycle count / F&A never take these paths.
  var VT_FROM = null, VT_CAT = null, VT_BACK = null, SCROLL_TOP = false, CAT_ON = null, CAT_LAST = null, RENDER_GEN = 0, PAINT_Q = null;
  var CATGO = { '#/top/arthroscopy': 'arth', '#/cat/Allografts%20%26%20Biologics': 'allo', '#/cat/Disposables': 'disp', '#/top/implants': 'impl',
    '#/cat/Instruments': 'inst', '#/cat/Capital': 'cap', '#/cat/Suture': 'sut', '#/bo': 'bo' };
  function motionRM() { // M0: one Reduce Motion check (TBX_RM in index.html), with its own fallback
    try { return window.TBX_RM ? !!window.TBX_RM() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function vtOK() { return !!document.startViewTransition && !motionRM(); }
  function afterPaint(fn) { if (PAINT_Q) PAINT_Q.push(fn); else fn(); }
  function catHead() { // N2: a Home tile's landing page carries the tile's icon in its header
    if (CURQ || !title) return null;
    var k = CATGO[(location.hash || '#/').split('?')[0]];
    if (!k) return null;
    if (!title.querySelector('.hico')) title.innerHTML = '<span class="hico k-' + k + '" aria-hidden="true">' + catSvg(k) + '</span><span class="tt">' + title.innerHTML + '</span>';
    CAT_LAST = { k: k, html: title.innerHTML };
    return k;
  }
  function vtView(el) { // fully on screen between the header and the bottom bar
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect(), bb = document.getElementById('bottombar'), bot = window.innerHeight;
    if (bb && bb.offsetHeight) bot = Math.min(bot, bb.getBoundingClientRect().top);
    return r.top >= navHdr() - 1 && r.bottom <= bot + 1;
  }
  function vtSeen(el) { // at least partly on screen below the header
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect(); return r.bottom > navHdr() + 8 && r.top < window.innerHeight - 8;
  }
  function vtGhost(row, bg) { // N11: a square at the row's end — the photo lifts off it (open) or shrinks back into it (Back)
    var r = row.getBoundingClientRect(), g = document.createElement('i'), z = Math.round(r.height);
    g.className = 'vt-ghost'; g.setAttribute('aria-hidden', 'true');
    g.style.cssText = 'left:' + Math.round(r.right - z) + 'px;top:' + Math.round(r.top) + 'px;width:' + z + 'px;height:' + z + 'px' + (bg ? ';background:' + bg : '');
    document.body.appendChild(g); return g;
  }
  function navRing(row) { // N11c: the row you came back to is marked for a moment (static for 1 s with Reduce Motion)
    if (!row) return;
    row.classList.remove('nav-ring'); void row.offsetWidth; row.classList.add('nav-ring');
    clearTimeout(row.__ring); row.__ring = setTimeout(function () { row.classList.remove('nav-ring'); }, 1000);
  }
  function backRow(sku) { // the row of the card you came back from, if it is on screen
    var go = pnRoute(sku), rows = content.querySelectorAll('.rowitem[data-go]');
    for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute('data-go') === go && vtView(rows[i])) return rows[i];
    return null;
  }
  // One transition: before(name, temp) names the old pieces (temp() = an element that exists only in the old snapshot);
  // the callback paints, runs the screen's afterPaint work, then after(name, t) names the new pieces (it may return a
  // promise, e.g. a photo decode, or skip the morph). Returns false when no transition started (the caller paints).
  function vtRun(mode, gen, paint, before, after) {
    var root = document.documentElement, named = [], temps = [], q = PAINT_Q = [];
    function name(el, n) { if (el) { el.style.viewTransitionName = n; named.push(el); } return el; }
    function temp(el) { temps.push(el); return el; }
    function drop() { temps.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }); temps = []; }
    function clear() { drop(); named.forEach(function (el) { el.style.viewTransitionName = ''; }); named = []; if (root.getAttribute('data-vt') === mode) root.removeAttribute('data-vt'); }
    function flush() { var f = q; q = []; if (PAINT_Q === f) PAINT_Q = null; f.forEach(function (fn) { try { fn(); } catch (e) { setTimeout(function () { throw e; }, 0); } }); }
    try {
      before(name, temp);
      root.setAttribute('data-vt', mode);
      content.classList.remove('vt', 'vt-rise', 'vt-fade');
      var t = document.startViewTransition(function () {
        drop();
        if (gen !== RENDER_GEN) { q = []; if (PAINT_Q === q) PAINT_Q = null; return; } // a newer screen took over: this one never paints
        try { paint(true); } catch (eP) { setTimeout(function () { throw eP; }, 0); }
        flush();
        try { return after(name, t); } catch (eA) { return; }
      });
      t.finished.then(clear, clear);
      return true;
    } catch (e) {
      clear(); if (PAINT_Q === q) PAINT_Q = null;
      return false;
    }
  }
  function render(browseHTML, opt) {
    LAST_BROWSE = browseHTML;
    var gen = ++RENDER_GEN, isHome = !!(opt && opt.home);
    PAINT_Q = null;
    var paint = function (sync) {
      content.classList.remove('homeview');
      if (CURQ) { if (title.innerHTML !== 'Search') LAST_TITLE = title.innerHTML; title.innerHTML = 'Search'; }
      CAT_ON = catHead();
      content.innerHTML = CURQ ? resultsHTML() : browseHTML;
      if (isHome) content.classList.add('homeview');
      if (SCROLL_TOP) { SCROLL_TOP = false; window.scrollTo(0, 0); } // N11a: scroll after the old snapshot, never before it
      // P35: Back / Forward land where the entry was left — once this frame is painted, then following late content.
      // Inside a View Transition at once, so its new snapshot already shows the restored place (N11c, N2 back).
      if (NAV.pending) { var pr = NAV.pending; NAV.pending = null; if (sync) { try { navRestore(pr); } catch (eNs) {} } else (window.requestAnimationFrame || setTimeout)(function () { try { navRestore(pr); } catch (eNr) {} }); }
    };
    var from = VT_FROM, cat = VT_CAT, back = VT_BACK, wasCat = CAT_ON, catWas = CAT_LAST;
    VT_FROM = null; VT_CAT = null; VT_BACK = null;
    if (vtOK()) {
      // N2: the tile's icon and name move into the header, the page rises in underneath
      if (cat && cat.isConnected && !CURQ && CATGO[(location.hash || '').split('?')[0]] && vtRun('cat', gen, paint, function (name) {
        name(cat.querySelector('.tico'), 'tbx-cat-ico'); name(cat.querySelector('.tlt'), 'tbx-cat-title');
      }, function (name) {
        name(title.querySelector('.hico'), 'tbx-cat-ico'); name(title.querySelector('.tt'), 'tbx-cat-title');
        content.classList.add('vt-rise'); setTimeout(function () { content.classList.remove('vt-rise'); }, 400);
      })) return;
      // N11b: row -> card — the title morphs into the heading, the row's end lifts off as the photo, the card fills in
      if (from && from.isConnected) {
        var row = from.closest ? from.closest('.rowitem') : null, hero = !CURQ && !!row && browseHTML.indexOf('class="pc-hero"') > -1;
        if (vtRun('card', gen, paint, function (name, temp) {
          name(from, 'tbx-title');
          if (hero) name(temp(vtGhost(row, 'var(--panel)')), 'tbx-hero');
        }, function (name) {
          name(content.querySelector('.card h1'), 'tbx-title');
          var pc = content.querySelector('#pcard');
          if (pc) { pc.classList.add('vt-in'); setTimeout(function () { pc.classList.remove('vt-in'); }, 420); }
          var hb = hero ? content.querySelector('.pc-hero') : null, im = hb && hb.querySelector('img');
          if (!hb) return;
          name(hb, 'tbx-hero');
          // the photo is usually decoded already (pointerdown on the row started it); never wait more than 120 ms
          if (im && im.decode) return Promise.race([im.decode().then(null, function () {}), new Promise(function (r) { setTimeout(r, 120); })]);
        })) return;
      }
      // N2 back: Home after a landing page — the header icon and name fly back into their tile (if it is on screen)
      if (isHome && wasCat && catWas && !CURQ) {
        var homeTitle = title.innerHTML;
        if (vtRun('home', gen, function (sync) { title.innerHTML = homeTitle; paint(sync); }, function (name) {
          title.innerHTML = catWas.html;
          name(title.querySelector('.hico'), 'tbx-cat-ico'); name(title.querySelector('.tt'), 'tbx-cat-title');
        }, function (name, t) {
          var tile = null, tl = content.querySelectorAll('.tile[data-go]');
          for (var i = 0; i < tl.length; i++) if (CATGO[tl[i].getAttribute('data-go')] === catWas.k) tile = tl[i];
          if (!tile || !vtView(tile)) { try { t.skipTransition(); } catch (eS) {} return; }
          name(tile.querySelector('.tico'), 'tbx-cat-ico'); name(tile.querySelector('.tlt'), 'tbx-cat-title');
          content.classList.add('vt-fade'); setTimeout(function () { content.classList.remove('vt-fade'); }, 300);
        })) return;
        title.innerHTML = homeTitle;
      }
      // N11c: Back from a card to its list — the list is restored first, then the title (and photo) fly back to its row
      if (back && vtSeen(back.h1) && (CURQ || browseHTML.indexOf('data-go="' + pnRoute(back.sku) + '"') > -1)) {
        var hOld = back.hero && vtSeen(back.hero) ? back.hero : null;
        if (vtRun('back', gen, paint, function (name) {
          name(back.h1, 'tbx-title'); if (hOld) name(hOld, 'tbx-hero');
        }, function (name, t) {
          var r0 = backRow(back.sku), g = null;
          if (!r0) { try { t.skipTransition(); } catch (eS) {} return; }
          name(r0.querySelector('.ti'), 'tbx-title');
          if (hOld) g = name(vtGhost(r0, ''), 'tbx-hero');
          var fin = function () { if (g && g.parentNode) g.parentNode.removeChild(g); navRing(r0); };
          t.finished.then(fin, fin);
        })) return;
      }
    }
    paint(false);
    content.classList.remove('vt', 'vt-rise', 'vt-fade'); void content.offsetWidth; content.classList.add('vt');
    if (back) (window.requestAnimationFrame || setTimeout)(function () { try { navRing(backRow(back.sku)); } catch (eB) {} }); // after the restore
  }
  // N11b: the card photo starts decoding while the finger is still on the row
  document.addEventListener('pointerdown', function (e) {
    try {
      var r = e.target && e.target.closest ? e.target.closest('.rowitem[data-go^="#/pn/"]') : null;
      if (!r || !vtOK()) return;
      var en = BYPN[nrm(decodeURIComponent(r.getAttribute('data-go').slice(5)))], rec = en ? recOf(en) : null, src = rec && rec.imgs && rec.imgs[0];
      if (!src) return;
      var im = new Image(); im.src = src; if (im.decode) im.decode().then(null, function () {});
    } catch (x) {}
  }, { passive: true, capture: true });
  function mark(s) {
    var e = esc(s);
    GKEYS.forEach(function (k) {
      var kk = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('(^|[^\\w-])(' + kk + ')(?![\\w-])', 'i');
      e = e.replace(re, function (m, p1, p2) { // P18: an opening bracket stays on the term's line
        var lead = /[(\[]$/.test(p1) ? p1.slice(-1) : '';
        return p1.slice(0, p1.length - lead.length) + '<span class="gnb">' + lead + '<button class="gterm" data-g="' + esc(k) + '">' + p2 + '</button></span>';
      });
    });
    return e;
  }
  // the 4.143 card, kept as the automatic fallback of the new card (cardHTML)
  function specCardV1(o) {
    var chips = (o.chips || []).map(function (c) {
      return '<span class="chip' + (c.k ? ' ' + c.k : '') + (c.dim ? ' dim' : '') + '">' + esc(c.t) + '</span>'; }).join('');
    var rows = (o.specs || []).filter(function (s) { return s[1]; }).map(function (s) {
      if (!s[0]) return '<div class="lhead">' + esc(s[1]) + '</div>';
      return '<div class="lr"><div class="lk">' + esc(s[0]) + '</div><div class="lv">' + mark(s[1]) + '</div></div>';
    }).join('');
    var built = !!rows || !!o.note || !!o.bp || !!(o.imgs && o.imgs.length);
    var tagb = (o.tags || []).map(function (tg) { return ' <span class="subtag">' + esc(tg) + '</span>'; }).join('');
    var bob = boBannerHTML(o.sku); // backorder / controlled / cleared status, with the pill inside the banner
    var fav = '';
    if (o.fav) {
      var on = isFav(o.fav.route);
      fav = '<button class="favbtn' + (on ? ' on' : '') + '" data-fav=\'' + esc(JSON.stringify(o.fav)) + '\'>' +
        (on ? ICON.starOn + 'Favorited' : ICON.star + 'Favorite') + '</button>' +
        '<button class="favbtn" data-share="1">' + ICON.share + 'Share</button>';
    }
    return '<div class="card"><h1>' + esc(o.name) + tagb + '</h1><div class="fam">' + esc(o.fam || '') + '</div>' +
      bob +
      (!built ? '<div class="nobuild">Not built yet</div>' : '') +
      (o.warn ? '<div class="warn">' + ICON.warn + esc(o.warn) + '</div>' : '') +
      '<div class="pnblock"><div class="num mono">' + esc(o.sku) + '</div>' +
      '<button class="copy" data-copy="' + esc(o.sku) + '">Copy</button></div>' +
      (o.uom ? '<div class="uomline">Unit: <b>' + esc(o.uom) + '</b></div>' : '') +
      (fav ? '<div class="favrow">' + fav + '</div>' : '') +
      (o.refs && o.refs.length ? '<div class="reflinkrow">' + o.refs.map(function (r) {
        return r.menu ? '<button class="refbtn" data-lmenu=\'' + esc(JSON.stringify({ t: r.t, items: r.menu })) + '\'>' + esc(r.t) + '</button>'
          : r.pnm ? '<button class="refbtn" data-pnm="' + esc(r.pnm) + '">' + esc(r.t) + '</button>'
          : '<button class="refbtn" data-go="' + r.go + '">' + esc(r.t) + '</button>';
      }).join('') + '</div>' : '') +
      (chips ? '<div class="chips">' + chips + '</div>' : '') +
      (o.vars && o.vars.length ? '<div class="eyebrow vhead">Variants</div><div class="chips">' + o.vars.map(function (v) {
        return '<button class="chip link" data-go="' + v.go + '">' + esc(v.t) + '</button>';
      }).join('') + '</div>' : '') +
      (rows ? '<div class="ledger">' + rows + '</div>' : (built && !(o.imgs || []).length ? '<div class="empty">Specs coming — part number and description confirmed from the 2026 catalog.</div>' : '')) +
      (o.used && o.used.length ? '<div class="eyebrow vhead">Used with</div><div class="linkrow">' + o.used.map(function (u) {
        return '<button class="linkbtn" data-go="' + u.go + '">' + esc(u.t) + ' &#x203A;</button>';
      }).join('') + '</div>' : '') +
      (o.bp ? '<div class="bp"><div class="bp-h">RFT Best Practice</div><div class="bp-b">' + esc(o.bp).replace(/\n/g, '<br>') + '</div></div>' : '') +
      ((o.imgs || []).map(function (im) {
        return '<img class="photo' + ((!o.imgFull && (im.indexOf('img/serfas-') === 0 || im.indexOf('img/shaver-') === 0)) ? ' photo-sm' : '') + '" src="' + esc(im) + '" alt="Product reference photo" loading="lazy">';
      }).join('')) +
      (o.links && o.links.length ? '<div class="linkrow">' + o.links.map(function (l) {
        return '<button class="linkbtn" data-go="' + l.go + '">' + esc(l.t) + ' &#x203A;</button>';
      }).join('') + '</div>' : '') +
      (o.note ? '<div class="note">' + mark(o.note).replace(/\n/g, '<br>') + '</div>' : '') +
      (o.src ? '<div class="src">Sources: ' + esc(o.src) + '</div>' : '') + '</div>';
  }

  // ==== R6 product card (N6 P28 P29 P30 P31 P32 P33 N13) ==================================================
  // Block order: title (+ small photo) → status lines → warning → key facts → sticky part-number band (Copy, Favorite, Share)
  // → related links (Instrumentation / Associated / Parts / guides) → jump chips → specs (table | "Specs coming")
  // → labels + variants → Used with → RFT Best Practice → photo strip → related parts → note → sources.
  // Stable hooks: #pcard[data-sku][data-kind], h1[data-hero="title"], img[data-hero="image"], .pgal-s, #lb,
  // .coll/.open, .rel / .cd-ico / .st-l; section ids cd-rel cd-specs cd-used cd-bp cd-photos cd-parts cd-note cd-src.
  // specCardV1 (the 4.143 card) stays as the automatic fallback: cardHTML() renders it if this code throws.

  // THE product-photo <img>. Every photo on the new card (title photo, strip) and in the viewer is built here, so
  // photo behaviour (offline placeholder, retry, "saved" checks) attaches in one place. Returns exactly one <img>.
  function photoImgHTML(src, alt, attrs) {
    return '<img src="' + esc(src) + '" alt="' + esc(alt == null ? 'Product reference photo' : alt) + '"' + (attrs ? ' ' + attrs : '') + '>';
  }
  var CARD_SEQ = 0;
  function cdSvg(d, w, extra) {
    return '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>';
  }
  var CI = {
    copy: cdSvg('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6.2A2.2 2.2 0 0 0 13.3 4H6.2A2.2 2.2 0 0 0 4 6.2v7.1a2.2 2.2 0 0 0 2.2 2.2h2.3"/>'),
    star: cdSvg('<path class="st-f" d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>'),
    share: cdSvg('<path d="M12 3.5v11"/><path d="M8.2 7.2L12 3.5l3.8 3.7"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>'),
    zoom: cdSvg('<circle cx="10.5" cy="10.5" r="6"/><path d="M20 20l-5-5M10.5 8v5M8 10.5h5"/>', 15, ' stroke-width="2.2"')
  };

  // P30 — one tappable line per status; the original sentences (date + report stamp, note, report link) open under it.
  // Other status lines (e.g. a scanned lot/expiry) can join the stack: STATUS_PROVIDERS.push(fn(sku) → [{k, pill, sum, det}]).
  var STATUS_PROVIDERS = [];
  function boSum(r) {
    if (r.clearDate) return boPast(r.clearDate) ? 'clear date passed' : 'clears ' + boFmt(r.clearDate);
    if (r.clearText) return 'clears ' + esc(r.clearText);
    return r.since ? 'since ' + boFmt(r.since) : 'no clear date given';
  }
  function statusRowsFor(sku) {
    var rows = [], e = boFor(sku),
        rep = '<button type="button" class="bo-more" data-go="' + esc(boReportRoute(sku)) + '">Backorder Report &#x203A;</button>'; // P46: the report, filtered to this part
    if (e) {
      if (e.st.bo) rows.push({ k: 'bo', pill: BO_PILL.bo, sum: boSum(e.bo),
        det: '<div class="bo-line">' + boWhen(e.bo) + '</div>' + (e.bo.note ? '<div class="bo-msg">' + esc(e.bo.note) + '</div>' : '') + rep });
      if (e.st.ctl) rows.push({ k: 'ctl', pill: BO_PILL.ctl, sum: '24–36 hr ship delay',
        det: '<div class="bo-line">Inventory controlled · 24–36 hr shipping delay</div>' + (e.ctl.msg ? '<div class="bo-msg">' + esc(e.ctl.msg) + '</div>' : '') + rep });
      if (e.st.clr && !e.st.bo) rows.push({ k: 'clr', pill: BO_PILL.clr, sum: 'week of ' + boFmt(e.clr.clearedOn),
        det: '<div class="bo-line">Cleared backorder · week of ' + boFmt(e.clr.clearedOn) + '</div>' + rep });
    }
    STATUS_PROVIDERS.forEach(function (fn) { try { (fn(sku) || []).forEach(function (r) { rows.push(r); }); } catch (eSp) {} });
    return rows;
  }
  function statusHTML(sku) {
    var rows = statusRowsFor(sku); if (!rows.length) return '';
    var base = 'st' + (++CARD_SEQ);
    // .bobanner / .bopill are kept: tools/bo/app-test.js reads them (banner before the part-number band)
    return '<div class="bobanner">' + rows.map(function (r, i) {
      var id = base + '-' + i;
      return '<div class="st-row st-' + esc(r.k) + '"><button type="button" class="st-l" data-coll aria-expanded="false" aria-controls="' + id + '">' +
        '<span class="bopill ' + esc(r.k) + '">' + esc(r.pill) + '</span><span class="st-t">' + r.sum + '</span><span class="st-c" aria-hidden="true">&#x203A;</span></button>' +
        '<div class="coll" id="' + id + '"><div class="coll-in"><div class="st-d">' + r.det + '</div></div></div></div>';
    }).join('') + '</div>';
  }

  // N6 — key facts: up to 3 EXISTING spec rows shown as tiles under the title and left out of the table (nothing added
  // or reworded). Rows come from the first table section only; tiles show when the table has >= 6 plain rows and >= 2
  // rows qualify. Rules: [labels in priority order, skip when the value is already in the title].
  var KF_RULES = {
    anchor: [[['Drill diameter', 'Drill size', 'Pilot hole'], 0], [['Drill depth', 'Pilot depth', 'Min socket depth'], 0],
      [['Length', 'Anchor length'], 0], [['Diameter', 'Anchor size', 'Anchor diameter', 'Max anchor diameter'], 1], [['Cannula', 'Minimum cannula'], 0]],
    knee: [[['Min tunnel', 'Suggested tunnel size'], 0], [['Min socket depth'], 0], [['Flip length'], 0], [['Loop length'], 0], [['Cortical footprint'], 0]],
    screw: [[['Drill size', 'Drill diameter'], 0], [['Length', 'Total length'], 1], [['Recommended tendon'], 0]],
    disp: [[['Inner diameter', 'Internal diameter'], 0], [['Diameter', 'Outer diameter', 'Cutting diameter', 'Cutting-head diameter', 'Shaft diameter', 'Drill diameter', 'Tip diameter'], 1],
      [['Working length', 'Length', 'Total length'], 1], [['Drill depth'], 0], [['Positive stop'], 0], [['Angle'], 1], [['Tip'], 0]],
    instr: [[['Diameter', 'Inner diameter', 'Outer diameter', 'Cutting diameter', 'Cutting-head diameter', 'Shaft diameter', 'Tip diameter', 'Drill diameter'], 1],
      [['Working length', 'Length', 'Marked length', 'Total length'], 1], [['Angle', 'Curvature', 'Offset'], 1], [['Tip'], 0], [['Size'], 1]],
    suture: [[['Strand length', 'Loop length', 'Total length'], 0], [['Needle'], 0], [['Color'], 1]],
    bio: [[['Dimensions', 'Size', 'Length', 'Label measurements', 'Graft size', 'Volume', 'Particle size'], 1], [['Preservation'], 1], [['Storage'], 0]],
    shaver: [[['Diameter'], 1], [['Length', 'Working length'], 0], [['Series'], 1]],
    probe: [[['Cut default'], 0], [['Coag'], 0], [['Outer diameter', 'Diameter'], 1]]
  };
  var KF_MAX = 22, KF_GATE = 6, KF_BAD = /^(no minimum|not listed|not published|size variable|see |varies)/i;
  function kfRule(o) {
    if (o.kind === 'shaver' || o.kind === 'probe') return o.kind;
    var c = o.cat || '';
    if (c === 'Screws') return 'screw';
    if (c === 'Knee/Meniscus Anchors') return 'knee';
    if (c === 'Artelon' || c === 'Other') return '';
    if (IMPLANT_CATS.indexOf(c) !== -1) return 'anchor';
    return c === 'Disposables' ? 'disp' : c === 'Instruments' ? 'instr' : c === 'Suture' ? 'suture' : c === 'Allografts & Biologics' ? 'bio' : '';
  }
  function kfNorm(s) { return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[″"]/g, 'in'); }
  // rows = the card's non-empty spec rows (the same array the table renders); returns [{i, k, v}], i = row index
  function keyFactsFor(o, rows) {
    var rule = KF_RULES[kfRule(o)]; if (!rule) return [];
    var plain = 0, sec1 = rows.length;
    for (var r = 0; r < rows.length; r++) { if (rows[r][0]) plain++; else if (sec1 === rows.length) sec1 = r; }
    if (plain < KF_GATE) return [];
    var title = kfNorm(o.name), out = [], used = {};
    for (var g = 0; g < rule.length && out.length < 3; g++) {
      var hit = -1;
      for (var l = 0; l < rule[g][0].length && hit < 0; l++) for (var j = 0; j < sec1; j++) if (rows[j][0] === rule[g][0][l]) { hit = j; break; }
      if (hit < 0 || used[hit]) continue;
      var v = String(rows[hit][1]).trim();
      if (v.length > KF_MAX || KF_BAD.test(v) || (rule[g][1] && title.indexOf(kfNorm(v)) !== -1)) continue;
      used[hit] = 1; out.push({ i: hit, k: rows[hit][0], v: v });
    }
    return out.length >= 2 ? out : [];
  }

  // P29 — one ≥44 pt amber chevron pill for every related link; more than 5 → the first 4 + "N more" (N13).
  function relPill(r, cls) {
    cls = 'rel' + (cls ? ' ' + cls : '');
    if (r.menu) return '<button type="button" class="' + cls + '" data-lmenu=\'' + esc(JSON.stringify({ t: r.t, items: r.menu })) + '\'>' + esc(r.t) + '</button>';
    if (r.pnm) return '<button type="button" class="' + cls + '" data-pnm="' + esc(r.pnm) + '">' + esc(r.t) + '</button>';
    return '<button type="button" class="' + cls + '" data-go="' + esc(r.go) + '">' + esc(r.t) + '</button>';
  }
  function pillsHTML(list, idBase) {
    if (!list.length) return '';
    if (list.length <= 5) return '<div class="rel-row">' + list.join('') + '</div>';
    var id = idBase + '-x';
    return '<div class="rel-row">' + list.slice(0, 4).join('') +
      '<button type="button" class="rel rel-more" data-coll data-more="' + (list.length - 4) + '" aria-expanded="false" aria-controls="' + id + '">' + (list.length - 4) + ' more</button></div>' +
      '<div class="coll" id="' + id + '"><div class="coll-in"><div class="rel-row">' + list.slice(4).join('') + '</div></div></div>';
  }
  var REL_SYS = /^#\/(instr|parts|fam|sub)\//;
  // P28 — right under the part-number band: the system links (Instrumentation / Associated … / Parts) and the hidden
  // guide cards (User guide, Error codes, Thawing guide, "Replaces … — why?"). Item-to-item links stay after the photos.
  function relTopHTML(o, seq) {
    var sys = (o.links || []).filter(function (l) { return REL_SYS.test(l.go || ''); }).map(function (l) { return relPill(l); });
    var refs = (o.refs || []).map(function (r) { return relPill(r, 'rel-ref'); });
    var h = pillsHTML(sys.concat(refs), 'rel' + seq);
    return h ? '<div class="cd-rel" id="cd-rel">' + h + '</div>' : '';
  }
  function relUsedHTML(o, seq) { // instrument cards: the implants that list this instrument (after the table, as before)
    var used = (o.used || []).map(function (u) { return relPill(u); });
    return used.length ? '<div class="cd-used" id="cd-used"><div class="eyebrow vhead">Used with</div>' + pillsHTML(used, 'use' + seq) + '</div>' : '';
  }
  function relPartsHTML(o, seq) { // item-to-item links (drill guide, handle, versions…): after the photos, as before
    var item = (o.links || []).filter(function (l) { return !REL_SYS.test(l.go || ''); }).map(function (l) { return relPill(l); });
    return item.length ? '<div class="cd-parts" id="cd-parts">' + pillsHTML(item, 'prt' + seq) + '</div>' : '';
  }
  // P32 — swipeable photo strip below the spec table ("1/4" counter); tap opens the viewer on that photo.
  function isSmallPhoto(o, im) { return !o.imgFull && (im.indexOf('img/serfas-') === 0 || im.indexOf('img/shaver-') === 0); }
  // R7 N14 — a lone photo sits in a slide as tall as the photo: its box comes from img-dims.js (built by tools/img-dims.mjs)
  // so the text below never moves when it arrives. The width reproduces today's max-width / max-height result exactly.
  function photoBox(src, sm) {
    var d = window.TBX_IMGD && window.TBX_IMGD[src];
    if (!d || !(d[0] > 0 && d[1] > 0)) return '';
    var w = d[0], h = d[1];
    return ' width="' + w + '" height="' + h + '" style="width:' + (sm ? Math.round(Math.min(110, w, 150 * w / h)) + 'px' : 'min(100%, ' + w + 'px, ' + Math.round(418 * w / h) + 'px)') + '"';
  }
  function photosHTML(o) {
    var imgs = o.imgs || [], n = imgs.length; if (!n) return '';
    return '<section class="cd-photos" id="cd-photos" tabindex="-1" aria-label="Photos"><div class="pgal" data-n="' + n + '">' +
      '<div class="pgal-t"' + (n > 1 ? ' role="group" aria-roledescription="carousel" aria-label="' + n + ' photos"' : '') + '>' +
      imgs.map(function (im, i) {
        var sm = isSmallPhoto(o, im);
        return '<button type="button" class="pgal-s' + (sm ? ' sm' : '') + '" data-i="' + i + '" data-src="' + esc(im) + '" aria-label="' +
          (n > 1 ? 'Photo ' + (i + 1) + ' of ' + n : 'Photo') + ', open full screen">' +
          photoImgHTML(im, 'Product reference photo', 'class="photo' + (sm ? ' photo-sm' : '') + '" loading="lazy" decoding="async"' + (n === 1 ? photoBox(im, sm) : '')) +
          '<span class="pgal-z" aria-hidden="true">' + CI.zoom + '</span></button>';
      }).join('') + '</div>' + (n > 1 ? '<span class="pgal-n" aria-hidden="true">1/' + n + '</span>' : '') + '</div></section>';
  }
  // N6 — jump chips: sections further down the card (Specs · Diagrams · Sources), only those present, only when there
  // are 3 of them and only on long cards: a chip row on a card that one flick scrolls through just pushes the specs down.
  // The Instrumentation links need no chip: P28 puts them directly under the band.
  // cardLen = the card's height at 390 pt estimated from its content (fitted on all 1,440 cards, median error ±70 pt);
  // above 1,000 ≈ longer than 1.4 screens.
  function cardLen(o, rows) {
    var chars = 0; rows.forEach(function (s) { chars += String(s[1]).length; });
    return 590 + 34 * rows.length + 1.3 * chars + 0.4 * (o.note || '').length + 1.1 * (o.bp || '').length + 1.4 * (o.warn || '').length;
  }
  function jumpChipsHTML(list, len) {
    if (list.length < 3 || len <= 1000) return '';
    return '<nav class="cd-jump" aria-label="On this card">' + list.map(function (j) {
      return '<button type="button" class="cd-j" data-jump="' + esc(j[0]) + '">' + esc(j[1]) + '</button>'; }).join('') + '</nav>';
  }
  function specCard(o) {
    var seq = ++CARD_SEQ;
    var rowsAll = (o.specs || []).filter(function (s) { return s[1]; });
    var kf = keyFactsFor(o, rowsAll), skip = {};
    kf.forEach(function (f) { skip[f.i] = 1; });
    var rows = rowsAll.map(function (s, i) {
      if (skip[i]) return '';
      if (!s[0]) return '<div class="lhead">' + esc(s[1]) + '</div>';
      return '<div class="lr"><div class="lk">' + esc(s[0]) + '</div><div class="lv">' + mark(s[1]) + '</div></div>';
    }).join('');
    var imgs = o.imgs || [];
    var built = rowsAll.length > 0 || !!o.note || !!o.bp || !!imgs.length;
    var tagb = (o.tags || []).map(function (tg) { return ' <span class="subtag">' + esc(tg) + '</span>'; }).join('');
    // title only: no photo beside it (Nate, 2026-09-24) — the photos live in the strip further down; lists never show photos
    var head = '<div class="pc-head"><div class="pc-tt"><h1 data-hero="title">' + esc(o.name) + tagb + '</h1>' +
      (o.fam ? '<div class="fam">' + esc(o.fam) + '</div>' : '') + '</div></div>';
    var kfHTML = kf.length ? '<div class="kf' + (kf.length === 2 ? ' kf2' : '') + '" role="list" aria-label="Key specs">' + kf.map(function (f) {
      return '<div class="kf-i' + (f.v.length > 10 ? ' kf-long' : '') + '" role="listitem"><span class="kf-k">' + esc(f.k) + '</span><span class="kf-v">' + esc(f.v) + '</span></div>';
    }).join('') + '</div>' : '';
    // sticky part-number band: part #, unit, and the Copy / Favorite / Share icons (44 pt each)
    var icons = '<button type="button" class="cd-ico cd-copy" data-copy="' + esc(o.sku) + '" aria-label="Copy part number">' + CI.copy + '</button>';
    if (o.fav) {
      var on = isFav(o.fav.route);
      icons += '<button type="button" class="cd-ico cd-fav' + (on ? ' on' : '') + '" data-fav=\'' + esc(JSON.stringify(o.fav)) + '\' aria-pressed="' + on + '" aria-label="Favorite">' + CI.star + '</button>' +
        '<button type="button" class="cd-ico cd-share" data-share="1" aria-label="Share">' + CI.share + '</button>';
    }
    var sku = String(o.sku || '');
    var band = '<div class="pnblock"><div class="pn-v"><div class="num mono' + (sku.length > 10 ? ' pn-l' : '') + '">' + esc(sku) + '</div>' +
      (o.uom ? '<div class="pn-u">' + esc(o.uom) + '</div>' : '') + '</div><div class="pn-i">' + icons + '</div></div>';
    // P33 — neutral "Specs coming" for everyone; the owner's phone (usage admin key) also sees the build flag
    var adm = false; try { adm = !!ugAdmin(); } catch (eA) {}
    var specs = rows ? '<div class="ledger">' + rows + '</div>' : '';
    if (!rowsAll.length && !imgs.length) specs = '<div class="cd-soon">Specs coming</div>' + (!built && adm ? '<div class="cd-todo">Not built yet · owner view</div>' : '');
    var lab = (o.chips || []).filter(function (c) { return c.k || kfNorm(o.name).indexOf(kfNorm(c.t)) === -1; }).map(function (c) { // drop the size chip that repeats the title
      return '<span class="chip' + (c.k ? ' ' + c.k : '') + (c.dim ? ' dim' : '') + '">' + esc(c.t) + '</span>'; }).join('');
    var jumps = [];
    if (specs) jumps.push(['cd-specs', 'Specs']);
    if (imgs.length) jumps.push(['cd-photos', 'Diagrams']);
    if (o.src) jumps.push(['cd-src', 'Sources']);
    return '<div class="card pcard" id="pcard" data-sku="' + esc(sku) + '" data-kind="' + esc(o.kind || 'item') + '">' +
      head +
      statusHTML(sku) +
      (o.warn ? '<div class="warn">' + ICON.warn + esc(o.warn) + '</div>' : '') +
      kfHTML +
      band +
      relTopHTML(o, seq) +
      jumpChipsHTML(jumps, cardLen(o, rowsAll)) +
      (specs ? '<section class="cd-specs" id="cd-specs" tabindex="-1" aria-label="Specs">' + specs + '</section>' : '') +
      (lab ? '<div class="chips cd-lab">' + lab + '</div>' : '') +
      (o.vars && o.vars.length ? '<div class="eyebrow vhead">Variants</div><div class="chips cd-vars">' + o.vars.map(function (v) {
        return '<button type="button" class="chip link" data-go="' + esc(v.go) + '">' + esc(v.t) + '</button>';
      }).join('') + '</div>' : '') +
      relUsedHTML(o, seq) +
      (o.bp ? '<div class="bp" id="cd-bp"><div class="bp-h">RFT Best Practice</div><div class="bp-b">' + esc(o.bp).replace(/\n/g, '<br>') + '</div></div>' : '') +
      photosHTML(o) +
      relPartsHTML(o, seq) +
      (o.note ? '<div class="note" id="cd-note">' + mark(o.note).replace(/\n/g, '<br>') + '</div>' : '') +
      (o.src ? '<div class="cd-src" id="cd-src" tabindex="-1"><div class="src">Sources: ' + esc(o.src) + '</div></div>' : '') +
      '</div>';
  }
  // Safety net: a card that throws renders the 4.143 layout instead of a blank screen (a throw during the first route
  // would trip the heal watchdog). The error goes to the usage hub as "card: …". CARD2 is a test seam (TBX_DEV.card.setV2).
  var CARD2 = { render: specCard };
  function cardHTML(o) {
    try { return CARD2.render(o); } catch (eC) {
      try { ugErr('card: ' + String((eC && eC.message) || eC).slice(0, 60) + ' (' + (o && o.sku) + ')', 'card', 0); } catch (eU) {} // usage hub: deduped, ≤5 a session
      return specCardV1(o);
    }
  }
  function cardRM() { return motionRM(); }
  // N13 — collapsible blocks (status details, "N more"): grid-template-rows 0fr → 1fr, which animates in iOS Safari 16+
  // (older versions just open); the tapped control stays under the finger (Safari has no CSS scroll anchoring).
  function keepInView(anchor, change) {
    var y0 = anchor.getBoundingClientRect().top; change();
    if (cardRM()) { var d0 = anchor.getBoundingClientRect().top - y0; if (Math.abs(d0) > 0.5) window.scrollBy(0, d0); return; }
    var t0 = Date.now();
    (function pin() {
      var dy = anchor.getBoundingClientRect().top - y0;
      if (Math.abs(dy) > 0.5) window.scrollBy(0, dy);
      if (Date.now() - t0 < 320) requestAnimationFrame(pin);
    })();
  }
  // N6 — a jump lands the section just under the sticky header + part-number band
  function cardJump(id) {
    var sec = document.getElementById(id); if (!sec) return;
    var bar = document.getElementById('bar'), band = document.querySelector('#pcard > .pnblock');
    var off = (bar ? bar.getBoundingClientRect().bottom : 0) + (band ? band.getBoundingClientRect().height : 0) + 10;
    var y = Math.max(0, Math.round(sec.getBoundingClientRect().top + (window.pageYOffset || 0) - off));
    try { window.scrollTo({ top: y, behavior: cardRM() ? 'auto' : 'smooth' }); } catch (eS) { window.scrollTo(0, y); }
    try { sec.focus({ preventScroll: true }); } catch (eF) {}
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-coll]') : null;
    if (t) {
      var box = document.getElementById(t.getAttribute('aria-controls') || '');
      if (!box) return;
      var open = t.getAttribute('aria-expanded') !== 'true';
      keepInView(t, function () {
        t.setAttribute('aria-expanded', String(open)); box.classList.toggle('open', open);
        if (t.hasAttribute('data-more')) t.textContent = open ? 'Fewer' : t.getAttribute('data-more') + ' more';
      });
      return;
    }
    var j = e.target && e.target.closest ? e.target.closest('.cd-jump [data-jump]') : null;
    if (j) cardJump(j.getAttribute('data-jump'));
  });
  // P32 — strip counter ("2/4"): scroll events don't bubble, so one capture-phase listener serves every strip
  document.addEventListener('scroll', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('pgal-t') || t.__raf) return;
    t.__raf = requestAnimationFrame(function () {
      t.__raf = 0;
      var s = t.firstElementChild, w = s ? s.getBoundingClientRect().width + 10 : 1;
      var i = Math.max(0, Math.min(t.children.length - 1, Math.round(t.scrollLeft / w)));
      var n = t.parentNode && t.parentNode.querySelector('.pgal-n');
      if (n) n.textContent = (i + 1) + '/' + t.children.length;
    });
  }, true);
  // the part-number band sticks right under the header: --hdr-h follows the header's real height (the CSS default is
  // the same sum), so a header change (landscape, zoom, a new header) never leaves a gap or an overlap
  (function () {
    var bar = document.getElementById('bar'), RO = window.ResizeObserver;
    if (!bar || !RO) return;
    try {
      new RO(function () { var h = bar.getBoundingClientRect().height; if (h > 0) document.documentElement.style.setProperty('--hdr-h', Math.round(h) + 'px'); }).observe(bar);
    } catch (eR) {}
  })();

  // ---- instrumentation resolver ----
  // P51: family index (fam -> item indexes, D.items order) and an exact-sku map, built once. instrFor used to walk every
  // item twice per call; the "used with" reverse index calls it for all ~584 implants on the first instrument card.
  var FAMIX = null, SKUIX = null;
  function famIx() {
    if (FAMIX) return FAMIX;
    FAMIX = {}; SKUIX = {};
    D.items.forEach(function (x, i) { (FAMIX[x.fam] = FAMIX[x.fam] || []).push(i); if (!(x.sku in SKUIX)) SKUIX[x.sku] = x; });
    return FAMIX;
  }
  function famItems(fams) {
    var ix = famIx(), all = [];
    fams.forEach(function (f) { if (ix[f]) all = all.concat(ix[f]); });
    if (fams.length > 1) all.sort(function (a, b) { return a - b; });
    var out = [], last = -1;
    all.forEach(function (i) { if (i !== last) out.push(D.items[i]); last = i; });
    return out;
  }
  function instrFor(it) {
    if (!it || !it.fam) return [];
    var ov = it.instr || {};
    if (ov.incl) {
      famIx();
      var out0 = [];
      ov.incl.forEach(function (sku) { if (SKUIX[sku]) out0.push({ it: SKUIX[sku] }); });
      return out0;
    }
    var fams = ov.fams || [ov.fam || it.fam];
    var own = ov.sz !== undefined ? ov.sz : (it.sz || '');
    var excl = ov.excl || [];
    var req = ov.req || '';
    var sibs = {};
    var pool = famItems(fams);
    pool.forEach(function (x) {
      if (x.sz) sibs[x.sz] = 1;
    });
    var VARIANTS = { 'CinchLock knotless anchor': ['SS', 'Flex'] };
    var vtoks = VARIANTS[it.fam] || [];
    var ownV = '';
    vtoks.forEach(function (v) {
      if (new RegExp('\\b' + v + '\\b').test(it.name || '')) ownV = ownV || v;
    });
    var out = [];
    pool.forEach(function (x) {
      if (x.hidden) return;
      if (x.cat !== 'Disposables' && x.cat !== 'Instruments' && x.cat !== 'Capital') return;
      if (excl.indexOf(x.sku) !== -1) return;
      if (req && ((x.name || '') + ' ' + (x.ld || '')).indexOf(req) === -1) return;
      var name = (x.name || '') + ' ' + (x.ld || '');
      var mentionsOwn = own && name.indexOf(own) !== -1;
      var mentionsSib = false;
      Object.keys(sibs).forEach(function (sz) {
        if (sz !== own && name.indexOf(sz) !== -1) mentionsSib = true;
      });
      if (own && mentionsSib && !mentionsOwn) return;
      if (ownV) {
        var mentionsOwnV = new RegExp('\\b' + ownV + '\\b').test(name);
        var mentionsOtherV = vtoks.some(function (v) {
          return v !== ownV && new RegExp('\\b' + v + '\\b').test(name);
        });
        if (mentionsOtherV && !mentionsOwnV) return;
      }
      out.push({ it: x });
    });
    if (it.cat === 'Disposables' && !out.some(function (x) { return x.it.cat === 'Instruments' || x.it.cat === 'Capital'; })) return [];
    return out;
  }

  function variantsFor(it) {
    if (!it.sz || ['Disposables', 'Instruments', 'Capital', 'Suture'].indexOf(it.cat) !== -1) return [];
    var out = [], seen = {};
    D.items.forEach(function (x) {
      if (x.fam !== it.fam || (x.sub || '') !== (it.sub || '') || x.sku === it.sku) return;
      if ((x.ld || '') === (it.ld || '') && x.sz && x.sz !== it.sz && !seen['s' + x.sz]) {
        seen['s' + x.sz] = 1; out.push({ t: x.sz, go: pnRoute(x.sku) });
      }
    });
    var subs = {};
    D.items.forEach(function (x) {
      if (x.fam !== it.fam || !x.sub || x.sub === (it.sub || '') || x.sz !== it.sz) return;
      (subs[x.sub] = subs[x.sub] || []).push(x);
    });
    var first = (it.fam || '').split(' ')[0];
    Object.keys(subs).forEach(function (sname) {
      var arr = subs[sname];
      var label = sname.replace(new RegExp('^' + first + '\\s*'), '').replace(/^with\s+/i, '') || sname;
      var exact = arr.filter(function (x) { return (x.ld || '') === (it.ld || ''); });
      var go = exact.length === 1 ? pnRoute(exact[0].sku)
             : arr.length === 1 ? pnRoute(arr[0].sku)
             : '#/sub/' + encodeURIComponent(it.cat) + '/' + encodeURIComponent(it.fam) + '/' + encodeURIComponent(sname);
      out.push({ t: label, go: go });
    });
    return out.slice(0, 8);
  }
  // Reverse index instrument-sku -> implants that list it, built once on first
  // use (instrFor over every implant is ~600k comparisons; per card that was a
  // visible pause on older phones).
  var USEDBY = null;
  function usedByIndex() {
    if (USEDBY) return USEDBY;
    USEDBY = {};
    D.items.forEach(function (a) {
      if (a.cat === 'Disposables' || a.cat === 'Instruments' || a.cat === 'Capital' || a.cat === 'Suture') return;
      if (!a.specs || !a.specs.length) return;
      var l = instrFor(a), seen = {};
      for (var i = 0; i < l.length; i++) {
        var k = l[i].it.sku;
        if (seen[k]) continue; seen[k] = 1;
        (USEDBY[k] = USEDBY[k] || []).push(a);
      }
    });
    return USEDBY;
  }
  function usedWith(inst) {
    if (inst.cat !== 'Disposables' && inst.cat !== 'Instruments' && inst.cat !== 'Capital') return [];
    var groups = {}, order = [];
    (usedByIndex()[inst.sku] || []).forEach(function (a) {
      var famShort = FAMSHORT[a.fam] || (a.fam || '').split(' ')[0];
      var key = famShort + '|' + (a.sz || '');
      if (!groups[key]) { groups[key] = { fam: a.fam, cat: a.cat, famShort: famShort, sz: a.sz || '', items: [] }; order.push(key); }
      groups[key].items.push(a);
    });
    return order.map(function (k) {
      var g = groups[k];
      var label = g.famShort + (g.sz ? ' ' + g.sz : '') + (g.items.length > 1 ? ' — ' + g.items.length : '');
      var go = g.items.length === 1 ? pnRoute(g.items[0].sku)
             : '#/fam/' + encodeURIComponent(g.cat) + '/' + encodeURIComponent(g.fam);
      return { t: label, go: go };
    }).slice(0, 10);
  }

  // ---- screens ----
  // One definition of "how many items are in a category" for every tile and row:
  // visible items whose cat OR cat2 matches, which is exactly what the screen
  // behind the tile lists.
  var CATN = {};
  function catCount(c) {
    if (CATN[c] !== undefined) return CATN[c];
    var n = 0; D.items.forEach(function (i) { if (!i.hidden && (i.cat === c || i.cat2 === c)) n++; });
    return (CATN[c] = n);
  }
  function implantCount() {
    var n = 0; IMPLANT_CATS.forEach(function (c) { n += catCount(c); }); return n;
  }
  function pumpTubing() {
    return D.items.filter(function (i) { return i.fam === 'CrossFlow arthroscopy pump' && i.cat === 'Disposables'; });
  }
  function capArthro() {
    var fams = ['CrossFire 2 resection platform', 'CrossFlow arthroscopy pump', 'FloSteady arthroscopy pump', 'Shaver handpieces'];
    return D.items.filter(function (i) { return !i.hidden && i.cat === 'Capital' && fams.indexOf(i.fam) !== -1; });
  }
  // R7 N10 — one line style (24 grid, 1.8 stroke, round caps and joins, currentColor, a 22% duotone mass) and a product
  // silhouette per category; the accent is the chip's class (.tico.k-<key> in index.html) and counts stay amber. The same
  // glyphs head each landing page (N2). Backorder keeps its blue tile, Inventory its amber one.
  var CATSVG = {
    allo: '<g transform="rotate(-45 12 12) translate(0 -1.2) scale(.92) translate(1.04 1.04)"><path class="f" d="M8.02 10.9H15.98A2.3 2.3 0 1 1 18.67 12A2.3 2.3 0 1 1 15.98 13.1H8.02A2.3 2.3 0 1 1 5.33 12A2.3 2.3 0 1 1 8.02 10.9Z"/><path d="M8.02 10.9H15.98A2.3 2.3 0 1 1 18.67 12A2.3 2.3 0 1 1 15.98 13.1H8.02A2.3 2.3 0 1 1 5.33 12A2.3 2.3 0 1 1 8.02 10.9Z"/></g><path class="f" d="M17.6 13.6c1.5 1.8 2.4 3.1 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.2.9-2.5 2.4-4.3z"/><path d="M17.6 13.6c1.5 1.8 2.4 3.1 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.2.9-2.5 2.4-4.3z"/>',
    arth: '<path d="M3.4 3.4l8.3 8.3"/><path d="M9.2 9.2l2.6-2.6"/><circle cx="12.6" cy="5.8" r="1.25" fill="currentColor" stroke="none"/><g transform="rotate(45 16 16)"><rect x="10.8" y="14.9" width="1.8" height="2.2" rx=".4"/><rect class="f" x="12.6" y="13.2" width="7.4" height="5.6" rx="1.8"/><rect x="12.6" y="13.2" width="7.4" height="5.6" rx="1.8"/></g><path d="M19.2 19.2c.9 1 1.2 2 .9 2.9"/>',
    cap: '<rect class="f" x="3.5" y="4" width="17" height="11" rx="2"/><rect x="3.5" y="4" width="17" height="11" rx="2"/><rect x="6" y="6.6" width="7.6" height="5.8" rx="1"/><path d="M16.6 7.4v.01M16.6 11.2v.01" stroke-width="2.4"/><path d="M8 15v3.6M16 15v3.6M5.5 18.6h13"/><circle cx="6.8" cy="20.8" r="1.25" fill="currentColor" stroke="none"/><circle cx="17.2" cy="20.8" r="1.25" fill="currentColor" stroke="none"/>',
    disp: '<circle class="f" cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="8.3"/><path d="M9.7 9.6a2.4 2.4 0 0 1 4.6 1c0 .9-.5 1.5-1.3 2.2l-3.3 2.9h4.8"/><path d="M6.2 6.2l11.6 11.6"/>',
    impl: '<path d="M9.3 10h5.4v5.6L12 21l-2.7-5.4z"/><path d="M9.3 12.4h5.4M9.3 14.8h5.4M10.1 17.2h3.8"/><path class="f" d="M10.4 10C9.1 6.4 9.9 3.2 12 3.2s2.9 3.2 1.6 6.8z"/><path d="M10.4 10C9.1 6.4 9.9 3.2 12 3.2s2.9 3.2 1.6 6.8"/>',
    inst: '<circle cx="5.2" cy="16.2" r="2.1"/><circle cx="7.8" cy="18.8" r="2.1"/><path d="M6.7 14.7l5.1-2.9M9.3 17.3l2.9-5.1"/><path class="f" d="M11.2 11.2l9.1-7.5-7.5 9.1z"/><path d="M11.2 11.2l9.1-7.5-7.5 9.1z"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    sut: '<path fill="currentColor" stroke="currentColor" stroke-width=".5" stroke-linejoin="round" d="M3.4 12.6A8.4 8.4 0 0 1 20 10.6L17.4 11.9A5.9 5.9 0 0 0 3.4 12.6Z"/><path d="M18.9 11.6c1.5 2.3 1.4 5-.6 6.5-2 1.5-4.8.8-5.5-1.1-.6-1.8 1-3.2 2.7-2.5 2 .8 1.6 4.2-.4 5.8-1.5 1.1-3.4 1.4-5.4 1.2"/>',
    bo: '<path class="f" d="M3.5 8.2L10.5 5l7 3.2v7.1l-7 3.3-7-3.3z"/><path d="M13 17.5l-2.5 1.1-7-3.3V8.2L10.5 5l7 3.2v3.6"/><path d="M3.5 8.2l7 3.2 7-3.2M10.5 11.4v7.2"/><circle class="cb" cx="17.4" cy="17.4" r="4.3"/><circle cx="17.4" cy="17.4" r="3.5"/><path d="M17.4 15.6v1.9l1.3.9"/>',
    inv: '<rect class="f" x="5" y="4.6" width="14" height="16.4" rx="2"/><rect x="5" y="4.6" width="14" height="16.4" rx="2"/><path d="M9 4.6V3.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M8.1 10.4l1.4 1.4 2.6-2.6M13.9 10.6h2.2M8.1 15.6l1.4 1.4 2.6-2.6M13.9 15.8h2.2"/>'
  };
  function catSvg(k) {
    return CATSVG[k] ? '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + CATSVG[k] + '</svg>' : '';
  }
  var CATKEY = { 'Arthroscopy': 'arth', 'Allografts & Biologics': 'allo', 'Disposables': 'disp', 'Implants': 'impl', 'Instruments': 'inst', 'Suture': 'sut', 'Capital': 'cap' };
  var TILE_ICONS = {};
  Object.keys(CATKEY).forEach(function (l) { TILE_ICONS[l] = catSvg(CATKEY[l]); });
  var WN_SHOWN = false;
  function wnSeen() { try { localStorage.setItem('tbx_wn_seen', String((window.TBX_WN || {}).v || 1)); } catch (e) {} }
  function hideWN(markSeen) {
    var el = document.getElementById('wncard');
    if (!el) return;
    if (markSeen) wnSeen();
    el.classList.add('bye');
    setTimeout(function () { el.remove(); }, 260);
  }
  function showWN() {
    try {
      var WN = window.TBX_WN;
      if (!WN || !WN.items || !WN.items.length) return;
      if (+(localStorage.getItem('tbx_wn_seen') || 0) >= WN.v) return;
      if (!localStorage.getItem('tbx_tour_done')) return; // first launch: the tour, not What's New (the tour marks it seen)
    } catch (e) { return; }
    if (WN_SHOWN || document.getElementById('wncard')) return;
    WN_SHOWN = true;
    var WN2 = window.TBX_WN;
    var el = document.createElement('div');
    el.id = 'wncard';
    el.innerHTML = '<div class="wn-h"><span>What&#8217;s new</span>' +
      '<button id="wndismiss" aria-label="Dismiss">' + ICON.close + '</button></div>' +
      WN2.items.slice().reverse().map(function (i, idx) { // whatsnew.js is appended oldest -> newest: newest shows first
        var inner = '<b>' + esc(i.d) + '</b>' + esc(i.t) + (i.link ? '<span class="wn-link">' + esc(i.link) + '</span>' : '') + (i.after ? esc(i.after) : '');
        var cls = 'wn-i' + (idx ? ' wn-x' : '');
        if (i.lab) return '<button class="' + cls + '" data-lab-go="' + esc(i.lab) + '">' + inner + '</button>'; // 4.154: opens a Case Lab (LABS)
        var go = i.sku ? pnRoute(i.sku) : (i.go || '');
        return go ? '<button class="' + cls + '" data-go="' + esc(go) + '">' + inner + '</button>'
                  : '<div class="' + cls + '">' + inner + '</div>';
      }).join('') +
      (WN2.items.length > 1 ? '<button id="wnmore">Show all ' + WN2.items.length + ' &#x203A;</button>' : '');
    document.body.appendChild(el);
  }
  // ---- expiration: one parser, one day-count, every consumer derives from these ----
  // expIso(v): anything a label or a person writes -> 'YYYY-MM-DD' ('' if unreadable).
  // Month-only forms ('2026-08', GS1 '260800', 'Aug 2026') mean the last day of that month.
  function expDaysLeft(v) {
    var iso = expIso(v); if (!iso) return null;
    var d = new Date(iso + 'T12:00:00'), today = new Date(); today.setHours(12, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }
  // Six-digit GS1/HIBC YYMMDD -> display form used on cards, count rows and the sheet:
  // 'YYYY-MM-DD', or 'YYYY-MM' when the label carries no day.
  function expDisp(e6) {
    if (!e6 || e6.length !== 6) return '';
    var dd = e6.slice(4);
    return '20' + e6.slice(0, 2) + '-' + e6.slice(2, 4) + (dd !== '00' ? '-' + dd : '');
  }
  function expStatus(e6) {
    if (!e6 || e6.length !== 6) return null;
    var days = expDaysLeft(e6); if (days === null) return null;
    if (days < 0) return { k: 'expired', days: days };
    if (days <= 30) return { k: 'soon', days: days };
    return { k: 'ok', days: days };
  }
  function showExpBanner(st, feStr, lot) {
    var old = document.getElementById('expban');
    if (old) old.remove();
    if (!st || st.k === 'ok') return;
    var b = document.createElement('div');
    b.id = 'expban';
    b.className = st.k;
    b.dataset.born = String(Date.now());
    b.innerHTML = '<div class="xb-ico">' + (st.k === 'expired' ? ICON.warn : ICON.clock) + '</div>' +
      '<div class="xb-t">' + (st.k === 'expired' ? 'Last Scan is EXPIRED!' : 'Last Scan Expires Soon') + '</div>' +
      (st.k === 'soon' ? '<div class="xb-days">' + st.days + ' day' + (st.days === 1 ? '' : 's') + ' left</div>' : '') +
      (lot ? '<div class="xb-sub">Lot ' + esc(lot) + '</div>' : '') +
      (feStr ? '<div class="xb-sub">Exp ' + esc(feStr) + '</div>' : '') +
      (st.k === 'expired' ? '<div class="xb-dn">Do not use</div>' : '') +
      '<button id="expban-x" aria-label="Dismiss">' + ICON.close + '</button>';
    document.body.appendChild(b);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#expban-x')) {
      var b = document.getElementById('expban');
      if (b) b.remove();
    }
  });

  // ---- part-number change popup: old number -> new number, with the stub card's note as the explanation ----
  var PNM_AFTER = null;
  function pnMoveShow(stub, after) {
    pnMoveClose(true);
    var cur = recOf(BYPN[nrm(stub.moved)]) || {};
    var b = document.createElement('div');
    b.id = 'pnmove';
    b.dataset.route = pnRoute(stub.moved); // the popup belongs to the current card: any other route closes it
    b.setAttribute('role', 'dialog'); b.setAttribute('aria-modal', 'true'); b.setAttribute('aria-labelledby', 'pnm-h');
    b.innerHTML = '<div class="pnm-card">' +
      '<button class="pnm-x" data-pnm-close="1" aria-label="Dismiss">' + ICON.close + '</button>' +
      '<div class="pnm-eyebrow" id="pnm-h">Part number changed</div>' +
      '<div class="pnm-map"><div class="pnm-pn"><span>Old</span><b class="mono">' + esc(stub.sku) + '</b></div>' +
      '<div class="pnm-arrow" aria-hidden="true">&#x2192;</div>' +
      '<div class="pnm-pn now"><span>New</span><b class="mono">' + esc(stub.moved) + '</b></div></div>' +
      '<div class="pnm-name">' + esc(cur.name || cur.t || '') + '</div>' +
      (stub.note ? '<p class="pnm-note">' + esc(stub.note) + '</p>' : '') +
      '<button class="pnm-ok" data-pnm-close="1">Got it</button></div>';
    document.body.appendChild(b);
    PNM_AFTER = after || null;
    var ok = b.querySelector('.pnm-ok');
    if (ok) { try { ok.focus({ preventScroll: true }); } catch (e0) { try { ok.focus(); } catch (e1) {} } }
  }
  function pnMoveClose(silent) {
    var b = document.getElementById('pnmove');
    if (b) b.remove();
    var cb = PNM_AFTER; PNM_AFTER = null;
    if (cb && !silent) { try { cb(); } catch (e) {} }
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.id === 'pnmove' || t.closest('[data-pnm-close]')) { pnMoveClose(false); return; }
    var pm = t.closest('[data-pnm]');
    if (pm) { var st = movedOf(pm.getAttribute('data-pnm')); if (st) pnMoveShow(st); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('pnmove')) pnMoveClose(false);
  });

  // ---- sharing suite ----
  var SH_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  var SH_MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
  function shWrap(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function shLoadImg(src, ms) {
    return new Promise(function (res) {
      var im = new Image();
      var to = setTimeout(function () { res(null); }, ms || 900);
      im.onload = function () { clearTimeout(to); res(im); };
      im.onerror = function () { clearTimeout(to); res(null); };
      im.src = src;
    });
  }
  function shRRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function composeCardPNG(it) {
    var W = 1080, PAD = 56;
    var name = it.name || it.t || '', fam = it.fam || '', sku = it.sku || '', uom = it.uom || '';
    var specs = (it.specs || []).filter(function (s) { return s && s[1]; });
    var MAXS = 9, extra = Math.max(0, specs.length - MAXS);
    specs = specs.slice(0, MAXS);
    var photoSrc = (it.imgs && it.imgs.length) ? it.imgs[0] : null;
    return (photoSrc ? shLoadImg(photoSrc, 900) : Promise.resolve(null)).then(function (photo) {
      var mc = document.createElement('canvas').getContext('2d');
      var PH = photo ? 300 : 0;
      mc.font = '700 46px ' + SH_FONT;
      var nameLines = shWrap(mc, name, W - PAD * 2 - (PH ? PH + 40 : 0)).slice(0, 3);
      var valW = W - PAD * 2 - 340;
      var rowHs = specs.map(function (s) {
        mc.font = '400 30px ' + SH_FONT;
        var full = shWrap(mc, s[1], valW);
        var vl = full.slice(0, 2);
        if (full.length > 2) vl[1] += ' …';
        return { k: s[0], vl: vl, h: Math.max(56, vl.length * 40 + 20) };
      });
      var headH = 108;
      var titleH = nameLines.length * 58 + (fam ? 42 : 0) + 66 + (uom ? 40 : 0) + 26;
      var titleBlock = Math.max(titleH, PH ? PH + 30 : 0);
      var specsH = rowHs.reduce(function (a, r) { return a + r.h; }, 0) + (extra ? 56 : 0) + (rowHs.length ? 20 : 0);
      var footH = 96;
      var H = headH + 36 + titleBlock + specsH + footH;
      var c = document.createElement('canvas');
      c.width = W; c.height = H;
      var x = c.getContext('2d');
      x.fillStyle = '#1E1E1E'; x.fillRect(0, 0, W, H);
      // header
      x.textBaseline = 'alphabetic';
      x.font = '700 40px ' + SH_FONT;
      var sx = PAD, sy = 66;
      x.fillStyle = '#F4F2EE'; x.fillText('Sports', sx, sy); sx += x.measureText('Sports').width;
      x.fillStyle = '#FDB515'; x.fillText('Med', sx, sy); sx += x.measureText('Med').width;
      x.fillStyle = '#F4F2EE'; x.fillText(' Toolbox', sx, sy);
      x.font = '400 24px ' + SH_FONT; x.fillStyle = '#9B968E'; x.textAlign = 'right';
      x.fillText('sportsmedtoolbox.com', W - PAD, 62);
      x.textAlign = 'left';
      x.fillStyle = '#FDB515'; x.fillRect(0, headH - 5, W, 5);
      // photo
      var ty = headH + 36;
      if (photo) {
        var px = W - PAD - PH, py = ty;
        shRRect(x, px, py, PH, PH, 18);
        x.fillStyle = '#FFFFFF'; x.fill();
        x.save(); shRRect(x, px, py, PH, PH, 18); x.clip();
        var s = Math.min((PH - 28) / photo.width, (PH - 28) / photo.height);
        var dw = photo.width * s, dh = photo.height * s;
        x.drawImage(photo, px + (PH - dw) / 2, py + (PH - dh) / 2, dw, dh);
        x.restore();
      }
      // title block
      var yy = ty + 44;
      x.fillStyle = '#F4F2EE'; x.font = '700 46px ' + SH_FONT;
      nameLines.forEach(function (l) { x.fillText(l, PAD, yy); yy += 58; });
      if (fam) { x.fillStyle = '#9B968E'; x.font = '400 28px ' + SH_FONT; x.fillText(fam, PAD, yy); yy += 42; }
      x.fillStyle = '#FDB515'; x.font = '700 46px ' + SH_MONO; x.fillText(sku, PAD, yy + 14); yy += 66;
      if (uom) { x.fillStyle = '#9B968E'; x.font = '400 28px ' + SH_FONT; x.fillText('Unit: ' + uom, PAD, yy); yy += 40; }
      yy = Math.max(yy + 26, ty + (PH ? PH + 30 : 0));
      // specs
      if (rowHs.length) {
        rowHs.forEach(function (r) {
          x.strokeStyle = '#3A3A3A'; x.lineWidth = 2;
          x.beginPath(); x.moveTo(PAD, yy); x.lineTo(W - PAD, yy); x.stroke();
          var ry = yy + 40;
          x.fillStyle = '#9B968E'; x.font = '700 26px ' + SH_FONT;
          shWrap(x, r.k, 300).slice(0, 2).forEach(function (kl, ki) { x.fillText(kl, PAD, ry + ki * 34); });
          x.fillStyle = '#F4F2EE'; x.font = '400 30px ' + SH_FONT;
          r.vl.forEach(function (vl, vi) { x.fillText(vl, PAD + 340, ry + vi * 40); });
          yy += r.h;
        });
        if (extra) {
          x.fillStyle = '#FDB515'; x.font = '600 26px ' + SH_FONT;
          x.fillText('+ ' + extra + ' more spec' + (extra > 1 ? 's' : '') + ' in the app', PAD, yy + 38);
          yy += 56;
        }
      }
      // footer
      x.fillStyle = '#FDB515'; x.fillRect(0, H - 70, W, 4);
      x.fillStyle = '#9B968E'; x.font = '400 24px ' + SH_FONT; x.textAlign = 'center';
      x.fillText('Search  ·  Scan  ·  Save — sportsmedtoolbox.com', W / 2, H - 26);
      x.textAlign = 'left';
      return c;
    });
  }
  function cardLink(it) {
    return location.origin + location.pathname.replace(/index\.html$/, '') + '#/pn/' + encodeURIComponent(it.sku);
  }
  function cardText(it) {
    var L = [it.name || it.t || '']; // the full title: the short list title (it.t, e.g. "Iconix 2") drops size and suture
    L.push('REF ' + it.sku + (it.uom ? ' · ' + it.uom : ''));
    if (it.fam) L.push(it.fam);
    var sp = (it.specs || []).filter(function (s) { return s && s[1]; });
    if (sp.length) L.push('');
    sp.forEach(function (s) { L.push(s[0] ? '• ' + s[0] + ': ' + s[1] : s[1]); }); // sub-headings print as plain lines
    L.push('', cardLink(it)); // P44: copied details carry the link to the card
    return L.join('\n');
  }
  function copyToClip(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { legacyCopy(t); });
    legacyCopy(t);
    return Promise.resolve();
  }
  function legacyCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  // P43 — the share image is drawn as soon as the share sheet opens, so "Send as image" can call navigator.share
  // inside the tap itself. (iOS refuses a share whose user gesture went stale while the photo loaded and the canvas
  // was drawn.) Not ready yet → the row says "Preparing image…" and asks for a fresh tap when it is.
  var SH_PREP = null;
  function shPrep(it) {
    if (SH_PREP && SH_PREP.sku === it.sku) return SH_PREP;
    var P = { sku: it.sku, v: null, err: false };
    P.p = composeCardPNG(it).then(function (c) {
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    }).then(function (blob) {
      if (!blob) throw new Error('blob');
      var fname = (nrm(it.sku) || 'card').toLowerCase() + '-card.png', file = null;
      try { file = new File([blob], fname, { type: 'image/png' }); } catch (e) {}
      P.v = { blob: blob, file: file, fname: fname };
      return P.v;
    }).catch(function () { P.err = true; return null; });
    SH_PREP = P;
    return P;
  }
  function shareImgNow(v, it) { // call synchronously from the tap handler
    var ok = false;
    try { ok = !!(v.file && navigator.canShare && navigator.share && navigator.canShare({ files: [v.file] })); } catch (e) {}
    if (ok) {
      return navigator.share({ files: [v.file], title: it.name || it.t || 'SM ToolBox' }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        dlBlob(v.blob, v.fname);
      });
    }
    dlBlob(v.blob, v.fname);
    return Promise.resolve();
  }
  function shareAsImage(it) { // programmatic path (tests): build or reuse, then share
    return shPrep(it).p.then(function (v) {
      if (!v) { toastMsg('Could not build image', 2200); return; }
      return shareImgNow(v, it);
    });
  }
  function dlBlob(blob, fname) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toastMsg('Image saved to downloads', 2400);
  }
  // P44 — a shared link carries the product name and part number (the link preview only shows the locked site)
  function shareLinkText(it) { return (it.name || it.t || '') + '\nREF ' + it.sku; }
  function shareLinkOf(it) {
    var url = cardLink(it), text = shareLinkText(it);
    var fallback = function () { return copyToClip(text + '\n' + url).then(function () { toastMsg('Link copied', 2200); }); };
    if (navigator.share) {
      return navigator.share({ title: it.name || it.t || 'SM ToolBox', text: text, url: url }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        return fallback();
      });
    }
    return fallback();
  }
  function shLabel(opt, t) { var sl = opt.querySelector('.sl'); if (sl && sl.firstChild) sl.firstChild.nodeValue = t; }
  function openShareSheet() {
    var it = CUR_IT;
    if (!it) return;
    var sh = document.getElementById('share-sheet');
    if (!sh) {
      sh = document.createElement('div');
      sh.id = 'share-sheet';
      document.body.appendChild(sh);
      sh.addEventListener('click', function (e) {
        if (e.target === sh || e.target.closest('.as-close')) { sh.hidden = true; return; }
        var opt = e.target.closest('.shopt');
        if (!opt || !CUR_IT) return;
        var act = opt.getAttribute('data-sh');
        if (act === 'img') {
          var P = shPrep(CUR_IT);
          if (!P.v && !P.err) {
            if (!opt.classList.contains('busy')) {
              opt.classList.add('busy'); opt.setAttribute('aria-busy', 'true'); shLabel(opt, 'Preparing image…');
              P.p.then(function () { opt.classList.remove('busy'); opt.removeAttribute('aria-busy'); shLabel(opt, P.v ? 'Image ready — tap to send' : 'Could not build image'); });
            }
            return; // keep the sheet open: the next tap is a fresh gesture
          }
          sh.hidden = true;
          try { ugEv('share', CUR_IT.sku, act); } catch (eUg) {}
          if (P.v) shareImgNow(P.v, CUR_IT); else toastMsg('Could not build image', 2200);
          return;
        }
        sh.hidden = true;
        try { ugEv('share', CUR_IT.sku, act); } catch (eUg2) {}
        if (act === 'link') shareLinkOf(CUR_IT);
        else if (act === 'copy') copyToClip(cardText(CUR_IT)).then(function () { toastMsg('Details copied — paste anywhere', 2400); });
      });
    }
    sh.innerHTML = '<div class="as-card" role="dialog" aria-modal="true" aria-label="Share this card"><h3>Share this card</h3>' +
      '<div class="sh-sub">' + esc(it.t || it.name || '') + ' · ' + esc(it.sku || '') + '</div>' +
      '<button class="shopt" data-sh="img"><span class="si">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></span>' +
        '<span class="sl">Send as image<span>A compact branded card — texts great</span></span></button>' +
      '<button class="shopt" data-sh="link"><span class="si">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg></span>' +
        '<span class="sl">Share link<span>Name, REF and a link that opens this card</span></span></button>' +
      '<button class="shopt" data-sh="copy"><span class="si">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></span>' +
        '<span class="sl">Copy details<span>Name, REF, specs and the link as text</span></span></button>' +
      '<button class="as-close">Cancel</button></div>';
    sh.hidden = false;
    setTimeout(function () { try { if (CUR_IT === it && !sh.hidden) shPrep(it); } catch (eP) {} }, 60); // after the sheet paints
  }

  // In-app dialogs (native confirm/alert/prompt look foreign in standalone mode
  // and cannot be styled). tbxAsk resolves true/false; tbxNotice resolves when
  // dismissed; tbxShowText shows copyable text with a Copy button.
  function askSheet() {
    var sh = document.getElementById('ask-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'ask-sheet'; sh.hidden = true; document.body.appendChild(sh); }
    return sh;
  }
  function tbxAsk(o) {
    return new Promise(function (res) {
      var sh = askSheet();
      sh.innerHTML = '<div class="as-card"><h3>' + esc(o.title || 'Are you sure?') + '</h3>' +
        (o.body ? '<div class="ask-b">' + esc(o.body) + '</div>' : '') +
        '<div class="ask-row"><button type="button" class="ask-no">' + esc(o.cancel || 'Cancel') + '</button>' +
        '<button type="button" class="ask-ok ' + (o.danger ? 'danger' : 'ok') + '">' + esc(o.ok || 'OK') + '</button></div></div>';
      function fin(v) { sh.hidden = true; sh.onclick = null; res(v); }
      sh.onclick = function (e) {
        if (e.target === sh || e.target.closest('.ask-no')) fin(false);
        else if (e.target.closest('.ask-ok')) fin(true);
      };
      sh.hidden = false;
    });
  }
  function tbxNotice(title, body, btn) {
    return new Promise(function (res) {
      var sh = askSheet();
      sh.innerHTML = '<div class="as-card"><h3>' + esc(title) + '</h3>' + (body ? '<div class="ask-b">' + esc(body) + '</div>' : '') +
        '<div class="ask-row"><button type="button" class="ask-ok ok">' + esc(btn || 'OK') + '</button></div></div>';
      sh.onclick = function (e) { if (e.target === sh || e.target.closest('.ask-ok')) { sh.hidden = true; sh.onclick = null; res(); } };
      sh.hidden = false;
    });
  }
  function tbxShowText(title, body, text) {
    var sh = askSheet();
    sh.innerHTML = '<div class="as-card"><h3>' + esc(title) + '</h3>' + (body ? '<div class="ask-b">' + esc(body) + '</div>' : '') +
      '<textarea readonly class="mono">' + esc(text) + '</textarea>' +
      '<div class="ask-row"><button type="button" class="ask-no">Close</button><button type="button" class="ask-ok ok">Copy</button></div></div>';
    sh.onclick = function (e) {
      if (e.target === sh || e.target.closest('.ask-no')) { sh.hidden = true; sh.onclick = null; return; }
      if (e.target.closest('.ask-ok')) { copyToClip(text).then(function () { toastMsg('Copied', 1600); }); return; }
      var ta = sh.querySelector('textarea'); if (ta && e.target === ta) ta.select();
    };
    sh.hidden = false;
  }

  function openLinkMenu(cfg) {
    var sh = document.getElementById('ug-sheet');
    if (!sh) {
      sh = document.createElement('div');
      sh.id = 'ug-sheet';
      document.body.appendChild(sh);
      sh.addEventListener('click', function (e) {
        if (e.target === sh || e.target.closest('.as-close')) { sh.hidden = true; return; }
        var opt = e.target.closest('[data-ug]');
        if (!opt) return;
        sh.hidden = true;
        location.hash = opt.getAttribute('data-ug');
      });
    }
    sh.innerHTML = '<div class="as-card"><h3>' + esc(cfg.t) + '</h3>' +
      (cfg.items || []).map(function (m) {
        return '<button class="shopt" data-ug="' + pnRoute(m.sku) + '"><span class="si">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>' +
          '<span class="sl">' + esc(m.t) + '</span></button>';
      }).join('') +
      '<button class="as-close">Cancel</button></div>';
    sh.hidden = false;
  }

  // ---- welcome tour ----
  var TOUR_STEPS = [
    { t: 'Search anything', p: 'Type a product name or part number in the bar below — dashes optional.',
      ico: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>' },
    { t: 'Scan any package', p: 'Tap the barcode button and fill the frame with any package label — the right card opens instantly, with lot and expiration.',
      ico: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10.5 8v8M13.5 8v5M16.5 8v8"/></svg>' },
    { t: 'Tap images to zoom', p: 'Tap any product photo to view it fullscreen. Pinch or double-tap to zoom in on the fine print.',
      ico: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>' }
  ];
  function showTour() {
    try { if (localStorage.getItem('tbx_tour_done')) return; } catch (e) { return; }
    if (document.getElementById('tour')) return;
    var ov = document.createElement('div');
    ov.id = 'tour';
    document.body.appendChild(ov);
    var i = 0;
    function step() {
      var s = TOUR_STEPS[i];
      ov.innerHTML = '<div class="tr-card"><div class="tr-ico">' + s.ico + '</div><h2>' + s.t + '</h2><p>' + s.p + '</p>' +
        '<div class="tr-dots">' + TOUR_STEPS.map(function (_, j) { return '<span class="tr-dot' + (j === i ? ' on' : '') + '"></span>'; }).join('') + '</div>' +
        '<button class="tr-next">' + (i < TOUR_STEPS.length - 1 ? 'Next' : 'Get started') + '</button>' +
        (i < TOUR_STEPS.length - 1 ? '<button class="tr-skip">Skip</button>' : '') + '</div>';
    }
    function done() {
      try { localStorage.setItem('tbx_tour_done', '1'); } catch (e) {}
      wnSeen(); // P17: a new user gets the tour; What's New is for people who knew the app before
      ov.remove();
    }
    ov.addEventListener('click', function (e) {
      if (e.target.closest('.tr-next')) { if (i < TOUR_STEPS.length - 1) { i++; step(); } else done(); }
      else if (e.target.closest('.tr-skip')) done();
    });
    step();
  }

  // ---- add to home screen ----
  var A2HS_EVT = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); A2HS_EVT = e; });
  function isStandalone() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function a2hsHTML() {
    try { if (isStandalone() || localStorage.getItem('tbx_a2hs_x')) return ''; } catch (e) { return ''; }
    return '<div class="a2hs"><span class="ai">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 9v6M9 12h6"/></svg></span>' +
      '<span class="at"><b>Add to Home Screen</b><span>Full screen, works offline, one tap from your phone</span></span>' +
      '<button class="ago" data-act="a2hs">How</button><button class="ax" data-act="a2hs-x" aria-label="Dismiss">' + ICON.close + '</button></div>';
  }
  function a2hsSheet() {
    var sh = document.getElementById('a2hs-sheet');
    if (!sh) {
      sh = document.createElement('div');
      sh.id = 'a2hs-sheet';
      // P52: iOS 26+ Safari puts Share under the More (three dots) menu next to the address bar; pick the steps by Safari's Version/ token
      var ua = navigator.userAgent || '';
      var ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      var sv = +((/Version\/(\d+)/.exec(ua) || [])[1] || 0), safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
      var SHR = '<span class="a2i">' + ICON.share + '</span>', MOR = '<span class="a2i">' + ICON.more + '</span>';
      var steps = ios
        ? (safari ? '' : '<li>Open <b>sportsmedtoolbox.com</b> in <b>Safari</b></li>') +
          (safari && sv >= 26 ? '<li>Tap ' + MOR + ' next to the address bar, then <b>Share</b></li>'
            : safari && sv ? '<li>Tap <b>Share</b> ' + SHR + ' in the toolbar</li>'
            : '<li>Tap <b>Share</b> ' + SHR + ' — on iOS 26 and later it’s under ' + MOR + ' next to the address bar</li>') +
          '<li>Scroll down and tap <b>Add to Home Screen</b></li>' +
          (safari && sv && sv < 26 ? '<li>Tap <b>Add</b></li>' : '<li>Keep <b>Open as Web App</b> on, then tap <b>Add</b></li>')
        : '<li>Open the browser menu (<b>&#8942;</b>)</li><li>Tap <b>Add to home screen</b> or <b>Install app</b></li><li>Confirm</li>';
      sh.innerHTML = '<div class="as-card"><h3>Install SportsMed Toolbox</h3><ol>' + steps + '</ol>' +
        '<button class="as-close">Done</button></div>';
      document.body.appendChild(sh);
      sh.addEventListener('click', function (e) {
        if (e.target === sh || e.target.closest('.as-close')) sh.hidden = true;
      });
    }
    sh.hidden = false;
  }
  document.addEventListener('click', function (e) {
    var shb = e.target.closest && e.target.closest('[data-share]');
    if (shb) { openShareSheet(); return; }
    var a2 = e.target.closest && e.target.closest('[data-act="a2hs"]');
    if (a2) {
      if (A2HS_EVT) { A2HS_EVT.prompt(); A2HS_EVT = null; } else a2hsSheet();
      return;
    }
    var a2x = e.target.closest && e.target.closest('[data-act="a2hs-x"]');
    if (a2x) {
      try { localStorage.setItem('tbx_a2hs_x', '1'); } catch (e2) {}
      var card = a2x.closest('.a2hs');
      if (card) card.remove();
      return;
    }
    var an = e.target.closest && e.target.closest('[data-act="asknate"]');
    if (an) { // P23: open the feedback form with the missing term filled in (no screenshot: the Route line carries ?q=…)
      var aq = an.getAttribute('data-q') || CURQ;
      try { if (window.TBX_FB_OPEN) window.TBX_FB_OPEN({ note: 'Please add “' + aq + '” to ToolBox — I searched for it and found nothing.', shot: false }); } catch (eA) {}
      return;
    }
    var s = e.target.closest && e.target.closest('[data-act="scan"]');
    if (s) { var sb = document.getElementById('scanbtn'); if (sb) sb.click(); return; }
    var ss = e.target.closest && e.target.closest('[data-ssort]');
    if (ss) { SSORT = SSORT === 'sku' ? 'rel' : 'sku'; try { localStorage.setItem('tbx_ssort', SSORT); } catch (e7) {} resultsRerender(); return; }
    var sa = e.target.closest && e.target.closest('[data-sall]');
    if (sa) { SALL = true; resultsRerender(); return; }
    var sfc = e.target.closest && e.target.closest('[data-sfclear]');
    if (sfc) { SPECF = {}; resultsRerender(); return; }
    var sc = e.target.closest && e.target.closest('.schip');
    if (sc) {
      var nf = sc.getAttribute('data-sf') || null;
      if (nf !== SFILT) SPECF = {};
      SFILT = nf;
      resultsRerender();
      return;
    }
    var wi = e.target.closest && e.target.closest('#wncard .wn-i[data-go]');
    if (wi) wnSeen(); // P17: tapping an item counts as reading it (the data-go handler navigates)
    var mo = e.target.closest && e.target.closest('#wnmore');
    if (mo) {
      var wc = document.getElementById('wncard');
      if (wc) {
        wc.classList.toggle('open');
        mo.innerHTML = wc.classList.contains('open') ? 'Show less' : 'Show all ' + ((window.TBX_WN || {}).items || []).length + ' &#x203A;';
      }
      return;
    }
    var d = e.target.closest && e.target.closest('#wndismiss');
    if (!d) return;
    hideWN(true);
  });
  function home() {
    setTitle('Sports', 'Med Toolbox'); backBtn.hidden = true;
    var tileDefs = [
      { label: 'Arthroscopy', go: '#/top/arthroscopy', n: D.probes.length + D.shavers.length + pumpTubing().length + capArthro().length },
      { label: 'Allografts & Biologics', go: '#/cat/' + encodeURIComponent('Allografts & Biologics'), n: catCount('Allografts & Biologics') },
      { label: 'Disposables', go: '#/cat/' + encodeURIComponent('Disposables'), n: catCount('Disposables') },
      { label: 'Implants', go: '#/top/implants', n: implantCount() },
      { label: 'Instruments', go: '#/cat/' + encodeURIComponent('Instruments'), n: catCount('Instruments') },
      { label: 'Capital', go: '#/cat/' + encodeURIComponent('Capital'), n: catCount('Capital') },
      { label: 'Suture', go: '#/cat/' + encodeURIComponent('Suture'), n: catCount('Suture') }
    ];
    tileDefs.sort(function (a, b) { return a.label.localeCompare(b.label); });
    var tiles = tileDefs.map(function (t) {
      return '<button class="tile" data-go="' + t.go + '">' +
        '<span class="tico k-' + (CATKEY[t.label] || '') + '">' + (TILE_ICONS[t.label] || '') + '</span>' +
        '<span class="tl"><b><span class="tlt">' + esc(t.label) + '</span></b><span class="n">' + plural(t.n, 'item') + '</span></span>' +
        '<span class="ct">&#x203A;</span></button>';
    }).join('');
    tiles += boTileHTML();
    tiles += '<button class="tile tile-inv" data-act="otherteams">' +
      '<span class="tico">' + catSvg('inv') + '</span>' +
      '<span class="tl"><b>Inventory Management</b><span class="n">Territory Cycle Counts</span></span>' +
      '<span class="ct">&#x203A;</span></button>';
    var fv = favs(), fsort = 'recent';
    try { fsort = localStorage.getItem('tbx_fsort') === 'az' ? 'az' : 'recent'; } catch (e0) {}
    // P38: rows show the card's current title (liveIt), part number stacked above it; P37: the first 8 + "Show all"
    var fvIt = function (f) { var s = f.it || { t: f.label, sku: f.pn }; return liveIt(s.sku || f.pn || '', s); };
    if (fsort === 'az') fv = fv.slice().sort(function (a, b) { return String(fvIt(a).t || '').localeCompare(String(fvIt(b).t || '')); });
    var FAV_N = 8, favAll = !!navX().favAll, fvShow = favAll ? fv : fv.slice(0, FAV_N);
    var favHTML = fv.length ? '<div class="eyebrow ebrow"><span>Favorites</span>' + (fv.length > 1 ? '<button class="clearrec" data-fsort="' + (fsort === 'az' ? 'recent' : 'az') + '">' + (fsort === 'az' ? 'A\u2013Z \u00b7 sort by recent' : 'Recent \u00b7 sort A\u2013Z') + '</button>' : '') + '</div><div class="list">' + fvShow.map(function (f) {
      return '<div class="rowwrap">' + rowHTML(f.route, fvIt(f), '', false, { stack: true }) +
        '<button class="rwact" data-unfav-route="' + esc(f.route) + '" aria-label="Remove favorite">' + ICON.starOn + '</button></div>';
    }).join('') + '</div>' + (fv.length > FAV_N ? '<button class="showall" data-favall="' + (favAll ? '0' : '1') + '" aria-expanded="' + favAll + '">' + (favAll ? 'Show fewer' : 'Show all ' + fv.length + ' favorites &#x203A;') + '</button>' : '') : '';
    var rc = recents();
    var recHTML = rc.length ? '<div class="eyebrow ebrow"><span>Recent</span><button class="clearrec" data-clearrec="1">Clear all</button></div><div class="list">' + rc.slice(0, 6).map(function (r) {
      return '<div class="rowwrap">' + rowHTML(pnRoute(r.sku), liveIt(r.sku, { t: r.label, sku: r.sku }), '', false, { stack: true }) +
        '<button class="rwact rwx" data-unrec="' + esc(r.sku) + '" aria-label="Remove from recents">' + ICON.close + '</button></div>';
    }).join('') + '</div>' : '';
    var hint = (!fv.length && !rc.length) ? '<div class="emp home-hint"><span>Cards you open show up here as Recents \u2014 tap ' + ICON.star + ' Favorite on any card to pin it to Favorites.</span></div>' : '';
    render(hint + favHTML + recHTML + '<div class="eyebrow">Browse</div><div class="tiles">' + tiles + '</div>' +
      a2hsHTML() +
      '<div class="foot">Works offline once loaded &middot; <span class="ugver" data-ugtap="1">v' + APPVER + '</span> &middot; ' + esc(D.built) +
      '<br><button class="footlink" data-go="#/about">About &amp; tips &#x203A;</button>' +
      '<span class="footsep">&middot;</span>' +
      '<button class="footlink" data-act="checkupd">Check for updates</button>' +
      (ugOn() && ugAdmin() ? '<span class="footsep">&middot;</span><button class="footlink" data-go="#/usage">Usage</button>' : '') + '</div>', { home: true });
    afterPaint(function () { homeBtn.classList.remove('away'); showWN(); });
  }
  function topScreen(which) {
    backBtn.hidden = false;
    if (which === 'implants') {
      setTitle('Implants', '');
      var icats = IMPLANT_CATS.slice().sort(function (a, b) {
        if (a === 'Other') return 1; if (b === 'Other') return -1;
        return a.localeCompare(b);
      });
      render('<div class="list">' + icats.filter(function (c) { return catCount(c); }).map(function (c) { // P41: drill rows, not tiles
        return drillRowHTML('#/cat/' + encodeURIComponent(c), c, catCount(c));
      }).join('') + '</div>');
      return;
    }
    setTitle('Arthroscopy', '');
    render('<div class="list">' +
      drillRowHTML('#/dgrp/' + encodeURIComponent('Arthroscopy capital'), 'Arthroscopy Capital', capArthro().length) +
      drillRowHTML('#/fam/' + encodeURIComponent('Disposables') + '/' + encodeURIComponent('CrossFlow arthroscopy pump'), 'Pump Tubing', pumpTubing().length) +
      drillRowHTML('#/probes', 'SERFAS RF Wands', D.probes.length) +
      drillRowHTML('#/shavers', 'Shaver Blades & Burs', D.shavers.length) +
      '</div>');
  }
  var DISP_GROUPS = {
    'Adaptable disposables': ['Adaptable positioning system'],
    'Anchor disposables': ['CinchLock knotless anchor', 'Gravity anchor', 'Iconix all-suture anchor', 'Knotilus+ knotless anchor', 'NanoTack suture anchor', 'Titanium wedge interference screws', 'AIR+', 'Biosteon HA/PLLA interference screws', 'TwinLoop Flex anchor'],
    'Cannulas & portal access': ['Dri-Lok cannula', 'FlowPort', 'GateWay flexible cannula', 'Portal entry kit', 'Transport', 'Samurai blades'],
    'Guardian/DARTs + HipCheck': ['Guardian + DARTs', 'Hip Check'],
    'Pump & fluid management': ['CrossFlow arthroscopy pump', 'FloSteady arthroscopy pump'],
    'Reamers & drilling': ['VersiTomic Flexible Reaming System', 'VersiTomic Low Profile Reaming System', 'VersiTomic RetroReamer', 'MicroFX OCD Osteochondral Drilling System', 'Phoenix Microfracture Drill', 'ACL/PCL instrumentation'],
    'PRP disposables': ['RegenKit THT (A-PRP)'],
    'Reposables': [],
    'Suture passing systems': ['ArthroTunneler system', 'G-Force tenodesis system', 'InJector II capsule closure', 'SharpShooter meniscal repair system', 'SlingShot capsule restoration system', 'NanoPass suture management system', 'Champion SlingShot suture passer', 'Champion+ Slider suture passer', 'VersiPass suture passer', 'Champion suture passer']
  };
  var ALLO_GROUPS = {
    'PRP': ['RegenKit THT (A-PRP)'],
    'ProChondrix': ['ProChondrix CR'],
    'GraftJacket': ['GraftJacket Now Ultra-Thick'],
    'Evergen': ['Tendon', 'Meniscus', 'Fresh Osteochondral', 'Chips and Cubes', 'Cortical Bone Blocks',
      'Ilium Tricortical', 'Structural Bone', 'UniCort Dowels', 'Wedges',
      'Matrix HD acellular human dermis', 'Fortiva porcine dermis'],
    'Alamo': ['Alamo tendons', 'Alamo fascia lata', 'Alamo cancellous bone'],
    'AlloSource': ['AlloSource tendons', 'AlloSource fascia lata']
  };
  var CAP_GROUPS = {
    'Arthroscopy capital': ['CrossFire 2 resection platform', 'CrossFlow arthroscopy pump', 'FloSteady arthroscopy pump', 'Shaver handpieces'],
    'Adaptable positioning system': ['Adaptable positioning system'],
    'Guardian + DARTs': ['Guardian + DARTs'],
    'PRP capital': ['RegenKit THT (A-PRP)']
  };
  var GROUPED = {
    'Disposables': { groups: DISP_GROUPS, fallback: 'More disposables', title: ['Disposables', ''] },
    'Allografts & Biologics': { groups: ALLO_GROUPS, fallback: 'More biologics', title: ['Allografts ', '& Biologics'] },
    'Capital': { groups: CAP_GROUPS, fallback: 'More capital', title: ['Capital', ''] }
  };
  function dispFamGroup(cat) {
    var m = {}, gs = GROUPED[cat || 'Disposables'].groups;
    Object.keys(gs).forEach(function (g) { gs[g].forEach(function (f) { m[f] = g; }); });
    return m;
  }
  function catOfGroup(g) {
    var found = null;
    Object.keys(GROUPED).forEach(function (c) {
      if (found) return;
      if (GROUPED[c].groups[g] || GROUPED[c].fallback === g) found = c;
    });
    return found || 'Disposables';
  }
  function grpOf(it, famGroup, fallback) { return it.agrp || it.dgrp || famGroup[it.fam] || fallback; }
  function dispGroupsScreen(cat) {
    cat = GROUPED[cat] ? cat : 'Disposables';
    var cfg = GROUPED[cat];
    setTitle(cfg.title.join(''), ''); backBtn.hidden = false; // P41: plain screen titles
    var famGroup = dispFamGroup(cat), counts = {};
    D.items.forEach(function (it) {
      if (it.hidden || (it.cat !== cat && it.cat2 !== cat)) return;
      var g = grpOf(it, famGroup, cfg.fallback);
      counts[g] = (counts[g] || 0) + 1;
    });
    var names = Object.keys(counts).sort();
    render('<div class="list">' + names.map(function (g) { return drillRowHTML('#/dgrp/' + encodeURIComponent(g), g, counts[g]); }).join('') + '</div>');
  }
  function dispGroupScreen(g) {
    var cat = catOfGroup(g), cfg = GROUPED[cat];
    setTitle(g, ''); backBtn.hidden = false;
    var famGroup = dispFamGroup(cat), fams = {}, order = [];
    D.items.forEach(function (it) {
      if (it.hidden || (it.cat !== cat && it.cat2 !== cat)) return;
      var itg = grpOf(it, famGroup, cfg.fallback);
      if (itg !== g) return;
      if (!fams[it.fam]) { fams[it.fam] = 0; order.push(it.fam); }
      fams[it.fam]++;
    });
    if (!order.length) return dispGroupsScreen(cat);
    if (order.length === 1) return famScreen(cat, order[0]);
    order.sort();
    render('<div class="list">' + order.map(function (f) {
      return drillRowHTML('#/fam/' + encodeURIComponent(cat) + '/' + encodeURIComponent(f), f, fams[f]);
    }).join('') + '</div>');
  }
  function catScreen(c) {
    if (GROUPED[c]) return dispGroupsScreen(c);
    var fams = {}, order = [];
    D.items.forEach(function (it) {
      if (it.hidden || (it.cat !== c && it.cat2 !== c)) return;
      if (!fams[it.fam]) { fams[it.fam] = 0; order.push(it.fam); }
      fams[it.fam]++;
    });
    if (order.length === 1) return famScreen(c, order[0]);
    setTitle(c, ''); backBtn.hidden = false; // P41: plain screen titles ("Corkscrew Anchors", not an amber second word)
    order.sort();
    render('<div class="list">' + order.map(function (f) {
      return drillRowHTML('#/fam/' + encodeURIComponent(c) + '/' + encodeURIComponent(f), f, fams[f]);
    }).join('') + '</div>');
  }
  function slOf(it) {
    var v = ''; (it.specs || []).some(function (s) { if (s[0] === 'Sliding') { v = s[1]; return true; } return false; });
    return v;
  }
  function _ntxt(it) { return it.name + ' ' + (it.ld || ''); }
  function _needleSpec(it) {
    var v = null;
    (it.specs || []).some(function (s) { if (s[0] === 'Needle') { v = s[1]; return true; } return false; });
    return v;
  }
  var FTOKENS = [
    { t: 'Needled', f: function (it) {
        var ns = _needleSpec(it);
        if (ns !== null) return !/^Non-needled/i.test(ns);
        return !/non-needled/i.test(_ntxt(it)) && /needle/i.test(_ntxt(it));
      } },
    { t: 'Non-needled', f: function (it) {
        var ns = _needleSpec(it);
        if (ns !== null) return /^Non-needled/i.test(ns);
        return /non-needled/i.test(_ntxt(it));
      } },
    { t: 'TT', f: function (it) { return /\bTT\b/.test(it.name); } },
    { t: 'XBraid S', f: function (it) { return /XBraid S\b/.test(it.name); } },
    { t: 'Force Fiber', f: function (it) { return /Force Fiber/i.test(it.name); } },
    { t: 'Sliding', f: function (it) { return slOf(it) === 'Sliding'; } },
    { t: 'Non-sliding', f: function (it) { return /^Non-sliding/.test(slOf(it)); } },
    { t: 'Concave', f: function (it) { return /concave/i.test(it.name); } },
    { t: 'Flat', f: function (it) { return /flat/i.test(it.name); } }
  ];
  function withFilters(baseFilter, famLabel) {
    var base = D.items.filter(function (it) { return !it.hidden && baseFilter(it); });
    var avail = FTOKENS.filter(function (tk) {
      if (famLabel && famLabel.indexOf(tk.t) !== -1) return false;
      var n = base.filter(tk.f).length; return n > 0 && n < base.length;
    });
    var active = avail.filter(function (tk) { return FILT[tk.t]; });
    var pass = function (it) {
      if (it.hidden || !baseFilter(it)) return false;
      return active.every(function (tk) { return tk.f(it); });
    };
    CURCOUNT = function () {
      var act = avail.filter(function (tk) { return FILT[tk.t]; });
      return base.filter(function (it) {
        return act.every(function (tk) { return tk.f(it); });
      }).length;
    };
    var bar = avail.length ? '<div class="fchips">' + avail.map(function (tk) {
      return '<button class="fchip' + (FILT[tk.t] ? ' on' : '') + '" data-filt="' + esc(tk.t) + '">' + esc(tk.t) + '</button>';
    }).join('') + '</div>' : '';
    return bar + (itemsHTML(pass) || '<div class="empty">No items match those filters.</div>');
  }
  function itemsHTML(filter) {
    var html = '', lastSz = null, open = false;
    D.items.forEach(function (it) {
      if (!filter(it)) return;
      if (!open) { html += '<div class="list">'; open = true; }
      var szg = it.szg || '';
      if (szg && szg !== lastSz) { html += '<div class="sizehead">' + esc(szg) + '</div>'; lastSz = szg; }
      html += rowHTML(pnRoute(it.sku), it, '', !!it.szg);
    });
    if (open) html += '</div>';
    return html;
  }
  function famScreen(c, f) {
    backBtn.hidden = false;
    var subs = {}, order = [];
    D.items.forEach(function (it) {
      if (it.hidden || (it.cat !== c && it.cat2 !== c) || it.fam !== f || !it.sub) return;
      if (!subs[it.sub]) { subs[it.sub] = 0; order.push(it.sub); }
      subs[it.sub]++;
    });
    setTitle(f, '');
    if (order.length) {
      render('<div class="list">' + order.map(function (s) {
        return drillRowHTML('#/sub/' + encodeURIComponent(c) + '/' + encodeURIComponent(f) + '/' + encodeURIComponent(s), s, subs[s]);
      }).join('') + '</div>');
      return;
    }
    if (f === 'FlowPort') { chipView(c, 'FlowPort', 'fp', ['Regular', 'Touch', 'Kit']); return; }
    if (f === 'Gravity anchor' && c === 'Corkscrew Anchors') { chipView(c, 'Gravity anchor', 'gmat', ['Titanium', 'PEEK']); return; }
    CURVIEW = function () { render(withFilters(function (it) { return (it.cat === c || it.cat2 === c) && it.fam === f; }, f)); };
    CURVIEW();
  }
  function chipView(c, fam, field, chips) {
    CURVIEW = function () {
      var sel = FILT.fp || chips[0];
      var bar = '<div class="fchips">' + chips.map(function (k) {
        return '<button class="fchip' + (sel === k ? ' on' : '') + '" data-fp="' + esc(k) + '">' + esc(k) + '</button>';
      }).join('') + '</div>';
      var list = D.items.filter(function (it) { return !it.hidden && it.cat === c && it.fam === fam && it[field] === sel; });
      var body = list.length ? '<div class="list">' + list.map(function (it) {
        return rowHTML(pnRoute(it.sku), it, '');
      }).join('') + '</div>' : '<div class="empty">No items.</div>';
      render(bar + body);
    };
    CURVIEW();
  }
  function subScreen(c, f, s) {
    backBtn.hidden = false;
    setTitle(s, '');
    CURVIEW = function () { render(withFilters(function (it) { return (it.cat === c || it.cat2 === c) && it.fam === f && it.sub === s; }, f + ' ' + s)); };
    CURVIEW();
  }
  function itemCard(it) {
    backBtn.hidden = false;
    setTitle(it.cat, ''); // P41: plain screen title
    CUR_IT = it;
    var chips = [];
    if (it.sz) chips.push({ t: it.sz });
    if (it.sub) chips.push({ t: it.sub, k: 'k-sub' });
    if (it.grp) chips.push({ t: it.grp, k: 'k-grp' });
    var links = [], refs = [];
    var relAll = instrFor(it).filter(function (x) { return x.it.sku !== it.sku; });
    var capFam = it.cat === 'Capital' || relAll.some(function (x) { return x.it.cat === 'Capital'; });
    if (it.parts && it.parts.length) links.push({ t: it.plabel || 'Parts', go: '#/parts/' + encodeURIComponent(it.sku) });
    if (capFam) {
      if (!it.hidden) {
        var rel = it.sub ? relAll.filter(function (x) { return (x.it.sub || '') === it.sub; }) : relAll;
        if (rel.some(function (x) { return x.it.cat === 'Disposables'; }))
          links.push({ t: 'Associated disposables', go: '#/instr/' + encodeURIComponent(it.sku) + '/Disposables' });
        if (rel.some(function (x) { return x.it.cat === 'Capital'; }))
          links.push({ t: 'Associated capital', go: (it.instr && it.instr.incl && it.instr.incl.length)
            // explicit list (e.g. shaver handpieces -> their consoles): show exactly those, not the item's own family
            ? '#/instr/' + encodeURIComponent(it.sku) + '/Capital'
            : it.sub
            ? '#/sub/' + encodeURIComponent('Capital') + '/' + encodeURIComponent(it.fam) + '/' + encodeURIComponent(it.sub)
            : '#/fam/' + encodeURIComponent('Capital') + '/' + encodeURIComponent(it.fam) });
      }
      (it.links || []).forEach(function (l) {
        if (l.menu) { refs.push({ t: l.t, menu: l.menu }); return; }
        var e = l.sku ? BYPN[nrm(l.sku)] : null;
        var tgtHidden = e && e.kind === 'item' && D.items[e.idx].hidden;
        if (!it.hidden && !tgtHidden) return;
        var entry = l.go ? { t: l.t, go: l.go } : (e ? (movedOf(l.sku) ? { t: l.t, pnm: l.sku } : { t: l.t, go: pnRoute(l.sku) }) : null);
        if (entry) (tgtHidden ? refs : links).push(entry);
      });
    } else {
      if (relAll.length) links.push({ t: 'Instrumentation', go: '#/instr/' + encodeURIComponent(it.sku) });
      (it.links || []).forEach(function (l) {
        if (l.menu) { refs.push({ t: l.t, menu: l.menu }); return; }
        var e = l.sku ? BYPN[nrm(l.sku)] : null;
        var tgtHidden = e && e.kind === 'item' && D.items[e.idx].hidden;
        var entry = l.go ? { t: l.t, go: l.go } : (e ? (movedOf(l.sku) ? { t: l.t, pnm: l.sku } : { t: l.t, go: pnRoute(l.sku) }) : null);
        if (entry) (tgtHidden ? refs : links).push(entry);
      });
    }
    render(cardHTML({ kind: 'item', cat: it.cat, name: it.name, fam: it.fam, sku: it.sku, uom: it.uom, chips: chips, tags: it.tags,
      specs: it.specs, note: it.note, src: it.src, imgs: it.imgs, imgFull: it.imgFull, warn: it.warn, links: links, refs: refs, bp: it.bp,
      vars: variantsFor(it), used: usedWith(it),
      fav: { route: pnRoute(it.sku), it: { t: it.t || it.name, sz: it.sz || '', ld: it.ld || '', sku: it.sku } } }));
  }
  function probeCard(p) {
    setTitle('SERFAS RF Wands', ''); backBtn.hidden = false;
    CUR_IT = p;
    render(cardHTML({ kind: 'probe', name: p.name, fam: p.fam, sku: p.sku, uom: p.uom, tags: p.tags, specs: p.specs, imgs: p.imgs, imgFull: p.imgFull, note: p.note,
      src: p.src,
      fav: { route: pnRoute(p.sku), it: { t: p.name, sku: p.sku } } }));
  }
  function shaverCard(s) {
    setTitle('Shaver Blades', ''); backBtn.hidden = false;
    CUR_IT = s;
    render(cardHTML({ kind: 'shaver', name: s.name, fam: (s.fam ? s.fam + ' series' : 'Shaver blades & burs'), sku: s.sku, uom: s.uom, tags: s.tags, specs: s.specs, imgs: s.imgs, imgFull: s.imgFull, warn: s.warn,
      note: s.note, src: s.src,
      fav: { route: pnRoute(s.sku), it: { t: s.name, sku: s.sku } } }));
  }
  function recents() { try { return JSON.parse(localStorage.getItem('tbx_recents') || '[]'); } catch (e) { return []; } }
  function noteRecent(sku, label) {
    try {
      var list = recents().filter(function (r) { return r.sku !== sku; });
      list.unshift({ sku: sku, label: label });
      localStorage.setItem('tbx_recents', JSON.stringify(list.slice(0, 6)));
    } catch (e) {}
  }
  function pnScreen(sku) {
    var e = BYPN[nrm(sku)] || BYPNZ[nrm(sku).replace(/^0+/, '')]; // leading zeros optional (0295724120 = 295724120)
    if (!e) return notFoundScreen(sku);
    var mv = movedOf(sku);
    if (mv) { location.replace(pnRoute(mv.moved)); pnMoveShow(mv); return; } // retired number: current card + change popup
    if (e.kind === 'item') { noteRecent(D.items[e.idx].sku, D.items[e.idx].t || D.items[e.idx].name); return itemCard(D.items[e.idx]); }
    if (e.kind === 'probe') { noteRecent(D.probes[e.idx].sku, D.probes[e.idx].name); return probeCard(D.probes[e.idx]); }
    noteRecent(D.shavers[e.idx].sku, D.shavers[e.idx].name);
    return shaverCard(D.shavers[e.idx]);
  }
  // ---- R7 N3: a logo with a little life. Four variations on compositor layers (never SVG internals), shuffled per launch
  // and taken in turn per tap; taps during one are ignored. Reduce Motion: a soft glow (opacity only). The layer markup
  // matches #brand / #lkbadge in index.html (the part shapes are the #lg-* symbols there). ----
  var LOGO = (function () {
    var L = ['tile', 'shadow', 'wrench', 'lid', 'body', 'latch', 'halo', 'core', 'glint', 'spark'], ORDER = ['wrench', 'latch', 'peek', 'glint'], vi = 0;
    for (var i = ORDER.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t0 = ORDER[i]; ORDER[i] = ORDER[j]; ORDER[j] = t0; }
    var EO = 'cubic-bezier(.2,.8,.2,1)';
    function html(cls) {
      return '<div class="lg' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><div class="lg-in">' + L.map(function (k) {
        return k === 'tile' ? '<i class="L l-tile"></i>' : k === 'glint' ? '<i class="L l-glint"><b></b></i>' : '<i class="L l-' + k + '"><svg viewBox="0 0 512 512"><use href="#lg-' + k + '"/></svg></i>';
      }).join('') + '</div></div>';
    }
    function parts(lg) {
      function q(s) { return lg.querySelector(s); }
      return { inn: q('.lg-in'), wrench: q('.l-wrench'), lid: q('.l-lid'), latch: q('.l-latch'), halo: q('.l-halo'), core: q('.l-core'), glintL: q('.l-glint'), glint: q('.l-glint b'), spark: q('.l-spark') };
    }
    function A(el, kf, o) { try { if (!el || !el.animate) return null; if (!o.fill) o.fill = 'none'; return el.animate(kf, o); } catch (e) { return null; } }
    var VAR = {
      wrench: function (p) { // the lid peeks, a wrench rises out of the box, turns once and drops back
        A(p.lid, [{ transform: 'none' }, { transform: 'rotate(-10deg)', offset: .18 }, { transform: 'rotate(-10deg)', offset: .74 }, { transform: 'rotate(1.5deg)', offset: .88 }, { transform: 'none' }], { duration: 700, easing: 'ease-in-out' });
        A(p.core, [{ opacity: 0 }, { opacity: .85, offset: .18 }, { opacity: .85, offset: .74 }, { opacity: 0, offset: .86 }, { opacity: 0 }], { duration: 700 });
        A(p.wrench, [{ opacity: 1, transform: 'none', easing: 'cubic-bezier(.2,.7,.3,1)' }, { opacity: 1, transform: 'translateY(-46%) rotate(150deg) scale(1.3)', offset: .36, easing: 'linear' },
          { opacity: 1, transform: 'translateY(-46%) rotate(330deg) scale(1.3)', offset: .56, easing: 'cubic-bezier(.5,0,.7,.4)' }, { opacity: 1, transform: 'translateY(-2%) rotate(360deg)', offset: .84 }, { opacity: 0, transform: 'rotate(360deg)' }], { duration: 700 });
        return 700;
      },
      latch: function (p) { // the latch clicks: it pops, the lid dips, the box squashes, a spark
        A(p.latch, [{ opacity: 1, transform: 'scale(.6,.15)' }, { opacity: 1, transform: 'scale(1.5)', offset: .28 }, { opacity: 1, transform: 'scale(1.15)', offset: .42 }, { opacity: 1, transform: 'scale(1.15)', offset: .74 }, { opacity: 0, transform: 'none' }], { duration: 560, easing: 'ease-out' });
        A(p.lid, [{ transform: 'none' }, { transform: 'translateY(1.4%)', offset: .3 }, { transform: 'none', offset: .52 }, { transform: 'none' }], { duration: 560 });
        A(p.inn, [{ transform: 'none' }, { transform: 'scale(1.045,.95)', offset: .3 }, { transform: 'scale(.99,1.01)', offset: .5 }, { transform: 'none', offset: .66 }, { transform: 'none' }], { duration: 560 });
        A(p.spark, [{ opacity: 0, transform: 'scale(0)' }, { opacity: 0, transform: 'scale(0)', offset: .3 }, { opacity: 1, transform: 'scale(1.8) rotate(45deg)', offset: .44 }, { opacity: 0, transform: 'scale(.5) rotate(90deg)', offset: .72 }, { opacity: 0, transform: 'scale(0)' }], { duration: 560 });
        return 560;
      },
      peek: function (p) { // the lid lifts on its hinge with the seam aglow, then closes with a small overshoot
        A(p.lid, [{ transform: 'none', easing: EO }, { transform: 'rotate(-14deg)', offset: .3 }, { transform: 'rotate(-14deg)', offset: .62, easing: 'ease-in' }, { transform: 'rotate(2deg)', offset: .8 }, { transform: 'none' }], { duration: 660 });
        A(p.core, [{ opacity: 0 }, { opacity: 1, offset: .28 }, { opacity: 1, offset: .62 }, { opacity: 0, offset: .8 }, { opacity: 0 }], { duration: 660 });
        A(p.halo, [{ opacity: 0 }, { opacity: .85, offset: .3 }, { opacity: .85, offset: .62 }, { opacity: 0, offset: .8 }, { opacity: 0 }], { duration: 660 });
        return 660;
      },
      glint: function (p) { // an amber glint sweeps the box as it swells a little
        A(p.glintL, [{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: .86 }, { opacity: 0 }], { duration: 600 });
        A(p.glint, [{ transform: 'translateX(-130%) skewX(-18deg)' }, { transform: 'translateX(520%) skewX(-18deg)' }], { duration: 600, easing: 'cubic-bezier(.45,0,.55,1)' });
        A(p.inn, [{ transform: 'none' }, { transform: 'scale(1.035)', offset: .45 }, { transform: 'none' }], { duration: 600, easing: 'ease-in-out' });
        return 600;
      },
      rm: function (p) { // Reduce Motion: light only
        A(p.halo, [{ opacity: 0 }, { opacity: .8, offset: .3 }, { opacity: 0 }], { duration: 380 });
        A(p.core, [{ opacity: 0 }, { opacity: .9, offset: .3 }, { opacity: 0 }], { duration: 380 });
        return 380;
      }
    };
    function play(lg, name) { // returns the variation played ('' if busy or failed)
      try {
        if (!lg || lg.__busy) return '';
        var v = motionRM() ? 'rm' : VAR[name] ? name : ORDER[vi++ % ORDER.length];
        lg.__busy = true;
        var ms = VAR[v](parts(lg));
        setTimeout(function () { lg.__busy = false; }, ms + 20);
        return v;
      } catch (e) { if (lg) lg.__busy = false; return ''; }
    }
    return { html: html, play: play, parts: parts, A: A, order: ORDER };
  })();
  window.TBX_LOGO = LOGO;
  (function () { // N3 on the Home header mark
    var br = document.getElementById('brand');
    if (br) br.addEventListener('click', function () { LOGO.play(br.querySelector('.lg')); });
  })();
  // ---- R7 N4: the toolbox drawer. Hold the About logo ~1 s: the lid lifts as you hold and a bar fills, then a small
  // drawer slides out of the box with a quote (R10). A quick tap plays N3; moving the finger or a scroll cancels. It
  // closes on its handle, a tap outside, or leaving the screen. The Credits card lower on the page is unchanged. ----
  // R10 (Nate, 2026-09-24): the drawer holds one motivating quote. The list is quotes.json at the site root
  // ({v, quotes: [{q, a, s?}]}: words, who said it, where from; tools/verify.mjs checks it). It is fetched when a hold
  // starts (pointerdown), so it is here when the drawer opens 0.9 s later, and kept in memory; sw.js saves it for
  // offline in ASSETS, never CORE (it must never hold up an update). Each phone walks its own shuffled order and sees
  // every quote once before any comes back: localStorage tbx_qbag = {h: hash of the list, o: shuffled indexes,
  // i: next position}; a new round never starts with the quote that ended the last one; a changed list starts a fresh
  // bag; with no storage (private mode) the bag lives in memory for the session. No list (offline and not saved, a bad
  // file, or still on its way) = Homer Stryker's line below: never an empty drawer, never a thrown error.
  var QUOTE = (function () {
    var FALLBACK = { q: 'If your tools don\u2019t work, make them work. If you can\u2019t make them work, make some that do work.', a: 'Homer Stryker', s: 'Stryker founder' };
    var KEY = 'tbx_qbag', LIST = null, HASH = '', BUSY = null, MEM = null;
    function str(v) { return typeof v === 'string' ? v.trim() : ''; }
    function clean(j) { // the usable quotes of a quotes.json body (text + who said it), or null
      var out = [];
      (j && Array.isArray(j.quotes) ? j.quotes : []).forEach(function (x) {
        var q = str(x && x.q), a = str(x && x.a);
        if (q && a) out.push({ q: q, a: a, s: str(x.s) });
      });
      return out.length ? out : null;
    }
    function hash(list) { // FNV-1a over the count and the quote texts in order: any edit to the list starts a fresh bag
      var s = list.length + '', h = 0x811c9dc5, i, k;
      for (i = 0; i < list.length; i++) s += '\n' + list[i].q;
      for (k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(36);
    }
    function shuffle(n, notFirst) { // Fisher-Yates; the round never starts with notFirst (the quote that ended the last one)
      var o = [], i, j, t;
      for (i = 0; i < n; i++) o.push(i);
      for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = o[i]; o[i] = o[j]; o[j] = t; }
      if (n > 1 && o[0] === notFirst) { j = 1 + Math.floor(Math.random() * (n - 1)); t = o[0]; o[0] = o[j]; o[j] = t; }
      return o;
    }
    function whole(b, n, h) { // a saved bag counts only if it is this list's and a whole permutation of it
      if (!b || b.h !== h || !Array.isArray(b.o) || b.o.length !== n || typeof b.i !== 'number' || !(b.i >= 0 && b.i <= n) || b.i % 1) return false;
      var seen = {};
      for (var k = 0; k < n; k++) { var x = b.o[k]; if (typeof x !== 'number' || x % 1 || x < 0 || x >= n || seen[x]) return false; seen[x] = 1; }
      return true;
    }
    function readBag() { if (MEM) return MEM; try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function saveBag(b) { MEM = b; try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }
    function pick(list, h) { // the index of the next quote to show; advances and saves the bag
      var n = list.length, b = readBag();
      if (!whole(b, n, h)) b = { h: h, o: shuffle(n, -1), i: 0 };
      if (b.i >= n) b = { h: h, o: shuffle(n, b.o[n - 1]), i: 0 };   // every quote shown: a new round
      saveBag({ h: h, o: b.o, i: b.i + 1 });
      return b.o[b.i];
    }
    function load() { // starts the fetch (or joins the one on its way); resolves with the list or null, never rejects
      if (LIST) return Promise.resolve(LIST);
      if (BUSY) return BUSY;
      try {
        BUSY = fetch('quotes.json').then(function (r) { if (!r.ok) throw new Error('quotes.json ' + r.status); return r.json(); })
          .then(function (j) { var l = clean(j); if (l) { LIST = l; HASH = hash(l); } return l; })
          .catch(function () { return null; })
          .then(function (l) { BUSY = null; return l; });   // a failure is tried again at the next hold
        return BUSY;
      } catch (e) { BUSY = null; return Promise.resolve(null); }
    }
    function next() { // the quote for this opening: the next one in the bag, or Homer Stryker's line
      try { if (LIST) { var x = LIST[pick(LIST, HASH)]; if (x) return x; } } catch (e) {}
      return FALLBACK;
    }
    function html(x) {
      return '<figure class="drw-q"><blockquote class="drw-qt">\u201c' + esc(x.q) + '\u201d</blockquote>' +
        '<figcaption class="drw-by">\u2014 <b>' + esc(x.a) + '</b>' + (x.s ? '<span class="drw-s">, ' + esc(x.s) + '</span>' : '') + '</figcaption></figure>';
    }
    return { load: load, next: next, html: html, clean: clean, hash: hash, shuffle: shuffle, whole: whole, pick: pick, FALLBACK: FALLBACK, KEY: KEY,
      state: function () { return { list: LIST, h: HASH, busy: !!BUSY, mem: MEM }; },
      reset: function () { LIST = null; HASH = ''; BUSY = null; MEM = null; } }; // tests: a fresh session
  })();
  function drawerHTML() {
    return '<div class="drw" id="ab-drw" hidden><button type="button" class="drw-front" aria-label="Close the quote drawer"><i></i></button>' +
      '<div class="drw-tray" role="group" aria-label="Quote">' + QUOTE.html(QUOTE.FALLBACK) + '</div></div>';
  }
  var HOLD = null, HOLD_MS = 900;
  function holdStop(k) { // k: 'tap' (quick release → N3), 'cancel' (spring back), 'open' (the drawer took over)
    var h = HOLD; if (!h) return; HOLD = null;
    clearTimeout(h.timer);
    var stop = function () { h.anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); };
    if (k === 'open') { setTimeout(stop, 200); return; } // the drawer's own motion takes over from the held pose
    stop();
    if (k === 'tap') LOGO.play(h.lg);
    else if (k === 'cancel' && !motionRM()) LOGO.A(LOGO.parts(h.lg).lid, [{ transform: 'translateY(-4%)' }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }
  function drwOpen(btn) {
    var card = btn.closest('.about-card'), d = card && card.querySelector('.drw'), lg = btn.querySelector('.lg');
    if (!d || !d.hidden) return;
    try { var tray = d.querySelector('.drw-tray'); if (tray) tray.innerHTML = QUOTE.html(QUOTE.next()); } catch (eQ) {} // R10: this opening's quote
    d.hidden = false; d.classList.add('open');
    var rm = motionRM(), p = lg ? LOGO.parts(lg) : null, reveal = 0;
    try { // R10: a long quote on a small phone can reach under the bottom bar: once the drawer is out, the page moves up
      // just enough to show all of it (never taking the handle under the header). Measured before the motion's transform.
      var dr = d.getBoundingClientRect(), bbar = document.getElementById('bottombar'), lim = bbar && bbar.offsetHeight ? bbar.getBoundingClientRect().top : window.innerHeight;
      reveal = Math.min(Math.ceil(dr.bottom + 12 - lim), Math.floor(dr.top - navHdr() - 8));
    } catch (eRv) { reveal = 0; }
    if (reveal > 0) setTimeout(function () {
      if (!d.isConnected || d.hidden || !d.classList.contains('open')) return;
      try { window.scrollBy({ top: reveal, left: 0, behavior: motionRM() ? 'auto' : 'smooth' }); } catch (eSc) { try { window.scrollBy(0, reveal); } catch (eSc2) {} }
    }, rm ? 130 : 380);
    if (rm) LOGO.A(d, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    else {
      if (p) {
        LOGO.A(p.lid, [{ transform: 'translateY(-5.5%)' }, { transform: 'translateY(-7.8%)', offset: .25 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.65,0,.35,1)' });
        LOGO.A(p.core, [{ opacity: 1, transform: 'translateY(-2.75%) scaleY(3.9)' }, { opacity: 0, transform: 'none' }], { duration: 300, delay: 100 });
        LOGO.A(p.halo, [{ opacity: .8 }, { opacity: 0 }], { duration: 300, delay: 100 });
      }
      LOGO.A(d, [{ opacity: 0, transform: 'translateY(-46px) scale(.26)' }, { opacity: 1, transform: 'translateY(-6px) scale(1.015)', offset: .72 }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    var bar = card.querySelector('.holdbar'); if (bar) LOGO.A(bar, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    try { d.querySelector('.drw-front').focus({ preventScroll: true }); } catch (e) {}
  }
  function drwClose(d) {
    if (!d || d.hidden || d.__closing) return;
    d.__closing = true; d.classList.remove('open');
    var a = motionRM() ? LOGO.A(d, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' })
      : LOGO.A(d, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-46px) scale(.26)' }], { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    setTimeout(function () { d.hidden = true; d.__closing = false; try { if (a) a.cancel(); } catch (e) {} }, motionRM() ? 110 : 250);
  }
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.about-hold') : null;
    if (!btn || (e.button && e.button !== 0)) return;
    try { QUOTE.load(); } catch (eQl) {} // R10: the quote list starts on its way now, so it is here when the drawer opens
    holdStop('cancel');
    var lg = btn.querySelector('.lg'), card = btn.closest('.about-card'), d = card && card.querySelector('.drw');
    if (!lg || (d && !d.hidden)) return;
    var p = LOGO.parts(lg), bar = card.querySelector('.holdbar'), bi = bar && bar.querySelector('.hb-fill'), anims = [];
    function add(a) { if (a) anims.push(a); }
    add(LOGO.A(bar, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'forwards' }));
    add(LOGO.A(bi, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: HOLD_MS, fill: 'forwards' })); // progress: stays with Reduce Motion
    if (!motionRM()) {
      add(LOGO.A(p.lid, [{ transform: 'none' }, { transform: 'translateY(-5.5%)' }], { duration: HOLD_MS, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' }));
      add(LOGO.A(p.core, [{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'translateY(-2.75%) scaleY(3.9)' }], { duration: HOLD_MS, easing: 'ease-in', fill: 'forwards' }));
    }
    add(LOGO.A(p.halo, [{ opacity: 0 }, { opacity: .8 }], { duration: HOLD_MS, easing: 'ease-in', fill: 'forwards' }));
    HOLD = { btn: btn, lg: lg, x: e.clientX, y: e.clientY, t: Date.now(), anims: anims, timer: setTimeout(function () {
      var h = HOLD; if (!h) return; holdStop('open'); drwOpen(h.btn);
    }, HOLD_MS) };
    HOLD_PTR = true;
  }, true);
  var HOLD_DONE = 0, HOLD_PTR = false; // a click right after a press on the logo belongs to that press (it is not a keyboard tap)
  document.addEventListener('pointermove', function (e) { if (HOLD && Math.sqrt(Math.pow(e.clientX - HOLD.x, 2) + Math.pow(e.clientY - HOLD.y, 2)) > 10) holdStop('cancel'); }, true);
  document.addEventListener('pointerup', function () {
    if (HOLD_PTR) { HOLD_PTR = false; HOLD_DONE = Date.now(); }
    if (HOLD) { var quick = Date.now() - HOLD.t < 260; holdStop(quick ? 'tap' : 'cancel'); }
  }, true);
  document.addEventListener('pointercancel', function () { holdStop('cancel'); }, true);
  window.addEventListener('scroll', function () { holdStop('cancel'); }, { passive: true });
  document.addEventListener('contextmenu', function (e) { if (e.target && e.target.closest && e.target.closest('.about-hold')) e.preventDefault(); });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var btn = t.closest('.about-hold');
    if (btn) { if (Date.now() - HOLD_DONE > 700) LOGO.play(btn.querySelector('.lg')); return; } // a keyboard press: N3
    var d = document.querySelector('.drw.open');
    if (!d) return;
    if (t.closest('.drw-front') || !t.closest('.drw')) drwClose(d);
  });
  function aboutScreen() {
    setTitle('About', ''); backBtn.hidden = false;
    render(
      '<div class="card about-card ab-top" style="text-align:center">' +
        '<div class="about-lg"><button type="button" class="about-hold" aria-label="SM ToolBox logo — hold for a quote">' + LOGO.html('appicon s96') + '</button><span class="holdbar" aria-hidden="true"><i class="hb-fill"></i></span></div>' +
        '<h1 style="margin:0">Sports<span style="color:var(--amber)">Med</span> Toolbox</h1>' +
        '<div style="color:var(--muted); font-size:13px; margin-top:5px">v' + APPVER + ' &middot; data updated ' + esc(D.built) + '</div>' +
        '<div class="ab-photos" id="ab-photos" hidden></div>' +
        '<div style="margin-top:6px"><button class="footlink" data-act="checkupd">Check for updates</button>' +
        '<span class="footsep">&middot;</span><button class="footlink" data-act="cyclecount">CT Team</button>' +
        '</div>' + drawerHTML() +
      '</div>' +
      '<div class="grouphead ab-gh">Tips</div>' +
      '<div class="card about-card">' +
        '<div class="tip"><b>Search smart.</b> Part numbers work with or without dashes.</div>' +
        '<div class="tip"><b>Scan the label.</b> The barcode button reads any package barcode &mdash; the card opens with lot and expiration shown.</div>' +
        '<div class="tip"><b>Zoom the fine print.</b> Tap any product photo to view it fullscreen; pinch or double-tap to zoom.</div>' +
        '<div class="tip"><b>Save your go-tos.</b> Tap ' + ICON.star + ' Favorite on any card to pin it to Favorites at the top of home.</div>' +
        '<div class="tip"><b>Take it offline.</b> Once loaded, everything works with zero signal &mdash; photos finish saving in the background (see Offline photos above).</div>' +
        '<div class="tip"><b>Install it.</b> Add the site to your home screen for the full app experience. <button class="footlink" data-act="a2hs" style="padding:0">Show me how &#x203A;</button></div>' +
      '</div>' +
      '<div class="grouphead ab-gh">Credits</div>' +
      '<div class="card about-card">' +
        '<div class="tip"><b style="color:var(--bone)">Created by Nate Merrell</b><br>Built for the CT Sports Medicine Team.</div>' +
        '<div class="tip">Questions, corrections, or a product you want added? Use the feedback bubble on any screen.</div>' +
        '<div id="fbq-note"></div>' + // P45: feedback waiting for signal / couldn't send (filled by the feedback module)
      '</div>' +
      '<div class="about-quote">\u201cIf your tools don\u2019t work, make them work. If you can\u2019t make them work, make some that do work.\u201d<span class="aq-by">\u2014 Homer Stryker</span></div>' +
      '<div style="text-align:center; margin:18px 0 6px"><button class="footlink" data-act="lockdev">Lock this device</button></div>');
    setTimeout(function () { try { phAbout(); } catch (ePh) {} }, 0);   // P2: the "Offline photos" line, once painted
    try { if (window.TBX_FBQ) window.TBX_FBQ.paint(); } catch (eFq) {}
  }
  function notFoundScreen(sku) { // P14: an old favorite / shared link / typo — say so, offer Search and Scan
    setTitle('Not in ToolBox', ''); backBtn.hidden = false; CUR_IT = null;
    var s = String(sku || '').slice(0, 40), fr = pnRoute(s);
    render('<div class="card nf-card">' + emptyHTML(ICON.search, '“' + s + '” isn’t in ToolBox',
      'It may be an old link, a typo, or a part without a card yet.',
      '<div class="nf-acts"><button class="nf-btn" data-go="#/?q=' + encodeURIComponent(s) + '">' + ICON.search + '<span>Search for it</span></button>' +
      '<button class="nf-btn" data-act="scan">' + ICON.scan + '<span>Scan the barcode</span></button></div>' +
      (isFav(fr) ? '<button class="footlink nf-unfav" data-unfav-route="' + esc(fr) + '">Remove from Favorites</button>' : '')) + '</div>');
  }
  function instrScreen(sku, cat) {
    var e = BYPN[nrm(sku)];
    if (!e || e.kind !== 'item') return notFoundScreen(sku);
    var it = D.items[e.idx];
    backBtn.hidden = false;
    var CATTITLE = { Capital: 'Associated capital', Disposables: 'Associated disposables', Instruments: 'Instrumentation' };
    setTitle(cat ? (CATTITLE[cat] || cat) : 'Instrumentation', '');
    var list = instrFor(it).filter(function (x) { return x.it.sku !== it.sku; });
    if (cat) list = list.filter(function (x) { return x.it.cat === cat && (!it.sub || (x.it.sub || '') === it.sub); });
    var order = ['Disposables', 'Instruments', 'Capital'], label = { Disposables: 'Disposables', Instruments: 'Instruments', Capital: 'Capital' };
    var html = '<div class="eyebrow">' + esc((it.t || it.name) + (it.sz ? ' ' + it.sz : '')) + '</div>';
    order.forEach(function (c) {
      var grp = list.filter(function (x) { return x.it.cat === c; });
      if (!grp.length) return;
      html += (cat ? '' : '<div class="grouphead">' + esc(label[c]) + '</div>') + '<div class="list">' +
        grp.map(function (x) { return rowHTML(pnRoute(x.it.sku), x.it, ''); }).join('') + '</div>';
    });
    render(html);
  }
  function partsScreen(sku) {
    var e = BYPN[nrm(sku)];
    if (!e || e.kind !== 'item') return notFoundScreen(sku);
    var it = D.items[e.idx];
    backBtn.hidden = false;
    setTitle(it.plabel || 'Parts', '');
    var html = '<div class="eyebrow">' + esc(it.t || it.name) + '</div><div class="list">' +
      (it.parts || []).map(function (psku) {
        var e2 = BYPN[nrm(psku)];
        if (!e2 || e2.kind !== 'item') return '';
        var x = D.items[e2.idx];
        return rowHTML(pnRoute(x.sku), x, '');
      }).join('') + '</div>';
    render(html);
  }
  function probesScreen() {
    setTitle('SERFAS RF Wands', ''); backBtn.hidden = false;
    var html = '', last = null, open = false;
    D.probes.forEach(function (p) {
      if (p.fam !== last) {
        if (open) html += '</div>';
        html += '<div class="grouphead">' + esc(p.fam) + '</div><div class="list">';
        open = true; last = p.fam;
      }
      html += rowHTML(pnRoute(p.sku), { t: p.name, sku: p.sku, uom: p.uom, tags: p.tags }, '');
    });
    if (open) html += '</div>';
    render(html);
  }
  var SHFAMS = ['Formula', 'CrossBlade', 'TPS', 'Parallel Portal'];
  function shDia(s) {
    var d = '';
    (s.specs || []).some(function (p) { if (p[0] === 'Diameter') { d = p[1]; return true; } return false; });
    return d;
  }
  function shSize(s) { var m = String(shDia(s)).match(/([\d.]+)/); return m ? parseFloat(m[1]) : 999; }
  function shaversScreen() {
    setTitle('Shaver Blades & Burs', ''); backBtn.hidden = false;
    var counts = {};
    D.shavers.forEach(function (s) { var f = s.fam || 'Formula'; counts[f] = (counts[f] || 0) + 1; });
    render('<div class="list">' + SHFAMS.slice().sort().filter(function (fm) { return counts[fm]; }).map(function (fm) {
      return drillRowHTML('#/shaverfam/' + encodeURIComponent(fm), fm, counts[fm]);
    }).join('') + '</div>');
  }
  function shaverFamScreen(fam) {
    backBtn.hidden = false;
    setTitle(fam, '');
    var list = D.shavers.filter(function (s) { return (s.fam || 'Formula') === fam; })
      .sort(function (a, b) { return (shSize(a) - shSize(b)) || String(a.name).localeCompare(String(b.name)); });
    if (!list.length) return render('<div class="empty">No shavers.</div>');
    var html = '', lastSz = null, open = false;
    list.forEach(function (s) {
      var sz = shSize(s);
      if (sz !== lastSz) {
        if (open) html += '</div>';
        html += '<div class="sizehead">' + esc(shDia(s)) + '</div><div class="list">';
        open = true; lastSz = sz;
      }
      html += rowHTML(pnRoute(s.sku), { t: s.name, sku: s.sku, uom: s.uom, tags: s.tags }, '');
    });
    if (open) html += '</div>';
    render(html);
  }

  // ---- cycle count (CT team) ----
  var CC = { creds: null, dev: '', loc: '', locBase: '', subloc: '', notes: '', mode: 'single', rows: [], base: [], ops: [], syncLoaded: false, wake: null, hist: {}, stream: null, running: false, poll: null, cool: { code: '', t: 0, ms: 2600 }, pend: null, canvas: document.createElement('canvas'), ctx: null, tickTO: null, track: null, focusIv: null, camOff: false, worker: null, workerFailed: false, wcb: {}, wid: 0, miss: 0, stall: 0, camBusy: false, ac: null, listSig: '', busy: false, view: 'gate', tgt: 'cc', ret: null, gateMsg: '' };
  function ccLS(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var TERR = {
    ct:  { id: 'ct',  name: 'CT Team',     enc: 'cc.enc.json',     tgt: 'cc',     gate: 'CT team access \u2014 enter the password.', fa: true },
    buf: { id: 'buf', name: 'Buffalo',     enc: 'cc-buf.enc.json', tgt: 'buf_cc', gate: 'Buffalo team access \u2014 enter the password.', fa: false },
    la:  { id: 'la',  name: 'Los Angeles', enc: 'cc-la.enc.json',  tgt: 'la_cc',  gate: 'Los Angeles team access \u2014 enter the password.', fa: false },
    syr: { id: 'syr', name: 'Syracuse',    enc: 'cc-syr.enc.json', tgt: 'syr_cc', gate: 'Syracuse team access \u2014 enter the password.', fa: false },
    ri:  { id: 'ri',  name: 'Rhode Island', enc: 'cc-ri.enc.json',  tgt: 'ri_cc',  gate: 'Rhode Island team access \u2014 enter the password.', fa: false },
    wm:  { id: 'wm',  name: 'Western Mass', enc: 'cc-wm.enc.json',  tgt: 'wm_cc',  gate: 'Western Mass team access \u2014 enter the password.', fa: false },
    sbx: { id: 'sbx', name: 'Sandbox',      enc: 'cc-sbx.enc.json', tgt: 'sbx_cc', gate: 'Sandbox \u2014 staging territory for testing. Enter the password.', fa: false }
  };
  var TORDER = ['buf', 'la', 'ri', 'syr', 'wm']; // sbx is deliberately not listed: reachable only at #/team/sbx
  // ---- Hub: self-serve territories (served by the syksmtoolbox Apps Script) ----
  var HUB = { url: '', key: '' };
  try { if (window.TOOLBOX && window.TOOLBOX.hub && window.TOOLBOX.hub.url) HUB = window.TOOLBOX.hub; } catch (eHub) {}
  var HORDER = [];
  var GMRE = /^[^@\s]+@(gmail|googlemail)\.com$/i;
  function hubOn() { return !!(HUB && HUB.url); }
  var TERR_BUILTIN = {}; for (var tbk in TERR) TERR_BUILTIN[tbk] = 1;
  function hubTerrAdd(t, save) {
    if (!t || !t.slug) return;
    if (TERR_BUILTIN[t.slug]) return; // built-in territories keep their own names and files
    if (TERR[t.slug]) { if (t.name) { TERR[t.slug].name = t.name; TERR[t.slug].gate = t.name + ' team access \u2014 enter the password.'; } return; }
    TERR[t.slug] = { id: t.slug, name: t.name || t.slug, enc: '', tgt: t.slug + '_cc', gate: (t.name || t.slug) + ' team access \u2014 enter the password.', fa: false, hub: true };
    HORDER.push(t.slug);
    if (save) hubTerrSave();
  }
  function hubTerrPrune(liveSlugs) {
    var gone = 0;
    for (var i = HORDER.length - 1; i >= 0; i--) {
      var k = HORDER[i];
      if (liveSlugs.indexOf(k) < 0) {
        if (ccPendingLS(TERR[k].tgt)) continue; // unsent scans on this phone: keep it until they go out
        HORDER.splice(i, 1); delete TERR[k];
        ['tbx_' + k + '_cc', 'tbx_' + k + '_cc_dev', 'tbx_' + k + '_cc_roster'].forEach(function (kk) { try { localStorage.removeItem(kk); } catch (e) {} });
        gone++;
      }
    }
    return gone;
  }
  function hubTerrSave() { try { localStorage.setItem('tbx_hubterrs', JSON.stringify(HORDER.map(function (k) { return { slug: k, name: TERR[k].name }; }))); } catch (e) {} }
  (function () { try { (JSON.parse(localStorage.getItem('tbx_hubterrs') || '[]') || []).forEach(function (t) { hubTerrAdd(t, false); }); } catch (e) {} })();
  function hubCall(action, body) {
    var b = body || {}; b.action = action; b.key = HUB.key;
    return fetch(HUB.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(b) }).then(function (r) { return r.json(); });
  }
  CC.terr = 'ct';
  var TDET = {};
  function terrTgt() { return TERR[CC.terr].tgt; }
  function terrKey(suf) { return 'tbx_' + terrTgt() + suf; }
  function terrByTgt(t) { for (var k in TERR) if (TERR[k].tgt === t) return TERR[k]; return TERR.ct; }
  function ccAllCcTgts() { var a = ['cc']; TORDER.concat(HORDER).forEach(function (k) { a.push(TERR[k].tgt); }); return a; }
  function ccPendingLS(t) { try { return (localStorage.getItem('tbx_' + t + '_ops') || '[]') !== '[]'; } catch (e) { return false; } }
  function ccCredsFor(t) {
    var st = ccSyncSt(t);
    if (st === CC) { if (!CC.creds) { var raw = ccLS('tbx_' + t); if (raw) { try { CC.creds = JSON.parse(raw); } catch (e) {} } } return CC.creds; }
    if (!st.creds) { var r2 = ccLS('tbx_' + t); if (r2) { try { st.creds = JSON.parse(r2); } catch (e2) {} } }
    return st.creds || null;
  }
  function ccDevFor(t) {
    var st = ccSyncSt(t);
    if (st === CC) { if (!CC.dev) CC.dev = ccLS('tbx_' + t + '_dev') || ''; return CC.dev; }
    if (!st.dev) st.dev = ccLS('tbx_' + t + '_dev') || '';
    return st.dev;
  }
  function ccSY(t) { var y = SY[t]; if (!y) y = SY[t] = { timer: null, inflight: false, retry: 0, lastOk: 0, inAt: 0 }; return y; }
  function terrSet(id) {
    if (!TERR[id] || CC.terr === id) return;
    var oldTgt = terrTgt();
    ccSaveBaseNow(oldTgt);
    try { localStorage.setItem('tbx_' + oldTgt + '_ops', JSON.stringify(CC.ops)); } catch (e) {}
    delete TDET[oldTgt];
    CC.terr = id;
    delete TDET[TERR[id].tgt];
    CC.creds = null; CC.dev = '';
    CC.loc = ''; CC.locBase = ''; CC.subloc = ''; CC.notes = '';
    CC.rows = []; CC.base = []; CC.ops = [];
    CC.syncLoaded = false;
    CC.tgt = TERR[id].tgt;
    ccHistLoad();
  }
  function ccB64d(x) { var bin = atob(x), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function ccExp(e6) { return expDisp(e6); }
  // Typed expiry on the manual/editor sheets -> the same 'YYYY-MM[-DD]' form scans produce.
  function ccExpInput(v) {
    v = String(v || '').trim(); if (!v) return '';
    var m;
    if ((m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/))) return m[3] ? m[1] + '-' + m[2] + '-' + m[3] : m[1] + '-' + m[2];
    if ((m = v.match(/^(\d{1,2})\/(\d{4})$/))) return m[2] + '-' + ('0' + m[1]).slice(-2);
    if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    if (/^\d{6}$/.test(v)) return expDisp(v);
    return v;
  }
  function ccIsExpired(exp) { var n = expDaysLeft(exp); return n !== null && n < 0; }
  function ccBar(hide) {
    var b = document.getElementById('bottombar'); if (b) b.style.display = hide ? 'none' : '';
    if (document.body) document.body.classList.toggle('ct-chrome-off', !!hide);
  }
  function ccStop() {
    if (!CC) return;
    CC.running = false;
    if (CC.tickTO) { clearTimeout(CC.tickTO); CC.tickTO = null; }
    if (CC.focusIv) { clearInterval(CC.focusIv); CC.focusIv = null; }
    if (CC.stream) { try { CC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} CC.stream = null; }
    CC.track = null;
    if (CC.poll) { clearInterval(CC.poll); CC.poll = null; }
    if (CC.wake) { try { CC.wake.release(); } catch (e2) {} CC.wake = null; }
    if (document.body) document.body.classList.remove('cc-fixed');
    var sh = document.getElementById('cc-sheet'); if (sh) { sh.hidden = true; sh.classList.remove('cc-modal'); }
    var bd = document.getElementById('cc-backdrop'); if (bd) bd.hidden = true;
  }
  // ---- offline-first sync engine: scans land in a local ledger instantly and
  // ---- upload in the background as idempotent ops (opId-deduped server side).
  var SY = { cc: { timer: null, inflight: false, retry: 0, lastOk: 0, inAt: 0 } };
  function ccNRef(x) { return String(x == null ? '' : x).replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }
  function ccNLot(x) { return String(x == null ? '' : x).trim().toUpperCase(); }
  function ccNLoc(x) { return String(x == null ? '' : x).trim().toLowerCase(); }
  function ccKeyCC(loc, ref, lot) { return ccNLoc(loc) + '||' + ccNRef(ref) + '||' + ccNLot(lot); }
  function ccSyncSt(t) {
    if (t === terrTgt()) return CC;
    var s = TDET[t];
    if (!s) { s = TDET[t] = { rows: [], base: [], ops: [], creds: null, dev: '', loaded: false }; }
    if (!s.loaded) {
      s.loaded = true;
      try { s.base = JSON.parse(localStorage.getItem('tbx_' + t + '_base') || '[]') || []; } catch (e) { s.base = []; }
      try { s.ops = JSON.parse(localStorage.getItem('tbx_' + t + '_ops') || '[]') || []; } catch (e2) { s.ops = []; }
    }
    return s;
  }
  var BSAVE = { cc: null };
  function ccSaveBaseNow(t) {
    if (BSAVE[t]) { clearTimeout(BSAVE[t]); BSAVE[t] = null; }
    try { localStorage.setItem('tbx_' + t + '_base', JSON.stringify(ccSyncSt(t).base)); } catch (e) {}
  }
  function ccSyncSave(t, baseChanged) {
    try { localStorage.setItem('tbx_' + t + '_ops', JSON.stringify(ccSyncSt(t).ops)); } catch (e) {}
    if (baseChanged) ccSaveBaseNow(t);
    else if (!BSAVE[t]) BSAVE[t] = setTimeout(function () { BSAVE[t] = null; ccSaveBaseNow(t); }, 4000);
  }
  function ccSyncLoad(t) {
    var st = ccSyncSt(t);
    try { st.base = JSON.parse(localStorage.getItem('tbx_' + t + '_base') || '[]') || []; } catch (e) { st.base = []; }
    try { st.ops = JSON.parse(localStorage.getItem('tbx_' + t + '_ops') || '[]') || []; } catch (e2) { st.ops = []; }
    ccDerive(t);
  }
  function ccOpRow(t, op, q, dev) {
    var r = { id: 'p' + op.opId, ts: op.ts || new Date().toISOString(), dev: dev || '', ref: op.ref, desc: op.desc || '', fam: op.fam || '', lot: op.lot || '', exp: op.exp || '', expired: !!op.expired, qty: q, pending: true };
    r.loc = op.loc; r.notes = op.notes || '';
    return r;
  }
  function ccDeriveCore(base, ops, t, dev) {
    var rows = base.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; return c; });
    var idx = {};
    function keyRow(x) { return ccKeyCC(x.loc, x.ref, x.lot); }
    function reindex() { idx = {}; for (var i = 0; i < rows.length; i++) { var k = keyRow(rows[i]); if (!(k in idx)) idx[k] = i; } }
    reindex();
    ops.forEach(function (op) {
      var k = ccKeyCC(op.loc, op.ref, op.lot);
      var j = (k in idx) ? idx[k] : -1;
      if (op.t === 'add') {
        var q = Math.max(1, Math.round(+op.qty || 1));
        if (j >= 0) { var row = rows[j]; row.qty = (+row.qty || 0) + q; row.ts = op.ts || row.ts; row.pending = true; if (!row.desc && op.desc) row.desc = op.desc; if (!row.exp && op.exp) row.exp = op.exp; if (op.expired) row.expired = true; }
        else { rows.push(ccOpRow(t, op, q, dev)); idx[k] = rows.length - 1; }
      } else if (op.t === 'set') {
        var q2 = Math.max(0, Math.round(+op.qty || 0));
        if (j >= 0) { rows[j].qty = q2; rows[j].ts = op.ts || rows[j].ts; rows[j].pending = true; if (op.exp !== undefined && op.exp !== rows[j].exp) { rows[j].exp = op.exp; rows[j].expired = !!op.expired; } }
        else { rows.push(ccOpRow(t, op, q2, dev)); idx[k] = rows.length - 1; }
      } else if (op.t === 'del') {
        if (j >= 0) { rows.splice(j, 1); reindex(); }
      }
    });
    return rows;
  }
  function ccDerive(t) {
    var st = ccSyncSt(t);
    var rows = ccDeriveCore(st.base || [], st.ops || [], t, ccDevFor(t));
    st.rows = rows;
    return rows;
  }
  function ccEndpoint(t) { return ccCredsFor(t); }
  function ccEnqueue(t, op) {
    op.opId = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    if (!op.ts) op.ts = new Date().toISOString();
    // Remember which phone made this scan now, so a later device re-pick can't
    // move queued scans onto someone else's tab.
    if (!op.dev) op.dev = ccDevFor(t) || '';
    ccSyncSt(t).ops.push(op);
    ccSyncSave(t);
    ccDerive(t);
    ccRenderList();
    if (CC.view === 'cchome' && t === CC.tgt) ccHomeCards();
    ccPill();
    ccFlushSoon(t, 1200);
  }
  function ccFlushSoon(t, ms) { var y = ccSY(t); if (y.timer) clearTimeout(y.timer); y.timer = setTimeout(function () { ccFlush(t); }, ms || 800); }
  function ccFetchTimeout(ms) {
    // Give up on a stuck request instead of holding the queue until the browser does.
    var ac = null; try { if (typeof AbortController !== 'undefined') ac = new AbortController(); } catch (e) {}
    var to = ac ? setTimeout(function () { try { ac.abort(); } catch (e2) {} }, ms) : null;
    return { signal: ac ? ac.signal : undefined, clear: function () { if (to) clearTimeout(to); } };
  }
  function ccFlush(t, keep) {
    var y = ccSY(t), st = ccSyncSt(t), ep = ccEndpoint(t);
    var dv = ccDevFor(t);
    if (!ep || !dv) { ccPill(); return; }
    if (y.inflight) {
      if (Date.now() - (y.inAt || 0) < 25000) { ccPill(); ccFlushSoon(t, 6000); return; }
      y.inflight = false;
    }
    if (!st.ops.length) { ccPill(); return; }
    // One batch per phone: scans carry the device they were made on, so a batch
    // only holds scans from a single device and is sent under that name. Scans
    // saved before this existed have no device and go under the current one.
    // A device the sheet already rejected is skipped while other scans remain,
    // so one stale group can't hold up the current phone. Re-picking the device
    // clears the rejection and the group is tried again.
    var bdev = '';
    for (var b0 = 0; b0 < st.ops.length; b0++) { var d0 = st.ops[b0].dev || dv; if (!(y.err === 'dev' && d0 === y.errDev)) { bdev = d0; break; } }
    if (!bdev) { ccPill(); ccSyncLine(t); return; }
    var batch = [], cap = keep ? 25 : 150;
    for (var bi = 0; bi < st.ops.length && batch.length < cap; bi++) { if ((st.ops[bi].dev || dv) === bdev) batch.push(st.ops[bi]); }
    y.inflight = true; y.inAt = Date.now(); ccPill();
    // After a failed or timed-out attempt the sheet may already hold some of these scans (the request
    // can land after the phone gave up). A retry asks for the rows back so the base is replaced with
    // the sheet's truth instead of being rebuilt from only the ops the sheet calls fresh.
    var wantRows = y.retry > 0;
    var tmo = ccFetchTimeout(20000);
    fetch(ep.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: ep.token, action: 'batch', dev: bdev, ops: batch, norows: wantRows ? 0 : 1 }), keepalive: !!keep, signal: tmo.signal })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        tmo.clear();
        y.inflight = false;
        // Look the territory state up again: the user may have switched territories
        // while this request was out, and the object grabbed at the start would then
        // belong to a different territory.
        var st2 = ccSyncSt(t);
        if (!j || !j.ok || !j.applied) {
          // Not on the roster: nothing will change until the device is re-picked
          // (which flushes again), so don't sit in a retry loop.
          if (j && j.err === 'dev') {
            y.err = 'dev'; y.errDev = bdev; ccStatus((bdev === dv ? 'This device isn\u2019t' : bdev + ' isn\u2019t') + ' on the roster \u2014 tap change on ' + terrByTgt(t).name); ccPill(); ccSyncLine(t);
            // Scans from any other phone can still go out.
            if (st2.ops.some(function (o) { return (o.dev || dv) !== bdev; })) ccFlushSoon(t, 400);
            return;
          }
          if (j && j.err === 'busy') { ccPill(); ccFlushSoon(t, 1500 + Math.floor(Math.random() * 2500)); return; }
          y.retry = Math.min(y.retry + 1, 5); ccPill(); ccFlushSoon(t, 5000 * Math.max(1, y.retry)); return;
        }
        if (y.errDev === bdev) { y.err = ''; y.errDev = ''; }
        var done = {}; j.applied.forEach(function (id) { done[id] = 1; });
        var fresh = {}; (j.fresh || j.applied).forEach(function (id) { fresh[id] = 1; });
        var settled = st2.ops.filter(function (o) { return fresh[o.opId]; });
        // Ops the sheet had already applied on an earlier attempt: they are not "fresh", so folding
        // only the fresh ones would drop them from this phone until the next pull.
        var dup = j.applied.some(function (id) { return !fresh[id]; });
        st2.ops = st2.ops.filter(function (o) { return !done[o.opId]; });
        if (j.rows) st2.base = j.rows;
        else if (settled.length) {
          st2.base = ccDeriveCore(st2.base, settled, t, bdev).map(function (r) { if (r.pending) { var c = {}; for (var k in r) c[k] = r[k]; delete c.pending; return c; } return r; });
        }
        y.retry = 0; y.lastOk = Date.now();
        ccSyncSave(t, true); ccDerive(t); ccRenderList();
        if (!j.rows && dup) ccPull(t).then(function () { ccRenderList(); if (CC.view === 'cchome' && t === CC.tgt) ccHomeCards(); }).catch(function () {});
        if (CC.view === 'cchome' && t === CC.tgt) ccHomeCards();
        ccPill(); ccSyncLine(t);
        if (st2.ops.length) ccFlushSoon(t, 400);
      })
      .catch(function () { tmo.clear(); y.inflight = false; y.retry = Math.min(y.retry + 1, 5); ccPill(); ccFlushSoon(t, 4000 * Math.max(1, y.retry)); });
  }
  function ccPull(t) {
    var ep = ccEndpoint(t);
    if (!ep) return Promise.reject(new Error('nocreds'));
    var y = ccSY(t), startOk = y.lastOk;
    var q = '&action=pull&dev=' + encodeURIComponent(ccDevFor(t) || '');
    var tmo = ccFetchTimeout(20000);
    return fetch(ep.url + '?token=' + encodeURIComponent(ep.token) + q, { signal: tmo.signal })
      .then(function (r) { tmo.clear(); return r.json(); }, function (e) { tmo.clear(); throw e; })
      .then(function (j) {
        if (j && j.ok && j.rows) {
          if (j.sheetUrl && t !== 'cc') { try { ccLS('tbx_' + t + '_sheet', String(j.sheetUrl)); } catch (eS) {} var sl = document.querySelector('.sheetlink'); if (!sl && CC.view === 'cchome' && t === CC.tgt) { var sy0 = document.getElementById('cc-sync'); if (sy0) sy0.insertAdjacentHTML('afterend', sheetLinkHTML(j.sheetUrl)); } }
          // A flush that landed (or is in flight) while this GET ran has fresher
          // rows than this snapshot — keep the flush's base in that case.
          if (y.lastOk === startOk && !y.inflight) { ccSyncSt(t).base = j.rows; ccSyncSave(t, true); }
          y.lastPull = Date.now();
          ccDerive(t); ccPill();
          try { fopsOnPull(t, j); } catch (eF) {}
          return j;
        }
        throw new Error('pull');
      });
  }
  function ccPill() {
    var el = document.getElementById('cc-pill'); if (!el) return;
    var cur = CC.tgt;
    var st = ccSyncSt(cur), y = ccSY(cur);
    var n = st.ops.length;
    if (!n) { el.textContent = 'Saved \u2713'; el.className = 'cc-pill ok'; }
    else if (y.inflight) { el.textContent = 'Syncing\u2026'; el.className = 'cc-pill busy'; }
    else if (!navigator.onLine) { el.textContent = n + ' queued \u2014 offline'; el.className = 'cc-pill wait'; }
    else { el.textContent = n + ' to sync'; el.className = 'cc-pill wait'; }
  }
  window.addEventListener('online', function () {
    ccFlushSoon(terrTgt(), 300);
    ccAllCcTgts().forEach(function (tg, i) { if (tg !== terrTgt() && ccPendingLS(tg)) ccFlushSoon(tg, 900 + i * 300); });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      try { ccFlush(terrTgt(), true); } catch (e) {}
      return;
    }
    if (document.visibilityState !== 'visible') return;
    try {
      if (CC.view === 'count') { ccWake(); ccBeepInit(); setTimeout(function () { ccCamRecover(); }, 500); }
      ccFlushSoon(terrTgt(), 800);
      setTimeout(function () { fopsLiveTick(true); }, 1200);
      ccAllCcTgts().forEach(function (tg, i2) { if (tg !== terrTgt() && ccPendingLS(tg)) ccFlushSoon(tg, 1600 + i2 * 300); });
    } catch (e2) {}
  });
  window.addEventListener('pagehide', function () { try { ccSaveBaseNow(terrTgt()); } catch (e) {} });
  // Boot: if this phone has queued scans from a previous session, load creds and push them out silently.
  // Deferred a tick so the whole module has evaluated first.
  setTimeout(function () {
    try {
      if (ccLS('tbx_cc') && (ccLS('tbx_cc_ops') || '[]') !== '[]') {
        if (CC.terr === 'ct') {
          if (!CC.creds) CC.creds = JSON.parse(ccLS('tbx_cc'));
          if (!CC.dev) CC.dev = ccLS('tbx_cc_dev') || '';
          if (!CC.syncLoaded) { CC.syncLoaded = true; ccSyncLoad('cc'); }
        }
        ccFlushSoon('cc', 2000);
      }
      TORDER.concat(HORDER).forEach(function (k, i) {
        var tg = TERR[k].tgt;
        if (tg !== terrTgt() && ccPendingLS(tg) && ccLS('tbx_' + tg)) ccFlushSoon(tg, 4000 + i * 500);
      });
    } catch (eBoot) {}
  }, 0);
  function sheetLinkHTML(url) { return url ? '<a class="sheetlink" href="' + esc(url) + '" target="_blank" rel="noopener">Open in Google Sheets &#x2197;</a>' : ''; }
  function ccSheetUrl() {
    if (CC.terr === 'ct') return (D.sheets || {}).cc || '';
    return ccLS(terrKey('_sheet')) || '';
  }
  function ccScreen() {
    setTitle('Cycle Count', ''); backBtn.hidden = false;
    ccStop();
    if (!ctEnsure(ccScreen)) return;
    CC.tgt = terrTgt(); CC.view = 'cchome';
    render(
      '<div class="card cc-card cc-home">' +
        '<h2 class="cc-h">Cycle Count</h2>' +
        '<div class="cc-sub">Counts by location \u2014 open one to keep adding, or start fresh.</div>' +
        '<div id="cc-fops" class="fops-wrap fops-top" hidden></div>' +
        '<div id="cc-counts-lab" class="fops-lab" hidden>Counts</div>' +
        '<button id="cc-new" class="cc-btn">Start new count</button>' +
        '<div id="cc-sync" class="cc-sync"></div>' +
        sheetLinkHTML(ccSheetUrl()) +
        '<div id="cc-cards" class="ctc-wrap">' + skel(3) + '</div>' +
      '</div>');
    document.getElementById('cc-new').addEventListener('click', function () { ccSession(); });
    fopsCard();
    CURREFRESH = function () { return ccHomeLoad(terrTgt(), true); };
    document.getElementById('cc-cards').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.ctc') : null; if (!c) return;
      var loc = c.dataset.loc; if (!loc) return;
      CC.loc = loc;
      // Prefer the split this phone saved when the count was started; fall back to the last separator.
      var lb = ccLS(terrKey('_locsplit:' + loc));
      if (lb) { try { var ps = JSON.parse(lb); CC.locBase = ps[0]; CC.subloc = ps[1] || ''; } catch (eS) { lb = null; } }
      if (!lb) { var k = loc.lastIndexOf(' \u2014 '); CC.locBase = k > -1 ? loc.slice(0, k) : loc; CC.subloc = k > -1 ? loc.slice(k + 3) : ''; }
      CC.notes = ''; CC.tgt = terrTgt(); ccCount();
    });
    ccHomeLoad(terrTgt(), false);
  }
  function ccGate() {
    CC.view = 'gate'; fa2Wide(false);
    var TR = TERR[CC.terr];
    var gm = CC.gateMsg || TR.gate; CC.gateMsg = '';
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">' + esc(TR.name) + '</h2>' +
        '<div class="cc-sub">' + esc(gm) + '</div>' +
        '<input id="cc-pw" class="cc-in" type="password" autocomplete="off" placeholder="Password">' +
        '<div id="cc-err" class="cc-err" hidden>Wrong password.</div>' +
        '<button id="cc-go" class="cc-btn">Unlock</button>' +
      '</div>');
    var go = document.getElementById('cc-go'), pw = document.getElementById('cc-pw');
    function tryPw() {
      var v = pw.value; if (!v) return;
      go.disabled = true; go.textContent = 'Checking\u2026';
      function okc(creds) {
        CC.creds = creds;
        ccLS(terrKey(''), JSON.stringify(CC.creds));
        if (creds.devices && creds.devices.length) ccLS(terrKey('_roster'), JSON.stringify(creds.devices));
        var nx = CC.ret || ccScreen; CC.ret = null; nx();
      }
      function bad(msg) {
        go.disabled = false; go.textContent = 'Unlock';
        var er = document.getElementById('cc-err'); if (er) { er.textContent = msg || 'Wrong password.'; er.hidden = false; }
      }
      if (TR.hub) {
        if (!hubOn()) { bad('Update the app first \u2014 tap Check for updates on the home screen.'); return; }
        hubCall('join', { slug: TR.id, pw: v }).then(function (j) {
          if (j && j.ok && j.creds) { if (j.name && j.name !== TERR[TR.id].name) { TERR[TR.id].name = j.name; hubTerrSave(); } okc(j.creds); return; }
          bad(j && j.err === 'off' ? 'This territory is paused \u2014 check with Nate.' : 'Wrong password.');
        }).catch(function () { bad('Couldn\u2019t reach the server \u2014 check signal and try again.'); });
        return;
      }
      fetch(TR.enc).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (P) {
        return crypto.subtle.importKey('raw', new TextEncoder().encode(v), 'PBKDF2', false, ['deriveKey'])
          .then(function (km) { return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ccB64d(P.salt), iterations: P.it }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
          .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ccB64d(P.iv) }, key, ccB64d(P.ct)); });
      }).then(function (buf) {
        var creds = JSON.parse(new TextDecoder().decode(buf));
        var next = function () { okc(creds); };
        if (CC.terr === 'ct') { fa2TryUnlock(v).then(next, next); } else { next(); }
      }).catch(function () {
        if (CC.terr === 'ct') {
          fa2TryUnlockFA(v).then(function (ok) {
            if (ok) { if (location.hash === '#/fa2') { fa2Home(); } else { location.hash = '#/fa2'; } }
            else { bad(); }
          });
        } else { bad(); }
      });
    }
    go.addEventListener('click', tryPw);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPw(); });
    setTimeout(function () { pw.focus(); }, 60);
  }
  function ccDevice() {
    CC.view = 'device'; fa2Wide(false);
    function draw(list) {
      render(
        '<div class="card cc-card">' +
          '<h2 class="cc-h">Whose phone is this?</h2>' +
          '<div class="cc-sub">Every scan from this phone goes to its own tab on the team sheet.</div>' +
          '<select id="cc-dev" class="cc-in cc-sel"><option value="" disabled selected>' + (list.length ? 'Select this device\u2026' : 'Loading devices\u2026') + '</option>' + list.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('') + '</select>' +
          '<button id="cc-devgo" class="cc-btn">Continue</button>' +
        '</div>');
      document.getElementById('cc-devgo').addEventListener('click', function () {
        var v = document.getElementById('cc-dev').value;
        if (!v) return;
        CC.dev = v; ccLS(terrKey('_dev'), v);
        var y0 = ccSY(terrTgt()); y0.err = ''; y0.errDev = '';
        var nx = CC.ret || ccScreen; CC.ret = null; nx();
      });
    }
    draw(ccRoster());
    if (CC.creds) {
      fetch(CC.creds.url + '?token=' + encodeURIComponent(CC.creds.token) + '&action=roster')
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.devices && j.devices.length) { ccLS(terrKey('_roster'), JSON.stringify(j.devices)); if (CC.view === 'device') draw(j.devices); } })
        .catch(function () {});
    }
  }
  function ccRoster() {
    var list = [];
    try { list = JSON.parse(ccLS(terrKey('_roster')) || '[]') || []; } catch (e) {}
    if (!list.length && CC.creds && CC.creds.devices && CC.creds.devices.length) list = CC.creds.devices.slice();
    return list;
  }
  function ccSession() {
    CC.view = 'session';
    var locs = [], sublocs = [];
    try { locs = JSON.parse(ccLS(terrKey('_locs')) || '[]'); } catch (e) {}
    try { sublocs = JSON.parse(ccLS(terrKey('_sublocs')) || '[]'); } catch (e) {}
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">Start a count</h2>' +
        '<div class="cc-sub">Device: <b>' + esc(CC.dev) + '</b></div>' +
        '<input id="cc-loc" class="cc-in" type="text" autocomplete="off" placeholder="Location (e.g. Storage Unit, Surgery Center)" list="cc-locl" value="' + esc(CC.locBase || '') + '">' +
        '<datalist id="cc-locl">' + locs.map(function (l) { return '<option value="' + esc(l) + '">'; }).join('') + '</datalist>' +
        '<input id="cc-subloc" class="cc-in" type="text" autocomplete="off" placeholder="Sub-location (optional, e.g. Shelf A1)" list="cc-sublocl" value="' + esc(CC.subloc || '') + '">' +
        '<datalist id="cc-sublocl">' + sublocs.map(function (l) { return '<option value="' + esc(l) + '">'; }).join('') + '</datalist>' +
        '<input id="cc-notes" class="cc-in" type="text" autocomplete="off" placeholder="Notes (optional)" value="' + esc(CC.notes || '') + '">' +
        '<button id="cc-start" class="cc-btn">Start Scanning</button>' +
        '<div class="cc-sub2">Scans save on this phone instantly and sync to the sheet automatically.</div>' +
      '</div>');
    document.getElementById('cc-start').addEventListener('click', function () {
      var loc = document.getElementById('cc-loc').value.trim();
      if (!loc) { document.getElementById('cc-loc').focus(); return; }
      var subloc = document.getElementById('cc-subloc').value.trim();
      CC.locBase = loc; CC.subloc = subloc;
      CC.loc = subloc ? loc + ' \u2014 ' + subloc : loc;
      if (subloc) ccLS(terrKey('_locsplit:' + CC.loc), JSON.stringify([loc, subloc]));
      CC.notes = document.getElementById('cc-notes').value.trim();
      var ls = [loc].concat(locs.filter(function (l) { return l !== loc; })).slice(0, 8);
      ccLS(terrKey('_locs'), JSON.stringify(ls));
      if (subloc) { var ss = [subloc].concat(sublocs.filter(function (l) { return l !== subloc; })).slice(0, 12); ccLS(terrKey('_sublocs'), JSON.stringify(ss)); }
      ccCount();
    });
  }
  function ccStatus(t) { var el = document.getElementById('cc-stat'); if (el) el.textContent = t; }
  function ccCount() {
    CC.view = 'count';
    CC.listSig = '';
    ccBar(true);
    // Pin the camera and running totals; only the scanned list scrolls.
    if (document.body) document.body.classList.add('cc-fixed');
    render(
      '<div id="ccwrap">' +
        ccCamPanelHtml({ manualId: 'cc-manual', endId: 'cc-end' }) +
        '<div id="cchead"><span id="cc-locname">' + esc(CC.loc) + '</span><span id="cc-pill" class="cc-pill"></span><span id="cc-tot"></span></div>' +
        '<div id="cclist">' + skel(4) + '</div>' +
      '</div>');
    CC.mode = 'single';
    document.getElementById('cc-end').addEventListener('click', function () { ccStop(); ccFlushSoon(CC.tgt, 100); ccScreen(); });
    document.getElementById('cc-manual').addEventListener('click', function () { ccManual(); });
    document.getElementById('cclist').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.ccrow') : null;
      if (!row) return;
      var r = ccRowsSrc().filter(function (x) { return x.id === row.dataset.id; })[0];
      if (r) ccEditor(r);
    });
    ccCamPanelWire();
    ccHistLoad();
    var t0 = CC.tgt;
    ccDerive(t0); ccRenderList(); ccPill();
    ccPull(t0).then(function () { ccRenderList(); }).catch(function () {});
    ccFlushSoon(t0, 600);
  }
  function ccModeUI() {
    ccStatus(CC.view === 'fa2add2' ? 'Aim at the product barcode \u2014 lot and expiry fill in automatically'
      : (CC.view === 'fa2ret' || CC.view === 'fa2send') ? 'Aim at a product barcode \u2014 each scan adds one'
      : 'Aim at a barcode \u2014 each scan confirms quantity');
  }
  function ccNoCamHint() { return (CC.view === 'fa2ret' || CC.view === 'fa2send') ? 'tap an item in the list' : 'tap + Manual to add items'; }
  function ccRefocus(force) {
    var t = CC.track;
    if (!t || !t.applyConstraints) return;
    var caps = (t.getCapabilities && t.getCapabilities()) || {};
    var modes = caps.focusMode || [];
    var set = function (m) { return t.applyConstraints({ advanced: [{ focusMode: m }] }).catch(function () {}); };
    if (modes.indexOf('single-shot') > -1) {
      set('single-shot');
      setTimeout(function () { if (modes.indexOf('continuous') > -1) set('continuous'); }, 800);
    } else if (force && modes.indexOf('manual') > -1 && modes.indexOf('continuous') > -1) {
      set('manual');
      setTimeout(function () { set('continuous'); }, 220);
    } else if (modes.indexOf('continuous') > -1) {
      set('continuous');
    }
  }
  function ccStartCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ccStatus('Camera not available'); return; }
    if (window.__TBX_PREPZX) window.__TBX_PREPZX();
    ccWorkerInit();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (st) {
        CC.stream = st; CC.running = true; CC.ctx = null; CC.stall = 0; CC.miss = 0;
        var v = document.getElementById('ccvid');
        if (!v) { ccStop(); return; }
        v.srcObject = st; v.play && v.play().catch(function () {});
        try {
          var track = st.getVideoTracks()[0];
          CC.track = track;
          // iOS ends or mutes the track when the phone locks or the app is
          // backgrounded; without this the preview silently freezes.
          try {
            track.addEventListener('ended', function () { ccCamRecover(); });
            track.addEventListener('mute', function () { setTimeout(function () { ccCamRecover(); }, 1500); });
          } catch (e0) {}
          if (track && track.applyConstraints) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
          var tb = document.getElementById('cc-torch');
          if (tb) { tb.hidden = true; tb.classList.remove('on'); tb.onclick = null; } // new track starts with the torch off
          var caps = track && track.getCapabilities ? track.getCapabilities() : null;
          if (tb && caps && caps.torch) {
            tb.hidden = false; var on = false;
            tb.onclick = function (e) { if (e) e.stopPropagation(); on = !on; tb.classList.toggle('on', on); track.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {}); };
          }
        } catch (e) {}
        ccModeUI();
        ccSchedule(400);
      }, function (err) {
        var blocked = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        ccStatus(blocked ? 'Camera blocked \u2014 tap ? to fix' : 'Camera unavailable \u2014 tap ? for help');
        ccCamHelp(true);
      });
  }
  function ccTick() {
    if (!CC.running || !ccScanView()) return;
    var v = document.getElementById('ccvid');
    if (!v || v.readyState < 2 || !v.videoWidth) {
      CC.stall++;
      if (CC.stall > 10) { CC.stall = 0; ccCamRecover(); return; }
      ccSchedule(250); return;
    }
    CC.stall = 0;
    try {
      var w = v.videoWidth, h = v.videoHeight, sc = Math.min(1, 1100 / w);
      // Decode a generous central region (matches the on-screen targeting box) —
      // cheaper per frame than the full frame, which keeps the preview smooth.
      var cw = Math.round(w * 0.86), ch = Math.round(h * 0.66);
      var sx = Math.round((w - cw) / 2), sy = Math.round((h - ch) / 2);
      var dw = Math.round(cw * sc), dh = Math.round(ch * sc);
      CC.canvas.width = dw; CC.canvas.height = dh;
      if (!CC.ctx) CC.ctx = CC.canvas.getContext('2d', { willReadFrequently: true });
      var c2 = CC.ctx;
      c2.drawImage(v, sx, sy, cw, ch, 0, 0, dw, dh);
      var img = c2.getImageData(0, 0, dw, dh);
      ccDecode(img, (CC.miss % 3) === 2 ? CC_FULL : CC_FAST)
        .then(function (res) {
          if (!CC.running) return;
          if (res && res.length && res[0].text) { CC.miss = 0; ccOnCode(res[0].text); }
          else { CC.miss++; ccSchedule(150); }
        }, function () { CC.miss++; ccSchedule(400); });
    } catch (e) { ccSchedule(300); }
  }
  function ccSchedule(ms) { if (CC.tickTO) clearTimeout(CC.tickTO); if (CC.camOff) return; CC.tickTO = setTimeout(ccTick, ms || 250); }
  // Two decode profiles. Most frames run the cheap pass (the codes we actually
  // scan, no exhaustive search). Every third frame runs the full pass, so any
  // other symbology still decodes within about half a second.
  var CC_FAST = { formats: ['DataMatrix', 'Code128'], maxNumberOfSymbols: 1, tryHarder: false, tryRotate: true, tryInvert: false, tryDownscale: false };
  var CC_FULL = { formats: ['DataMatrix', 'Code128', 'QRCode', 'EAN-13', 'UPC-A', 'PDF417'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: false };
  function ccWorkerInit() {
    if (CC.worker || CC.workerFailed || typeof Worker === 'undefined') return;
    CC.wfirst = true;
    try {
      var wk = new Worker('ccscan.js');
      wk.onmessage = function (e) {
        var d = e.data || {};
        var cb = CC.wcb[d.id];
        if (cb) { delete CC.wcb[d.id]; cb(d.err ? null : d.result); }
      };
      wk.onerror = function () { CC.workerFailed = true; try { wk.terminate(); } catch (e2) {} if (CC.worker === wk) CC.worker = null; };
      CC.worker = wk;
    } catch (e) { CC.workerFailed = true; CC.worker = null; }
  }
  function ccWorkerDrop() {
    try { if (CC.worker) CC.worker.terminate(); } catch (e) {}
    CC.worker = null; CC.wcb = {};
    // One slow frame shouldn't cost the whole session: allow a single respawn,
    // then fall back to the main thread for good.
    CC.wdrops = (CC.wdrops || 0) + 1;
    if (CC.wdrops >= 2) CC.workerFailed = true; else setTimeout(function () { if (ccScanView() && !CC.workerFailed) ccWorkerInit(); }, 1500);
  }
  function ccDecode(img, opts) {
    if (!CC.worker) return ZXingWASM.readBarcodes(img, opts);
    return new Promise(function (resolve) {
      var id = ++CC.wid, done = false;
      // First decode includes the WASM warm-up in the worker, which is slow on older phones.
      var wms = CC.wfirst ? 15000 : 5000; CC.wfirst = false;
      var wd = setTimeout(function () {
        if (done) return; done = true; delete CC.wcb[id];
        ccWorkerDrop(); // unresponsive worker: respawn once, then main thread
        resolve(null);
      }, wms);
      CC.wcb[id] = function (res) { if (done) return; done = true; clearTimeout(wd); resolve(res); };
      try {
        CC.worker.postMessage({ id: id, buf: img.data.buffer, w: img.width, h: img.height, opts: opts }, [img.data.buffer]);
      } catch (e) {
        if (!done) { done = true; clearTimeout(wd); delete CC.wcb[id]; ccWorkerDrop(); resolve(null); }
      }
    });
  }
  // Audible confirmation: iOS ignores navigator.vibrate, so a scan needs a sound
  // for anyone counting without watching the screen.
  function ccBeepInit() {
    try {
      if (!CC.ac) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; CC.ac = new AC(); }
      if (CC.ac.state === 'suspended' && CC.ac.resume) CC.ac.resume();
    } catch (e) {}
  }
  function ccTone(f1, f2, at, dur, type, vol) {
    var o = CC.ac.createOscillator(), g = CC.ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f1, at);
    if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.85 : vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(CC.ac.destination);
    o.start(at); o.stop(at + dur + 0.03);
  }
  // Bell-like note: triangle fundamental plus a quiet octave above, which is what
  // gives a payment-terminal chime its rounded rather than buzzy character.
  function ccChime(f, at, dur, vol) {
    ccTone(f, f, at, dur, 'triangle', vol);
    ccTone(f * 2, f * 2, at, dur * 0.55, 'sine', vol * 0.28);
  }
  function ccBeep(kind) {
    try {
      if (!CC.ac || CC.ac.state !== 'running') return;
      var t = CC.ac.currentTime + 0.01;
      if (kind === 'expired') {
        // alarm: three descending wails
        for (var i = 0; i < 3; i++) ccTone(900, 340, t + i * 0.28, 0.24, 'sawtooth', 0.85);
      } else if (kind === 'warn') {
        // not recognised: two mid-low thuds
        ccTone(380, 290, t, 0.13, 'triangle', 0.9);
        ccTone(380, 290, t + 0.19, 0.15, 'triangle', 0.9);
      } else if (kind === 'dup') {
        // already on the list here: same chime family, doubled and a step down
        ccChime(1175, t, 0.07, 0.62);
        ccChime(1175, t + 0.10, 0.09, 0.62);
      } else {
        // success: rising two-note chime, Apple Pay style
        ccChime(2093, t, 0.09, 0.72);
        ccChime(2794, t + 0.095, 0.20, 0.72);
      }
    } catch (e) {}
  }
  // iOS gives a web app no way to open the Settings app, so the best we can do
  // is show the exact tap-path and offer a reload once it has been changed.
  function ccCamHelp(blocked) {
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) return;
    CC.running = false;
    ccModalOpen(sheet);
    sheet.innerHTML =
      '<div class="cc-sh-h">' + (blocked ? 'Camera is blocked' : 'Camera not working?') + '</div>' +
      '<div class="cc-sub">' + (blocked ? 'Permission was denied for this site.' : 'If the preview stays black, permission is usually the cause.') + '</div>' +
      '<div class="cc-help-steps">' +
        '<b>In Safari</b><br>Tap <b>aA</b> in the address bar &rarr; <b>Website Settings</b> &rarr; set <b>Camera</b> to <b>Allow</b> &rarr; tap Reload below.' +
        '<br><br><b>From the Home Screen icon</b><br>Settings app &rarr; <b>Apps</b> &rarr; <b>Safari</b> &rarr; <b>Camera</b> &rarr; <b>Allow</b>, then reopen the app.' +
        '<br><br>' + (CC.view === 'fa2ret' || CC.view === 'fa2send' ? 'You can still tap the item in the list below.' : 'This still works without the camera \u2014 use <b>+ Manual</b> to type a part number and lot.') +
      '</div>' +
      '<div class="cc-sh-row"><button id="cc-hx" class="cc-cancel">Close</button><button id="cc-hr" class="cc-btn">Reload</button></div>';
    document.getElementById('cc-hx').onclick = function () { ccModalClose(sheet); CC.running = true; ccSchedule(300); };
    document.getElementById('cc-hr').onclick = function () { location.reload(); };
  }
  // Learned code->part pairs also go to the hub (action 'learn'), queued until it
  // answers ok, so catalogue gaps show up without anyone copying text by hand.
  function learnQueue(code, sku) {
    try {
      var q = JSON.parse(localStorage.getItem('tbx_learn_q') || '[]');
      if (!q.some(function (x) { return x.code === code && x.sku === sku; })) q.push({ code: code, sku: sku, ts: new Date().toISOString() });
      localStorage.setItem('tbx_learn_q', JSON.stringify(q.slice(-200)));
    } catch (e) {}
    learnFlushSoon(1500);
  }
  var LEARN_T = null;
  function learnFlushSoon(ms) { if (LEARN_T) clearTimeout(LEARN_T); LEARN_T = setTimeout(learnFlush, ms || 1000); }
  function learnFlush() {
    LEARN_T = null;
    if (!hubOn() || !navigator.onLine) return;
    var q = [];
    try { q = JSON.parse(localStorage.getItem('tbx_learn_q') || '[]'); } catch (e) {}
    if (!q.length) return;
    var dev = '';
    try { dev = ccLS(terrKey('_dev')) || ccLS('tbx_cc_dev') || ''; } catch (e2) {}
    hubCall('learn', { items: q, dev: dev, ver: APPVER }).then(function (j) {
      if (!j || !j.ok) return; // unknown to this hub version: keep queued, try next session
      try {
        var now = JSON.parse(localStorage.getItem('tbx_learn_q') || '[]');
        var sent = {}; q.forEach(function (x) { sent[x.code + '|' + x.sku] = 1; });
        localStorage.setItem('tbx_learn_q', JSON.stringify(now.filter(function (x) { return !sent[x.code + '|' + x.sku]; })));
      } catch (e3) {}
    }).catch(function () {});
  }
  window.addEventListener('online', function () { learnFlushSoon(2500); });
  setTimeout(learnFlush, 6000);
  function ccLearnMap() { try { return JSON.parse(localStorage.getItem('tbx_learned') || '{}'); } catch (e) { return {}; } }
  function ccLearnCount() { return Object.keys(ccLearnMap()).length; }
  function ccLearnText() {
    var m = ccLearnMap();
    return Object.keys(m).map(function (k) { return k + '  ' + m[k]; }).join('\n');
  }
  function ccCamSet(on) {
    CC.camOff = !on;
    var b = document.getElementById('cc-cam');
    if (b) { b.textContent = on ? 'Camera off' : 'Camera on'; b.classList.toggle('camoff', !on); }
    var tgt = document.getElementById('cc-target'); if (tgt) tgt.style.display = on ? '' : 'none';
    if (on) { ccStartCam(); return; }
    CC.running = false;
    if (CC.tickTO) { clearTimeout(CC.tickTO); CC.tickTO = null; }
    if (CC.focusIv) { clearInterval(CC.focusIv); CC.focusIv = null; }
    try { if (CC.stream) CC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    CC.stream = null; CC.track = null;
    var v = document.getElementById('ccvid'); if (v) { try { v.srcObject = null; } catch (e2) {} }
    var tb = document.getElementById('cc-torch'); if (tb) { tb.hidden = true; tb.classList.remove('on'); }
    ccStatus('Camera off \u2014 ' + ccNoCamHint());
  }
  function ccCamAlive() { var t = CC.track; return !!(t && t.readyState === 'live' && !t.muted); }
  function ccCamRecover() {
    if (CC.camOff || !ccScanView() || CC.camBusy || ccCamAlive()) return;
    CC.camBusy = true;
    ccStatus('Restarting camera\u2026');
    try { if (CC.stream) CC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    CC.stream = null; CC.track = null; CC.running = false;
    if (CC.tickTO) { clearTimeout(CC.tickTO); CC.tickTO = null; }
    setTimeout(function () { CC.camBusy = false; if (ccScanView()) ccStartCam(); }, 300);
  }
  function ccScanView() { return CC.view === 'count' || CC.view === 'fa2add2' || CC.view === 'fa2ret' || CC.view === 'fa2send'; }
  // One camera panel for every scanning screen: the same box, aiming frame, flash,
  // status line, torch, ? help and Camera-off toggle the cycle count uses, wired the
  // same way (tap the preview to refocus, a beep per read, screen kept awake, camera
  // restarts itself after a lock or app switch). The F&A screens must never drift
  // from this - any new scanning screen renders ccCamPanelHtml() + ccCamPanelWire().
  function ccCamPanelHtml(opts) {
    opts = opts || {};
    return '<div id="cctop">' +
        '<video id="ccvid" playsinline muted autoplay></video>' +
        '<div id="cc-target" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
        '<div id="cc-flash" aria-hidden="true"></div>' +
        (opts.endId ? '<button id="' + esc(opts.endId) + '" type="button" class="cc-endtop">End</button>' : '') +
        '<button id="cc-torch" class="cc-torch" hidden>&#9889;</button>' +
        '<button id="cc-help" class="cc-help" aria-label="Camera help" title="Camera not working?">?</button>' +
        '<div id="cc-stat" class="cc-stat">Starting camera\u2026</div>' +
        '<div id="ccbar">' +
          (opts.manualId ? '<button id="' + esc(opts.manualId) + '" type="button" class="cc-mini">+ Manual</button>' : '') +
          '<button id="cc-cam" type="button" class="cc-mini">Camera off</button>' +
        '</div>' +
      '</div>' +
      '<div id="cc-sheet" hidden></div>';
  }
  function ccCamPanelWire() {
    var top = document.getElementById('cctop');
    if (top && !top.dataset.wired) {
      top.dataset.wired = '1';
      document.getElementById('ccvid').addEventListener('click', function () { ccRefocus(true); });
      document.getElementById('cc-help').addEventListener('click', function (e) { e.stopPropagation(); ccCamHelp(false); });
      document.getElementById('cc-cam').addEventListener('click', function () { ccCamSet(CC.camOff); });
      // Outside the count screen the page scrolls, so pin the preview under the header
      // (the count screen gets the same effect from body.cc-fixed).
      if (!top.closest('#ccwrap')) { top.classList.add('cc-pinned'); var bar = document.getElementById('bar'); top.style.top = (bar ? bar.offsetHeight : 0) + 'px'; }
    }
    ccBeepInit();
    CC.camOff = false;
    ccStartCam();
    ccWake();
  }
  function ccRearm(ms) { CC.cool.t = Date.now(); CC.cool.ms = ms || 2200; }
  function ccWake() {
    try {
      if (!navigator.wakeLock || CC.wake) return;
      navigator.wakeLock.request('screen').then(function (wl) {
        CC.wake = wl;
        if (wl.addEventListener) wl.addEventListener('release', function () { CC.wake = null; });
      }).catch(function () {});
    } catch (e) {}
  }
  function ccFlashGreen() {
    var f = document.getElementById('cc-flash'); if (!f) return;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function ccHistKey(loc, ref, lot) { return String(loc) + '|' + String(ref) + '|' + String(lot || ''); }
  function ccHistSave() { try { localStorage.setItem(terrKey('_hist'), JSON.stringify(CC.hist)); } catch (e) {} }
  function ccHistLoad() { try { CC.hist = JSON.parse(localStorage.getItem(terrKey('_hist')) || '{}') || {}; } catch (e) { CC.hist = {}; } }
  function ccHistText(arr) {
    if (!arr || !arr.length) return '';
    var s = String(arr[0]);
    for (var i = 1; i < arr.length; i++) { s += (arr[i] < 0 ? ' \u2212 ' + Math.abs(arr[i]) : ' + ' + arr[i]); }
    var t = arr.reduce(function (a, b) { return a + (+b || 0); }, 0);
    return 'Scans: ' + s + ' = ' + t;
  }
  function ccModalOpen(sheet) {
    var bd = document.getElementById('cc-backdrop');
    if (!bd) { bd = document.createElement('div'); bd.id = 'cc-backdrop'; document.body.appendChild(bd); }
    bd.hidden = false; sheet.classList.add('cc-modal'); sheet.hidden = false;
  }
  function ccModalClose(sheet) {
    sheet.hidden = true; sheet.classList.remove('cc-modal');
    var bd = document.getElementById('cc-backdrop'); if (bd) bd.hidden = true;
    ccRearm();
  }
  function ccOnCode(txt) {
    var now = Date.now();
    if (CC.view === 'fa2add2') { fa2ScanCode(txt, now); return; }
    if (CC.view === 'fa2ret' || CC.view === 'fa2send') { fa2RetCode(txt, now); return; }

    if (txt === CC.cool.code && now - CC.cool.t < (CC.cool.ms || 2200)) { ccSchedule(120); return; }
    CC.cool = { code: txt, t: now, ms: 2200 };
    var r = window.__TBX_RESOLVE ? window.__TBX_RESOLVE(txt) : { sku: null, p: {} };
    var lot = (r.p && r.p.lot) || '', exp = ccExp(r.p && r.p.exp);
    var ref = null, desc = '', fam = '';
    // A barcode carrying only lot/expiry identifies no product. Hold it for the
    // product scan rather than mistaking the digits for a part number.
    if (!r.sku && !(r.p && r.p.gtin) && (lot || exp)) {
      CC.pend = { lot: lot, exp: exp, t: now };
      ccFlashGreen();
      ccLotEntry(lot, exp);
      return;
    }
    if (r.sku) {
      ref = r.sku;
      var e = BYPN[nrm(r.sku)];
      var it = e ? (recOf(e)) : null;
      if (it) { desc = it.t || it.name || ''; fam = it.fam || ''; }
    } else if (r.p && r.p.gtin) {
      ccFlashGreen();
      ccUnknown(r, lot, exp); return;
    } else {
      var n = nrm(txt);
      if (n.length >= 5 && n.length <= 20) { ref = n; }
      else { ccStatus('Not a product barcode \u2014 keep aiming'); ccSchedule(500); return; }
    }
    ccFlashGreen();
    if (CC.pend && (now - CC.pend.t) < 120000) {
      if (!lot) lot = CC.pend.lot;
      if (!exp) exp = CC.pend.exp;
    }
    ccConfirm(ref, desc, fam, lot, exp);
  }
  function ccConfirm(ref, desc, fam, lot, exp) {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) { CC.running = true; ccSchedule(300); return; }
    var ex = ccRowsSrc().filter(function (x) { return ccMatch(x, ref, lot); })[0];
    if (ex) ccFlash(ex.id);
    ccModalOpen(sheet);
    ccBeep(ccIsExpired(exp) ? 'expired' : (ex ? 'dup' : 'ok'));
    try { navigator.vibrate && navigator.vibrate(ex ? [30, 60, 30] : 35); } catch (ev) {}
    function closeModal() { ccModalClose(sheet); }
    sheet.innerHTML =
      '<div class="cc-sh-h">' + esc(ref) + (desc ? ' \u2014 ' + esc(desc) : '') + '</div>' +
      '<div class="cc-sub">' + (lot ? 'Lot ' + esc(lot) : 'No lot on this barcode') + (exp ? ' \u00b7 Exp ' + esc(exp) : '') + '</div>' +
      (lot ? fopsHintHTML(CC.tgt, ref, lot) : '') +
      (ccIsExpired(exp) ? '<div class="cc-exptag">EXPIRED</div>' : '') +
      (lot ? '' : '<input id="cc-clot" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Lot from the box">') +
      (ex ? '<div class="cc-note">Already in list here: <b>' + (+ex.qty || 0) + '</b> \u00b7 this adds on top</div>' : '') +
      '<div class="cc-qlabel">' + (ex ? 'Add quantity' : 'Quantity') + '</div>' +
      '<div class="cc-qtyrow"><button id="cc-cqm" class="cc-qbtn" aria-label="Decrease">\u2212</button>' +
        '<input id="cc-cqv" class="cc-qin" type="number" inputmode="numeric" min="1" value="1">' +
        '<button id="cc-cqp" class="cc-qbtn" aria-label="Increase">+</button></div>' +
      '<div class="cc-sh-row"><button id="cc-cx" class="cc-cancel">Cancel</button><button id="cc-cok" class="cc-btn">Confirm</button></div>';
    var qv = document.getElementById('cc-cqv');
    document.getElementById('cc-cqm').onclick = function () { qv.value = Math.max(1, (+qv.value || 1) - 1); };
    document.getElementById('cc-cqp').onclick = function () { qv.value = Math.max(1, (+qv.value || 0) + 1); };
    var lv0 = document.getElementById('cc-clot');
    if (lv0) lv0.addEventListener('input', function () { lv0.classList.remove('cc-need'); });
    document.getElementById('cc-cok').onclick = function () {
      var q = Math.max(1, Math.round(+qv.value || 1));
      var lv = document.getElementById('cc-clot');
      var useLot = lot || (lv ? lv.value.trim() : '');
      if (!useLot) { if (lv) { lv.classList.add('cc-need'); try { lv.focus(); } catch (e4) {} } return; }
      ccQtyOk(q).then(function (yes) {
        if (!yes) return;
        closeModal(); CC.running = true;
        ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (useLot ? ' \u00b7 Lot ' + useLot : ''));
        ccRearm(600); // counted it: allow the very next scan of the same item quickly
        ccAdd(ref, desc, fam, useLot, exp, q); ccSchedule(220);
      });
    };
    document.getElementById('cc-cx').onclick = function () {
      closeModal(); ccRearm(2200); CC.running = true; ccStatus('Cancelled \u2014 keep scanning'); ccSchedule(300);
    };
  }
  var CC_QCAP = 200;
  // Big numbers are almost always a slipped finger. Ask once before they hit the sheet.
  function ccQtyOk(q) { return q > CC_QCAP ? tbxAsk({ title: 'Add ' + q + '?', body: 'That\u2019s more than ' + CC_QCAP + ' units on one line. Add it anyway?', ok: 'Add ' + q }) : Promise.resolve(true); }
  function ccAdd(ref, desc, fam, lot, exp, qty) {
    qty = Math.max(1, Math.round(+qty || 1));
    var t = CC.tgt;
    var op = { t: 'add', ref: ref, desc: desc || '', fam: fam || '', lot: lot || '', exp: exp || '', expired: ccIsExpired(exp), qty: qty };
    op.loc = CC.loc; op.notes = CC.notes || '';
    CC.pend = null;
    var key = ccHK({ ref: ref, lot: lot });
    if (!CC.hist[key]) CC.hist[key] = [];
    CC.hist[key].push(qty); ccHistSave();
    ccEnqueue(t, op);
  }
  // A lot/expiry barcode with no product code: keep what it gave us and ask for
  // the part number, rather than relying on a second scan arriving in order.
  function ccLotEntry(lot, exp) {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) { CC.running = true; ccSchedule(300); return; }
    ccModalOpen(sheet);
    ccBeep(ccIsExpired(exp) ? 'expired' : 'dup');
    sheet.innerHTML =
      '<div class="cc-sh-h">Lot barcode</div>' +
      '<div class="cc-sub">' + (lot ? 'Lot ' + esc(lot) : 'No lot') + (exp ? ' \u00b7 Exp ' + esc(exp) : '') + '</div>' +
      (ccIsExpired(exp) ? '<div class="cc-exptag">EXPIRED</div>' : '') +
      '<div class="cc-sub2">No part number on this barcode \u2014 type it from the box.</div>' +
      '<input id="cc-lpn" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Part number">' +
      '<div class="cc-qlabel">Quantity</div>' +
      '<div class="cc-qtyrow"><button id="cc-lqm" class="cc-qbtn" aria-label="Decrease">\u2212</button>' +
        '<input id="cc-lqv" class="cc-qin" type="number" inputmode="numeric" min="1" value="1">' +
        '<button id="cc-lqp" class="cc-qbtn" aria-label="Increase">+</button></div>' +
      '<div class="cc-sh-row"><button id="cc-lx" class="cc-cancel">Cancel</button><button id="cc-lok" class="cc-btn">Add</button></div>';
    var qv = document.getElementById('cc-lqv'), pn = document.getElementById('cc-lpn');
    document.getElementById('cc-lqm').onclick = function () { qv.value = Math.max(1, (+qv.value || 1) - 1); };
    document.getElementById('cc-lqp').onclick = function () { qv.value = Math.max(1, (+qv.value || 0) + 1); };
    try { pn.focus(); } catch (e) {}
    document.getElementById('cc-lok').onclick = function () {
      var v = nrm(pn.value);
      if (!v) { pn.classList.add('cc-need'); try { pn.focus(); } catch (e2) {} return; }
      var q = Math.max(1, Math.round(+qv.value || 1));
      var e3 = BYPN[v] || BYPN[v.replace(/^0+/, '')];
      var desc = '', fam = '', ref = v;
      if (e3) { var it = recOf(e3); ref = it.sku; desc = it.t || it.name || ''; fam = it.fam || ''; }
      ccQtyOk(q).then(function (yes) {
        if (!yes) return;
        ccModalClose(sheet); CC.running = true;
        ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (lot ? ' \u00b7 Lot ' + lot : ''));
        ccRearm(600);
        ccAdd(ref, desc, fam, lot, exp, q); ccSchedule(220);
      });
    };
    document.getElementById('cc-lx').onclick = function () {
      ccModalClose(sheet); CC.running = true;
      ccStatus('Cancelled \u2014 keep scanning');
      ccSchedule(300);
    };
  }
  function ccUnknown(r, lot, exp) {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) { CC.running = true; ccSchedule(300); return; }
    ccBeep('warn');
    ccModalOpen(sheet);
    sheet.innerHTML =
      '<div class="cc-sh-h">Unknown barcode</div>' +
      '<div class="cc-sub">GTIN ' + esc(r.p.gtin || '') + '</div>' +
      (ccIsExpired(exp) ? '<div class="cc-exptag">EXPIRED</div>' : '') +
      '<input id="cc-udesc" class="cc-in" type="text" autocomplete="off" placeholder="Description">' +
      '<input id="cc-upn" class="cc-in" type="text" autocomplete="off" placeholder="Part number">' +
      '<input id="cc-ulot" class="cc-in" type="text" autocomplete="off" placeholder="Lot" value="' + esc(lot || '') + '">' +
      '<div class="cc-sh-row"><button id="cc-uadd" class="cc-btn">Add to count</button><button id="cc-uskip" class="cc-mini">Skip</button></div>';
    document.getElementById('cc-uadd').addEventListener('click', function () {
      var v = nrm(document.getElementById('cc-upn').value);
      if (!v) { var up = document.getElementById('cc-upn'); up.classList.add('cc-need'); up.focus(); return; }
      var lotv = document.getElementById('cc-ulot').value.trim();
      if (!lotv && !lot) { var ul = document.getElementById('cc-ulot'); ul.classList.add('cc-need'); try { ul.focus(); } catch (e5) {} return; }
      var descv = document.getElementById('cc-udesc').value.trim();
      var e = BYPN[v] || BYPN[v.replace(/^0+/, '')];
      var desc = descv, fam = '', ref = v;
      if (e) {
        var it = recOf(e);
        ref = it.sku; if (!desc) desc = it.t || it.name || ''; fam = it.fam || '';
        // Only remember it when the typed number matched a real catalogue item,
        // and key it on the full GTIN so packaging levels stay distinct.
        if (r.p && r.p.gtin && r.p.gtin.length === 14) {
          try {
            var L = JSON.parse(localStorage.getItem('tbx_learned') || '{}');
            if (!L[r.p.gtin]) { L[r.p.gtin] = ref; localStorage.setItem('tbx_learned', JSON.stringify(L)); learnQueue(r.p.gtin, ref); }
          } catch (eL) {}
        }
      }
      ccModalClose(sheet); CC.running = true;
      ccAdd(ref, desc, fam, lotv || lot, exp); ccSchedule(400);
    });
    document.getElementById('cc-uskip').addEventListener('click', function () { ccModalClose(sheet); CC.running = true; ccSchedule(300); });
  }
  function ccManual() {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) { CC.running = true; ccSchedule(300); return; }
    ccModalOpen(sheet);
    sheet.innerHTML =
      '<div class="cc-sh-h">Manual add</div>' +
      '<input id="cc-mpn" class="cc-in" type="text" autocomplete="off" placeholder="Part number">' +
      '<input id="cc-mlot" class="cc-in" type="text" autocomplete="off" placeholder="Lot">' +
      '<input id="cc-mexp" class="cc-in" type="text" autocomplete="off" inputmode="numeric" placeholder="Expiry (optional, YYYY-MM or YYYY-MM-DD)">' +
      '<div class="cc-qlabel">Quantity</div>' +
      '<div class="cc-qtyrow"><button id="cc-mqm" class="cc-qbtn" aria-label="Decrease">\u2212</button>' +
        '<input id="cc-mqv" class="cc-qin" type="number" inputmode="numeric" min="1" value="1">' +
        '<button id="cc-mqp" class="cc-qbtn" aria-label="Increase">+</button></div>' +
      '<div id="cc-mhint" class="cc-hint" hidden>Part number and lot are both required.</div>' +
      '<div class="cc-sh-row"><button id="cc-madd" class="cc-btn">Add to count</button><button id="cc-mx" class="cc-mini">Cancel</button></div>';
    var pnEl = document.getElementById('cc-mpn'), lotEl = document.getElementById('cc-mlot'), hintEl = document.getElementById('cc-mhint');
    function clearNeed() { hintEl.hidden = true; pnEl.classList.remove('cc-need'); lotEl.classList.remove('cc-need'); }
    pnEl.addEventListener('input', clearNeed); lotEl.addEventListener('input', clearNeed);
    var qvEl = document.getElementById('cc-mqv');
    document.getElementById('cc-mqm').addEventListener('click', function () { qvEl.value = Math.max(1, (+qvEl.value || 1) - 1); });
    document.getElementById('cc-mqp').addEventListener('click', function () { qvEl.value = Math.max(1, (+qvEl.value || 0) + 1); });
    document.getElementById('cc-madd').addEventListener('click', function () {
      var v = nrm(pnEl.value);
      var lot = lotEl.value.trim();
      if (!v || !lot) {
        hintEl.hidden = false;
        pnEl.classList.toggle('cc-need', !v);
        lotEl.classList.toggle('cc-need', !lot);
        (!v ? pnEl : lotEl).focus();
        return;
      }
      var e = BYPN[v] || BYPN[v.replace(/^0+/, '')];
      var desc = '', fam = '', ref = v;
      if (e) { var it = recOf(e); ref = it.sku; desc = it.t || it.name || ''; fam = it.fam || ''; }
      var q = Math.max(1, Math.round(+qvEl.value || 1));
      var mexp = ccExpInput(document.getElementById('cc-mexp').value);
      ccQtyOk(q).then(function (yes) {
        if (!yes) return;
        ccModalClose(sheet); CC.running = true;
        ccAdd(ref, desc, fam, lot, mexp, q); ccSchedule(400);
      });
    });
    document.getElementById('cc-mx').addEventListener('click', function () { ccModalClose(sheet); CC.running = true; ccSchedule(300); });
  }
  function ccEditor(r) {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) return;
    var key = ccHK(r);
    if (!CC.hist[key] || !CC.hist[key].length) { CC.hist[key] = [(+r.qty || 0)]; ccHistSave(); }
    ccModalOpen(sheet);
    function closeModal() { ccModalClose(sheet); }
    function draw(q) {
      var breakdown = ccHistText(CC.hist[key]);
      sheet.innerHTML =
        '<div class="cc-sh-h">' + esc(r.ref) + (r.desc ? ' \u2014 ' + esc(r.desc) : '') + '</div>' +
        '<div class="cc-sub">' + (r.lot ? 'Lot ' + esc(r.lot) : 'No lot') + (r.exp ? ' \u00b7 Exp ' + esc(r.exp) : '') + '</div>' +
        ((r.expired || ccIsExpired(r.exp)) ? '<div class="cc-exptag">EXPIRED</div>' : '') +
        '<div class="cc-qlabel">Expiry</div>' +
        '<input id="cc-qexp" class="cc-in" type="text" autocomplete="off" inputmode="numeric" placeholder="YYYY-MM or YYYY-MM-DD" value="' + esc(r.exp || '') + '">' +
        '<div class="cc-qlabel">Final quantity</div>' +
        '<div class="cc-qtyrow"><button id="cc-qm" class="cc-qbtn">\u2212</button><input id="cc-qv" class="cc-qin" type="number" inputmode="numeric" value="' + q + '"><button id="cc-qp" class="cc-qbtn">+</button></div>' +
        (breakdown ? '<div class="cc-break">' + esc(breakdown) + '</div>' : '') +
        '<div class="cc-sh-row"><button id="cc-qdel" class="cc-cancel cc-endb">Delete line</button><button id="cc-qdone" class="cc-btn">Done</button></div>';
      var qv = document.getElementById('cc-qv');
      document.getElementById('cc-qm').onclick = function () { qv.value = Math.max(0, (+qv.value || 0) - 1); };
      document.getElementById('cc-qp').onclick = function () { qv.value = (+qv.value || 0) + 1; };
      document.getElementById('cc-qdone').onclick = function () {
        var nq = Math.max(0, Math.round(+qv.value || 0));
        var nexp = ccExpInput(document.getElementById('cc-qexp').value);
        ccQtyOk(nq).then(function (yes) {
          if (!yes) return;
          closeModal(); CC.running = true; ccSchedule(300);
          var qChanged = nq !== (+r.qty || 0), eChanged = nexp !== (r.exp || '');
          if (!qChanged && !eChanged) return;
          if (qChanged) { var delta = nq - (+r.qty || 0); if (!CC.hist[key]) CC.hist[key] = []; CC.hist[key].push(delta); ccHistSave(); }
          var t = CC.tgt;
          var op = { t: 'set', ref: r.ref, lot: r.lot || '', qty: nq, desc: r.desc || '', fam: r.fam || '', exp: nexp, expired: ccIsExpired(nexp) };
          op.loc = r.loc; op.notes = r.notes || '';
          ccEnqueue(t, op);
        });
      };
      document.getElementById('cc-qdel').onclick = function () {
        tbxAsk({ title: 'Delete this line?', body: r.ref + (r.lot ? ' \u00b7 Lot ' + r.lot : '') + '\nIt comes off the count on this phone and the sheet.', ok: 'Delete', danger: true }).then(function (yes) {
          if (!yes) return;
          closeModal(); CC.running = true; ccSchedule(300);
          delete CC.hist[key]; ccHistSave();
          var t = CC.tgt;
          var op = { t: 'del', ref: r.ref, lot: r.lot || '' };
          op.loc = r.loc;
          ccEnqueue(t, op);
        });
      };
    }
    draw(r.qty);
  }
  function ccFlash(id) {
    var el = document.querySelector('.ccrow[data-id="' + id + '"]');
    if (el) { el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1200); }
  }
  function ccRenderList() {
    var list = document.getElementById('cclist');
    if (!list) return;
    var rows = CC.rows.filter(function (x) { return ccNLoc(x.loc) === ccNLoc(CC.loc); });
    rows.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
    var tot = 0; rows.forEach(function (x) { tot += (+x.qty || 0); });
    var totEl = document.getElementById('cc-tot');
    if (totEl) totEl.textContent = rows.length + ' lines \u00b7 ' + tot + ' units';
    if (!rows.length) { if (CC.listSig !== 'empty') { list.innerHTML = '<div class="cc-empty">No scans yet at this location \u2014 point the camera at a barcode.</div>'; CC.listSig = 'empty'; } return; }
    var CAP = 150;
    var shown = rows.length > CAP ? rows.slice(0, CAP) : rows;
    var sig = shown.map(function (x) { return x.id + ':' + x.qty + ':' + (x.lot || '') + ':' + (x.exp || '') + ':' + (x.pending ? 1 : 0) + ':' + (x.desc || ''); }).join('|') + '#' + rows.length;
    if (sig === CC.listSig) return;
    CC.listSig = sig;
    list.innerHTML = (rows.length > CAP ? '<div class="cc-empty">Showing the ' + CAP + ' most recent of ' + rows.length + ' lines \u2014 all are counted and synced.</div>' : '') + shown.map(function (x) {
      var expd = x.expired || ccIsExpired(x.exp);
      return '<div class="ccrow' + (x.pending ? ' pend' : '') + '" data-id="' + esc(x.id) + '">' +
        '<div class="ccr-main"><div class="ccr-ref">' + esc(x.ref) + (expd ? '<span class="ccr-exp">EXPIRED</span>' : '') + '</div>' +
        '<div class="ccr-sub">' + esc(x.desc || '') + '</div>' +
        '<div class="ccr-sub2">' + (x.lot ? 'Lot ' + esc(x.lot) : '') + (x.exp ? ' \u00b7 Exp ' + esc(x.exp) : '') + (x.dev && x.dev !== CC.dev ? ' \u00b7 ' + esc(x.dev) : '') + '</div></div>' +
        '<div class="ccr-qty">' + (+x.qty || 0) + '</div>' +
      '</div>';
    }).join('');
  }

  // ---- CT team hub ----
  function ctEnsure(then) {
    if (!CC.creds) { var st = ccLS(terrKey('')); if (st) { try { CC.creds = JSON.parse(st); } catch (e) {} } }
    if (!CC.creds) { CC.ret = then; ccGate(); return false; }
    if (!CC.dev) CC.dev = ccLS(terrKey('_dev')) || '';
    var ros = [];
    try { ros = JSON.parse(ccLS(terrKey('_roster')) || '[]') || []; } catch (e2) {}
    if (CC.dev && ros.length && ros.indexOf(CC.dev) === -1) { CC.dev = ''; try { localStorage.removeItem(terrKey('_dev')); } catch (e3) {} }
    if (!ros.length && CC.creds) {
      fetch(CC.creds.url + '?token=' + encodeURIComponent(CC.creds.token) + '&action=roster')
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.devices && j.devices.length) ccLS(terrKey('_roster'), JSON.stringify(j.devices)); })
        .catch(function () {});
    }
    if (!CC.dev) { CC.ret = then; ccDevice(); return false; }
    if (!CC.syncLoaded) { CC.syncLoaded = true; ccSyncLoad(terrTgt()); }
    return true;
  }
  function ccRowsSrc() { return CC.rows; }
  function ccMatch(x, ref, lot) {
    return ccNLoc(x.loc) === ccNLoc(CC.loc) && ccNRef(x.ref) === ccNRef(ref) && ccNLot(x.lot) === ccNLot(lot);
  }
  function ccHK(o) {
    return ccHistKey(ccNLoc(o.loc !== undefined ? o.loc : CC.loc), ccNRef(o.ref), ccNLot(o.lot));
  }
  function ctScreen() {
    var TR = TERR[CC.terr];
    setTitle(TR.name, ''); backBtn.hidden = false;
    ccStop();
    if (!ctEnsure(ctScreen)) return;
    CC.view = 'hub';
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">' + esc(TR.name) + '</h2>' +
        '<div class="cc-sub">Device: <b>' + esc(CC.dev) + '</b> <button id="ct-devchg" class="cc-link" type="button">change</button></div>' +
        (TR.hub ? '<div class="cc-sub"><button id="ct-mg" class="cc-link" type="button">Manage this team</button></div>' : '') +
        (ccLearnCount() ? '<div class="cc-sub">' + ccLearnCount() + ' new barcode' + (ccLearnCount() > 1 ? 's' : '') + ' learned on this phone <button id="ct-learn" class="cc-link" type="button">copy</button></div>' : '') +
        '<button id="ct-cc" class="ct-big">Cycle Count<span>Trunk &amp; closet counts by location</span></button>' +
        (TR.fa ? '<button id="ct-fa2" class="ct-big">F&amp;A Inventory<span>Live drops, usage, send-backs &amp; history</span></button>' : '') +
      '</div>');
    document.getElementById('ct-cc').addEventListener('click', function () { location.hash = TR.id === 'ct' ? '#/cc' : '#/team/' + TR.id + '/cc'; });
    var mg = document.getElementById('ct-mg');
    if (mg) mg.addEventListener('click', function () { location.hash = '#/team/' + TR.id + '/manage'; });
    var fb2 = document.getElementById('ct-fa2');
    if (fb2) fb2.addEventListener('click', function () { location.hash = '#/fa2'; });
    var lb = document.getElementById('ct-learn');
    if (lb) lb.addEventListener('click', function () {
      tbxShowText('Learned barcodes', 'These pair a scanned code with the part it belongs to. They also upload to the hub on their own; copy them here if you want to send them by hand.', ccLearnText());
    });
    document.getElementById('ct-devchg').addEventListener('click', function () {
      var pend = (CC.ops || []).length;
      if (pend) { tbxNotice('Scans still syncing', 'This phone still has ' + pend + ' unsent scan' + (pend > 1 ? 's' : '') + '. Get signal so they finish syncing, then change the device.'); ccFlushSoon(terrTgt(), 200); return; }
      try { localStorage.removeItem(terrKey('_dev')); } catch (e) {}
      CC.dev = ''; CC.ret = ctScreen; ccDevice();
    });
  }
  function signupScreen() {
    setTitle('New Territory', ''); backBtn.hidden = false;
    ccStop();
    CC.view = 'signup';
    if (!hubOn()) { render('<div class="card cc-card"><h2 class="cc-h">New Territory</h2><div class="cc-sub">Update the app first \u2014 tap Check for updates on the home screen, then come back.</div></div>'); return; }
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">New Territory</h2>' +
        '<div class="cc-sub">Set your team up with its own cycle count. This creates a Google Sheet on the ToolBox account and shares it with everyone below.</div>' +
        '<input id="su-name" class="cc-in" type="text" autocomplete="off" placeholder="Your name">' +
        '<input id="su-email" class="cc-in" type="email" autocomplete="off" autocapitalize="off" placeholder="Your Gmail (no Stryker email)">' +
        '<input id="su-terr" class="cc-in" type="text" autocomplete="off" placeholder="Territory name (e.g. Boston)">' +
        '<input id="su-pw" class="cc-in" type="password" autocomplete="new-password" placeholder="Territory password (6+ characters)">' +
        '<input id="su-pw2" class="cc-in" type="password" autocomplete="new-password" placeholder="Confirm password">' +
        '<div id="su-rows"></div>' +
        '<button id="su-add" class="cc-link" type="button" style="margin-top:10px">\u2795 Add a teammate</button>' +
        '<div id="su-err" class="cc-err" hidden></div>' +
        '<button id="su-go" class="cc-btn" style="display:block; margin:14px auto 0">Done \u2014 create my territory</button>' +
        '<div class="cc-sub2">Everyone gets edit access to the sheet, and each phone gets its own tab.</div>' +
      '</div>');
    var rowsEl = document.getElementById('su-rows'), go = document.getElementById('su-go');
    document.getElementById('su-add').addEventListener('click', function () {
      var d = document.createElement('div');
      d.innerHTML = '<div class="su-row">' +
        '<div class="cc-sub" style="margin-top:10px">Teammate <button class="cc-link" type="button" data-del="1">remove</button></div>' +
        '<input class="cc-in su-nm" type="text" autocomplete="off" placeholder="Teammate name">' +
        '<input class="cc-in su-em" type="email" autocomplete="off" autocapitalize="off" placeholder="Teammate Gmail">' +
      '</div>';
      rowsEl.appendChild(d.firstChild);
    });
    rowsEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-del]') : null; if (!b) return;
      var r = b.closest('.su-row'); if (r) r.remove();
    });
    function serr(m, el) {
      var e2 = document.getElementById('su-err'); e2.textContent = m; e2.hidden = false;
      if (el) el.focus();
      go.disabled = false; go.textContent = 'Done \u2014 create my territory';
    }
    go.addEventListener('click', function () {
      document.getElementById('su-err').hidden = true;
      var name = document.getElementById('su-name').value.trim();
      var email = document.getElementById('su-email').value.trim().toLowerCase();
      var terr = document.getElementById('su-terr').value.trim();
      var pw1 = document.getElementById('su-pw').value, pw2 = document.getElementById('su-pw2').value;
      if (!name) return serr('Enter your name.', document.getElementById('su-name'));
      if (/stryker/i.test(email)) return serr('Use a personal Gmail \u2014 Stryker emails can\u2019t be used here.', document.getElementById('su-email'));
      if (!GMRE.test(email)) return serr('Enter a valid Gmail address.', document.getElementById('su-email'));
      if (terr.length < 2) return serr('Enter a territory name.', document.getElementById('su-terr'));
      if (pw1.length < 6) return serr('Password needs at least 6 characters.', document.getElementById('su-pw'));
      if (pw1 !== pw2) return serr('Passwords don\u2019t match.', document.getElementById('su-pw2'));
      var members = [], dup = {}; dup[email] = 1; var badf = null;
      Array.prototype.forEach.call(rowsEl.querySelectorAll('.su-row'), function (r) {
        if (badf) return;
        var n2 = r.querySelector('.su-nm').value.trim(), m2 = r.querySelector('.su-em').value.trim().toLowerCase();
        if (!n2) { badf = ['Every teammate needs a name.', r.querySelector('.su-nm')]; return; }
        if (/stryker/i.test(m2)) { badf = ['Teammates need personal Gmails \u2014 no Stryker emails.', r.querySelector('.su-em')]; return; }
        if (!GMRE.test(m2)) { badf = ['Enter a valid Gmail for every teammate.', r.querySelector('.su-em')]; return; }
        if (dup[m2]) { badf = [m2 + ' is entered twice.', r.querySelector('.su-em')]; return; }
        dup[m2] = 1; members.push({ name: n2, email: m2 });
      });
      if (badf) return serr(badf[0], badf[1]);
      go.disabled = true; go.textContent = 'Creating your Google Sheet\u2026';
      hubCall('signup', { terr: terr, pw: pw1, owner: { name: name, email: email }, members: members }).then(function (j) {
        if (!j || !j.ok) {
          if (j && j.err === 'dupname') return serr('That territory name is already taken \u2014 try another.', document.getElementById('su-terr'));
          if (j && String(j.err).indexOf('dupemail:') === 0) return serr(String(j.err).slice(9) + ' is already on another territory.');
          if (j && j.err === 'cap') return serr('Signups are capped for today \u2014 try again tomorrow.');
          if (j && j.err === 'busy') return serr('The server is busy \u2014 try again in a few seconds.');
          return serr('Couldn\u2019t create the territory \u2014 try again, or text Nate.');
        }
        hubTerrAdd({ slug: j.slug, name: j.name }, true);
        var jt = j.slug + '_cc'; // what the router will look for; j.tgt is informational
        ccLS('tbx_' + jt, JSON.stringify(j.creds));
        ccLS('tbx_' + jt + '_dev', j.selfDev);
        ccLS('tbx_' + jt + '_roster', JSON.stringify(j.creds.devices || []));
        location.hash = '#/team/' + j.slug + '/cc';
      }).catch(function () { serr('Couldn\u2019t reach the server \u2014 check signal and try again.'); });
    });
    setTimeout(function () { var f = document.getElementById('su-name'); if (f) f.focus(); }, 60);
  }
  function manageScreen() {
    var TR = TERR[CC.terr];
    setTitle('Manage \u2014 ' + TR.name, ''); backBtn.hidden = false;
    ccStop();
    CC.view = 'manage';
    var mpw = '';
    function mcall(body, btn, done) {
      body.slug = TR.id; body.pw = mpw;
      if (btn) btn.disabled = true;
      hubCall('edit', body).then(function (j) {
        if (btn) btn.disabled = false;
        if (j && j.ok) {
          if (j.devices) ccLS('tbx_' + TR.tgt + '_roster', JSON.stringify(j.devices));
          if (body.op === 'setpw') mpw = body.newpw;
          done(null, j);
        } else done((j && j.err) || 'server', j);
      }).catch(function () { if (btn) btn.disabled = false; done('net'); });
    }
    function eMsg(err) {
      if (err === 'dupname') return 'That territory name is taken.';
      if (String(err).indexOf('dupemail:') === 0) return String(err).slice(9) + ' is already on another territory.';
      if (String(err).indexOf('bad:email') === 0) return 'That doesn\u2019t look like a valid Gmail (no Stryker emails).';
      if (err === 'bad:pw') return 'Password needs 6\u201364 characters.';
      if (err === 'owner') return 'The owner can\u2019t be removed.';
      if (err === 'net') return 'Couldn\u2019t reach the server \u2014 try again.';
      return 'That didn\u2019t work \u2014 try again.';
    }
    function show(j) {
      var P = j.profile;
      TERR[TR.id].name = P.name; hubTerrSave();
      render(
        '<div class="card cc-card">' +
          '<h2 class="cc-h">Manage ' + esc(P.name) + '</h2>' +
          '<div id="mg-msg" class="cc-sub2" hidden></div>' +
          '<div class="cc-sub" style="margin-top:12px"><b>Territory name</b></div>' +
          '<input id="mg-name" class="cc-in" type="text" autocomplete="off" value="' + esc(P.name) + '">' +
          '<button id="mg-rename" class="cc-btn">Save name</button>' +
          '<div class="cc-sub" style="margin-top:16px"><b>Territory password</b></div>' +
          '<input id="mg-np1" class="cc-in" type="password" autocomplete="new-password" placeholder="New password (6+ characters)">' +
          '<input id="mg-np2" class="cc-in" type="password" autocomplete="new-password" placeholder="Confirm new password">' +
          '<button id="mg-setpw" class="cc-btn">Change password</button>' +
          '<div class="cc-sub" style="margin-top:16px"><b>Team</b></div>' +
          '<div id="mg-list"></div>' +
          '<div class="cc-sub" style="margin-top:12px"><b>Add a teammate</b></div>' +
          '<input id="mg-an" class="cc-in" type="text" autocomplete="off" placeholder="Name">' +
          '<input id="mg-ae" class="cc-in" type="email" autocomplete="off" autocapitalize="off" placeholder="Gmail">' +
          '<button id="mg-add" class="cc-btn">Add teammate</button>' +
          '<div class="cc-sub2">Adding someone creates their tab and shares the sheet with them. Removing someone keeps their tab and scans.</div>' +
        '</div>');
      var lp = document.getElementById('mg-list');
      lp.innerHTML = P.members.map(function (m2) {
        var off = m2.status !== 'active';
        return '<div class="cc-sub mg-m"' + (off ? ' style="opacity:.5"' : '') + '>' + esc(m2.name) + ' \u2014 ' + esc(m2.email) + ' (' + esc(m2.dev) + ')' +
          (off ? ' \u2014 removed' : ' <button class="cc-link" type="button" data-fx="' + esc(m2.email) + '">fix</button>' + (m2.role === 'owner' ? '' : ' <button class="cc-link" type="button" data-rm="' + esc(m2.email) + '">remove</button>')) +
        '</div>';
      }).join('');
      function msg(t, isErr) { var m3 = document.getElementById('mg-msg'); if (!m3) return; m3.hidden = false; m3.textContent = t; m3.style.color = isErr ? '#e66' : ''; window.scrollTo(0, 0); }
      document.getElementById('mg-rename').addEventListener('click', function () {
        var v2 = document.getElementById('mg-name').value.trim();
        if (v2.length < 2) return msg('Enter a territory name.', true);
        mcall({ op: 'rename', name: v2 }, this, function (e2, r) { if (e2) return msg(eMsg(e2), true); show(r); });
      });
      document.getElementById('mg-setpw').addEventListener('click', function () {
        var a = document.getElementById('mg-np1').value, b2 = document.getElementById('mg-np2').value;
        if (a.length < 6) return msg('New password needs at least 6 characters.', true);
        if (a !== b2) return msg('Passwords don\u2019t match.', true);
        mcall({ op: 'setpw', newpw: a }, this, function (e2, r) { if (e2) return msg(eMsg(e2), true); show(r); });
      });
      document.getElementById('mg-add').addEventListener('click', function () {
        var n2 = document.getElementById('mg-an').value.trim(), e3 = document.getElementById('mg-ae').value.trim().toLowerCase();
        if (!n2) return msg('Enter the teammate\u2019s name.', true);
        if (!GMRE.test(e3) || /stryker/i.test(e3)) return msg('Enter a valid Gmail (no Stryker emails).', true);
        mcall({ op: 'addmember', name: n2, email: e3 }, this, function (e2, r) { if (e2) return msg(eMsg(e2), true); show(r); });
      });
      lp.addEventListener('click', function (e4) {
        var fx = e4.target.closest ? e4.target.closest('[data-fx]') : null;
        if (fx) {
          var row = fx.closest('.mg-m'), oe = fx.dataset.fx, mm = null;
          P.members.forEach(function (x) { if (x.email === oe) mm = x; });
          if (!mm) return;
          row.innerHTML = '<input class="cc-in mg-fn" type="text" value="' + esc(mm.name) + '">' +
            '<input class="cc-in mg-fe" type="email" autocapitalize="off" value="' + esc(mm.email) + '">' +
            '<button class="cc-btn mg-fs" type="button">Save</button>';
          row.querySelector('.mg-fs').addEventListener('click', function () {
            var n3 = row.querySelector('.mg-fn').value.trim(), e5 = row.querySelector('.mg-fe').value.trim().toLowerCase();
            if (!n3) return msg('Name can\u2019t be blank.', true);
            if (!GMRE.test(e5) || /stryker/i.test(e5)) return msg('Enter a valid Gmail (no Stryker emails).', true);
            mcall({ op: 'editmember', oldEmail: oe, name: n3, email: e5 }, this, function (e2, r) { if (e2) return msg(eMsg(e2), true); show(r); });
          });
          return;
        }
        var b3 = e4.target.closest ? e4.target.closest('[data-rm]') : null; if (!b3) return;
        tbxAsk({ title: 'Remove ' + b3.dataset.rm + '?', body: 'They lose access to ' + P.name + '. Their tab and scans stay on the sheet.', ok: 'Remove', danger: true }).then(function (yes) {
          if (!yes) return;
          mcall({ op: 'removemember', email: b3.dataset.rm }, b3, function (e2, r) { if (e2) return msg(eMsg(e2), true); show(r); });
        });
      });
    }
    (function ask() {
      render(
        '<div class="card cc-card">' +
          '<h2 class="cc-h">Manage ' + esc(TR.name) + '</h2>' +
          '<div class="cc-sub">Enter the territory password to edit the team.</div>' +
          '<input id="mg-pw" class="cc-in" type="password" autocomplete="off" placeholder="Territory password">' +
          '<div id="mg-err" class="cc-err" hidden>Wrong password.</div>' +
          '<button id="mg-go" class="cc-btn">Continue</button>' +
        '</div>');
      var go = document.getElementById('mg-go'), pw = document.getElementById('mg-pw');
      function tryIt() {
        var v = pw.value; if (!v) return;
        go.disabled = true; go.textContent = 'Checking\u2026';
        mpw = v;
        mcall({ op: 'profile' }, go, function (e2, j) {
          if (!e2) { show(j); return; }
          go.textContent = 'Continue';
          var er = document.getElementById('mg-err');
          if (er) { er.textContent = e2 === 'off' ? 'This territory is paused \u2014 check with Nate.' : (e2 === 'net' ? 'Couldn\u2019t reach the server.' : 'Wrong password.'); er.hidden = false; }
        });
      }
      go.addEventListener('click', tryIt);
      pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryIt(); });
      setTimeout(function () { pw.focus(); }, 60);
    })();
  }
  function helpScreen() {
    setTitle('How it works', ''); backBtn.hidden = false;
    ccStop();
    CC.view = 'help';
    render('<div class="card cc-card"><h2 class="cc-h">How it works</h2>' +
      '<div class="cc-sub">The full cycle-count guide \u2014 setup, scanning, syncing, the team sheet, and the Field Ops count sheet.</div>' +
      '<button id="help-view" class="cc-btn" type="button" style="margin-top:14px">View the guide</button>' +
      '<div class="cc-sub2" style="margin-top:12px"><button id="help-dl" class="cc-link" type="button">Download as PDF</button> \u2014 save it to Files or share it.</div>' +
      '<div id="help-body"></div></div>');
    var hv = document.getElementById('help-view');
    if (hv) hv.addEventListener('click', function () { location.hash = '#/teams/help/view'; });
    var hd = document.getElementById('help-dl');
    if (hd) hd.addEventListener('click', function () { guideShare(hd); });
    try { guidePdfBlob(); } catch (e) {}
  }
  var GUIDE_PDF = 'guide/SMToolBox_Cycle_Count_Scanner_Guide.pdf';
  function guidePdfBlob() {
    if (!window.__gpdf) window.__gpdf = fetch(GUIDE_PDF).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).catch(function (e) { window.__gpdf = null; throw e; });
    return window.__gpdf;
  }
  function guideShare(btn) {
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = 'Preparing\u2026';
    var done = function () { btn.disabled = false; btn.textContent = orig; };
    guidePdfBlob().then(function (b) {
      var f = null;
      try { f = new File([b], 'SMToolBox Cycle Count Guide.pdf', { type: 'application/pdf' }); } catch (e) {}
      if (f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })) {
        return navigator.share({ files: [f] }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          throw err;
        }).then(done);
      }
      throw 0;
    }).catch(function () {
      guidePdfBlob().then(function (b) {
        var u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = 'SMToolBox Cycle Count Guide.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
        done();
      }).catch(function () { done(); location.href = GUIDE_PDF; });
    });
  }
  function helpViewScreen() {
    setTitle('How it works', ''); backBtn.hidden = false;
    ccStop();
    CC.view = 'helpview';
    var pages = '';
    for (var i = 1; i <= 7; i++) pages += '<img src="guide/pages/p' + i + '.webp" loading="lazy" alt="Guide page ' + i + '" style="display:block; width:100%; border-radius:10px; margin:0 0 12px; background:#fff">';
    render('<div style="max-width:560px; margin:10px auto; padding:0 10px">' + pages +
      '<div class="cc-sub2" style="text-align:center; margin:6px 0 20px"><button id="hv-dl" class="cc-link" type="button">Download as PDF</button></div></div>');
    var hd2 = document.getElementById('hv-dl');
    if (hd2) hd2.addEventListener('click', function () { guideShare(hd2); });
    try { guidePdfBlob(); } catch (e) {}
  }
  function teamsScreen() {
    setTitle('Territory Cycle Counts', ''); backBtn.hidden = false;
    ccStop();
    CC.view = 'teams';
    render(
      '<div class="card cc-card" style="position:relative">' +
        '<button id="tm-help" class="ct-help" type="button" style="left:12px; right:auto" aria-label="How it works">?</button>' +
        (hubOn() ? '<button id="tm-refresh" class="ct-help" type="button" aria-label="Refresh territories">\u21BB</button>' : '') +
        '<h2 class="cc-h">Territory Cycle Counts</h2>' +
        '<div class="cc-sub">Pick a territory to open its cycle count.</div>' +
        (hubOn() ? '<input id="tm-q" class="cc-in" type="search" autocomplete="off" placeholder="Search territories\u2026">' +
          '<button id="tm-new" class="ct-big ct-gold">\u2795 New Territory<span>Set your team up with its own count sheet</span></button>' : '') +
        '<div id="tm-list"></div>' +
        '<div id="tm-note" class="cc-sub2" hidden></div>' +
      '</div>');
    function items() {
      var a = TORDER.map(function (k) { return TERR[k]; });
      HORDER.forEach(function (k) { a.push(TERR[k]); });
      a.sort(function (x, y) { return x.name.localeCompare(y.name); });
      return a;
    }
    function draw() {
      var qEl = document.getElementById('tm-q');
      var q = qEl ? qEl.value.trim().toLowerCase() : '';
      var el = document.getElementById('tm-list'); if (!el) return;
      var a = items().filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; });
      el.innerHTML = a.length ? a.map(function (t) { return '<button class="ct-big" data-terr="' + esc(t.id) + '">' + esc(t.name) + '<span>Cycle counts by location</span></button>'; }).join('') : '<div class="cc-empty">No territory matches.</div>';
    }
    draw();
    var qi = document.getElementById('tm-q');
    if (qi) qi.addEventListener('input', draw);
    var nb = document.getElementById('tm-new');
    if (nb) nb.addEventListener('click', function () { location.hash = '#/signup'; });
    var hb = document.getElementById('tm-help');
    if (hb) hb.addEventListener('click', function () { location.hash = '#/teams/help'; });
    document.querySelector('.cc-card').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-terr]') : null; if (!b) return;
      location.hash = '#/team/' + b.dataset.terr;
    });
    var rb = document.getElementById('tm-refresh');
    function hubRefresh(manual) {
      if (!hubOn()) return;
      if (rb && manual) { rb.disabled = true; rb.style.opacity = '.45'; }
      var done = function () { if (rb) { rb.disabled = false; rb.style.opacity = ''; } };
      hubCall('teams').then(function (j) {
        if (!j || !j.ok || !j.teams) throw 0;
        j.teams.forEach(function (t) { hubTerrAdd(t, false); });
        var gone = hubTerrPrune(j.teams.map(function (t) { return t.slug; }));
        hubTerrSave(); draw(); done();
        var nt = document.getElementById('tm-note');
        if (nt && manual) { nt.hidden = false; nt.textContent = gone ? 'Updated \u2014 removed ' + gone + ' old territor' + (gone === 1 ? 'y' : 'ies') + '.' : 'Up to date.'; }
      }).catch(function () {
        done();
        var nt = document.getElementById('tm-note');
        if (nt) {
          if (!navigator.onLine) { nt.hidden = false; nt.textContent = 'Offline \u2014 showing territories this phone has seen.'; }
          else if (manual) { nt.hidden = false; nt.textContent = 'Couldn\u2019t reach the hub \u2014 try again.'; }
        }
      });
    }
    if (rb) rb.addEventListener('click', function () { hubRefresh(true); });
    hubRefresh(false);
  }
  function ccHomeCards() {
    var el = document.getElementById('cc-cards'); if (!el) return;
    var by = {};
    CC.rows.forEach(function (x) {
      var k = ccNLoc(x.loc);
      var s = by[k]; if (!s) s = by[k] = { loc: x.loc, lines: 0, units: 0, last: '' };
      s.lines++; s.units += (+x.qty || 0);
      if (String(x.ts) > String(s.last)) s.last = x.ts;
    });
    var arr = Object.keys(by).map(function (k) { return by[k]; });
    arr.sort(function (a, b) { return String(b.last).localeCompare(String(a.last)); });
    if (!arr.length) { el.innerHTML = emptyHTML('&#x1F4E6;', 'No counts yet', 'Start one above \u2014 scans save on this phone instantly and sync to the team sheet.'); return; }
    el.innerHTML = arr.map(function (s) {
      return '<div class="ctc" data-loc="' + esc(s.loc) + '">' +
        '<div class="ctc-main"><div class="ctc-t">' + esc(s.loc) + '</div>' +
        '<div class="ctc-n">Last activity ' + esc(faFmt(s.last)) + '</div></div>' +
        '<div class="ctc-r">' + s.lines + ' lines<br>' + s.units + ' units</div>' +
      '</div>';
    }).join('');
  }
  // The "Synced" line on the count home screen. Shared with the upload path so a
  // roster rejection shows here instead of "still syncing" forever.
  function ccSyncLine(t) {
    if (CC.view !== 'cchome' || t !== CC.tgt) return;
    var st = ccSyncSt(t), y = ccSY(t);
    var s2 = document.getElementById('cc-sync'); if (!s2) return;
    if (st.ops.length && y.err === 'dev') { s2.innerHTML = esc(st.ops.length + ' scan' + (st.ops.length > 1 ? 's' : '') + ' can\u2019t send \u2014 ' + (y.errDev && y.errDev !== ccDevFor(t) ? y.errDev : 'this phone') + ' isn\u2019t on the team roster. Tap change on the ' + terrByTgt(t).name + ' screen to re-pick the device.'); return; }
    if (st.ops.length) { s2.innerHTML = esc(st.ops.length + ' scan' + (st.ops.length > 1 ? 's' : '') + ' still syncing \u2014 sends automatically.'); return; }
    s2.innerHTML = sinceHTML(Math.max(y.lastOk || 0, y.lastPull || 0), 'Synced');
  }
  function faFmt(iso) {
    var d = new Date(iso); if (isNaN(d)) return String(iso || '');
    var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return mo + ' ' + d.getDate() + ', ' + d.getFullYear() + ' \u00b7 ' + h + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + ap;
  }

  // ---- home cache + refresh (instant paint from last-known rows, background sync) ----
  function ccHistPrune() {
    // Scan history is only useful for lines still on the count; drop the rest so it can't grow forever.
    try {
      var live = {}; CC.rows.forEach(function (x) { live[ccHK(x)] = 1; });
      var n = 0; Object.keys(CC.hist).forEach(function (k) { if (!live[k]) { delete CC.hist[k]; n++; } });
      if (n) ccHistSave();
    } catch (e) {}
  }
  function ccHomeLoad(t, manual) {
    var sy = document.getElementById('cc-sync');
    ccDerive(t); ccHistPrune();
    var rows = CC.rows;
    var paint = ccHomeCards;
    if (rows.length) { paint(); if (sy) sy.textContent = manual ? 'Refreshing\u2026' : 'Updating\u2026'; }
    else if (sy && manual) { sy.textContent = 'Refreshing\u2026'; }
    function done() {}
    function syncLine() { ccSyncLine(t); }
    ccFlushSoon(t, 250);
    return ccPull(t).then(function () {
      paint(); syncLine(); done();
    }).catch(function () {
      var e2 = document.getElementById('cc-cards');
      var s2 = document.getElementById('cc-sync');
      if (!CC.rows.length && e2) { e2.innerHTML = '<div class="cc-empty">Sheet unreachable \u2014 working offline. Scans still save on this phone and sync later.</div>'; }
      else if (s2) { s2.innerHTML = 'Offline \u2014 showing this phone\u2019s saved counts. ' + sinceHTML(Math.max(ccSY(t).lastOk || 0, ccSY(t).lastPull || 0), 'Last synced'); }
      done();
    });
  }

  // ---- Field Ops count sheet (territory upload -> reconciled tab on the team sheet) ----
  // Pure core below is shared verbatim with fops.gs on the Apps Script side. Keep them identical.
  // ==== FOPS CORE BEGIN ====
  function fopsHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function fopsKeyMat(x) { var s = String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (/^\d/.test(s)) s = s.replace(/^0+(?=.)/, ''); return s; }
  function fopsKeyLot(x) { var s = String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.replace(/^0+(?=.)/, ''); }
  function fopsKey(m, l) { return fopsKeyMat(m) + '|' + fopsKeyLot(l); }
  // Field Ops' dashed convention for a scanned REF whose material is not on their list.
  function fopsDash(ref) {
    var s = String(ref == null ? '' : ref).trim().toUpperCase().replace(/\s+/g, '');
    if (s.indexOf('-') > -1) return s;
    var m = /^(\d{10})([A-Z]{0,2})$/.exec(s); if (m) return m[1].slice(0, 4) + '-' + m[1].slice(4, 7) + '-' + m[1].slice(7) + m[2];
    var n = /^(\d{9})([A-Z]{0,2})$/.exec(s); if (n) return n[1].slice(0, 3) + '-' + n[1].slice(3, 6) + '-' + n[1].slice(6) + n[2];
    return s;
  }
  // list: [{d, m, b}] in Field Ops order. rows: team rows [{ref, lot, qty, desc}] from every location and phone.
  function fopsReconcile(list, rows) {
    var spell = {}, listKeys = {}, sums = {}, order = [], i, L, k, km;
    for (i = 0; i < list.length; i++) { L = list[i]; km = fopsKeyMat(L.m); if (!fopsHas(spell, km)) spell[km] = String(L.m); listKeys[fopsKey(L.m, L.b)] = 1; }
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], q = Math.round(+r.qty || 0); if (q <= 0) continue;
      k = fopsKey(r.ref, r.lot); var s = fopsHas(sums, k) ? sums[k] : null;
      if (!s) { s = sums[k] = { q: 0, ref: r.ref, lot: r.lot, desc: '', km: fopsKeyMat(r.ref) }; order.push(k); }
      s.q += q; if (!s.desc && r.desc) s.desc = String(r.desc);
    }
    var confirmed = [], missing = [], additional = [], units = 0;
    for (i = 0; i < list.length; i++) {
      L = list[i]; k = fopsKey(L.m, L.b);
      if (fopsHas(sums, k)) { confirmed.push({ d: L.d, m: L.m, b: L.b, q: sums[k].q }); units += sums[k].q; }
      else missing.push({ d: L.d, m: L.m, b: L.b });
    }
    for (i = 0; i < order.length; i++) {
      k = order[i]; if (fopsHas(listKeys, k)) continue;
      var a = sums[k], onList = fopsHas(spell, a.km);
      additional.push({ d: a.desc, m: onList ? spell[a.km] : fopsDash(a.ref), b: String(a.lot == null ? '' : a.lot).trim(), q: a.q, onList: onList });
    }
    additional.sort(function (x, y) { return x.m < y.m ? -1 : x.m > y.m ? 1 : (x.b < y.b ? -1 : x.b > y.b ? 1 : 0); });
    return { confirmed: confirmed, missing: missing, additional: additional, meta: { n: list.length, confirmed: confirmed.length, missing: missing.length, additional: additional.length, units: units } };
  }
  // Stable fingerprint of a list (dedupes identical re-uploads). Two FNV-1a passes, 16 hex chars.
  function fopsVer(list) {
    var s = JSON.stringify(list.map(function (L) { return [L.d, L.m, L.b]; }));
    function fnv(seed) { var h = seed >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }
    return fnv(2166136261) + fnv(1215871187);
  }
  // ==== FOPS CORE END ====

  // -- .xlsx / .csv reading on the phone (no numbers are ever created; every cell stays the text it was) --
  function fopsUtf8(u8) { try { return new TextDecoder('utf-8').decode(u8); } catch (e) { var o = ''; for (var i = 0; i < u8.length; i++) o += String.fromCharCode(u8[i]); try { return decodeURIComponent(escape(o)); } catch (e2) { return o; } } }
  function fopsUnzip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i = u8.length - 22;
    while (i >= 0 && !(u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06)) i--;
    if (i < 0) throw new Error('notzip');
    var count = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), files = {};
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zipdir');
      var f = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), lho: dv.getUint32(p + 42, true) };
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[fopsUtf8(u8.subarray(p + 46, p + 46 + nl))] = f;
      p += 46 + nl + xl + cl;
    }
    return { has: function (n) { return fopsHas(files, n); }, names: Object.keys(files), read: function (n) {
      if (!fopsHas(files, n)) return null;
      var f = files[n], q = f.lho; if (dv.getUint32(q, true) !== 0x04034b50) throw new Error('ziplocal');
      var start = q + 30 + dv.getUint16(q + 26, true) + dv.getUint16(q + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method === 8) { if (!window.TBX_INFLATE) throw new Error('noinflate'); return window.TBX_INFLATE(data, new Uint8Array(f.usize)); }
      throw new Error('zipmethod');
    } };
  }
  function fopsXml(text) { var d = new DOMParser().parseFromString(text, 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('xml'); return d; }
  function fopsTags(node, name) { return node.getElementsByTagNameNS ? node.getElementsByTagNameNS('*', name) : node.getElementsByTagName(name); }
  function fopsText(node) { var ts = fopsTags(node, 't'), o = ''; for (var i = 0; i < ts.length; i++) o += ts[i].textContent; return o; }
  function fopsCol(ref) { var m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; var c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return c - 1; }
  function fopsNumText(v) {
    // A cell Excel already turned into a number: keep its digits, never an exponent.
    var s = String(v == null ? '' : v).trim(); if (!/[eE]/.test(s)) return s;
    var x = Number(s); if (!isFinite(x)) return s;
    return (x === Math.floor(x) && Math.abs(x) < 1e21) ? x.toFixed(0) : String(x);
  }
  // -> { grid: [[cell,...],...], numeric: n, sheet: name }
  function fopsReadXlsx(buf) {
    var z = fopsUnzip(new Uint8Array(buf));
    if (!z.has('xl/workbook.xml')) throw new Error('notxlsx');
    var shared = [];
    if (z.has('xl/sharedStrings.xml')) { var sis = fopsTags(fopsXml(fopsUtf8(z.read('xl/sharedStrings.xml'))), 'si'); for (var i = 0; i < sis.length; i++) shared.push(fopsText(sis[i])); }
    var wb = fopsXml(fopsUtf8(z.read('xl/workbook.xml'))), sheets = fopsTags(wb, 'sheet'), rels = {};
    if (z.has('xl/_rels/workbook.xml.rels')) { var rs = fopsTags(fopsXml(fopsUtf8(z.read('xl/_rels/workbook.xml.rels'))), 'Relationship'); for (var j = 0; j < rs.length; j++) rels[rs[j].getAttribute('Id')] = rs[j].getAttribute('Target'); }
    var out = [];
    for (var s = 0; s < sheets.length; s++) {
      var rid = sheets[s].getAttribute('r:id') || sheets[s].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var target = rels[rid] || ('worksheets/sheet' + (s + 1) + '.xml');
      target = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target;
      if (!z.has(target)) continue;
      var doc = fopsXml(fopsUtf8(z.read(target))), cells = fopsTags(doc, 'c'), grid = [], numeric = 0, rowI = -1, colI = 0, lastRow = null;
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c], rowEl = cell.parentNode, ref = cell.getAttribute('r') || '', t = cell.getAttribute('t') || '';
        if (rowEl !== lastRow) { lastRow = rowEl; var rn = parseInt(rowEl.getAttribute('r') || '0', 10); rowI = rn > 0 ? rn - 1 : rowI + 1; colI = 0; }
        var ci = fopsCol(ref); if (ci < 0) ci = colI; colI = ci + 1;
        var v = '', vEl = fopsTags(cell, 'v')[0];
        if (t === 's') { v = vEl ? (shared[parseInt(vEl.textContent, 10)] || '') : ''; }
        else if (t === 'inlineStr') { v = fopsText(cell); }
        else if (t === 'str' || t === 'e') { v = vEl ? vEl.textContent : ''; if (t === 'e') v = ''; }
        else if (t === 'b') { v = vEl && vEl.textContent === '1' ? 'TRUE' : 'FALSE'; }
        else { v = vEl ? vEl.textContent : ''; if (v !== '') { numeric++; v = fopsNumText(v); } }
        if (v === '') continue;
        while (grid.length <= rowI) grid.push([]);
        grid[rowI][ci] = v;
      }
      out.push({ grid: grid, numeric: numeric, sheet: sheets[s].getAttribute('name') || ('Sheet' + (s + 1)) });
    }
    if (!out.length) throw new Error('nosheet');
    return out;
  }
  function fopsReadCsv(text) {
    var grid = [], row = [], cell = '', q = false, i = 0, ch;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (; i < text.length; i++) {
      ch = text.charAt(i);
      if (q) { if (ch === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text.charAt(i + 1) === '\n') i++; row.push(cell); grid.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); grid.push(row); }
    return [{ grid: grid, numeric: 0, sheet: 'CSV' }];
  }
  function fopsIsHeader(row) {
    var hasM = false, hasB = false;
    for (var i = 0; i < (row || []).length; i++) { var v = String(row[i] || '').trim().toLowerCase(); if (v === 'material') hasM = true; if (v === 'batch') hasB = true; }
    return hasM && hasB;
  }
  // Turn a grid into the list Field Ops sent: { title, lines:[{d,m,b}], warnings:[], stats:{} }
  function fopsFromGrid(grid, numeric) {
    var h = -1, r, i;
    for (r = 0; r < Math.min(grid.length, 12); r++) if (fopsIsHeader(grid[r])) { h = r; break; }
    if (h < 0) throw new Error('noheader');
    var hdr = grid[h], dcol = -1, mcol = -1, bcol = -1, qcol = -1, addM = -1, addB = -1, addQ = -1;
    for (i = 0; i < hdr.length; i++) {
      var v = String(hdr[i] || '').trim().toLowerCase();
      if (v === 'material description' && dcol < 0) dcol = i;
      else if (v === 'material') { if (mcol < 0) mcol = i; else if (addM < 0) addM = i; }
      else if (v === 'batch') { if (bcol < 0) bcol = i; else if (addB < 0) addB = i; }
      else if (v === 'quantity') { if (qcol < 0) qcol = i; else if (addQ < 0) addQ = i; }
    }
    if (dcol < 0) dcol = mcol > 0 ? mcol - 1 : -1;
    var title = '';
    if (h > 0) { var t0 = String((grid[0] || [])[0] || '').trim(); if (t0 && !fopsIsHeader(grid[0]) && !/^additional inventory$/i.test(t0)) title = t0; }
    var lines = [], seen = {}, dupes = 0, noBatch = 0, noMat = 0, prefilled = 0, extra = 0, traps = [];
    function cell(row, c) { return c < 0 ? '' : String((row || [])[c] == null ? '' : row[c]).trim(); }
    for (r = h + 1; r < grid.length; r++) {
      var row = grid[r], m = cell(row, mcol), b = cell(row, bcol), d = cell(row, dcol);
      if (cell(row, qcol)) prefilled++;
      if (cell(row, addM) || cell(row, addB) || cell(row, addQ)) extra++;
      if (!m && !b) continue;
      if (!m) { noMat++; continue; }
      if (!b) { noBatch++; continue; }
      var k = fopsKey(m, b);
      if (fopsHas(seen, k)) { dupes++; continue; }
      seen[k] = 1; lines.push({ d: d, m: m, b: b });
      if (traps.length < 4 && (/^\d+E\d+$/i.test(b) || /^0/.test(m) || /^0/.test(b) || /-/.test(b))) traps.push(m + ' / ' + b);
    }
    if (!lines.length) throw new Error('empty');
    var warnings = [];
    if (prefilled) warnings.push(prefilled + ' line' + (prefilled > 1 ? 's' : '') + ' already had a quantity \u2014 ignored; quantities come from scans. Field Ops should send the empty sheet.');
    if (extra) warnings.push(extra + ' additional-inventory line' + (extra > 1 ? 's' : '') + ' in the file \u2014 ignored; additional inventory comes from scans.');
    if (dupes) warnings.push(dupes + ' duplicate line' + (dupes > 1 ? 's' : '') + ' dropped.');
    if (noBatch) warnings.push(noBatch + ' line' + (noBatch > 1 ? 's' : '') + ' had no batch \u2014 skipped.');
    if (noMat) warnings.push(noMat + ' line' + (noMat > 1 ? 's' : '') + ' had no material \u2014 skipped.');
    if (numeric) warnings.push(numeric + ' cell' + (numeric > 1 ? 's' : '') + ' arrived as numbers, not text \u2014 leading zeros or letters may already be lost. If a batch looks wrong, ask Field Ops for the original export.');
    var mats = {}; for (i = 0; i < lines.length; i++) mats[fopsKeyMat(lines[i].m)] = 1;
    return { title: title, lines: lines, warnings: warnings, stats: { lines: lines.length, materials: Object.keys(mats).length, traps: traps } };
  }
  function fopsParseFile(file) {
    var name = String(file && file.name || '').toLowerCase();
    function asBuf() { if (file.arrayBuffer) return file.arrayBuffer(); return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(file); }); }
    return asBuf().then(function (buf) {
      var u8 = new Uint8Array(buf), sheets;
      if (u8.length > 1 && u8[0] === 0x50 && u8[1] === 0x4b) sheets = fopsReadXlsx(buf);
      else if (u8.length > 7 && u8[0] === 0xD0 && u8[1] === 0xCF) throw new Error('xls');
      else sheets = fopsReadCsv(fopsUtf8(u8));
      var picked = null; for (var i = 0; i < sheets.length; i++) { for (var r = 0; r < Math.min(sheets[i].grid.length, 12); r++) if (fopsIsHeader(sheets[i].grid[r])) { picked = sheets[i]; break; } if (picked) break; }
      if (!picked) picked = sheets[0];
      var res = fopsFromGrid(picked.grid, picked.numeric);
      res.src = String(file && file.name || ''); res.ver = fopsVer(res.lines);
      return res;
    });
  }
  function fopsErrText(e) {
    var c = e && e.message || '';
    if (c === 'xls') return 'That\u2019s an old .xls file \u2014 open it in Excel or Numbers and save as .xlsx (or .csv), then upload again.';
    if (c === 'noheader') return 'Couldn\u2019t find the Material / Batch columns. Upload the count sheet exactly as Field Ops sent it.';
    if (c === 'empty') return 'No material/batch lines found on that sheet.';
    if (c === 'noinflate') return 'Update the app first \u2014 tap Check for updates on the home screen.';
    return 'Couldn\u2019t read that file. Upload the .xlsx (or .csv) Field Ops sent.';
  }

  // -- per-territory state (list cached on this phone, meta + capability from pull) --
  var FO = { st: {}, fetching: {}, statusing: {} };
  function fopsSt(t) {
    var s = FO.st[t]; if (s) return s;
    s = FO.st[t] = { list: null, meta: null, status: null, cap: false, loaded: true };
    try { var raw = localStorage.getItem('tbx_' + t + '_fops'); if (raw) { s.list = JSON.parse(raw); if (s.list && s.list.lines) s.list.lines = s.list.lines.map(function (a) { return Array.isArray(a) ? { d: a[0], m: a[1], b: a[2] } : a; }); } } catch (e) { s.list = null; }
    try { var rm = localStorage.getItem('tbx_' + t + '_fops_meta'); if (rm) s.meta = JSON.parse(rm); } catch (e2) { s.meta = null; }
    try { var rs = localStorage.getItem('tbx_' + t + '_fops_status'); if (rs) s.status = JSON.parse(rs); } catch (e4) { s.status = null; }
    try { s.cap = localStorage.getItem('tbx_' + t + '_fops_cap') === '1'; } catch (e3) {}
    return s;
  }
  function fopsSave(t) {
    var s = fopsSt(t);
    try {
      if (s.list) localStorage.setItem('tbx_' + t + '_fops', JSON.stringify({ ver: s.list.ver, title: s.list.title, by: s.list.by || '', at: s.list.at || '', lines: s.list.lines.map(function (L) { return [L.d, L.m, L.b]; }) }));
      else localStorage.removeItem('tbx_' + t + '_fops');
      localStorage.setItem('tbx_' + t + '_fops_meta', JSON.stringify(s.meta || null));
      if (s.status) localStorage.setItem('tbx_' + t + '_fops_status', JSON.stringify(s.status)); else localStorage.removeItem('tbx_' + t + '_fops_status');
      localStorage.setItem('tbx_' + t + '_fops_cap', s.cap ? '1' : '0');
    } catch (e) {}
  }
  function fopsOnPull(t, j) {
    // Called with every successful pull. The presence of a `fops` key is the server saying it knows the feature.
    var s = fopsSt(t);
    if (!j || !('fops' in j)) { if (s.cap) { s.cap = false; fopsSave(t); if (CC.view === 'cchome' && t === CC.tgt) fopsCard(); } return; }
    s.cap = true; s.meta = j.fops || null;
    if (!s.meta) { if (s.list || s.status) { s.list = null; s.status = null; s.idx = null; } fopsSave(t); }
    else {
      fopsSave(t);
      if (!s.list || s.list.ver !== s.meta.ver) fopsFetch(t);
      else if (!s.status || s.status.ver !== s.meta.ver || (s.meta.built && s.status.built !== s.meta.built)) fopsStatus(t);
    }
    if (CC.view === 'cchome' && t === CC.tgt) fopsCard();
  }
  // Team-wide reconcile from the server (every phone's scans), refreshed when the sheet has rebuilt.
  function fopsStatus(t) {
    if (FO.statusing[t]) return FO.statusing[t];
    var ep = ccCredsFor(t); if (!ep) return Promise.reject(new Error('nocreds'));
    var tmo = ccFetchTimeout(20000);
    FO.statusing[t] = fetch(ep.url + '?token=' + encodeURIComponent(ep.token) + '&action=fops_status', { signal: tmo.signal })
      .then(function (r) { tmo.clear(); return r.json(); }, function (e) { tmo.clear(); throw e; })
      .then(function (j) { delete FO.statusing[t]; if (!j || !j.ok) throw new Error('fops_status'); fopsStatusSet(t, j); return j; })
      .catch(function (e) { delete FO.statusing[t]; throw e; });
    return FO.statusing[t];
  }
  function fopsStatusSet(t, j) {
    var s = fopsSt(t), found = {};
    (j.found || []).forEach(function (a) { found[a[0]] = +a[1] || 0; });
    s.status = { at: Date.now(), ver: j.ver || '', built: j.built || '', found: found, additional: (j.additional || []).map(function (a) { return { d: a[0] || '', m: a[1] || '', b: a[2] || '', q: +a[3] || 0 }; }) };
    fopsSave(t);
    if (CC.view === 'cchome' && t === CC.tgt) fopsCard();
    if (CC.view === 'fops' && t === CC.tgt) fopsScreenPaint();
  }
  // What this phone shows: the server's team-wide picture, plus this phone's own rows on top (instant, offline).
  function fopsLocal(t) {
    var s = fopsSt(t); if (!s.list) return null;
    var found = {}, k, i, L;
    if (s.status && s.status.ver === s.list.ver) for (k in s.status.found) if (fopsHas(s.status.found, k)) found[k] = s.status.found[k];
    ccDerive(t);
    var rows = ccSyncSt(t).rows || [], mine = {}, mineOrder = [];
    for (i = 0; i < rows.length; i++) { var r = rows[i], q = Math.round(+r.qty || 0); if (q <= 0) continue; k = fopsKey(r.ref, r.lot); if (!fopsHas(mine, k)) { mine[k] = { q: 0, ref: r.ref, lot: r.lot, desc: r.desc || '' }; mineOrder.push(k); } mine[k].q += q; }
    var spell = {}, listKeys = {};
    for (i = 0; i < s.list.lines.length; i++) { L = s.list.lines[i]; var km = fopsKeyMat(L.m); if (!fopsHas(spell, km)) spell[km] = L.m; listKeys[fopsKey(L.m, L.b)] = 1; }
    var confirmed = [], missing = [], additional = [], units = 0, addKeys = {};
    for (i = 0; i < mineOrder.length; i++) { k = mineOrder[i]; if (fopsHas(listKeys, k) && !fopsHas(found, k)) found[k] = mine[k].q; }
    for (i = 0; i < s.list.lines.length; i++) { L = s.list.lines[i]; k = fopsKey(L.m, L.b); if (fopsHas(found, k)) { confirmed.push({ d: L.d, m: L.m, b: L.b, q: found[k] }); units += found[k]; } else missing.push({ d: L.d, m: L.m, b: L.b }); }
    if (s.status && s.status.ver === s.list.ver) for (i = 0; i < s.status.additional.length; i++) { var a = s.status.additional[i]; additional.push(a); addKeys[fopsKey(a.m, a.b)] = 1; }
    for (i = 0; i < mineOrder.length; i++) { k = mineOrder[i]; if (fopsHas(listKeys, k) || fopsHas(addKeys, k)) continue; var mm = mine[k], kmm = fopsKeyMat(mm.ref); additional.push({ d: mm.desc, m: fopsHas(spell, kmm) ? spell[kmm] : fopsDash(mm.ref), b: String(mm.lot == null ? '' : mm.lot).trim(), q: mm.q }); addKeys[k] = 1; }
    additional.sort(function (x, y) { return x.m < y.m ? -1 : x.m > y.m ? 1 : (x.b < y.b ? -1 : x.b > y.b ? 1 : 0); });
    return { confirmed: confirmed, missing: missing, additional: additional, meta: { n: s.list.lines.length, confirmed: confirmed.length, missing: missing.length, additional: additional.length, units: units } };
  }
  function fopsFetch(t) {
    if (FO.fetching[t]) return FO.fetching[t];
    var ep = ccCredsFor(t); if (!ep) return Promise.reject(new Error('nocreds'));
    var tmo = ccFetchTimeout(20000);
    FO.fetching[t] = fetch(ep.url + '?token=' + encodeURIComponent(ep.token) + '&action=fops_get', { signal: tmo.signal })
      .then(function (r) { tmo.clear(); return r.json(); }, function (e) { tmo.clear(); throw e; })
      .then(function (j) {
        delete FO.fetching[t];
        if (!j || !j.ok) throw new Error('fops_get');
        var s = fopsSt(t);
        if (j.lines && j.lines.length) { s.list = { ver: j.ver, title: j.title || '', by: (j.meta && j.meta.by) || '', at: (j.meta && j.meta.at) || '', lines: j.lines.map(function (a) { return Array.isArray(a) ? { d: a[0], m: a[1], b: a[2] } : a; }) }; s.meta = j.meta || s.meta; }
        else { s.list = null; s.meta = null; }
        fopsSave(t);
        if (CC.view === 'cchome' && t === CC.tgt) fopsCard();
        if (CC.view === 'fops' && t === CC.tgt) fopsScreenPaint();
        return j;
      })
      .catch(function (e) { delete FO.fetching[t]; throw e; });
    return FO.fetching[t];
  }
  function fopsPost(t, body) {
    var ep = ccCredsFor(t); if (!ep) return Promise.reject(new Error('nocreds'));
    body.token = ep.token; body.dev = ccDevFor(t) || '';
    var tmo = ccFetchTimeout(25000);
    return fetch(ep.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: tmo.signal })
      .then(function (r) { tmo.clear(); return r.json(); }, function (e) { tmo.clear(); throw e; });
  }
  function fopsProgress(t) {
    // Team picture from the server plus this phone's rows when the list is here; server meta otherwise.
    var s = fopsSt(t);
    if (s.list) { var R = fopsLocal(t); if (R) return R.meta; }
    return s.meta ? { n: s.meta.n, confirmed: s.meta.confirmed, missing: s.meta.missing, additional: s.meta.additional, units: s.meta.units } : null;
  }
  // 'on' | 'lotoff' | 'off' | null (no list on this phone)
  function fopsHint(t, ref, lot) {
    var s = fopsSt(t); if (!s.list) return null;
    if (!s.idx || s.idx.ver !== s.list.ver) {
      var idx = { ver: s.list.ver, keys: {}, mats: {} };
      for (var i = 0; i < s.list.lines.length; i++) { idx.keys[fopsKey(s.list.lines[i].m, s.list.lines[i].b)] = 1; idx.mats[fopsKeyMat(s.list.lines[i].m)] = 1; }
      s.idx = idx;
    }
    if (fopsHas(s.idx.keys, fopsKey(ref, lot))) return 'on';
    if (fopsHas(s.idx.mats, fopsKeyMat(ref))) return 'lotoff';
    return 'off';
  }
  function fopsHintHTML(t, ref, lot) {
    var h = fopsHint(t, ref, lot); if (!h) return '';
    if (h === 'on') return '<div class="fops-hint on">\u2713 On the Field Ops list</div>';
    if (h === 'lotoff') return '<div class="fops-hint off">Material is on the Field Ops list \u2014 this lot isn\u2019t. Goes to Additional.</div>';
    return '<div class="fops-hint off">Not on the Field Ops list \u2014 goes to Additional</div>';
  }
  function fopsNum(n) { return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // Other phones' scans reach this phone through fops_status: refresh it about once a minute while the
  // Cycle Count home or the Field Ops screen is open, and whenever the app comes back to the foreground.
  function fopsLiveTick(force) {
    try {
      if (document.visibilityState !== 'visible') return;
      if (!(CC.view === 'cchome' || CC.view === 'fops')) return;
      var t = CC.tgt, s = fopsSt(t); if (!t || !s.cap || !s.list) return;
      if (!force && Date.now() - ((s.status && s.status.at) || 0) < 50000) return;
      fopsStatus(t).catch(function () {});
    } catch (e) {}
  }
  setInterval(function () { fopsLiveTick(false); }, 60000);
  function fopsRoute() { return CC.terr === 'ct' ? '#/cc/fops' : '#/team/' + CC.terr + '/cc/fops'; }

  // -- the Cycle Count home: one clearly separate row under the counts; everything else lives on the Field Ops screen --
  function fopsCard() {
    var el = document.getElementById('cc-fops'); if (!el) return;
    var t = CC.tgt, s = fopsSt(t), lab = document.getElementById('cc-counts-lab');
    if (!s.cap) { el.innerHTML = ''; el.hidden = true; if (lab) lab.hidden = true; return; }
    el.hidden = false; if (lab) lab.hidden = false;
    var body;
    if (!s.list && !s.meta) {
      body = '<div class="ctc-main"><div class="ctc-t">Field Ops count sheet</div><div class="ctc-n">Upload the empty sheet Field Ops sent \u2014 see what\u2019s found, missing and additional</div></div>';
    } else {
      var p = fopsProgress(t) || { n: 0, confirmed: 0, missing: 0, additional: 0 };
      var title = (s.list && s.list.title) || (s.meta && s.meta.title) || 'Field Ops count sheet';
      body = '<div class="ctc-main"><div class="ctc-t">' + esc(title) + '</div>' +
        '<div class="fops-nums"><span class="ok">' + fopsNum(p.confirmed) + ' found</span><span class="miss">' + fopsNum(p.missing) + ' missing</span><span class="add">' + fopsNum(p.additional) + ' additional</span></div></div>';
      if (s.list && (!s.status || s.status.ver !== s.list.ver || Date.now() - (s.status.at || 0) > 60000)) fopsStatus(t).catch(function () {});
    }
    el.innerHTML = (s.list ? '<div class="fops-dl-wrap"><button id="cc-fops-dl" class="cc-btn cc-btn-out" type="button">Download Completed Cycle Count Sheet</button></div>' : '') +
      '<div class="fops-lab">Field Ops</div><div class="fops-home" role="button" tabindex="0"><div class="fops-ic">\uD83D\uDCCB</div>' + body + '<div class="fops-chev">\u203A</div></div>';
    el.querySelector('.fops-home').addEventListener('click', function () { location.hash = fopsRoute(); });
    var dl = document.getElementById('cc-fops-dl'); if (dl) dl.addEventListener('click', function () { fopsDownload(t); });
  }
  function fopsPick(t) {
    var inp = document.createElement('input'); inp.type = 'file';
    inp.accept = '.xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; try { document.body.removeChild(inp); } catch (e) {}
      if (!f) return;
      var el = document.getElementById('fops-act'); if (el) el.innerHTML = '<div class="fops-sub">Reading ' + esc(f.name) + '\u2026</div>';
      fopsParseFile(f).then(function (res) { fopsPreview(t, res); }).catch(function (e) { fopsHead(fopsErrText(e)); });
    });
    inp.click();
  }
  function fopsPreview(t, res) {
    var el = document.getElementById('fops-act'); if (!el) return;
    var s = fopsSt(t), same = s.list && s.list.ver === res.ver;
    if (!FO.catIdx) { FO.catIdx = {}; for (var pk in BYPN) FO.catIdx[fopsKeyMat(pk)] = 1; }
    var catN = 0; for (var i = 0; i < res.lines.length; i++) { if (fopsHas(FO.catIdx, fopsKeyMat(res.lines[i].m))) catN++; }
    el.innerHTML = '<div class="fops-t">' + esc(res.title || res.src || 'Count sheet') + '</div>' +
      '<div class="fops-sub">' + fopsNum(res.stats.lines) + ' lines \u00b7 ' + fopsNum(res.stats.materials) + ' materials \u00b7 ' + fopsNum(catN) + ' lines match the catalog</div>' +
      (res.warnings.length ? '<div class="fops-warn">' + res.warnings.map(function (w) { return '<div>\u26a0 ' + esc(w) + '</div>'; }).join('') + '</div>' : '') +
      (same ? '<div class="fops-sub">This is the sheet already loaded.</div>' : '') +
      (s.list && !same ? '<div class="fops-sub">Replaces the sheet loaded now for the whole team.</div>' : '') +
      '<div class="fops-row"><button id="fops-use" class="cc-btn fops-btn"' + (same ? ' disabled' : '') + '>Use this sheet</button><button id="fops-cx" class="fops-lnk">Cancel</button></div>' +
      '<div id="fops-err" class="cc-err" hidden></div>';
    document.getElementById('fops-cx').addEventListener('click', function () { fopsHead(); });
    document.getElementById('fops-use').addEventListener('click', function () {
      var b = document.getElementById('fops-use'); b.disabled = true; b.textContent = 'Sending to the sheet\u2026';
      fopsPost(t, { action: 'fops_put', title: res.title, src: res.src, ver: res.ver, lines: res.lines.map(function (L) { return [L.d, L.m, L.b]; }) }).then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.err ? j.err : 'put');
        var s2 = fopsSt(t);
        s2.cap = true; s2.list = { ver: j.ver || res.ver, title: res.title, by: (j.meta && j.meta.by) || ccDevFor(t) || '', at: (j.meta && j.meta.at) || new Date().toISOString(), lines: res.lines }; s2.meta = j.meta || null; s2.idx = null; s2.status = null;
        fopsSave(t);
        if (j.status) fopsStatusSet(t, j.status); else fopsScreenPaint();
      }).catch(function (e) {
        b.disabled = false; b.textContent = 'Use this sheet';
        var er = document.getElementById('fops-err'); if (er) { er.textContent = (e && e.message === 'dev') ? 'This phone isn\u2019t on the roster \u2014 re-pick the device.' : 'Couldn\u2019t reach the sheet \u2014 check signal and try again.'; er.hidden = false; }
      });
    });
  }
  function fopsRemove(t) {
    tbxAsk({ title: 'Remove the Field Ops sheet?', body: 'The Field Ops tab comes off the team sheet for everyone. Scans are not touched \u2014 upload a sheet again any time.', ok: 'Remove', danger: true }).then(function (yes) {
      if (!yes) return;
      var el = document.getElementById('fops-act'); if (el) el.innerHTML = '<div class="fops-sub">Removing\u2026</div>';
      fopsPost(t, { action: 'fops_clear' }).then(function (j) {
        if (!j || !j.ok) throw new Error('clear');
        var s2 = fopsSt(t); s2.list = null; s2.meta = null; s2.status = null; s2.idx = null; fopsSave(t); fopsScreenPaint();
      }).catch(function () { fopsHead('Couldn\u2019t reach the sheet \u2014 check signal and try again.'); });
    });
  }

  // -- the Field Ops screen: sheet status + actions on top, Missing / Found / Additional below --
  var FOV = { chip: 'missing', q: '' };
  function fopsScreen() {
    setTitle('Field Ops', ''); backBtn.hidden = false; ccStop();
    if (!ctEnsure(fopsScreen)) return;
    CC.tgt = terrTgt(); CC.view = 'fops'; FOV.q = '';
    // Same fixed layout as the count screen: the page never scrolls, only the list panel does.
    if (document.body) document.body.classList.add('cc-fixed');
    render('<div class="card cc-card fops-screen"><div id="fops-head"></div><div id="fops-body"></div></div>');
    CURREFRESH = function () { var t = CC.tgt; return ccPull(t).then(function () { return fopsStatus(t); }).then(function () { fopsScreenPaint(); }); };
    fopsScreenPaint();
    var t0 = CC.tgt;
    ccPull(t0).then(function () { return fopsStatus(t0); }).then(function () { fopsScreenPaint(); }).catch(function () { fopsScreenPaint(); });
  }
  // Sheet status + buttons. `err` shows an inline message under the buttons.
  function fopsHead(err) {
    var head = document.getElementById('fops-head'); if (!head) return;
    var t = CC.tgt, s = fopsSt(t);
    var errHTML = err ? '<div class="cc-err fops-err">' + esc(err) + '</div>' : '';
    head.className = (s.list || s.meta) ? 'has-list' : '';
    if (!s.list && !s.meta) {
      head.innerHTML = '<h2 class="cc-h">Field Ops count sheet</h2>' +
        '<div class="cc-sub fops-intro">Upload the <b>empty</b> count sheet Field Ops sent you (.xlsx or .csv). Scanned quantities fill in from the team\u2019s scans, and the team sheet gets a <b>Field Ops</b> tab for when it\u2019s time to return the count sheet to them.</div>' +
        '<div id="fops-act"><button id="fops-up" class="cc-btn">Upload count sheet</button>' + errHTML + '</div>';
      document.getElementById('fops-up').addEventListener('click', function () { fopsPick(t); });
      return;
    }
    var p = fopsProgress(t) || { n: 0, confirmed: 0, missing: 0, additional: 0, units: 0 };
    var title = (s.list && s.list.title) || (s.meta && s.meta.title) || 'Field Ops count sheet';
    var by = (s.list && s.list.by) || (s.meta && s.meta.by) || '', at = (s.list && s.list.at) || (s.meta && s.meta.at) || '';
    var pct = p.n ? Math.round(100 * p.confirmed / p.n) : 0;
    head.innerHTML = '<h2 class="cc-h">' + esc(title) + '</h2>' +
      '<div class="fops-sub">' + fopsNum(p.n) + ' lines' + (by ? ' \u00b7 uploaded by ' + esc(by) : '') + (at ? ' ' + esc(faFmt(at)) : '') + (s.list ? '' : ' \u00b7 <span class="fops-dim">syncing list\u2026</span>') + '</div>' +
      '<div class="fops-bar"><div class="fops-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="fops-nums"><span class="ok">' + fopsNum(p.confirmed) + ' found</span><span class="miss">' + fopsNum(p.missing) + ' missing</span><span class="add">' + fopsNum(p.additional) + ' additional</span></div>' +
      '<div id="fops-act"><div class="fops-row"><button id="fops-rep" class="fops-lnk">Replace sheet</button><button id="fops-rm" class="fops-lnk danger">Remove</button></div>' + errHTML + '</div>';
    document.getElementById('fops-rep').addEventListener('click', function () { fopsPick(t); });
    document.getElementById('fops-rm').addEventListener('click', function () { fopsRemove(t); });
    if (s.list && (!s.status || s.status.ver !== s.list.ver || Date.now() - (s.status.at || 0) > 60000)) fopsStatus(t).catch(function () {});
  }
  function fopsScreenPaint() {
    var body = document.getElementById('fops-body'); if (!body) return;
    fopsHead();
    var t = CC.tgt, s = fopsSt(t);
    // Only a loaded list fills the screen (panel to the bottom); with nothing loaded the card hugs its content.
    var card = document.querySelector('.fops-screen'); if (card) card.classList.toggle('has-list', !!s.list);
    if (!s.list) { body.innerHTML = s.meta ? '<div class="cc-empty">Syncing the list\u2026 pull down to refresh.</div>' : ''; return; }
    var R = fopsLocal(t), teamOk = s.status && s.status.ver === s.list.ver;
    var sets = { missing: R.missing, found: R.confirmed, additional: R.additional };
    var q = nrm(FOV.q), arr = sets[FOV.chip] || [];
    if (q) arr = arr.filter(function (L) { return nrm(L.m).indexOf(q) > -1 || nrm(L.b).indexOf(q) > -1 || nrm(L.d).indexOf(q) > -1; });
    var cap = 300, shown = arr.slice(0, cap);
    body.innerHTML = (teamOk ? '' : '<div class="fops-sub">Showing this phone\u2019s scans \u2014 the team picture loads when the sheet is reachable.</div>') +
      '<div class="chips fops-chips">' + ['missing', 'found', 'additional'].map(function (c) { return '<button class="chip' + (FOV.chip === c ? ' on' : ' dim') + '" data-chip="' + c + '">' + c.charAt(0).toUpperCase() + c.slice(1) + ' ' + fopsNum(sets[c].length) + '</button>'; }).join('') + '</div>' +
      '<input id="fops-q" class="cc-in" type="search" autocomplete="off" placeholder="Search material, batch or description" value="' + esc(FOV.q) + '">' +
      '<div id="fops-list" class="ctc-wrap">' +
      (!arr.length ? '<div class="cc-empty">' + (q ? 'Nothing matches.' : (FOV.chip === 'missing' ? 'Nothing missing \u2014 every line on the list has been counted.' : FOV.chip === 'found' ? 'Nothing counted yet.' : 'Nothing extra \u2014 every scan is on the list.')) + '</div>' :
        shown.map(function (L) {
          return '<div class="ctc fops-row2"><div class="ctc-main"><div class="ctc-t">' + esc(L.m) + ' <span class="fops-lot">' + esc(L.b) + '</span></div><div class="ctc-n">' + esc(L.d || '') + '</div></div>' +
            (L.q != null ? '<div class="ctc-r">' + fopsNum(L.q) + '</div>' : '') + '</div>';
        }).join('') + (arr.length > cap ? '<div class="cc-empty">Showing ' + cap + ' of ' + fopsNum(arr.length) + ' \u2014 search to narrow.</div>' : '')) +
      '</div>';
    body.querySelectorAll('[data-chip]').forEach(function (b) { b.addEventListener('click', function () { FOV.chip = b.dataset.chip; fopsScreenPaint(); }); });
    var qi = document.getElementById('fops-q');
    qi.addEventListener('input', function (e) { FOV.q = e.target.value; fopsListPaint(); });
    fopsFitList();
    var lst = document.getElementById('fops-list'); if (lst) lst.scrollTop = 0;
  }
  // The list scrolls inside its own panel: size it to what is left of the viewport under the header,
  // chips and search box, so those stay put while the rows scroll (re-measured on resize / keyboard).
  function fopsFitList() {
    var list = document.getElementById('fops-list'); if (!list) return;
    if (document.body && document.body.classList.contains('cc-fixed')) { list.style.maxHeight = ''; return; } // flex layout sizes it
    var vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0; if (!vh) return;
    var top = list.getBoundingClientRect().top + (window.pageYOffset || 0);
    var h = Math.floor(vh - top - 18); if (h < 240) h = 240;
    list.style.maxHeight = h + 'px';
  }
  (function () {
    var t = null; function refit() { if (CC.view !== 'fops') return; if (t) clearTimeout(t); t = setTimeout(function () { t = null; fopsFitList(); }, 80); }
    window.addEventListener('resize', refit); window.addEventListener('orientationchange', refit);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  })();
  // Re-render only the rows while typing (keeps the search box focused).
  function fopsListPaint() {
    var list = document.getElementById('fops-list'); if (!list) return;
    var t = CC.tgt, s = fopsSt(t); if (!s.list) return;
    var R = fopsLocal(t), sets = { missing: R.missing, found: R.confirmed, additional: R.additional };
    var q = nrm(FOV.q), arr = sets[FOV.chip] || [];
    if (q) arr = arr.filter(function (L) { return nrm(L.m).indexOf(q) > -1 || nrm(L.b).indexOf(q) > -1 || nrm(L.d).indexOf(q) > -1; });
    var cap = 300, shown = arr.slice(0, cap);
    list.scrollTop = 0;
    list.innerHTML = !arr.length ? '<div class="cc-empty">' + (q ? 'Nothing matches.' : 'Nothing here.') + '</div>' :
      shown.map(function (L) {
        return '<div class="ctc fops-row2"><div class="ctc-main"><div class="ctc-t">' + esc(L.m) + ' <span class="fops-lot">' + esc(L.b) + '</span></div><div class="ctc-n">' + esc(L.d || '') + '</div></div>' +
          (L.q != null ? '<div class="ctc-r">' + fopsNum(L.q) + '</div>' : '') + '</div>';
      }).join('') + (arr.length > cap ? '<div class="cc-empty">Showing ' + cap + ' of ' + fopsNum(arr.length) + ' \u2014 search to narrow.</div>' : '');
  }

  // -- Excel export: the reconciliation exactly as the Field Ops tab on the Google Sheet (IT1223 layout), built on
  //    the phone from the team picture this phone has, zipped with the vendored fflate and handed to the share sheet --
  var FOPS_XL = {
    widths: [337, 108, 83, 61, 30, 193, 96, 71, 61, 30, 340, 108, 84, 61, 20, 520],   // Sheets px, same as fops.gs
    cols: 16, hdr: 4, textCols: [1, 2, 3, 6, 7, 8, 11, 12, 13], qtyCols: [4, 9]
  };
  function fopsXmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  function fopsColRef(c) { var s = ''; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function fopsFileSafe(s) { return String(s || '').replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }
  // Rows of the tab: [title,...,status] / blank / section titles / headers / data; numbers stay numbers, everything else text.
  function fopsXlsxRows(t) {
    var s = fopsSt(t), R = fopsLocal(t), teamOk = s.status && s.list && s.status.ver === s.list.ver;
    var title = (s.list && s.list.title) || (s.meta && s.meta.title) || 'Field Ops count sheet';
    var by = (s.list && s.list.by) || (s.meta && s.meta.by) || '', at = (s.list && s.list.at) || (s.meta && s.meta.at) || '';
    var when = faFmt(new Date().toISOString()), upAt = at ? faFmt(at).split(' \u00b7 ')[0] : '';
    var status = 'Updated ' + when + ' \u00b7 Confirmed ' + R.confirmed.length + ' \u00b7 Missing ' + R.missing.length + ' \u00b7 Additional ' + R.additional.length +
      (by ? ' \u00b7 list uploaded by ' + by + (upAt ? ' ' + upAt : '') : '') +
      ' \u00b7 generated by SM ToolBox' + (teamOk ? ' (team picture as of ' + faFmt(new Date(s.status.at || Date.now()).toISOString()).split(' \u00b7 ')[1] + ')' : ' (this phone\u2019s scans only)');
    var H = ['Material Description', 'Material', 'Batch', 'Quantity'], rows = [], i;
    var r1 = []; for (i = 0; i < FOPS_XL.cols; i++) r1.push(''); r1[0] = title; r1[FOPS_XL.cols - 1] = status; rows.push(r1);
    var r2 = []; for (i = 0; i < FOPS_XL.cols; i++) r2.push(''); rows.push(r2);
    var r3 = r2.slice(); r3[0] = 'Confirmed Inventory'; r3[5] = 'Additional Inventory'; r3[10] = 'Missing Inventory'; rows.push(r3);
    rows.push(H.concat(['']).concat(H).concat(['']).concat(H).concat(['', '']));
    var n = Math.max(R.confirmed.length, R.additional.length, R.missing.length);
    for (i = 0; i < n; i++) {
      var c = R.confirmed[i], a = R.additional[i], m = R.missing[i];
      rows.push([c ? c.d : '', c ? c.m : '', c ? c.b : '', c ? c.q : '', '', a ? a.d : '', a ? a.m : '', a ? a.b : '', a ? a.q : '', '', m ? m.d : '', m ? m.m : '', m ? m.b : '', '', '', '']);
    }
    return { rows: rows, title: title, n: n, teamOk: !!teamOk };
  }
  // Minimal OOXML workbook: inline strings (lots like 24E01 stay text), numeric quantities, the tab's fills/bold/widths/freeze.
  function fopsXlsxBytes(t) {
    var X = fopsXlsxRows(t), rows = X.rows, i, j, sd = '';
    // Cells must appear in column order inside each row (Excel repairs the file otherwise), so every row is
    // walked column by column; the row-3 section bands are emitted as empty styled cells in that same pass.
    var bandOf = function (col) { return col >= 1 && col <= 4 ? 2 : col >= 6 && col <= 9 ? 3 : col >= 11 && col <= 14 ? 4 : 0; };
    for (i = 0; i < rows.length; i++) {
      var r = rows[i], cells = '';
      for (j = 0; j < FOPS_XL.cols; j++) {
        var v = r[j], ref = fopsColRef(j + 1) + (i + 1), st = 0, empty = (v === '' || v == null);
        if (i === 0) st = j === 0 ? 1 : (j === FOPS_XL.cols - 1 ? 6 : 0);
        else if (i === 2) st = j === 0 ? 8 : j === 5 ? 9 : j === 10 ? 10 : bandOf(j + 1);
        else if (i === 3) st = 5;
        if (empty) { if (i === 2 && st) cells += '<c r="' + ref + '" s="' + st + '"/>'; continue; }
        if (typeof v === 'number' && i >= FOPS_XL.hdr) cells += '<c r="' + ref + '"><v>' + v + '</v></c>';
        else cells += '<c r="' + ref + '" t="inlineStr"' + (st ? ' s="' + st + '"' : '') + '><is><t xml:space="preserve">' + fopsXmlEsc(v) + '</t></is></c>';
      }
      sd += '<row r="' + (i + 1) + '">' + cells + '</row>';
    }
    var cols = ''; for (i = 0; i < FOPS_XL.widths.length; i++) cols += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (Math.round(FOPS_XL.widths[i] / 7 * 100) / 100) + '" customWidth="1"/>';
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + fopsColRef(FOPS_XL.cols) + rows.length + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + FOPS_XL.hdr + '" topLeftCell="A' + (FOPS_XL.hdr + 1) + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A' + (FOPS_XL.hdr + 1) + '" sqref="A' + (FOPS_XL.hdr + 1) + '"/></sheetView></sheetViews>' +
      '<cols>' + cols + '</cols><sheetData>' + sd + '</sheetData></worksheet>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Arial"/></font></fonts>' +
      '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA4C2F4"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="11">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                  // 0 default
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                    // 1 title
      '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>' +                    // 2 green band
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>' +                    // 3 blue band
      '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>' +                    // 4 red band
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                    // 5 bold headers
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                    // 6 status (italic grey)
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                  // 7 (spare)
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +      // 8 Confirmed title
      '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +      // 9 Additional title
      '<xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +      // 10 Missing title
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Field Ops" sheetId="1" r:id="rId1"/></sheets></workbook>';
    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    var enc = new TextEncoder(), F = window.TBX_FFLATE;
    var bytes = F.zipSync({ '[Content_Types].xml': enc.encode(types), '_rels/.rels': enc.encode(rels), 'xl/workbook.xml': enc.encode(wb), 'xl/_rels/workbook.xml.rels': enc.encode(wbRels), 'xl/styles.xml': enc.encode(styles), 'xl/worksheets/sheet1.xml': enc.encode(sheet) }, { level: 6 });
    var d = new Date(), day = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return { bytes: bytes, name: fopsFileSafe(X.title) + ' - Completed Cycle Count ' + day + '.xlsx', teamOk: X.teamOk, n: X.n };
  }
  // iOS: the share sheet (Save to Files, Mail, AirDrop...) works in Safari and the home-screen app; fall back to a download.
  function fopsDeliver(file) {
    var type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var blob = new Blob([file.bytes], { type: type });
    try {
      if (navigator.share && navigator.canShare && typeof File === 'function') {
        var f = new File([blob], file.name, { type: type });
        if (navigator.canShare({ files: [f] })) return navigator.share({ files: [f] }).then(function () { return 'share'; });   // no title/text: iOS would add a text.txt alongside
      }
    } catch (e) {}
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e2) {} }, 4000);
    return Promise.resolve('download');
  }
  function fopsDownload(t) {
    var s = fopsSt(t); if (!s.list) return;
    var file;
    try { file = fopsXlsxBytes(t); } catch (e) { if (document.getElementById('fops-head')) fopsHead('Couldn\u2019t build the file on this phone.'); else toastMsg('Couldn\u2019t build the file on this phone.', 3000); return; }
    fopsDeliver(file).then(function (how) {
      toastMsg(how === 'share' ? 'Shared ' + file.name : 'Downloading ' + file.name, 2600);
      fopsStatus(t).catch(function () {});     // freshen the team picture for the next export
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;  // the share sheet was dismissed
      var msg = 'Couldn\u2019t hand the file to this phone \u2014 open the Google Sheet and use Download there.';
      if (document.getElementById('fops-head')) fopsHead(msg); else toastMsg(msg, 3600);
    });
  }

  // ---- pull-to-refresh: screens register CURREFRESH (a function returning a promise) ----
  // P48: the arrow never outlives its gesture. The system taking the touch (touchcancel), the app going to the
  // background and leaving the screen (route() calls PTR_RESET) put it away; a refresh already running finishes
  // silently. A 20-s watchdog on `busy` keeps a refresh that never settles from switching pull-to-refresh off.
  // A full pull is unchanged: same 80-px threshold, one CURREFRESH call, the same 250-ms settle.
  var CURREFRESH = null, PTR_RESET = null;
  (function () {
    var ind = document.createElement('div'); ind.id = 'ptr'; ind.innerHTML = '&#x21bb;'; document.body.appendChild(ind);
    var y0 = null, pulling = false, busy = false, wd = null;
    function top() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }
    function hide() { ind.classList.remove('spin'); ind.style.opacity = '0'; ind.style.transform = 'translate(-50%,-40px)'; }
    function shown() { return ind.classList.contains('spin') || (ind.style.opacity !== '' && ind.style.opacity !== '0'); }
    function cancel() { y0 = null; pulling = false; if (!busy && shown()) hide(); } // a running refresh keeps its spin
    PTR_RESET = function () { y0 = null; pulling = false; if (shown()) hide(); }; // no-op unless the arrow is showing
    document.addEventListener('touchcancel', cancel, { passive: true });
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancel(); });
    document.addEventListener('touchstart', function (e) {
      if (!CURREFRESH || busy || !top() || document.body.classList.contains('cc-fixed')) { y0 = null; return; }
      var t = e.target; if (t.closest && t.closest('#cc-sheet, #ask-sheet, .k-scroll, .fa2-modal, input, textarea')) { y0 = null; return; }
      y0 = e.touches[0].clientY; pulling = false;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (y0 === null) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 12 && top()) { pulling = true; var p = Math.min(1, dy / 80); ind.style.opacity = String(p); ind.style.transform = 'translate(-50%,' + Math.round(-40 + 40 * p) + 'px) rotate(' + Math.round(p * 270) + 'deg)'; }
      else if (pulling) { ind.style.opacity = '0'; }
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (y0 === null) return;
      var dy = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : y0) - y0;
      y0 = null;
      if (!pulling || dy < 80 || !CURREFRESH) { pulling = false; ind.style.opacity = '0'; return; }
      pulling = false;
      busy = true; ind.style.opacity = '1'; ind.style.transform = 'translate(-50%,0)'; ind.classList.add('spin');
      try { navigator.vibrate && navigator.vibrate(12); } catch (ev) {}
      var fin = false, done = function () { if (fin) return; fin = true; clearTimeout(wd); busy = false; hide(); };
      wd = setTimeout(done, 20000);
      Promise.resolve().then(function () { return CURREFRESH(); }).then(function () { setTimeout(done, 250); }, function () { setTimeout(done, 250); });
    }, { passive: true });
  })();

  // ---- router ----
  function legacyRedirect(kind, n) {
    var pool = kind === 'item' ? D.items : kind === 'probe' ? D.probes : D.shavers;
    var o = pool[n];
    if (o) { location.replace(pnRoute(o.sku)); return; }
    if (BYPN[nrm(String(n))]) { location.replace(pnRoute(String(n))); return; }
    location.replace('#/');
  }
  // ---- F&A Inventory v2 (fa2) — live event-sourced stock via the TBX FA Hub ----
  var FA2 = { creds: null, cache: null, form: null, adminPw: '', pend: 0, gen: 0 };
  // Master-tab columns by name. The hub sends masterCols with every read; these
  // defaults only matter for an older hub reply. Nothing below indexes r[N] directly.
  var MC = { ref: 0, desc: 1, lot: 2, exp: 3, qty: 4, status: 5, loc: 6, act: 7 };
  var MC_NAMES = { ref: 'ref', description: 'desc', desc: 'desc', lot: 'lot', exp: 'exp', expiry: 'exp', expiration: 'exp', qty: 'qty', quantity: 'qty', status: 'status', lastlocation: 'loc', location: 'loc', lastactivity: 'act' };
  function fa2ColsApply(d) {
    var cols = d && d.masterCols;
    if (!cols || !cols.length) return;
    var m = {};
    cols.forEach(function (c, i) { var k = MC_NAMES[String(c).toLowerCase().replace(/[^a-z]/g, '')]; if (k && m[k] === undefined) m[k] = i; });
    if (m.ref === undefined || m.lot === undefined || m.qty === undefined) return; // unrecognised header row: keep defaults
    for (var k in MC) if (m[k] !== undefined) MC[k] = m[k];
  }
  function fa2Save(c) { FA2.creds = c; try { localStorage.setItem('tbx_fa2', JSON.stringify(c)); } catch (e) {} }
  function fa2Creds() {
    if (FA2.creds) return FA2.creds;
    try { FA2.creds = JSON.parse(localStorage.getItem('tbx_fa2') || 'null'); } catch (e) { FA2.creds = null; }
    return FA2.creds;
  }
  function fa2Dec(file, pw) {
    return fetch(file).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (P) {
      return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey'])
        .then(function (km) { return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ccB64d(P.salt), iterations: P.it }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
        .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ccB64d(P.iv) }, key, ccB64d(P.ct)); })
        .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
    });
  }
  function fa2TryUnlock(pw) { return fa2Dec('fa2.enc.json', pw).then(fa2Save).catch(function () {}); }
  function fa2TryUnlockFA(pw) { return fa2Dec('fa2-fa.enc.json', pw).then(function (c) { fa2Save(c); return true; }).catch(function () { return false; }); }
  function fa2IsFA() { var c = fa2Creds(); return !!(c && c.scope === 'fa'); }
  // Reads are safe to repeat; anything that writes is not (a blind retry could
  // double-send a welcome or re-approve an import).
  // iOS hands a resumed home-screen app a stale socket now and then; the first
  // request on it hangs. A throwaway ping on resume takes that hit instead of the user.
  FA2.lastWarm = 0;
  function fa2Warm() {
    if (!fa2Creds()) return;
    if (Date.now() - FA2.lastWarm < 45000) return;
    FA2.lastWarm = Date.now();
    fa2Call('ping').then(function () {}, function () {});
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { fa2Warm(); if (CC.view === 'fa2home') fa2OutboxCheck(); } });
  window.addEventListener('pageshow', function () { fa2Warm(); });
  function fa2Retryable(action, extra) {
    if (action === 'read' || action === 'ping' || action === 'import_list' || action === 'tracking_set') return true;
    if (action === 'admin' && extra && /^(toggles_get|teams_get|report_preview)$/.test(String(extra.op))) return true;
    return false;
  }
  function fa2Call(action, extra) {
    var c = fa2Creds(); if (!c) return Promise.reject(new Error('locked'));
    var b = { action: action, token: c.token };
    if (extra) { for (var k in extra) b[k] = extra[k]; }
    var safe = fa2Retryable(action, extra), body = JSON.stringify(b), tries = safe ? 2 : 1;
    // Reads give up quickly and retry; writes get longer because a batch may be
    // rebuilding the Master tab on the far end.
    var limit = safe ? 12000 : 25000;
    function once(left) {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var opts = { method: 'POST', body: body };
      if (ctl) opts.signal = ctl.signal;
      // Apps Script can sit on a request for minutes when it is busy; don't leave
      // the phone spinning on "Checking..." with no way to tell what happened.
      var to = setTimeout(function () { if (ctl) ctl.abort(); }, limit);
      return fetch(c.url, opts).then(function (r) {
        clearTimeout(to);
        return r.text().then(function (t) {
          try { return JSON.parse(t); }
          catch (e2) { var eb = new Error('badreply'); eb.status = r.status; throw eb; }
        });
      }, function (e) {
        clearTimeout(to);
        throw new Error((e && e.name === 'AbortError') ? 'timeout' : 'net');
      }).catch(function (e) {
        if (left > 1) return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return once(left - 1); });
        throw e;
      });
    }
    return once(tries);
  }
  function fa2Ensure(then) {
    if (fa2IsFA()) return true;
    if (!ctEnsure(then)) return false;
    if (!fa2Creds()) {
      CC.creds = null; CC.ret = then;
      CC.gateMsg = 'One-time unlock \u2014 enter the CT password again to turn on F&A Inventory on this phone.';
      ccGate(); return false;
    }
    return true;
  }
  function fa2CacheGet() {
    if (FA2.cache) return FA2.cache;
    try { FA2.cache = JSON.parse(localStorage.getItem('tbx_fa2_cache') || 'null'); } catch (e) { FA2.cache = null; }
    return FA2.cache;
  }
  function fa2CacheSet(d) { if (!fa2Sane(d)) return; if (d.teams) fa2TeamsSave(d.teams); FA2.cache = { t: Date.now(), d: d }; try { localStorage.setItem('tbx_fa2_cache', JSON.stringify(FA2.cache)); } catch (e) {} }
  // A read that comes back ok:true but without a master array (seen when the
  // server is mid-rebuild) must never be cached or rendered — one bad payload
  // would otherwise blank every screen until the cache expired.
  function fa2Sane(d) { var ok = !!(d && d.ok && d.master && typeof d.master.length === 'number' && d.ledgerCols); if (ok) fa2ColsApply(d); return ok; }
  function fa2CacheKill() { FA2.cache = null; try { localStorage.removeItem('tbx_fa2_cache'); } catch (e) {} }
  function fa2Load(force) {
    var c = fa2CacheGet();
    if (c && !fa2Sane(c.d)) { fa2CacheKill(); c = null; }
    if (!force && c && Date.now() - c.t < 60000) return Promise.resolve(c.d);
    var lim = FA2.readLimit || 300;
    return fa2Call('read', { limit: lim }).then(function (j) {
      if (fa2Sane(j)) { fa2CacheSet(j); return j; }
      // Retry once: these blanks are transient rebuild races, not real states.
      return fa2Call('read', { limit: lim }).then(function (j2) {
        if (fa2Sane(j2)) { fa2CacheSet(j2); return j2; }
        if (c) return c.d;
        throw new Error((j2 && j2.err) || 'server');
      });
    }).catch(function (e) { if (c) return c.d; throw e; });
  }
  function fa2Num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  // "From" needs a detail box for Other (free note) and Territory Transfer (which territory).
  function fa2FromNeeds(v) { return v === 'Other' || v === 'Territory Transfer'; }
  function fa2FromPh(v) { return v === 'Territory Transfer' ? 'Territory Received From?' : 'Notes'; }
  function fa2FromValue(f) {
    var x = String(f.fromOther || '').trim();
    if (f.from === 'Other') return x;
    if (f.from === 'Territory Transfer') return 'Territory Transfer \u2014 ' + x;
    return f.from;
  }
  function fa2Today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fa2Uuid() { try { return crypto.randomUUID(); } catch (e) { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10); } }
  // A cycle-count device is registered as "Mia's iPhone"; the person is "Mia".
  // Used for the From chips and for who-did-it on sports-side events.
  function fa2PersonName(n) {
    n = String(n || '').replace(/\s+/g, ' ').trim();
    n = n.replace(/\s*\(.*?\)\s*$/, '');
    n = n.replace(/(?:['\u2019`]s)?\s*\b(?:iphone|ipad|ipod|phone|android|pixel|galaxy|samsung|mobile|cell|device)\b.*$/i, '').trim();
    n = n.replace(/['\u2019`]s$/, '').trim();
    return n;
  }
  function fa2Who() { return fa2IsFA() ? (FA2.faName || '') : (fa2PersonName(CC.dev) || CC.dev || ''); }
  // Kept out of the read cache on purpose: that cache is wiped after every save,
  // and the roster must still fill the chip lists on the very next screen.
  function fa2TeamsSave(list) {
    if (!list || !list.length) return;
    FA2.teamList = list;
    try { localStorage.setItem('tbx_fa2_teams', JSON.stringify(list)); } catch (e) {}
  }
  function fa2Teams(role) {
    var t = FA2.teamList;
    if (!t) { try { t = JSON.parse(localStorage.getItem('tbx_fa2_teams') || 'null'); } catch (e) { t = null; } FA2.teamList = t; }
    if (!t || !t.length) { var d = fa2CacheGet(); t = (d && d.d && d.d.teams) || []; }
    return t.filter(function (x) { return x.role === role; }).map(function (x) { return x.name; });
  }
  // pending (idempotent retry) queue: one batch at a time
  function fa2PendGet() { try { return JSON.parse(localStorage.getItem('tbx_fa2_pend') || 'null'); } catch (e) { return null; } }
  function fa2PendSet(p) { try { if (p) localStorage.setItem('tbx_fa2_pend', JSON.stringify(p)); else localStorage.removeItem('tbx_fa2_pend'); } catch (e) {} }
  function fa2Sig(events) { var t = JSON.stringify(events), h = 5381; for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
  // Did a batch with this opId reach the ledger? Used when the reply was lost,
  // so a dropped response never turns into a "tap again" that double-applies.
  function fa2Landed(opId) {
    return fa2Call('read', { limit: 120 }).then(function (j) {
      if (!fa2Sane(j)) return null;
      var ix = j.ledgerCols.indexOf('OpId'); if (ix < 0) return null;
      return (j.ledger || []).some(function (r) { return String(r[ix]) === opId; });
    }).catch(function () { return null; });
  }
  // Stock never enters the sheet without a part number, lot and expiration - this is the
  // one gate every screen passes through, so a missed check upstream still cannot save.
  function fa2StockGate(events) {
    for (var i = 0; i < (events || []).length; i++) {
      var e = events[i]; if (e.type !== 'Received') continue;
      var miss = [];
      if (!String(e.ref || '').trim()) miss.push('part number');
      if (!String(e.lot || '').trim()) miss.push('lot');
      if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(String(e.exp || ''))) miss.push('expiration');
      if (miss.length) return (e.ref ? e.ref + ' ' : 'An item ') + 'is missing its ' + miss.join(', ') + ' \u2014 nothing was saved.';
    }
    return '';
  }
  function fa2Submit(events, label, btn) {
    var gateMsg = fa2StockGate(events);
    if (gateMsg) { if (btn) { btn.disabled = false; } var eG = new Error(gateMsg); eG.hub = true; return Promise.reject(eG); }
    var p = fa2PendGet(), sig = fa2Sig(events);
    // Same screen + same content after a failed attempt = same opId (the hub dedups).
    // Same screen but edited content = check whether the earlier attempt landed first.
    var opId = (p && p.label === label && p.sig === sig) ? p.opId : fa2Uuid();
    var stale = (p && p.label === label && p.sig !== sig) ? p.opId : null;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
    var pre = stale ? fa2Landed(stale) : Promise.resolve(false);
    FA2.inflight = (FA2.inflight || 0) + 1;
    return pre.then(function (landed) {
      if (landed) { fa2PendSet(null); fa2CacheKill(); var e0 = new Error('Your earlier attempt did go through \u2014 check History before saving this again.'); e0.hub = true; throw e0; }
      // The events ride along in the record, so a save the phone lost mid-flight
      // (app killed, page reclaimed) can be re-sent from Home under the same opId.
      fa2PendSet({ opId: opId, label: label, sig: sig, events: events, t: Date.now() });
      FA2.lastOpId = opId;
      return fa2Call('batch', { opId: opId, events: events }).then(function (j) {
        if (j && j.ok) return j;
        var e1 = new Error((j && j.err) || 'server'); e1.hub = true; e1.at = j ? j.at : undefined; throw e1;
      }, function () {
        return fa2Landed(opId).then(function (landed2) { if (landed2) return { ok: true, recovered: true }; throw new Error('net'); });
      }).then(function (j) { fa2PendSet(null); fa2CacheKill(); return j; });
    }).then(function (j) { FA2.inflight--; return j; }, function (e) {
      FA2.inflight--;
      // The hub answered no: nothing to recover later, so drop the record (a 'dup' means it did land).
      if (e && e.hub) { fa2PendSet(null); if (String(e.message) === 'dup') fa2CacheKill(); }
      throw e;
    });
  }
  // A batch the phone never got an answer for is still in tbx_fa2_pend with its
  // events. Home asks the hub whether it landed and, if not, offers to send it
  // again under the same opId - never silently, never twice.
  var FA2_OUTBOX_NAMES = { add: 'Inventory add', use: 'Case usage', ret: 'Removal', send: 'Send-back', fix: 'Correction', dropfix: 'Drop re-file' };
  function fa2OutboxName(p) { return FA2_OUTBOX_NAMES[String(p.label || '').split('-')[0]] || 'A save'; }
  function fa2OutboxLabel(p) { var n = (p.events || []).length; return fa2OutboxName(p) + ' (' + n + ' line' + (n === 1 ? '' : 's') + ')'; }
  function fa2OutboxCheck() {
    var p = fa2PendGet();
    if (!p || !p.events || !p.events.length || (FA2.inflight || 0) > 0 || FA2.outboxBusy) return;
    if (FA2.flash && FA2.flash.state === 'busy') return;
    FA2.outboxBusy = true;
    fa2Flash('busy', 'Checking an unsent save\u2026');
    fa2Landed(p.opId).then(function (landed) {
      FA2.outboxBusy = false;
      var lb = fa2OutboxLabel(p);
      if (landed === true) { fa2PendSet(null); fa2CacheKill(); fa2Flash('ok', lb + ' did reach the sheet \u2014 nothing lost.'); if (CC.view === 'fa2home') fa2HomeLoad(true); return; }
      fa2Flash('bad', lb + (landed === null ? ' is unsent and the server can\u2019t be reached right now.' : ' never reached the sheet.'),
        function () { fa2OutboxSend(p); }, function () { fa2PendSet(null); });
    });
  }
  function fa2OutboxSend(p) {
    var lb = fa2OutboxLabel(p);
    fa2Flash('busy', 'Sending ' + lb.toLowerCase() + '\u2026');
    fa2Submit(p.events, p.label, null).then(function () {
      var n = (p.events || []).length;
      fa2Flash('ok', fa2OutboxName(p) + ' saved \u2014 ' + n + ' line' + (n === 1 ? '' : 's'));
      if (CC.view === 'fa2home') fa2HomeLoad(true); else if (CC.view === 'fa2onhand') fa2OnHandLoad(true);
    }, function (e) {
      fa2Flash('bad', lb + ': ' + fa2FailMsg(e, 'still couldn\u2019t reach the server.'), (e && e.hub) ? null : function () { fa2OutboxSend(p); }, function () { fa2PendSet(null); });
    });
  }
  var FA2_ERRS = { scope: 'This login can only send product back to Stryker.', auth: 'Access token rejected \u2014 re-enter the CT password.', tracking: 'Tracking # is required.', exp: 'Expiration is required.', qty: 'Quantity can\u2019t be zero.', reverses: 'Nothing to void.', type: 'Unknown event type.', dup: 'Already saved.' };
  function fa2FailMsg(e, net) {
    if (e && e.hub) { var m = String(e.message || 'server'); return (FA2_ERRS[m] || (m.length > 24 ? m : 'Server rejected this (' + m + ').')) + (typeof e.at === 'number' ? ' Line ' + (e.at + 1) + '.' : ''); }
    var k = e && e.message;
    if (k === 'timeout') return 'The sheet server didn\u2019t answer in time \u2014 it\u2019s usually busy for a minute. Try again.';
    if (k === 'badreply') return 'The sheet server sent back an error page instead of data \u2014 try again in a minute.';
    return net || 'Couldn\u2019t reach the server \u2014 check your signal and tap again.';
  }
  function fa2Err(id, msg) {
    var el = document.getElementById(id); if (!el) return;
    el.textContent = msg; el.hidden = false;
    // Make sure it is actually on screen (and not tucked under the sticky action bar).
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    var bar = document.querySelector('.k-bar');
    if (bar) { var eb = el.getBoundingClientRect().bottom, bt = bar.getBoundingClientRect().top; if (eb > bt - 4 && bar.getBoundingClientRect().bottom <= window.innerHeight) window.scrollBy(0, eb - bt + 8); }
  }
  function fa2Wide(on) { if (document.body) document.body.classList.toggle('fa2-wide', !!on); }
  function fa2Spin(on) { var b = document.getElementById('fa2-rf'); if (b) { b.classList.toggle('spin', !!on); b.disabled = !!on; } }
  // Every refresh button spins while it works and ticks when it's done, so a tap never looks ignored.
  function fa2RefreshWire(fn) {
    CURREFRESH = fn;
    var b = document.getElementById('fa2-rf'); if (!b) return;
    b.addEventListener('click', function () {
      fa2Spin(true);
      Promise.resolve().then(fn).then(function () { fa2Spin(false); fa2Ticked(); }, function () { fa2Spin(false); });
    });
  }
  function fa2Ticked() {
    var b = document.getElementById('fa2-rf'); if (!b) return;
    b.innerHTML = '&#x2713;'; b.classList.add('ok');
    setTimeout(function () { var b2 = document.getElementById('fa2-rf'); if (b2) { b2.innerHTML = '&#x21bb;'; b2.classList.remove('ok'); } }, 1400);
  }
  // Every screen that draws from the sheet gets the same top-right refresh; onRefresh returns a promise.
  function fa2Shell(title, sub, inner, onRefresh) {
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">' + title + '</h2>' +
        (sub ? '<div class="cc-sub">' + sub + '</div>' : '') +
        inner +
        '<div id="fa2-err" class="cc-err" hidden></div>' +
      '</div>');
    // A sticky bottom bar would otherwise hide the error below the fold: keep the message above it.
    var er = document.getElementById('fa2-err'), bar = er && er.parentNode ? er.parentNode.querySelector('.k-bar') : null;
    if (er && bar) bar.parentNode.insertBefore(er, bar);
    if (onRefresh) fa2RefreshWire(onRefresh);
  }
  function fa2Amt(v) { if (v == null || String(v).trim() === '') return null; var n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
  function fa2Money(n) { var t = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '\u2212$' : '$') + t; }
  function fa2ImpTotal(x) {
    var hdr = (x.detail && x.detail.hdr) || {};
    var t = fa2Amt(hdr.total != null ? hdr.total : hdr.poTotal != null ? hdr.poTotal : hdr.orderTotal != null ? hdr.orderTotal : x.total);
    if (t != null) return t;
    var sum = 0, any = false;
    ((x.detail && x.detail.lines) || []).forEach(function (L) {
      var v = fa2Amt(L.lineTotal);
      if (v == null && fa2Amt(L.unitPrice) != null) v = fa2Amt(L.unitPrice) * (Number(L.qty) || 0);
      if (v != null) { sum += v; any = true; }
    });
    return any ? sum : null;
  }
  function fa2Chips(id, opts, cur) {
    return '<div class="fa2-chips" id="' + id + '">' + opts.map(function (o) {
      return '<button type="button" class="fa2-chip' + (o === cur ? ' on' : '') + '" data-v="' + esc(o) + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
  }
  function fa2ChipWire(id, onPick) {
    var el = document.getElementById(id); if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.fa2-chip') : null; if (!b) return;
      el.querySelectorAll('.fa2-chip').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      onPick(b.dataset.v);
    });
  }

  /* ---------- send-back tracking reminders ----------
     A send-back saved without a tracking # is chased from Home on every phone:
     pending = ledger rows of type Returned/Sent back to Stryker with a blank Tracking
     column, grouped by OpId (plus this phone's own just-saved ones until the read
     catches up). Entering the # calls the hub's tracking_set, which fills that column
     on those rows — stock lines are never edited, so the ledger stays append-only. */
  var FA2_TRK_TYPES = { 'Returned to Stryker': 1, 'Sent back to Stryker': 1 };
  function fa2TrkLocal() { try { return JSON.parse(localStorage.getItem('tbx_fa2_trk') || '[]') || []; } catch (e) { return []; } }
  function fa2TrkLocalSave(l) { try { localStorage.setItem('tbx_fa2_trk', JSON.stringify(l.slice(-30))); } catch (e) {} }
  function fa2TrkLocalAdd(p) { var l = fa2TrkLocal().filter(function (x) { return x.opId !== p.opId; }); l.push(p); fa2TrkLocalSave(l); }
  function fa2TrkLocalDrop(opId) { fa2TrkLocalSave(fa2TrkLocal().filter(function (x) { return x.opId !== opId; })); }
  function fa2TrkPending(d) {
    var out = [], byOp = {}, seenOp = {}, filled = {};
    if (d && d.ledger && d.ledgerCols) {
      var ix = {}; d.ledgerCols.forEach(function (c, i) { ix[String(c).toLowerCase()] = i; });
      var g = function (r, k) { var i = ix[k]; return i === undefined ? '' : String(r[i] == null ? '' : r[i]); };
      var voided = {};
      d.ledger.forEach(function (r) { if (g(r, 'type') === 'Void' && g(r, 'reverses')) voided[g(r, 'reverses')] = 1; });
      d.ledger.forEach(function (r) {
        if (!FA2_TRK_TYPES[g(r, 'type')] || voided[g(r, 'eventid')]) return;
        var op = g(r, 'opid') || g(r, 'eventid'); if (!op) return;
        seenOp[op] = 1;
        if (g(r, 'tracking').trim()) { filled[op] = 1; return; }
        var p = byOp[op];
        if (!p) { p = byOp[op] = { opId: op, ts: g(r, 'timestamp'), lines: 0, units: 0, by: fa2PersonName(g(r, 'enteredby')), refs: [] }; out.push(p); }
        p.lines++; p.units += Math.abs(fa2Num(g(r, 'qty')));
        var q = Math.abs(fa2Num(g(r, 'qty'))); p.refs.push(g(r, 'ref') + (q > 1 ? ' \u00d7' + q : ''));
      });
    }
    // this phone's own recent saves: drop once the sheet shows them tracked, keep while the read lags
    var loc = fa2TrkLocal(), keep = [];
    loc.forEach(function (p) {
      if (filled[p.opId] && !byOp[p.opId]) return;
      keep.push(p);
      if (!byOp[p.opId] && !seenOp[p.opId]) out.push(p);
    });
    if (keep.length !== loc.length) fa2TrkLocalSave(keep);
    out.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
    return out;
  }
  function fa2TrkDraw(list) {
    var el = document.getElementById('fa2-trkpend'); if (!el) return;
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="fa2-trkp"><div class="t">Tracking # needed \u00b7 ' + list.length + ' send-back' + (list.length === 1 ? '' : 's') + '</div>' +
      list.map(function (p, i) {
        return '<div class="r"><div class="m">' + esc(faFmt(p.ts)) + ' \u00b7 ' + p.lines + ' item' + (p.lines === 1 ? '' : 's') + ' \u00b7 ' + p.units + ' unit' + (p.units === 1 ? '' : 's') +
          '<span>' + esc((p.refs || []).slice(0, 4).join(', ') + ((p.refs || []).length > 4 ? ' \u2026' : '')) + (p.by ? ' \u00b7 ' + esc(p.by) : '') + (p.trk ? ' \u00b7 # ' + esc(p.trk) + ' saved on this phone, waiting for the hub' : '') + '</span></div>' +
          '<button type="button" data-trk="' + i + '">Add tracking</button></div>';
      }).join('') + '</div>';
    el.querySelectorAll('[data-trk]').forEach(function (b) { b.addEventListener('click', function () { fa2TrackSheet(list[+b.getAttribute('data-trk')]); }); });
  }
  function fa2TrackSave(p, trk) {
    return fa2Call('tracking_set', { opId: p.opId, tracking: trk, enteredBy: fa2Who() }).then(function (j) {
      if (j && j.ok) { fa2TrkLocalDrop(p.opId); fa2CacheKill(); return j; }
      var e = new Error((j && j.err) || 'server'); e.hub = true; throw e;
    });
  }
  function fa2TrackSheet(p) {
    var sh = askSheet();
    sh.innerHTML = '<div class="as-card"><h3>Add the tracking #</h3>' +
      '<div class="ask-b">Send-back ' + esc(faFmt(p.ts)) + ' \u00b7 ' + p.lines + ' item' + (p.lines === 1 ? '' : 's') + ' \u00b7 ' + p.units + ' unit' + (p.units === 1 ? '' : 's') + (p.by ? ' \u00b7 ' + esc(p.by) : '') +
      '\n' + esc((p.refs || []).join(', ')) + '\n\nThe stock is already off the sheet. Enter the carrier tracking # from the label \u2014 this reminder stays on Home until it\u2019s in.</div>' +
      '<input id="trk-in" class="cc-in" autocomplete="off" autocapitalize="characters" placeholder="Tracking #" value="' + esc(p.trk || '') + '">' +
      '<div id="trk-err" class="cc-err" hidden></div>' +
      '<div class="ask-row"><button type="button" class="ask-no">Later</button><button type="button" class="ask-ok ok">Save tracking</button></div></div>';
    var inp = sh.querySelector('#trk-in'), ok = sh.querySelector('.ask-ok');
    function close() { sh.hidden = true; sh.onclick = null; }
    function save() {
      var v = (inp.value || '').trim();
      if (!v) { inp.classList.add('cc-need'); inp.focus(); return; }
      ok.disabled = true; ok.textContent = 'Saving\u2026';
      fa2TrackSave(p, v).then(function () {
        close(); fa2Flash('ok', 'Tracking saved \u2014 ' + v);
        if (CC.view === 'fa2home') fa2HomeLoad(true);
      }, function (e) {
        ok.disabled = false; ok.textContent = 'Save tracking';
        var er = sh.querySelector('#trk-err');
        if (e && e.hub && String(e.message) === 'action') {
          // Older hub without tracking_set: keep the number on this phone and say so.
          p.trk = v; fa2TrkLocalAdd(p); close();
          fa2Flash('bad', 'Saved on this phone. The hub needs its tracking update before it reaches the sheet \u2014 tell Nate.');
          if (CC.view === 'fa2home') fa2HomeLoad(false);
          return;
        }
        if (er) { er.textContent = fa2FailMsg(e); er.hidden = false; }
      });
    }
    sh.onclick = function (e) {
      if (e.target === sh || e.target.closest('.ask-no')) { close(); return; }
      if (e.target.closest('.ask-ok')) save();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
    inp.addEventListener('input', function () { inp.classList.remove('cc-need'); });
    sh.hidden = false;
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 80);
  }

  /* ---------- status pill (survives navigation; drawn wherever a host exists) ---------- */
  function fa2Flash(state, msg, retry, discard) {
    FA2.flash = { state: state, msg: msg, retry: retry || null, discard: discard || null };
    fa2FlashDraw();
  }
  function fa2FlashClear() { FA2.flash = null; clearTimeout(FA2.flashTO); fa2FlashDraw(); }
  function fa2FlashDraw() {
    var host = document.getElementById('fa2-flash'); if (!host) return;
    var fl = FA2.flash;
    clearTimeout(FA2.flashTO);
    if (!fl) { host.hidden = true; host.innerHTML = ''; return; }
    host.className = 'fa2-flash ' + fl.state;
    var rfn = fl.retry && fl.retry.fn ? fl.retry.fn : fl.retry, rlb = (fl.retry && fl.retry.label) || 'Retry';
    host.innerHTML = '<span class="fa2-fl-dot"></span><span>' + esc(fl.msg) + '</span>' +
      (rfn ? '<button type="button" id="fa2-flgo" class="cc-link fa2-fl-act">' + esc(rlb) + '</button>' : '') +
      (fl.discard ? '<button type="button" id="fa2-fldc" class="cc-link fa2-fl-dis">Discard</button>' : '');
    host.hidden = false;
    if (rfn) document.getElementById('fa2-flgo').addEventListener('click', function () { fa2FlashClear(); rfn(); });
    if (fl.discard) document.getElementById('fa2-fldc').addEventListener('click', function () { var d = fl.discard; fa2FlashClear(); d(); });
    // Success clears itself once it has actually been on screen for a few seconds.
    if (fl.state === 'ok') FA2.flashTO = setTimeout(function () { if (FA2.flash && FA2.flash.state === 'ok') fa2FlashClear(); }, 6000);
  }
  // The drop is sent in the background so the phone can leave the scanner screen
  // immediately; the pill on Home reports processing / saved / failed-with-retry.
  function fa2AddRun(evs, label, lines, units, draft) {
    fa2Flash('busy', 'Inventory add processing\u2026');
    fa2Submit(evs, label, null).then(function () {
      fa2Flash('ok', 'Inventory add saved \u2014 ' + lines + ' item' + (lines === 1 ? '' : 's') + ' \u00b7 ' + units + ' unit' + (units === 1 ? '' : 's'));
      if (CC.view === 'fa2home') fa2HomeLoad(true);
      else if (CC.view === 'fa2onhand') fa2OnHandLoad(true);
    }, function (e) {
      if (e && e.hub && draft) {
        // The sheet refused it: put the whole drop back as a draft so it can be fixed, not retyped.
        fa2DraftSet(draft);
        fa2Flash('bad', fa2FailMsg(e, 'Inventory add didn\u2019t save.') + ' The drop is kept on this phone \u2014 open Add inventory to fix it.', { label: 'Open', fn: function () { location.hash = '#/fa2/add'; } });
        return;
      }
      fa2Flash('bad', fa2FailMsg(e, 'Inventory add didn\u2019t save.'), function () { fa2AddRun(evs, label, lines, units, draft); });
    });
  }
  // In-progress drop (step-1 form + scanned tray), mirrored to the phone so a
  // back-swipe, a phone call or Safari reclaiming the page never loses the scans.
  function fa2DraftGet() { try { return JSON.parse(localStorage.getItem('tbx_fa2_draft') || 'null'); } catch (e) { return null; } }
  function fa2DraftSet(d) { try { if (d) localStorage.setItem('tbx_fa2_draft', JSON.stringify(d)); else localStorage.removeItem('tbx_fa2_draft'); } catch (e) {} }
  function fa2DraftSave() { if (FA2.form && FA2.form.kind === 'add') fa2DraftSet({ form: FA2.form, a2: FA2.a2 || { items: {}, order: [] } }); }
  // Who can hand product over: the CT device roster (what the cycle-count join returns)
  // plus anyone Admin lists on the Sports team. Hardcoded names only as a last resort.
  function fa2FromNames() {
    var out = [], seen = {};
    function add(n) { n = fa2PersonName(n); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); } }
    // Admin's Sports team spelling first, then anyone on the device roster it doesn't already cover.
    fa2Teams('sports').forEach(add);
    var ros = []; try { ros = JSON.parse(ccLS(terrKey('_roster')) || '[]') || []; } catch (e) { ros = []; }
    ros.forEach(add);
    if (!out.length) ['Megan', 'Matt', 'Mia', 'Manny', 'Isabella', 'Nate'].forEach(add);
    return out;
  }

  /* ---------- Home ---------- */
  function fa2Home() {
    var fa = fa2IsFA();
    setTitle('F&A Inventory', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Home)) return; fa2Wide(true);
    CC.view = 'fa2home';
    var tiles;
    if (fa) {
      tiles =
        '<button id="fa2-onhand" class="ct-big">On hand<span>Product in your possession \u2014 expired and send-back lots on top</span></button>' +
        '<button id="fa2-send" class="ct-big">Send back to Stryker<span>Scan or tap what goes back \u2014 tracking # required</span></button>' +
        '<button id="fa2-hist" class="ct-big">History<span>Every event, newest first</span></button>';
    } else {
      tiles =
        '<button id="fa2-onhand" class="ct-big">On hand<span>What\u2019s out right now \u2014 first to expire on top</span></button>' +
        '<button id="fa2-trans" class="ct-big">Transactions<span id="fa2-tsub">Bill-only imports \u2014 approve or deny</span></button>' +
        '<button id="fa2-add" class="ct-big">Add inventory<span>Record a drop to the F&amp;A team</span></button>' +
        '<button id="fa2-ret" class="ct-big">Remove / Return<span>Back to rep stock, transfer, or other</span></button>' +
        '<button id="fa2-use" class="ct-big">Record case usage<span>Manual bill-only entry \u2014 BO, facility, surgeon</span></button>' +
        '<button id="fa2-hist" class="ct-big">History<span>Append-only ledger \u2014 corrections are new events</span></button>' +
        '<button id="fa2-adm" class="ct-big">Admin<span>Teams, sheet access &amp; email settings</span></button>';
    }
    render(
      '<div class="card cc-card">' +
        '<div id="fa2-flash" class="fa2-flash" hidden></div>' +
        '<h2 class="cc-h">F&amp;A Inventory</h2>' +
        '<div class="cc-sub">' + (fa ? 'F&amp;A view \u2014 send-backs only. Everything else is read-only.' : 'Live field stock \u2014 everything handed to the Foot &amp; Ankle team.') + '</div>' +
        '<div id="fa2-pills" class="fa2-pills"></div>' +
        '<div id="fa2-trkpend"></div>' +
        tiles +
        '<div id="fa2-msg" class="cc-sub2"></div>' +
        sheetLinkHTML((D.sheets || {}).fa2) +
      '</div>');
    function go(id, h) { var b = document.getElementById(id); if (b) b.addEventListener('click', function () { location.hash = h; }); }
    go('fa2-onhand', '#/fa2/onhand'); go('fa2-hist', '#/fa2/history'); go('fa2-send', '#/fa2/send');
    go('fa2-trans', '#/fa2/trans'); go('fa2-add', '#/fa2/add'); go('fa2-ret', '#/fa2/return'); go('fa2-use', '#/fa2/use'); go('fa2-adm', '#/fa2/admin');
    fa2RefreshWire(function () { return fa2HomeLoad(true); });
    fa2FlashDraw();
    fa2TrkDraw(fa2TrkPending(null));
    fa2HomeLoad(false);
    fa2OutboxCheck();
  }
  function fa2HomeLoad(force) {
    var p = document.getElementById('fa2-pills'), m = document.getElementById('fa2-msg');
    if (p && !p.innerHTML) p.innerHTML = skel(1, 'sm');
    var g = ++FA2.gen;
    return fa2Load(force).then(function (d) {
      if (CC.view !== 'fa2home' || g !== FA2.gen) return;
      var units = 0, soon = 0, sb = 0, exp = 0;
      (d.master || []).forEach(function (r) {
        var q = fa2Num(r[MC.qty]); if (q <= 0) return; units += q;
        var b = fa2RowBand(r);
        if (b === 0) exp += q; else if (b === 1) sb += q; else if (b === 2) soon += q;
      });
      var goSend = fa2IsFA() ? '#/fa2/send' : '#/fa2/return';
      if (p) p.innerHTML =
        '<span class="cc-pill ok">' + units + ' on hand</span>' +
        (exp ? '<button type="button" class="cc-pill bad fa2-pillgo" data-h="' + goSend + '">' + exp + ' expired</button>' : '') +
        (sb ? '<button type="button" class="cc-pill wait fa2-pillgo" data-h="' + goSend + '">' + sb + ' send back</button>' : '') +
        (soon ? '<span class="cc-pill busy">' + soon + ' \u22643 mo</span>' : '');
      if (p) p.querySelectorAll('.fa2-pillgo').forEach(function (b) { b.addEventListener('click', function () { location.hash = b.getAttribute('data-h'); }); });
      fa2TrkDraw(fa2TrkPending(d));
      if (m) { var cc0 = fa2CacheGet(); m.innerHTML = sinceHTML(cc0 && cc0.t, 'Synced'); }
      if (!fa2IsFA()) fa2Call('import_list').then(function (j) {
        if (!j || !j.ok || CC.view !== 'fa2home') return;
        var n = (j.imports || []).filter(function (x) { return x.outcome === 'pending' || x.outcome === 'revised-pending'; }).length;
        FA2.pend = n;
        var ts = document.getElementById('fa2-tsub');
        if (ts && n) ts.innerHTML = '<b class="fa2-badge">' + n + ' pending</b> \u2014 tap to review';
      }).catch(function () {});
    }).catch(function () {
      if (CC.view !== 'fa2home' || g !== FA2.gen) return;
      if (p) p.innerHTML = '';
      if (m) m.textContent = 'Couldn\u2019t reach the server \u2014 check signal and try again.';
    });
  }

  /* ---------- v2.1 shared kit ---------- */
  function fa2KitCss() { /* styles live in index.html (.k-*, .f2*, .h-*, .a2*) */ }
  var FA2_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  // Accepts what people and labels actually write; always answers YYYY-MM-DD (or ''
  // when it can't be read). Month-only means good through the end of that month.
  function expIso(v) {
    var t = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
    if (!t) return '';
    var y, mo, d = 0, m;
    if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?$/))) { y = +m[1]; mo = +m[2]; d = m[3] ? +m[3] : 0; }
    else if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else if ((m = t.match(/^(\d{1,2})[-\/.](\d{4})$/))) { mo = +m[1]; y = +m[2]; }
    else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/^(\d{2})(\d{2})(\d{2})$/))) { y = 2000 + +m[1]; mo = +m[2]; d = +m[3]; } // GS1 YYMMDD, 00 day = end of month
    else if ((m = t.match(/^(?:(\d{1,2})[ -])?([A-Za-z]{3,9})[ -](\d{4})$/))) { d = m[1] ? +m[1] : 0; mo = FA2_MON[m[2].slice(0, 3).toLowerCase()]; y = +m[3]; }
    else if ((m = t.match(/^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})$/))) { mo = FA2_MON[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3]; }
    else return '';
    if (!y || !mo || mo < 1 || mo > 12) return '';
    var last = new Date(y, mo, 0).getDate();
    if (!d) d = last;
    if (d < 1 || d > last) return '';
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  function expNorm(e) { return expIso(e) || String(e == null ? '' : e).trim(); }
  // 0 expired \u00b7 1 send back (\u22642 mo) \u00b7 2 expiring (\u22643 mo) \u00b7 3 ok. The sheet's own status
  // column wins (same bands the weekly email uses); the date math only fills in when it is missing.
  function expBand4(e) {
    var n = expIso(e); if (!n) return 3;
    var d = new Date(n + 'T12:00:00'), now = new Date(); now.setHours(0, 0, 0, 0);
    if (d < now) return 0;
    var m2 = new Date(now); m2.setMonth(m2.getMonth() + 2); if (d <= m2) return 1;
    var m3 = new Date(now); m3.setMonth(m3.getMonth() + 3); return d <= m3 ? 2 : 3;
  }
  function fa2RowBand(r) {
    var st = String(r[MC.status] || '');
    if (st === 'EXPIRED') return 0;
    if (st.indexOf('SEND BACK') === 0) return 1;
    if (st === '\u22643 MO') return 2;
    if (st === 'OK') return 3;
    return expBand4(r[MC.exp]);
  }
  var FA2_BAND_NAMES = ['Expired', 'Send back \u22642 mo', 'Expiring \u22643 mo', 'OK'], FA2_BAND_CLS = ['bad', 'warn', 'soon', 'ok'];
  function fa2RowChip(r) { var b = fa2RowBand(r); return '<span class="f2chip ' + ['exp">Expired', 'sb">Send back', 'soon">\u22643 mo', 'ok">OK'][b] + '</span>'; }
  function fa2BandSort(rows) {
    return rows.slice().sort(function (a, b) {
      var ba = fa2RowBand(a), bb = fa2RowBand(b);
      if (ba !== bb) return ba - bb;
      var ra = String(a[0]), rb = String(b[0]);
      if (ra !== rb) return ra < rb ? -1 : 1;
      var ea = expNorm(a[3]) || '9999-99-99', eb = expNorm(b[3]) || '9999-99-99';
      return ea < eb ? -1 : ea > eb ? 1 : 0;
    });
  }
  function kitBanner(hostSel, msg) { var host = typeof hostSel === 'string' ? document.querySelector(hostSel) : hostSel; if (!host) return; var b = document.createElement('div'); b.className = 'k-ban'; b.innerHTML = '<span>' + msg + '</span><button aria-label="Dismiss">\u00d7</button>'; b.querySelector('button').addEventListener('click', function () { b.remove(); }); host.insertBefore(b, host.firstChild); setTimeout(function () { if (b.parentNode) b.remove(); }, 3000); }
  function kitShake(el, qtyEl) { if (!el) return; el.classList.remove('k-shake'); void el.offsetWidth; el.classList.add('k-shake'); if (qtyEl) { qtyEl.classList.add('k-red'); setTimeout(function () { qtyEl.classList.remove('k-red'); }, 700); } }
  function kitMatch(q, parts) { q = String(q || '').trim().toUpperCase(); if (!q) return true; var hay = parts.join(' ').toUpperCase(); return q.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; }); }
  function kitTray(host, state, opts) {
    opts = opts || {}; fa2KitCss();
    function rowsOf() { return [].slice.call(host.querySelectorAll('.k-trow')); }
    function draw() {
      var order = state.order, items = state.items;
      if (!order.length) { host.innerHTML = opts.empty ? '<div class="cc-empty">' + opts.empty + '</div>' : ''; return; }
      var h = '';
      order.forEach(function (k) {
        var p = items[k]; if (!p) return;
        var bits = [p.lot ? 'Lot ' + esc(p.lot) : '<em class="k-miss">No lot</em>'];
        if (p.exp) bits.push('Exp ' + esc(p.exp));
        else if (opts.needExp) bits.push('<em class="k-miss">No expiry</em>');
        if (p.onhand != null) bits.push(p.onhand + ' on hand');
        // more than the sheet says is on hand: flag the row so nobody submits it by accident
        var over = (p.onhand != null && p.qty > p.onhand);
        h += '<div class="k-trow' + (opts.onEdit ? ' k-can' : '') + (over ? ' k-over' : '') + '" data-k="' + esc(k) + '">' +
          '<span class="k-handle" aria-label="Reorder">\u2261</span>' +
          '<span class="k-arrows"><button data-mv="-1">\u25b2</button><button data-mv="1">\u25bc</button></span>' +
          '<span class="k-tmain"><span class="k-tt">' + esc(p.ref) + (p.desc ? ' \u00b7 ' + esc(p.desc) : '') + '</span>' +
          '<span class="k-ts">' + bits.join(' \u00b7 ') + '</span></span>' +
          (opts.onEdit ? '<button class="k-edit" type="button" aria-label="Edit item">\u270e</button>' : '') +
          '<span class="k-step"><button data-d="-1">\u2212</button><b>' + p.qty + '</b><button data-d="1">+</button></span>' +
          '<button class="k-x" aria-label="Remove">\u00d7</button>' +
        '</div>';
      });
      host.innerHTML = h;
      if (window.FA2_ARROWS) rowsOf().forEach(function (r) { r.querySelector('.k-arrows').style.display = 'inline-flex'; });
      wire();
      if (opts.onChange) opts.onChange();
    }
    function wire() {
      rowsOf().forEach(function (row) {
        var k = row.getAttribute('data-k'), p = state.items[k];
        row.querySelectorAll('.k-step button').forEach(function (b) {
          b.addEventListener('click', function () {
            var d = Number(b.getAttribute('data-d')); var nq = p.qty + d;
            if (nq < 1) return;
            if (p.max != null && nq > p.max && !(opts.allowOver && opts.allowOver(k))) { kitShake(row, row.querySelector('.k-step b')); return; }
            p.qty = nq; draw();
          });
        });
        row.querySelector('.k-x').addEventListener('click', function () { delete state.items[k]; state.order = state.order.filter(function (x) { return x !== k; }); draw(); });
        if (opts.onEdit) {
          var ed = row.querySelector('.k-edit');
          if (ed) ed.addEventListener('click', function (e) { e.stopPropagation(); opts.onEdit(k); });
          row.querySelector('.k-tmain').addEventListener('click', function () { opts.onEdit(k); });
        }
        row.querySelectorAll('.k-arrows button').forEach(function (b) {
          b.addEventListener('click', function () { var mv = Number(b.getAttribute('data-mv')); var i = state.order.indexOf(k), j = i + mv; if (j < 0 || j >= state.order.length) return; state.order.splice(i, 1); state.order.splice(j, 0, k); draw(); });
        });
        var hd = row.querySelector('.k-handle');
        hd.addEventListener('pointerdown', function (ev) {
          ev.preventDefault(); try { hd.setPointerCapture(ev.pointerId); } catch (e) {}
          row.classList.add('k-lift');
          function onMove(e2) {
            var y = e2.clientY, list = rowsOf(), i = list.indexOf(row);
            if (i > 0) { var pr = list[i - 1].getBoundingClientRect(); if (y < pr.top + pr.height / 2) { row.parentNode.insertBefore(row, list[i - 1]); return; } }
            if (i < list.length - 1) { var nr = list[i + 1].getBoundingClientRect(); if (y > nr.top + nr.height / 2) { row.parentNode.insertBefore(list[i + 1], row); } }
          }
          function onUp() {
            hd.removeEventListener('pointermove', onMove); hd.removeEventListener('pointerup', onUp); hd.removeEventListener('pointercancel', onUp);
            row.classList.remove('k-lift');
            state.order = rowsOf().map(function (r) { return r.getAttribute('data-k'); });
            if (opts.onChange) opts.onChange();
          }
          hd.addEventListener('pointermove', onMove); hd.addEventListener('pointerup', onUp); hd.addEventListener('pointercancel', onUp);
        });
      });
    }
    draw();
    return { redraw: draw };
  }

  /* ---------- On hand ---------- */
  function fa2OnHand() {
    setTitle('On hand', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2OnHand)) return; fa2Wide(true);
    CC.view = 'fa2onhand';
    fa2KitCss();
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">On hand</h2>' +
        '<div class="cc-sub">First to expire on top. Usage and send-backs come off automatically.</div>' +
        '<input id="fa2-q" class="cc-in" placeholder="Search ref, lot, or description">' +
        '<div id="fa2-list">' + skel(4) + '</div>' +
      '</div>');
    fa2RefreshWire(function () { return fa2OnHandLoad(true); });
    document.getElementById('fa2-q').addEventListener('input', fa2OnHandDraw);
    fa2OnHandLoad(false);
  }
  function fa2OnHandLoad(force) {
    var g = ++FA2.gen;
    return fa2Load(force).then(function (d) {
      if (CC.view !== 'fa2onhand' || g !== FA2.gen) return;
      FA2.ohD = d;
      fa2OnHandDraw();
    }).catch(function () {
      if (CC.view !== 'fa2onhand' || g !== FA2.gen) return;
      var el = document.getElementById('fa2-list');
      if (el) el.innerHTML = '<div class="cc-empty">Couldn\u2019t reach the server \u2014 check signal and try again.</div>';
    });
  }
  function fa2OnHandDraw() {
    var el = document.getElementById('fa2-list'); if (!el || !FA2.ohD) return;
    var q = (document.getElementById('fa2-q') || {}).value || '';
    var rows = (FA2.ohD.master || []).filter(function (r) { return fa2Num(r[MC.qty]) > 0 && kitMatch(q, [r[MC.ref], r[MC.desc], r[MC.lot]]); });
    if (!rows.length) { el.innerHTML = q ? emptyHTML('', 'No matches', 'Try a shorter ref or lot fragment.') : emptyHTML('&#x2705;', 'Nothing on hand', 'Every lot handed to the F&A team has been used, returned or sent back.'); return; }
    rows = fa2BandSort(rows);
    var html = '', last = -1;
    rows.forEach(function (r) {
      var b = fa2RowBand(r);
      if (b !== last) { html += '<div class="fa2-eyebrow ' + FA2_BAND_CLS[b] + '">' + FA2_BAND_NAMES[b] + '</div>'; last = b; }
      html +=
          '<div class="f2c">' +
            '<div class="f2top"><b>' + esc(r[MC.ref]) + '</b>' + fa2RowChip(r) + '</div>' +
            (r[MC.desc] ? '<div class="f2desc">' + esc(r[MC.desc]) + '</div>' : '') +
            '<div class="f2sub">' + (r[MC.lot] ? 'Lot ' + esc(r[MC.lot]) : 'No lot') + (r[MC.exp] ? ' \u00b7 Exp ' + esc(r[MC.exp]) : '') + (r[MC.loc] ? ' \u00b7 ' + esc(r[MC.loc]) : '') + '</div>' +
            '<div class="f2qty"><b>' + fa2Num(r[MC.qty]) + '</b> on hand</div>' +
          '</div>';
    });
    el.innerHTML = html;
  }

  /* ---------- History (+ Void on sports) ---------- */
  function fa2History() {
    setTitle('History', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2History)) return; fa2Wide(true);
    CC.view = 'fa2hist';
    fa2KitCss();
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">History</h2>' +
        '<div class="cc-sub">Grouped by event \u2014 tap any card for line detail. Corrections are new events, never edits.</div>' +
        '<div id="fa2-hf" class="hf"></div>' +
        '<div id="fa2-list">' + skel(4) + '</div>' +
      '</div>');
    fa2RefreshWire(function () { return fa2HistLoad(true); });
    fa2HistLoad(false);
  }
  function fa2HistLoad(force) {
    var pi = fa2IsFA() ? Promise.resolve(null) : fa2Call('import_list').catch(function () { return null; });
    return Promise.all([fa2Load(force), pi]).then(function (rs) {
      if (CC.view !== 'fa2hist') return;
      FA2.histD = rs[0];
      FA2.histImps = (rs[1] && rs[1].ok && rs[1].imports) || [];
      fa2HistDraw();
    }).catch(function () {
      if (CC.view !== 'fa2hist') return;
      var el = document.getElementById('fa2-list');
      if (el) el.innerHTML = '<div class="cc-empty">Couldn\u2019t reach the server \u2014 check signal and try again.</div>';
    });
  }
  function faDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return String(iso || '');
    var d = new Date(+m[1], +m[2] - 1, +m[3]), t = new Date(); t.setHours(0, 0, 0, 0);
    var diff = Math.round((t - d) / 86400000);
    if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== t.getFullYear() ? ', ' + d.getFullYear() : '');
  }
  function fa2HistNeg(ty) {
    return ty === 'Used in case' || ty === 'Returned to rep' || ty === 'Sent back to Stryker' ||
           ty === 'Returned to Stryker' || ty === 'External Transfer' || ty === 'Written Off' || ty === 'Returned to CT SM';
  }
  function fa2HistDraw() {
    var el = document.getElementById('fa2-list'); if (!el || !FA2.histD) return;
    var d = FA2.histD, L = d.ledger || [], C = d.ledgerCols || [];
    if (!L.length) { el.innerHTML = emptyHTML('&#x1F4D2;', 'No events yet', 'Drops, usage, returns and send-backs will show up here as they happen.'); return; }
    var ix = {}; C.forEach(function (n, i) { ix[n] = i; });
    function g(r, n) { return ix[n] !== undefined && r[ix[n]] !== undefined && r[ix[n]] !== null ? String(r[ix[n]]) : ''; }
    var voided = {};
    L.forEach(function (r) { if (g(r, 'Type') === 'Void' && g(r, 'Reverses')) voided[g(r, 'Reverses')] = 1; });
    var groups = [], byKey = {};
    L.forEach(function (r) {
      var ty = g(r, 'Type');
      var key = (g(r, 'OpId') || ('e:' + g(r, 'EventId'))) + '\u0001' + ty;
      var grp = byKey[key];
      if (!grp) {
        grp = byKey[key] = {
          key: key, ty: ty,
          date: g(r, 'EventDate') || g(r, 'Timestamp').slice(0, 10),
          ts: g(r, 'Timestamp'),
          from: g(r, 'From') || fa2PersonName(g(r, 'EnteredBy')),
          to: g(r, 'DropName') || g(r, 'ReceivedBy') || g(r, 'Facility') || '',
          drop: g(r, 'DropName'), fromRaw: g(r, 'From'), rb: g(r, 'ReceivedBy'), acc: g(r, 'AccountName'), accl: g(r, 'AccountLocation'), note: g(r, 'Note'),
          po: g(r, 'CasePO'), fac: g(r, 'Facility'), sur: g(r, 'Surgeon'), dos: g(r, 'DOS'), pid: g(r, 'PatientId'),
          bo: g(r, 'CaseBO'), reason: g(r, 'Reason'), track: g(r, 'Tracking'), by: fa2PersonName(g(r, 'EnteredBy')),
          rows: [], units: 0
        };
        groups.push(grp);
      }
      var q = fa2Num(g(r, 'Qty'));
      var eid = g(r, 'EventId');
      grp.rows.push({ eid: eid, ref: g(r, 'Ref'), desc: g(r, 'Description'), lot: g(r, 'Lot'), exp: g(r, 'Exp'), qty: q, ty: ty, voided: !!voided[eid], reverses: g(r, 'Reverses'), flags: g(r, 'Flags') });
      if (!voided[eid] && ty !== 'Void') grp.units += q;
    });
    // Bill-only imports that were reviewed (approved / denied / lines skipped as not-F&A) or auto-applied
    (FA2.histImps || []).filter(function (x) { return x.outcome && x.outcome !== 'pending' && x.outcome !== 'revised-pending' && x.outcome !== 'duplicate' && x.outcome !== 'ignored-not-a-bo'; }).slice(0, 40).forEach(function (x) {
      var hdr = (x.detail && x.detail.hdr) || {}, lines = (x.detail && x.detail.lines) || [];
      var ts = String(x.resolvedAt || x.reviewedAt || x.updatedAt || x.ts || '');
      var by = x.resolver || x.resolvedBy || x.reviewer || x.by || '';
      var skipped = lines.filter(function (L) { return L.skipped; }).length;
      var issues = lines.filter(function (L) { return L.issue && !L.skipped; }).length;
      var tot = fa2ImpTotal(x);
      groups.push({ imp: true, outcome: x.outcome, ts: ts, date: ts.slice(0, 10),
        ty: 'Bill only ' + (x.outcome === 'auto' ? 'auto-applied' : x.outcome === 'approved' ? 'approved' : x.outcome === 'denied' ? 'denied' : String(x.outcome)),
        bits: [ts.slice(0, 10), x.bo || '(no BO)', hdr.facility, hdr.surgeon, by ? 'by ' + by : '', tot != null ? fa2Money(tot) : '', skipped ? skipped + ' marked not F&A stock' : '', issues ? issues + ' issue' + (issues > 1 ? 's' : '') : ''].filter(Boolean),
        rows: lines.map(function (L) { return { ref: L.refRaw || L.ref || '', desc: L.desc || '', lot: L.lot || '', qty: fa2Num(L.qty), skipped: !!L.skipped, issue: L.issue || '', resolved: !!L.resolve }; }),
        units: lines.filter(function (L) { return !L.skipped; }).reduce(function (a, L) { return a + fa2Num(L.qty); }, 0) });
    });
    groups.sort(function (x, y) { return x.ts < y.ts ? 1 : x.ts > y.ts ? -1 : 0; });
    var canFix = !fa2IsFA();
    // filters: type chips, who chips, free text over ref/desc/lot/BO/tracking; day separators
    var HF = FA2.hf = FA2.hf || { ty: '', who: '', q: '' };
    var tys = [], whos = [];
    groups.forEach(function (g2) { var tn = g2.imp ? 'Bill only' : g2.ty; if (tys.indexOf(tn) < 0) tys.push(tn); if (g2.by && whos.indexOf(g2.by) < 0) whos.push(g2.by); });
    var hf = document.getElementById('fa2-hf');
    if (hf && !hf.dataset.wired) {
      hf.dataset.wired = '1';
      hf.innerHTML = '<input id="hf-q" class="cc-in" placeholder="Search ref, lot, description, BO or tracking" value="' + esc(HF.q) + '">' +
        fa2Chips('hf-ty', ['All'].concat(tys), HF.ty || 'All') + (whos.length > 1 ? fa2Chips('hf-who', ['Anyone'].concat(whos), HF.who || 'Anyone') : '');
      document.getElementById('hf-q').addEventListener('input', function () { HF.q = this.value; fa2HistDraw(); });
      fa2ChipWire('hf-ty', function (v) { HF.ty = v === 'All' ? '' : v; fa2HistDraw(); });
      fa2ChipWire('hf-who', function (v) { HF.who = v === 'Anyone' ? '' : v; fa2HistDraw(); });
    }
    var qn = nrm(HF.q);
    var shown = groups.filter(function (g2) {
      var tn = g2.imp ? 'Bill only' : g2.ty;
      if (HF.ty && tn !== HF.ty) return false;
      if (HF.who && g2.by !== HF.who) return false;
      if (!qn) return true;
      var hay = nrm([g2.bo, g2.track, g2.to, g2.from, g2.reason].concat(g2.rows.map(function (x) { return [x.ref, x.desc, x.lot].join(' '); })).join(' '));
      return hay.indexOf(qn) > -1;
    });
    FA2.histGroups = groups;
    if (!shown.length) { el.innerHTML = emptyHTML('', 'Nothing matches', 'Clear a filter or shorten the search.'); return; }
    var lastDay = '';
    el.innerHTML = shown.map(function (grp) {
      var gi = groups.indexOf(grp);
      var dayH = grp.date && grp.date !== lastDay ? '<div class="h-day">' + esc(faDay(grp.date)) + '</div>' : '';
      lastDay = grp.date || lastDay;
      return dayH + histCard(grp, gi);
    }).join('');
    function histCard(grp, gi) {
      if (grp.imp) {
        var applied = grp.outcome === 'approved' || grp.outcome === 'auto';
        var ipc = grp.outcome === 'denied' ? 'bad' : applied ? 'ok' : 'wait';
        var ilines = grp.rows.map(function (x) {
          return '<div class="h-ln' + (x.skipped ? ' h-dim' : '') + '"><span class="h-lref"><b>' + esc(x.ref || '\u2014') + '</b>' +
            '<span>' + (x.lot ? 'Lot ' + esc(x.lot) : 'No lot') + (x.desc ? ' \u00b7 ' + esc(x.desc) : '') + (x.skipped ? ' \u00b7 SKIPPED \u2014 not F&A stock' : '') + (x.issue ? ' \u00b7 ' + esc(x.issue) + (x.resolved ? ' (resolved)' : '') : '') + '</span></span>' +
            '<span class="h-cnt">' + (x.skipped ? 'skip' : (applied ? '\u2212' : '\u00d7') + Math.abs(x.qty)) + '</span></div>';
        }).join('');
        return '<div class="h-ev' + (grp.outcome === 'denied' ? ' h-dim' : '') + '" data-g="' + gi + '">' +
          '<div class="h-top"><span class="h-ty">' + esc(grp.ty) + '</span><span class="cc-pill ' + ipc + '">' + (grp.outcome === 'denied' ? 'DENIED' : applied ? '\u2212' + grp.units : esc(String(grp.outcome).toUpperCase())) + '</span></div>' +
          '<div class="h-sub">' + esc(grp.bits.join(' \u00b7 ')) + ' \u00b7 ' + grp.rows.length + ' line' + (grp.rows.length === 1 ? '' : 's') + '</div>' +
          '<div class="h-lines" hidden>' + ilines + '</div>' +
        '</div>';
      }
      var neg = fa2HistNeg(grp.ty);
      var sign = grp.ty === 'Void' ? '' : (grp.ty === 'Adjustment' ? (grp.units < 0 ? '\u2212' : '+') : (neg ? '\u2212' : '+'));
      var pc = grp.ty === 'Void' ? '' : (grp.ty === 'Adjustment' ? 'busy' : (neg ? 'bad' : 'ok'));
      var allVoid = grp.rows.every(function (x) { return x.voided; });
      var bits = [grp.date];
      if (grp.from) bits.push(grp.from + (grp.to ? ' \u2192 ' + grp.to : ''));
      else if (grp.to) bits.push(grp.to);
      if (grp.bo) bits.push(grp.bo);
      if (grp.track) bits.push('Tracking ' + grp.track);
      if (grp.reason) bits.push(grp.reason);
      var lines = grp.rows.map(function (x) {
        return '<div class="h-ln' + (x.voided ? ' h-dim' : '') + '">' +
          '<span class="h-lref"><b>' + esc(x.ref || (x.ty === 'Void' ? 'Void of ' + x.reverses.slice(0, 8) : '\u2014')) + '</b>' +
          '<span>' + (x.lot ? 'Lot ' + esc(x.lot) : 'No lot') + (x.exp ? ' \u00b7 Exp ' + esc(x.exp) : '') + (x.desc ? ' \u00b7 ' + esc(x.desc) : '') + (x.voided ? ' \u00b7 VOIDED' : '') + (x.flags ? ' \u00b7 ' + esc(x.flags) : '') + '</span></span>' +
          '<span class="h-cnt">' + (x.ty === 'Void' ? 'void' : (neg ? '\u2212' : '+') + Math.abs(x.qty)) +
            (canFix && !x.voided && x.ty !== 'Void' && x.eid ? ' <button type="button" class="cc-link h-fix" data-eid="' + esc(x.eid) + '">File Correction</button>' : '') +
          '</span>' +
        '</div>';
      }).join('');
      return '<div class="h-ev' + (allVoid ? ' h-dim' : '') + '" data-g="' + gi + '">' +
        '<div class="h-top"><span class="h-ty">' + esc(grp.ty) + '</span>' +
          '<span class="cc-pill ' + pc + '">' + (grp.ty === 'Void' ? 'VOID' : sign + Math.abs(grp.units)) + '</span></div>' +
        '<div class="h-sub">' + esc(bits.join(' \u00b7 ')) + ' \u00b7 ' + grp.rows.length + ' line' + (grp.rows.length > 1 ? 's' : '') +
          (canFix && !allVoid && grp.ty === 'Received' ? ' \u00b7 <button type="button" class="cc-link h-gfix" data-g="' + gi + '">Edit drop details</button>' : '') + '</div>' +
        '<div class="h-lines" hidden>' + lines + '</div>' +
      '</div>';
    }
    // The read is capped; once the ledger is longer than the window, offer the rest.
    var lim = FA2.readLimit || 300;
    if (L.length >= lim) el.innerHTML += '<button type="button" id="fa2-more" class="cc-mini">Show older events</button>';
    FA2.histGroups = groups;
    el.onclick = function (e) {
      var mo = e.target.closest ? e.target.closest('#fa2-more') : null;
      if (mo) { mo.disabled = true; mo.textContent = 'Loading\u2026'; FA2.readLimit = Math.min(lim * 3, 6000); fa2CacheKill(); fa2HistLoad(true); return; }
      var fx = e.target.closest ? e.target.closest('.h-fix') : null;
      if (fx) { e.stopPropagation(); fa2Correct(fx.dataset.eid); return; }
      var gx = e.target.closest ? e.target.closest('.h-gfix') : null;
      if (gx) { e.stopPropagation(); fa2DropFix(+gx.dataset.g); return; }
      var card = e.target.closest ? e.target.closest('.h-ev') : null; if (!card) return;
      var ln = card.querySelector('.h-lines');
      ln.hidden = !ln.hidden; card.classList.toggle('open', !ln.hidden);
    };
  }
  // Re-file every live line of a drop with corrected who/where/from - the phone-side answer
  // to "she picked the wrong location for the whole scan session". Same Void + replacement
  // pattern as File Correction, so the Ledger stays append-only and Master rebuilds correctly.
  function fa2DropFix(gi) {
    var grp = (FA2.histGroups || [])[gi]; if (!grp || grp.ty !== 'Received') return;
    var live = grp.rows.filter(function (x) { return !x.voided && x.ty === 'Received' && x.eid; });
    if (!live.length) return;
    var units = 0; live.forEach(function (x) { units += Math.abs(x.qty); });
    var rbOpts = fa2Teams('fa').concat(['Bloomfield Warehouse', 'Account']);
    var fromOpts = fa2Teams('sports').concat(['Territory Transfer', 'Other']);
    var curFrom = String(grp.fromRaw || ''), curRb = String(grp.rb || '');
    var fromSel = fromOpts.indexOf(curFrom) > -1 ? curFrom : (/^Territory Transfer/i.test(curFrom) ? 'Territory Transfer' : (curFrom ? 'Other' : ''));
    var fromDetail = fromSel === 'Territory Transfer' ? curFrom.replace(/^Territory Transfer\s*[\u2014\-:]?\s*/i, '') : (fromSel === 'Other' ? curFrom : '');
    var rbSel = grp.acc ? 'Account' : curRb;
    if (rbSel && rbOpts.indexOf(rbSel) < 0) rbOpts.unshift(rbSel);
    var wrap = document.createElement('div');
    wrap.className = 'fa2-modal';
    wrap.innerHTML =
      '<div class="fa2-mcard" style="max-height:85vh;overflow:auto">' +
        '<div class="fa2-t">Edit drop details</div>' +
        '<div class="fa2-s" style="margin:6px 0 10px">' + esc(grp.date) + ' \u00b7 ' + live.length + ' line' + (live.length === 1 ? '' : 's') + ' \u00b7 ' + units + ' unit' + (units === 1 ? '' : 's') + '. Every line in this drop is re-filed with the details below; the originals stay in History as voided.</div>' +
        '<label class="a2f" for="gf-drop"><span class="a2fl">Drop name</span><input id="gf-drop" class="cc-in" value="' + esc(grp.drop || '') + '"></label>' +
        '<div class="fa2-lab">Received by</div>' + fa2Chips('gf-rb', rbOpts, rbSel) +
        '<div id="gf-acc"' + (rbSel === 'Account' ? '' : ' hidden') + '>' +
          '<input id="gf-accn" class="cc-in" placeholder="Account name (required)" value="' + esc(grp.acc || '') + '">' +
          '<input id="gf-accl" class="cc-in" placeholder="Where at the account? (required)" value="' + esc(grp.accl || '') + '">' +
        '</div>' +
        '<div class="fa2-lab">From</div>' + fa2Chips('gf-from', fromOpts, fromSel) +
        '<input id="gf-fromo" class="cc-in" placeholder="' + esc(fa2FromPh(fromSel)) + '" value="' + esc(fromDetail) + '"' + (fa2FromNeeds(fromSel) ? '' : ' hidden') + '>' +
        '<label class="a2f" for="gf-why"><span class="a2fl">Why</span><input id="gf-why" class="cc-in" placeholder="Explanation (required)"></label>' +
        '<div id="gf-err" class="cc-err" hidden></div>' +
        '<div class="fa2-mrow"><button type="button" id="gf-cancel" class="cc-mini">Cancel</button><button type="button" id="gf-go" class="cc-btn">Re-file ' + live.length + ' line' + (live.length === 1 ? '' : 's') + '</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var sel = { rb: rbSel, from: fromSel };
    fa2ChipWire('gf-rb', function (v) { sel.rb = v; document.getElementById('gf-acc').hidden = v !== 'Account'; });
    fa2ChipWire('gf-from', function (v) { sel.from = v; var fo = document.getElementById('gf-fromo'); fo.placeholder = fa2FromPh(v); fo.hidden = !fa2FromNeeds(v); });
    document.getElementById('gf-cancel').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('gf-go').addEventListener('click', function () {
      var drop = document.getElementById('gf-drop').value.trim();
      var accn = document.getElementById('gf-accn').value.trim(), accl = document.getElementById('gf-accl').value.trim();
      var detail = document.getElementById('gf-fromo').value.trim();
      var why = document.getElementById('gf-why').value.trim();
      if (!drop) return fa2Err('gf-err', 'Give the drop a name.');
      if (!sel.rb) return fa2Err('gf-err', 'Pick who received it.');
      if (sel.rb === 'Account' && (!accn || !accl)) return fa2Err('gf-err', 'Account name and location are required.');
      if (!sel.from) return fa2Err('gf-err', 'Pick who it came from.');
      if (sel.from === 'Territory Transfer' && !detail) return fa2Err('gf-err', 'Territory received from is required.');
      if (sel.from === 'Other' && !detail) return fa2Err('gf-err', 'Add a note saying where it came from.');
      if (!why) return fa2Err('gf-err', 'Add a short explanation.');
      var from = fa2FromValue({ from: sel.from, fromOther: detail });
      var receivedBy = sel.rb === 'Account' ? accn : sel.rb;
      var evs = [];
      live.forEach(function (row) {
        evs.push({ type: 'Void', reverses: row.eid, ref: row.ref, lot: row.lot, reason: 'Drop details corrected: ' + why, enteredBy: fa2Who(), entryMethod: 'manual' });
        var r2 = { type: 'Received', ref: row.ref, desc: row.desc, lot: row.lot, exp: row.exp, qty: Math.abs(row.qty),
          dropName: drop, from: from, receivedBy: receivedBy, accountName: sel.rb === 'Account' ? accn : '', accountLocation: sel.rb === 'Account' ? accl : '',
          reason: 'Correction: ' + why, linkedTo: row.eid, flags: 'Corrected', entryMethod: 'manual', enteredBy: fa2Who() };
        if (grp.note) r2.note = grp.note;
        if (grp.date) r2.eventDate = grp.date;
        evs.push(r2);
      });
      var btn = document.getElementById('gf-go');
      fa2Submit(evs, 'dropfix-' + gi + '-' + (grp.ts || ''), btn)
        .then(function () { wrap.remove(); kitBanner(document.querySelector('.cc-card'), 'Drop re-filed \u2014 ' + live.length + ' line' + (live.length === 1 ? '' : 's')); fa2HistLoad(true); })
        .catch(function (e) { fa2Err('gf-err', fa2FailMsg(e, 'Couldn\u2019t save \u2014 try again.')); btn.disabled = false; btn.textContent = 'Re-file ' + live.length + ' line' + (live.length === 1 ? '' : 's'); });
    });
  }
  function fa2Correct(eid) {
    var grps = FA2.histGroups || [], row = null, grp = null;
    grps.forEach(function (G) { G.rows.forEach(function (x) { if (x.eid === eid) { row = x; grp = G; } }); });
    if (!row) return;
    var wrap = document.createElement('div');
    wrap.className = 'fa2-modal';
    wrap.innerHTML =
      '<div class="fa2-mcard">' +
        '<div class="fa2-t">File Correction</div>' +
        '<div class="fa2-s" style="margin:6px 0 10px">' + esc(row.ty) + ' \u00b7 ' + esc(row.ref) + ' \u00b7 Lot ' + esc(row.lot) + ' \u00b7 qty ' + Math.abs(row.qty) + '</div>' +
        '<div class="fa2-lab">What to do</div>' + fa2Chips('fc-mode', ['Correct details', 'Void entirely'], 'Correct details') +
        '<div id="fc-fields">' +
          '<label class="a2f" for="fc-ref"><span class="a2fl">REF</span><input id="fc-ref" class="cc-in" value="' + esc(row.ref) + '"></label>' +
          '<label class="a2f" for="fc-lot"><span class="a2fl">LOT</span><input id="fc-lot" class="cc-in" value="' + esc(row.lot) + '"></label>' +
          '<div class="fa2-2col">' +
            '<label class="a2f" for="fc-exp"><span class="a2fl">Expiration</span><input id="fc-exp" class="cc-in" inputmode="numeric" value="' + esc(expIso(row.exp) || row.exp || '') + '"></label>' +
            '<label class="a2f" for="fc-qty"><span class="a2fl">QTY</span><input id="fc-qty" class="cc-in" type="number" min="1" inputmode="numeric" value="' + Math.abs(row.qty) + '"></label>' +
          '</div>' +
          '<div id="fc-warn" class="cc-sub2" hidden></div>' +
        '</div>' +
        '<input id="fc-why" class="cc-in" placeholder="Explanation (required)">' +
        '<div id="fc-err" class="cc-err" hidden></div>' +
        '<div class="fa2-mrow"><button type="button" id="fc-cancel" class="cc-mini">Cancel</button><button type="button" id="fc-go" class="cc-btn">Save correction</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var mode = 'Correct details';
    fa2ChipWire('fc-mode', function (v) { mode = v; document.getElementById('fc-fields').hidden = (v === 'Void entirely'); });
    // Corrections change stock the same way the original event did. Warn (but
    // never block) when the new number would drive this lot below zero — the
    // ledger stays honest, the operator just needs to know.
    function fcWarn() {
      var w = document.getElementById('fc-warn'); if (!w) return;
      var neg = fa2HistNeg(row.ty);
      if (!neg) { w.hidden = true; return; }
      var onhand = 0, d = FA2.histD || FA2.ohD;
      var ref = document.getElementById('fc-ref').value.trim().toUpperCase();
      var lot = document.getElementById('fc-lot').value.trim().toUpperCase();
      ((d && d.master) || []).forEach(function (r) {
        if (String(r[MC.ref]).toUpperCase() === ref && String(r[MC.lot]).toUpperCase() === lot) onhand += fa2Num(r[MC.qty]);
      });
      var q = +document.getElementById('fc-qty').value || 0;
      var avail = onhand + Math.abs(row.qty);
      if (q > avail) { w.hidden = false; w.textContent = 'Heads up: ' + q + ' is more than the ' + avail + ' this lot can cover \u2014 it will go to zero and the extra won\u2019t show on hand.'; }
      else w.hidden = true;
    }
    ['fc-ref', 'fc-lot', 'fc-qty'].forEach(function (id) { document.getElementById(id).addEventListener('input', fcWarn); });
    // whatever they type, it settles into the standard as soon as they leave the field
    document.getElementById('fc-exp').addEventListener('change', function (e) {
      var p = expIso(e.target.value); if (p) e.target.value = p;
    });
    fcWarn();
    document.getElementById('fc-cancel').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('fc-go').addEventListener('click', function () {
      var why = document.getElementById('fc-why').value.trim();
      if (!why) return fa2Err('fc-err', 'An explanation is required.');
      var evs = [{ type: 'Void', reverses: eid, ref: row.ref, lot: row.lot, reason: why, enteredBy: fa2Who(), entryMethod: 'manual' }];
      if (mode === 'Correct details') {
        var ref = document.getElementById('fc-ref').value.trim();
        var lot = document.getElementById('fc-lot').value.trim();
        var qty = +document.getElementById('fc-qty').value || 0;
        var expRaw = document.getElementById('fc-exp').value.trim();
        var exp = expIso(expRaw);
        if (!ref) return fa2Err('fc-err', 'REF is required.');
        if (!lot) return fa2Err('fc-err', 'LOT is required.');
        if (qty < 1) return fa2Err('fc-err', 'Qty must be at least 1.');
        if (row.ty === 'Received' && !expRaw) return fa2Err('fc-err', 'Expiration is required.');
        if (expRaw && !exp) return fa2Err('fc-err', 'Couldn\u2019t read that expiration \u2014 try 2030-01-01, 1/1/2030, 01/2030 or JAN 2030.');
        if (exp) document.getElementById('fc-exp').value = exp;
        var rep = { type: row.ty, ref: ref, desc: row.desc, lot: lot, exp: exp || row.exp, qty: qty,
          reason: 'Correction: ' + why, linkedTo: eid, flags: 'Corrected', entryMethod: 'manual', enteredBy: fa2Who() };
        if (grp) {
          // carry the original event's own fields, not the display fallbacks
          if (grp.bo) rep.caseBO = grp.bo;
          if (grp.ty === 'Received') { rep.dropName = grp.drop; rep.from = grp.fromRaw; rep.receivedBy = grp.rb; if (grp.acc) rep.accountName = grp.acc; if (grp.accl) rep.accountLocation = grp.accl; }
          else if (grp.rb) rep.receivedBy = grp.rb;
          if (grp.ty === 'Used in case') { rep.casePO = grp.po; rep.facility = grp.fac; rep.surgeon = grp.sur; rep.dos = grp.dos; rep.patientId = grp.pid; }
          if (grp.note) rep.note = grp.note;
          if (grp.track) rep.tracking = grp.track;
          if (grp.date) rep.eventDate = grp.date;
        }
        evs.push(rep);
      }
      var btn = document.getElementById('fc-go');
      fa2Submit(evs, 'fix-' + eid, btn)
        .then(function () { wrap.remove(); kitBanner(document.querySelector('.cc-card'), mode === 'Void entirely' ? 'Entry voided' : 'Correction filed'); fa2HistLoad(true); })
        .catch(function (e) { fa2Err('fc-err', fa2FailMsg(e, 'Couldn\u2019t save \u2014 try again.')); btn.disabled = false; btn.textContent = 'Save correction'; });
    });
  }

  /* ---------- Add inventory (drop) ---------- */
  // A bare type=date renders empty until it is tapped, and a number input never shows
  // its placeholder once it has a value — so both fields get a visible label, and the
  // date is pre-filled with today (editable) rather than looking broken.
  function fa2ExpQtyRow(expId, qtyId, expVal, qtyVal) {
    return '<div class="fa2-2col">' +
        '<label class="a2f" for="' + expId + '"><span class="a2fl">Expiration</span>' +
          '<input id="' + expId + '" class="cc-in" type="date"' + (expVal === undefined ? ' data-def="1"' : '') + ' value="' + esc(expVal === undefined ? fa2Today() : (expVal || '')) + '"></label>' +
        '<label class="a2f" for="' + qtyId + '"><span class="a2fl">QTY</span>' +
          '<input id="' + qtyId + '" class="cc-in" type="number" min="1" inputmode="numeric" value="' + esc(String(qtyVal === undefined ? 1 : qtyVal)) + '"></label>' +
      '</div>';
  }
  // A date input only accepts YYYY-MM-DD; a scanned YYYY-MM becomes the end of that
  // month, which is exactly how the hub reads it.
  function fa2DateVal(e) { var n = expNorm(e); return /^\d{4}-\d{2}-\d{2}$/.test(n) ? n : ''; }
  // The field itself carries the status: red = today or already past, amber = inside
  // 3 months, green = good. Same bands the On hand list uses.
  function fa2ExpWire(expId) {
    var el = document.getElementById(expId);
    if (!el) return;
    function chk() {
      var v = el.value;
      el.classList.remove('x-bad', 'x-warn', 'x-ok');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      el.classList.add(v <= fa2Today() ? 'x-bad' : expBand4(v) <= 2 ? 'x-warn' : 'x-ok');
    }
    function touched() { delete el.dataset.def; delete el.dataset.ack; chk(); }
    if (!el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('input', touched); el.addEventListener('change', touched); }
    chk();
  }
  // Manual dates: the untouched today-default is never a real expiry, and a date that
  // is today or already past has to be asked for twice.
  function fa2ExpGate(expId, errId, again) {
    var el = document.getElementById(expId); if (!el) return true;
    var v = el.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { fa2Err(errId, 'Pick a full expiration date (day, month, year).'); return false; }
    if (el.dataset.def) { fa2Err(errId, 'Set the expiration date \u2014 it\u2019s still today\u2019s date.'); return false; }
    if (v <= fa2Today() && el.dataset.ack !== v) { el.dataset.ack = v; fa2Err(errId, 'That date is today or already past \u2014 tap ' + again + ' again to file it as expired.'); return false; }
    return true;
  }
  function fa2ExpReset(expId) {
    var el = document.getElementById(expId); if (!el) return;
    el.value = fa2Today(); el.dataset.def = '1'; delete el.dataset.ack;
    fa2ExpWire(expId);
  }
  function fa2Add() {
    setTitle('Add inventory', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Add)) return; fa2Wide(true);
    CC.view = 'fa2add';
    fa2KitCss();
    if (!FA2.form || FA2.form.kind !== 'add') {
      var dr = fa2DraftGet();
      if (dr && dr.form && dr.form.kind === 'add') { FA2.form = dr.form; FA2.a2 = (dr.a2 && dr.a2.order) ? dr.a2 : { items: {}, order: [] }; FA2.resumed = true; }
      else { FA2.form = { kind: 'add', drop: '', date: fa2Today(), from: '', fromOther: '', rb: '', accName: '', accLoc: '', note: '', items: [] }; FA2.a2 = { items: {}, order: [] }; FA2.resumed = false; }
    }
    var f = FA2.form;
    var nItems = (FA2.a2 && FA2.a2.order) ? FA2.a2.order.length : 0;
    var faNames = fa2Teams('fa');
    var rbOpts = faNames.concat(['Bloomfield Warehouse', 'Account']);
    var fromNames = fa2FromNames();
    if (f.from && fromNames.indexOf(f.from) < 0 && !fa2FromNeeds(f.from)) fromNames.unshift(f.from);
    var fromOpts = fromNames.concat(['Territory Transfer', 'Other']);
    fa2Shell('Add inventory', 'Record a drop to the F&amp;A team.',
      (FA2.resumed && nItems ? '<div id="fa2-resume" class="cc-sub2 fa2-resume">Picked up where you left off \u2014 ' + nItems + ' item' + (nItems === 1 ? '' : 's') + ' still in the tray. <button type="button" id="fa2-restart" class="cc-link">Start over</button></div>' : '') +
      '<input id="fa2-drop" class="cc-in" placeholder="Drop name (e.g. Hartford office drop)" value="' + esc(f.drop) + '">' +
      '<input id="fa2-date" class="cc-in" type="date" value="' + esc(f.date) + '">' +
      '<div class="fa2-lab">From</div>' + fa2Chips('fa2-from', fromOpts, f.from) +
      '<input id="fa2-fromo" class="cc-in" placeholder="' + esc(fa2FromPh(f.from)) + '" value="' + esc(f.fromOther) + '"' + (fa2FromNeeds(f.from) ? '' : ' hidden') + '>' +
      '<div class="fa2-lab">Received by</div>' + (rbOpts.length > 2 ? '' : '<div class="cc-sub2">Tip: add F&amp;A members in Admin to pick them here.</div>') + fa2Chips('fa2-rb', rbOpts, f.rb) +
      '<div id="fa2-acc"' + (f.rb === 'Account' ? '' : ' hidden') + '>' +
        '<input id="fa2-accn" class="cc-in" placeholder="Account name (required)" value="' + esc(f.accName) + '">' +
        '<input id="fa2-accl" class="cc-in" placeholder="Where at the account? (required)" value="' + esc(f.accLoc) + '">' +
      '</div>' +
      '<input id="fa2-note" class="cc-in" placeholder="Notes" value="' + esc(f.note || '') + '">' +
      '<button id="fa2-go" class="cc-btn">' + (nItems ? 'Continue \u2014 ' + nItems + ' item' + (nItems === 1 ? '' : 's') + ' in the tray' : 'Save drop \u2014 add items') + '</button>',
      function () { return fa2Load(true).then(function () { if (CC.view === 'fa2add') fa2Add(); }); });
    var rs = document.getElementById('fa2-restart');
    if (rs) rs.addEventListener('click', function () { fa2DraftSet(null); FA2.form = null; FA2.a2 = null; FA2.resumed = false; fa2Add(); });
    var sv = fa2DraftSave;
    document.getElementById('fa2-drop').addEventListener('input', function (e) { f.drop = e.target.value; sv(); });
    ['input', 'change'].forEach(function (ev) { document.getElementById('fa2-date').addEventListener(ev, function (e) { f.date = e.target.value; sv(); }); });
    fa2ChipWire('fa2-from', function (v) { f.from = v; var fo = document.getElementById('fa2-fromo'); fo.placeholder = fa2FromPh(v); fo.hidden = !fa2FromNeeds(v); sv(); });
    fa2ChipWire('fa2-rb', function (v) { f.rb = v; document.getElementById('fa2-acc').hidden = v !== 'Account'; sv(); });
    document.getElementById('fa2-fromo').addEventListener('input', function (e) { f.fromOther = e.target.value; sv(); });
    document.getElementById('fa2-accn').addEventListener('input', function (e) { f.accName = e.target.value; sv(); });
    document.getElementById('fa2-accl').addEventListener('input', function (e) { f.accLoc = e.target.value; sv(); });
    document.getElementById('fa2-note').addEventListener('input', function (e) { f.note = e.target.value; sv(); });
    document.getElementById('fa2-go').addEventListener('click', function () {
      var detail = String(f.fromOther || '').trim();
      if (!f.drop.trim()) return fa2Err('fa2-err', 'Give the drop a name.');
      if (!f.from) return fa2Err('fa2-err', 'Pick who it came from.');
      if (f.from === 'Territory Transfer' && !detail) return fa2Err('fa2-err', 'Territory received from is required.');
      if (f.from === 'Other' && !detail) return fa2Err('fa2-err', 'Add a note saying where it came from.');
      if (!f.rb) return fa2Err('fa2-err', 'Pick who received it.');
      if (f.rb === 'Account' && (!f.accName.trim() || !f.accLoc.trim())) return fa2Err('fa2-err', 'Account name and location are both required.');
      location.hash = '#/fa2/add2';
    });
  }

  /* ---------- Add inventory, step 2: scan + manual ---------- */
  function fa2DescOf(ref) {
    var e = BYPN[nrm(ref)];
    if (e === undefined) e = BYPN[nrm(ref).replace(/^0+/, '')];
    if (e === undefined) return '';
    var it = (typeof e === 'object' && e.kind)
      ? (recOf(e))
      : D.items[e];
    return it ? (it.t || it.name || '') : '';
  }
  function fa2ScanCode(txt, now) {
    if (txt === CC.cool.code && now - CC.cool.t < (CC.cool.ms || 2200)) { ccSchedule(160); return; }
    CC.cool = { code: txt, t: now, ms: 2200 };
    var r = window.__TBX_RESOLVE ? window.__TBX_RESOLVE(txt) : { sku: null, p: {} };
    var p = r.p || {};
    var lot = p.lot || '', exp = ccExp(p.exp), ref = r.sku || '', desc = '';
    if (!ref && !p.gtin && (lot || exp)) {
      ccFlashGreen();
      if (FA2.pendRef && now - FA2.pendRef.t < FA2_HELD_MS) {
        var pr = FA2.pendRef; FA2.pendRef = null; fa2HeldDraw();
        fa2ScanConfirm(pr.ref, pr.desc, lot, exp);
        return;
      }
      if (fa2AttachLE(lot, exp)) { ccBeep('ok'); ccStatus((lot ? 'Lot ' + lot : 'Expiry') + ' attached to the last item'); ccSchedule(200); return; }
      FA2.pendLE = { lot: lot, exp: exp, t: now }; fa2HeldDraw();
      fa2LotEntry(lot, exp);
      return;
    }
    if (!ref) {
      var n = nrm(txt);
      if (n.length >= 5 && n.length <= 20 && BYPN[n]) ref = skuOf(BYPN[n]);
    }
    if (!ref) { ccBeep('warn'); ccStatus('Unknown barcode \u2014 use + Manual'); ccSchedule(300); return; }
    desc = fa2DescOf(ref);
    if (FA2.pendLE && now - FA2.pendLE.t < FA2_HELD_MS) { lot = lot || FA2.pendLE.lot; exp = exp || FA2.pendLE.exp; }
    FA2.pendLE = null; FA2.pendRef = null; fa2HeldDraw();
    ccFlashGreen();
    fa2ScanConfirm(ref, desc, lot, exp);
  }
  // The count screen's per-scan sheet, shared by every F&A scanning screen: the camera
  // pauses, the item shows with its lot/expiry, a quantity is picked, Confirm adds it and
  // Cancel resumes. Confirm re-arms fast (600 ms) so the same box can be scanned again.
  function fa2ScanSheet(o) {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) { CC.running = true; ccSchedule(300); return; }
    ccModalOpen(sheet);
    FA2.sheetMax = o.max || 0;
    sheet.innerHTML =
      '<div class="cc-sh-h">' + o.title + '</div>' +
      (o.sub ? '<div class="cc-sub">' + o.sub + '</div>' : '') +
      (o.expired ? '<div class="cc-exptag">EXPIRED</div>' : '') +
      (o.fields || '') +
      (o.note ? '<div class="cc-note">' + o.note + '</div>' : '') +
      '<div class="cc-qlabel">' + esc(o.qtyLabel || 'Quantity') + '</div>' +
      '<div class="cc-qtyrow"><button id="cc-cqm" class="cc-qbtn" aria-label="Decrease">\u2212</button>' +
        '<input id="cc-cqv" class="cc-qin" type="number" inputmode="numeric" min="1" value="1">' +
        '<button id="cc-cqp" class="cc-qbtn" aria-label="Increase">+</button></div>' +
      '<div class="cc-sh-row"><button id="cc-cx" class="cc-cancel">Cancel</button><button id="cc-cok" class="cc-btn">' + esc(o.okLabel || 'Confirm') + '</button></div>';
    var qv = document.getElementById('cc-cqv');
    function cap(n) { n = Math.max(1, Math.round(+n || 1)); return FA2.sheetMax ? Math.min(FA2.sheetMax, n) : n; }
    document.getElementById('cc-cqm').onclick = function () { qv.value = Math.max(1, (+qv.value || 1) - 1); };
    document.getElementById('cc-cqp').onclick = function () { qv.value = cap((+qv.value || 0) + 1); };
    function resume(ms) { ccModalClose(sheet); CC.running = true; ccSchedule(ms || 220); }
    document.getElementById('cc-cok').onclick = function () {
      var q = cap(qv.value);
      if (o.onOk(q) === false) return;
      resume(220); ccRearm(600);
    };
    document.getElementById('cc-cx').onclick = function () {
      resume(300); ccRearm(2200); ccStatus('Cancelled \u2014 keep scanning');
      if (o.onCancel) o.onCancel();
    };
  }
  function fa2ScanConfirm(ref, desc, lot, exp) {
    var had = FA2.a2.items[ref + '\u0001' + (lot || '')];
    ccBeep(ccIsExpired(exp) ? 'expired' : (had ? 'dup' : 'ok'));
    try { navigator.vibrate && navigator.vibrate(had ? [30, 60, 30] : 35); } catch (e) {}
    fa2ScanSheet({
      title: esc(ref) + (desc ? ' \u2014 ' + esc(desc) : ''),
      sub: (lot ? 'Lot ' + esc(lot) : '<b>No lot on this barcode</b>') + (exp ? ' \u00b7 Exp ' + esc(exp) : ' \u00b7 <b>no expiration on this barcode</b>') +
           ((lot && exp) ? '' : '<br>Type what\u2019s on the box, or Cancel and scan the lot barcode first \u2014 it can\u2019t be added without both.'),
      expired: ccIsExpired(exp),
      fields: (lot ? '' : '<input id="cc-clot" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Lot from the box (required)">') +
              (exp ? '' : '<label class="a2f"><span class="a2fl">Expiration (required)</span><input id="cc-cexp" class="cc-in" type="date"></label>') +
              ((lot && exp) ? '' : '<button type="button" id="cc-cscan" class="cc-mini">Scan the lot barcode instead</button><div id="cc-cerr" class="cc-err" hidden></div>'),
      note: had ? 'Already in list: <b>' + had.qty + '</b> \u00b7 this adds on top' : '',
      qtyLabel: had ? 'Add quantity' : 'Quantity',
      onOk: function (q) {
        var lv = document.getElementById('cc-clot'), xv = document.getElementById('cc-cexp');
        var useLot = lot || (lv ? lv.value.trim() : '');
        if (!useLot) { if (lv) { lv.classList.add('cc-need'); try { lv.focus(); } catch (e) {} } fa2Err('cc-cerr', 'Lot is required.'); return false; }
        if (!exp && !fa2ExpGate('cc-cexp', 'cc-cerr', 'Confirm')) { if (xv) xv.classList.add('cc-need'); return false; }
        var useExp = exp || xv.value;
        fa2AddItem({ ref: ref, desc: desc, lot: useLot, exp: useExp, qty: q }, true);
        ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + ' \u00b7 Lot ' + useLot);
      }
    });
    if (document.getElementById('cc-cexp')) fa2ExpWire('cc-cexp');
    var scb = document.getElementById('cc-cscan');
    if (scb) scb.addEventListener('click', function () {
      // hold the product for two minutes; the lot label scanned next completes it
      FA2.pendRef = { ref: ref, desc: desc, t: Date.now() }; FA2.pendLE = null; fa2HeldDraw();
      document.getElementById('cc-cx').click();
      ccStatus(ref + ' held \u2014 now scan its lot barcode');
    });
    ['cc-clot', 'cc-cexp'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('input', function () { el.classList.remove('cc-need'); var er = document.getElementById('cc-cerr'); if (er) er.hidden = true; }); });
  }
  // Lot barcode before its product: the count screen's "Lot barcode" sheet. Type the
  // part number, or Cancel and scan the product barcode next - the lot stays held.
  function fa2LotEntry(lot, exp) {
    ccBeep(ccIsExpired(exp) ? 'expired' : 'dup');
    fa2ScanSheet({
      title: 'Lot barcode',
      sub: (lot ? 'Lot ' + esc(lot) : 'No lot') + (exp ? ' \u00b7 Exp ' + esc(exp) : ''),
      expired: ccIsExpired(exp),
      fields: '<div class="cc-sub2">No part number on this barcode \u2014 scan the product barcode next, or type it from the box.</div>' +
              '<input id="cc-lpn" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Part number (required)">' +
              (lot ? '' : '<input id="cc-llot" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Lot from the box (required)">') +
              (exp ? '' : '<label class="a2f"><span class="a2fl">Expiration (required)</span><input id="cc-lexp" class="cc-in" type="date"></label>') +
              '<div id="cc-lerr" class="cc-err" hidden></div>',
      okLabel: 'Add',
      onOk: function (q) {
        var pn = document.getElementById('cc-lpn'), v = pn ? pn.value.trim() : '';
        if (!v) { if (pn) { pn.classList.add('cc-need'); try { pn.focus(); } catch (e) {} } fa2Err('cc-lerr', 'Part number is required.'); return false; }
        var ll = document.getElementById('cc-llot'), useLot = lot || (ll ? ll.value.trim() : '');
        if (!useLot) { if (ll) { ll.classList.add('cc-need'); try { ll.focus(); } catch (e2) {} } fa2Err('cc-lerr', 'Lot is required.'); return false; }
        if (!exp && !fa2ExpGate('cc-lexp', 'cc-lerr', 'Add')) return false;
        var useExp = exp || document.getElementById('cc-lexp').value;
        FA2.pendLE = null; fa2HeldDraw();
        fa2AddItem({ ref: v, desc: fa2DescOf(v), lot: useLot, exp: useExp, qty: q }, true);
        ccStatus('Added ' + v + (q > 1 ? ' \u00d7' + q : '') + ' \u00b7 Lot ' + useLot);
      },
      onCancel: function () { ccStatus('Lot held \u2014 now scan the product barcode'); }
    });
    if (document.getElementById('cc-lexp')) fa2ExpWire('cc-lexp');
    ['cc-lpn', 'cc-llot', 'cc-lexp'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('input', function () { el.classList.remove('cc-need'); var er = document.getElementById('cc-lerr'); if (er) er.hidden = true; }); });
  }
  // Remove / Send: the scanned product's stock rows -> the same sheet (a lot to pick when
  // the barcode had none and several are on hand, quantity capped at what is left).
  function fa2ScanPick(cands, lot, tray, addToTray) {
    var miss = function (msg) { ccBeep('warn'); return msg; };
    var ref = String(cands[0][0]), m = null;
    if (lot) {
      m = cands.filter(function (r) { return String(r[MC.lot]).toUpperCase() === String(lot).toUpperCase(); })[0];
      if (!m) return miss(ref + ' Lot ' + lot + ' isn\u2019t on hand');
    } else if (cands.length === 1) { m = cands[0]; }
    function have(r) { var k = r[MC.ref] + '\u0001' + r[MC.lot]; return tray.items[k] ? tray.items[k].qty : 0; }
    function left(r) { return fa2Num(r[MC.qty]) - have(r); }
    if (m && left(m) <= 0) return miss(ref + ' \u2014 all ' + fa2Num(m[4]) + ' already selected');
    var opts = cands.filter(function (r) { return left(r) > 0; });
    if (!m && !opts.length) return miss(ref + ' \u2014 everything on hand is already selected');
    var cur = m || opts[0], pick = !m && opts.length > 1;
    ccFlashGreen();
    ccBeep(fa2RowBand(cur) === 0 ? 'expired' : 'ok');
    try { navigator.vibrate && navigator.vibrate(35); } catch (e) {}
    function subFor(r) { return (r[MC.lot] ? 'Lot ' + esc(r[MC.lot]) : 'No lot') + (r[MC.exp] ? ' \u00b7 Exp ' + esc(r[MC.exp]) : '') + ' \u00b7 ' + fa2Num(r[MC.qty]) + ' on hand' + (have(r) ? ' \u00b7 ' + have(r) + ' already selected' : ''); }
    fa2ScanSheet({
      title: esc(ref) + (cur[MC.desc] ? ' \u2014 ' + esc(cur[MC.desc]) : ''),
      sub: subFor(cur),
      expired: fa2RowBand(cur) === 0,
      fields: pick ? '<div class="cc-sub2">Which lot?</div>' + fa2Chips('cc-lots', opts.map(function (r) { return String(r[MC.lot]); }), String(cur[MC.lot])) : '',
      max: left(cur),
      onOk: function (q) {
        var k = cur[MC.ref] + '\u0001' + cur[MC.lot];
        if (!addToTray(k, q)) return false;
        ccStatus('Added ' + cur[MC.ref] + (q > 1 ? ' \u00d7' + q : '') + (cur[MC.lot] ? ' \u00b7 Lot ' + cur[MC.lot] : ''));
      }
    });
    if (pick) fa2ChipWire('cc-lots', function (v) {
      cur = opts.filter(function (r) { return String(r[MC.lot]) === v; })[0] || cur;
      var sb = document.querySelector('#cc-sheet .cc-sub'); if (sb) sb.innerHTML = subFor(cur);
      var xt = document.querySelector('#cc-sheet .cc-exptag'); if (xt) xt.remove();
      if (fa2RowBand(cur) === 0 && sb) sb.insertAdjacentHTML('afterend', '<div class="cc-exptag">EXPIRED</div>');
      FA2.sheetMax = left(cur);
      var qv = document.getElementById('cc-cqv'); if (qv) qv.value = Math.min(+qv.value || 1, FA2.sheetMax);
    });
    return '';
  }
  function fa2AddItem(o, fromScan) {
    var key = (o.ref || '') + '\u0001' + (o.lot || '');
    var t = FA2.a2;
    if (t.items[key]) { t.items[key].qty += (o.qty || 1); }
    else { t.items[key] = { ref: o.ref, desc: o.desc || '', lot: o.lot || '', exp: o.exp || '', qty: o.qty || 1, src: fromScan ? 'scan' : 'manual' }; t.order.push(key); }
    if (FA2.a2api) FA2.a2api.redraw();
    fa2A2Gate();
  }
  // A lot/expiry that arrived before its product waits 2 min (as on the count screen), visibly, then is forgotten -
  // so a stray label from one box can never end up on the next box scanned minutes later.
  var FA2_HELD_MS = 120000;
  function fa2HeldDraw() {
    var h = document.getElementById('a2-held'); if (!h) return;
    clearTimeout(FA2.heldTO);
    var p = FA2.pendLE, pr = FA2.pendRef;
    if (pr && Date.now() - pr.t >= FA2_HELD_MS) { FA2.pendRef = pr = null; }
    if (!p || Date.now() - p.t >= FA2_HELD_MS) { FA2.pendLE = p = null; }
    if (!p && !pr) { h.hidden = true; h.innerHTML = ''; return; }
    h.hidden = false;
    h.innerHTML = '<span class="f2bub">' + (pr ? esc(pr.ref) + ' held \u2014 scan its lot barcode' :
        (p.lot ? 'Lot ' + esc(p.lot) : '') + (p.lot && p.exp ? ' \u00b7 ' : '') + (p.exp ? 'Exp ' + esc(p.exp) : '') + ' held for the next product') + '</span>' +
      '<button type="button" id="a2-heldx" class="k-x" aria-label="Forget held item">\u00d7</button>';
    document.getElementById('a2-heldx').addEventListener('click', function () { FA2.pendLE = null; FA2.pendRef = null; fa2HeldDraw(); ccStatus('Cleared'); });
    FA2.heldTO = setTimeout(fa2HeldDraw, FA2_HELD_MS - (Date.now() - (p || pr).t) + 50);
  }
  // A lot/expiry-only barcode scanned right after a product barcode belongs to
  // that item (two-barcode labels in either order). Returns true when attached.
  function fa2AttachLE(lot, exp) {
    var t = FA2.a2; if (!t || !t.order.length) return false;
    var lk = t.order[t.order.length - 1], li = t.items[lk];
    if (!li || (li.lot && li.exp)) return false;
    var nl = li.lot || lot, ne = li.exp || exp, nk = (li.ref || '') + '\u0001' + nl;
    delete t.items[lk]; t.order.pop();
    if (t.items[nk]) { t.items[nk].qty += li.qty; if (!t.items[nk].exp) t.items[nk].exp = ne; }
    else { li.lot = nl; li.exp = ne; t.items[nk] = li; t.order.push(nk); }
    if (FA2.a2api) FA2.a2api.redraw();
    fa2A2Gate();
    return true;
  }
  // Fix a typo or a bad scan in place — nobody should have to delete a line and rescan.
  function fa2ItemEdit(key) {
    var t = FA2.a2, p = t.items[key]; if (!p) return;
    var wrap = document.createElement('div');
    wrap.className = 'fa2-modal';
    wrap.innerHTML =
      '<div class="fa2-mcard">' +
        '<div class="fa2-t">Edit item</div>' +
        '<div class="fa2-s" style="margin:6px 0 10px">' + (p.src === 'scan' ? 'Scanned' : 'Added by hand') + ' \u2014 corrections stay in this drop.</div>' +
        '<input id="ie-ref" class="cc-in" placeholder="REF (part number)" value="' + esc(p.ref || '') + '">' +
        '<input id="ie-desc" class="cc-in" placeholder="Description" value="' + esc(p.desc || '') + '">' +
        '<input id="ie-lot" class="cc-in" placeholder="LOT" value="' + esc(p.lot || '') + '">' +
        fa2ExpQtyRow('ie-exp', 'ie-qty', fa2DateVal(p.exp), p.qty) +
        '<div id="ie-err" class="cc-err" hidden></div>' +
        '<div class="fa2-mrow"><button type="button" id="ie-cancel" class="cc-mini">Cancel</button><button type="button" id="ie-save" class="cc-btn">Save changes</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    fa2ExpWire('ie-exp');
    document.getElementById('ie-ref').addEventListener('input', function (e) {
      var d = document.getElementById('ie-desc');
      if (d && !d.value) { var dv = fa2DescOf(e.target.value); if (dv) d.value = dv; }
    });
    document.getElementById('ie-cancel').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('ie-save').addEventListener('click', function () {
      var ref = document.getElementById('ie-ref').value.trim();
      var desc = document.getElementById('ie-desc').value.trim();
      var lot = document.getElementById('ie-lot').value.trim();
      var exp = document.getElementById('ie-exp').value;
      var qty = Math.round(+document.getElementById('ie-qty').value || 0);
      if (!ref) return fa2Err('ie-err', 'REF is required.');
      if (!lot) return fa2Err('ie-err', 'LOT is required \u2014 an item can\u2019t be saved without one.');
      if (!fa2ExpGate('ie-exp', 'ie-err', 'Save changes')) return;
      if (qty < 1) return fa2Err('ie-err', 'Qty must be at least 1.');
      var changed = ref !== p.ref || lot !== (p.lot || '') || exp !== fa2DateVal(p.exp);
      var src = (p.src === 'scan' && changed) ? 'manual' : p.src;
      var nk = ref + '\u0001' + lot, i = t.order.indexOf(key);
      delete t.items[key];
      if (nk !== key && t.items[nk]) {
        // merged into a line that already exists — keep one row, combine the counts
        t.items[nk].qty += qty;
        if (!t.items[nk].exp && exp) t.items[nk].exp = exp;
        if (!t.items[nk].desc && desc) t.items[nk].desc = desc;
        if (i > -1) t.order.splice(i, 1);
      } else {
        t.items[nk] = { ref: ref, desc: desc, lot: lot, exp: exp, qty: qty, src: src };
        if (i > -1) t.order[i] = nk; else t.order.push(nk);
      }
      wrap.remove();
      if (FA2.a2api) FA2.a2api.redraw();
      fa2A2Gate();
    });
  }
  function fa2A2Gate() {
    fa2DraftSave();
    var b = document.getElementById('a2-go'); if (!b) return;
    var t = FA2.a2, bad = 0;
    t.order.forEach(function (k) { var p = t.items[k]; if (!p.ref || !p.lot || !p.exp || !(p.qty > 0)) bad++; });
    b.disabled = !t.order.length || bad > 0;
    var w = document.getElementById('a2-warn');
    if (w) { w.hidden = !bad; w.textContent = bad ? bad + ' item' + (bad > 1 ? 's need' : ' needs') + ' a lot and expiration \u2014 tap the line to fill them in, or remove it.' : ''; }
  }
  function fa2RetCode(txt, now) {
    if (txt === CC.cool.code && now - CC.cool.t < (CC.cool.ms || 2200)) { ccSchedule(160); return; }
    CC.cool = { code: txt, t: now, ms: 2200 };
    var r = window.__TBX_RESOLVE ? window.__TBX_RESOLVE(txt) : { sku: null, p: {} };
    var p = r.p || {}, ref = r.sku || '';
    if (!ref) { var n = nrm(txt); if (n.length >= 5 && n.length <= 20 && BYPN[n]) ref = skuOf(BYPN[n]); }
    if (!ref) { ccBeep('warn'); ccStatus('Unknown barcode \u2014 tap the item in the list'); ccSchedule(300); return; }
    ccStatus(FA2.retScan ? FA2.retScan(ref, p.lot || '') : '');
    ccSchedule(220);
  }
  window.__TBX_ONCODE = function (txt) { return ccOnCode(txt); };
  function fa2Add2() {
    var f = FA2.form;
    if (!f || f.kind !== 'add' || !f.drop) { location.hash = '#/fa2/add'; return; }
    setTitle('Add items', ''); backBtn.hidden = false;
    if (!fa2Ensure(fa2Add2)) return; fa2Wide(true);
    ccStop();
    CC.view = 'fa2add2';
    fa2KitCss();
    // The tray survives a trip back to step 1 (and a page reload, via the draft).
    if (!FA2.a2 || !FA2.a2.order) FA2.a2 = { items: {}, order: [] };
    FA2.pendLE = null;
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">Add items</h2>' +
        '<div class="cc-sub">' + esc(f.drop) + ' \u00b7 ' + esc(f.date) + ' \u00b7 from ' + esc(fa2FromValue(f)) + '</div>' +
        ccCamPanelHtml({ manualId: 'a2-man' }) +
        '<div id="a2-held" class="a2held" hidden></div>' +
        '<div id="a2-manwrap" class="a2man" hidden>' +
          '<input id="a2-ref" class="cc-in" placeholder="REF (part number)">' +
          '<input id="a2-desc" class="cc-in" placeholder="Description">' +
          '<input id="a2-lot" class="cc-in" placeholder="LOT">' +
          fa2ExpQtyRow('a2-exp', 'a2-qty') +
          '<button id="a2-addman" type="button" class="cc-mini">Add to list</button>' +
        '</div>' +
        '<div class="fa2-lab">Items in this drop</div><div id="a2-tray"></div>' +
        '<div id="a2-warn" class="cc-sub2" hidden></div>' +
        '<div id="fa2-err" class="cc-err" hidden></div>' +
        '<div class="k-bar"><button id="a2-go" class="cc-btn" disabled>Save drop</button></div>' +
      '</div>');
    FA2.a2api = kitTray(document.getElementById('a2-tray'), FA2.a2, { empty: 'Scan a barcode or use + Manual.', onChange: fa2A2Gate, onEdit: fa2ItemEdit, needExp: true });
    document.getElementById('a2-man').addEventListener('click', function () {
      var w = document.getElementById('a2-manwrap'); w.hidden = !w.hidden;
      if (!w.hidden) document.getElementById('a2-ref').focus();
    });
    fa2ExpWire('a2-exp');
    document.getElementById('a2-ref').addEventListener('input', function (e) {
      var d = document.getElementById('a2-desc');
      if (d && !d.value) { var dv = fa2DescOf(e.target.value); if (dv) d.value = dv; }
    });
    document.getElementById('a2-addman').addEventListener('click', function () {
      var ref = document.getElementById('a2-ref').value.trim();
      var lot = document.getElementById('a2-lot').value.trim();
      var exp = document.getElementById('a2-exp').value;
      var qty = +document.getElementById('a2-qty').value || 0;
      if (!ref) return fa2Err('fa2-err', 'REF is required.');
      if (!lot) return fa2Err('fa2-err', 'LOT is required.');
      if (!fa2ExpGate('a2-exp', 'fa2-err', 'Add to list')) return;
      if (qty < 1) return fa2Err('fa2-err', 'Qty must be at least 1.');
      var er = document.getElementById('fa2-err'); if (er) er.hidden = true;
      fa2AddItem({ ref: ref, desc: document.getElementById('a2-desc').value.trim(), lot: lot, exp: exp, qty: qty }, false);
      ['a2-ref', 'a2-desc', 'a2-lot'].forEach(function (id) { document.getElementById(id).value = ''; });
      fa2ExpReset('a2-exp');
      document.getElementById('a2-qty').value = '1';
      document.getElementById('a2-ref').focus();
    });
    ccCamPanelWire();
    fa2A2Gate();
    document.getElementById('a2-go').addEventListener('click', function () {
      var t = FA2.a2;
      if (!t.order.length) return fa2Err('fa2-err', 'Add at least one item.');
      var from = fa2FromValue(f);
      var evs = t.order.map(function (k) {
        var p = t.items[k];
        return { type: 'Received', ref: p.ref, desc: p.desc, lot: p.lot, exp: p.exp, qty: p.qty,
          dropName: f.drop.trim(), from: from, receivedBy: f.rb === 'Account' ? f.accName.trim() : f.rb,
          accountName: f.rb === 'Account' ? f.accName.trim() : '', accountLocation: f.rb === 'Account' ? f.accLoc.trim() : '',
          eventDate: f.date, note: (f.note || '').trim(), entryMethod: p.src === 'scan' ? 'scan' : 'manual', enteredBy: fa2Who() };
      });
      var lines = t.order.length, units = 0;
      t.order.forEach(function (k) { units += t.items[k].qty; });
      var gb = document.getElementById('a2-go'); if (gb) { gb.disabled = true; gb.textContent = 'Saving\u2026'; }
      ccStop();
      FA2.form = null; FA2.a2 = { items: {}, order: [] }; FA2.a2api = null; FA2.resumed = false; fa2DraftSet(null);
      fa2AddRun(evs, 'add-' + f.drop.trim() + '-' + f.date, lines, units, { form: f, a2: t });
      location.hash = '#/fa2';
    });
  }

  /* ---------- shared on-hand card picker: tap a card → stepper → Add ---------- */
  function fa2PickCardHtml(r, key, have, open, pend) {
    var oh = fa2Num(r[MC.qty]);
    return '<div class="f2c fa2-pk' + (open ? ' pk-open' : '') + '" data-k="' + esc(key) + '">' +
      '<div class="f2top"><b>' + esc(r[MC.ref]) + '</b><span class="f2bub">' + (have ? have + ' of ' + oh + ' selected' : oh + ' on hand') + '</span></div>' +
      (r[MC.desc] ? '<div class="f2desc">' + esc(r[MC.desc]) + '</div>' : '') +
      '<div class="f2sub">' + (r[MC.lot] ? 'Lot ' + esc(r[MC.lot]) : 'No lot') + (r[MC.exp] ? ' \u00b7 Exp ' + esc(r[MC.exp]) : '') + '</div>' +
      (open ? '<div class="pk-qty">' +
          '<span class="pk-step">' +
            '<button type="button" class="pk-m" aria-label="Less"' + (pend <= 1 ? ' disabled' : '') + '>\u2212</button>' +
            '<b class="pk-n">' + pend + '</b>' +
            '<button type="button" class="pk-p" aria-label="More">+</button>' +
          '</span>' +
          '<button type="button" class="cc-btn pk-add">Add</button>' +
        '</div>' : '') +
    '</div>';
  }
  function fa2PickListHtml(rows, have, st) {
    var html = '', last = -1;
    rows.forEach(function (r) {
      var b = fa2RowBand(r);
      if (b !== last) { html += '<div class="fa2-eyebrow ' + FA2_BAND_CLS[b] + '">' + FA2_BAND_NAMES[b] + '</div>'; last = b; }
      var key = r[MC.ref] + '\u0001' + r[MC.lot];
      var oh = fa2Num(r[MC.qty]), hv = have(key);
      html += fa2PickCardHtml(r, key, hv, st.openKey === key, Math.min(st.pickN, Math.max(1, oh - hv)));
    });
    return html;
  }
  // state = {openKey, pickN}; api = {rowFor, cardFor, have, add, redraw}
  function fa2PickBind(hostId, st, api) {
    var host = document.getElementById(hostId); if (!host) return;
    host.onclick = function (e) {
      if (!e.target.closest) return;
      var card = e.target.closest('.fa2-pk'); if (!card) return;
      var k = card.getAttribute('data-k');
      if (e.target.closest('.pk-add')) { api.add(k, st.pickN); return; }
      var step = e.target.closest('.pk-m') ? -1 : e.target.closest('.pk-p') ? 1 : 0;
      if (step) {
        var m = api.rowFor(k), oh = m ? fa2Num(m[4]) : 1, have = api.have(k);
        var next = st.pickN + step;
        // never offer more than is left; asking anyway shakes the card
        if (next > Math.max(1, oh - have)) { kitShake(card, card.querySelector('.f2bub')); return; }
        st.pickN = Math.max(1, next); api.redraw(); return;
      }
      if (e.target.closest('.pk-qty')) return;
      st.openKey = (st.openKey === k) ? '' : k;
      st.pickN = 1;
      api.redraw();
      // Open in place. Only if the picker would sit under the sticky action bar (or past the
      // list's own scroll edge) nudge by the minimum needed - never recentre the card.
      if (st.openKey) {
        var c2 = api.cardFor(st.openKey), q = c2 && c2.querySelector('.pk-qty');
        if (q) {
          try { q.scrollIntoView({ block: 'nearest' }); } catch (e2) {}
          var bar = document.querySelector('.k-bar');
          if (bar) { var qb = q.getBoundingClientRect().bottom, bt = bar.getBoundingClientRect().top; if (qb > bt - 6) window.scrollBy(0, qb - bt + 10); }
        }
      }
    };
  }

  /* ---------- Remove / Return ---------- */
  var FA2_REMOVE_TYPES = ['Returned to Stryker', 'External Transfer', 'Written Off', 'Returned to CT SM'];
  // Which detail fields each removal type asks for: [key, label, required]
  var FA2_REMOVE_FIELDS = {
    'Returned to Stryker': [['trk', 'Tracking #', false], ['note', 'Notes', false]],
    'External Transfer': [['trk', 'Tracking #', false], ['terr', 'Receiving Rep/Territory', true], ['sent', 'Sent by who', true], ['note', 'Notes', false]],
    'Written Off': [['reason', 'Reason', true]],
    'Returned to CT SM': [['recv', 'Received by who', true], ['note', 'Notes', false]]
  };
  // The bottom-bar scanner glyph, reused so the button reads as "scan" everywhere.
  function fa2ScanIcon(sz) {
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>' +
      '<path d="M7 8v8M10.5 8v8M13.5 8v5M13.5 16v0M16.5 8v8"/></svg>';
  }
  function fa2Return() {
    setTitle('Remove / Return', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Return)) return; fa2Wide(true);
    CC.view = 'fa2ret';
    fa2KitCss();
    var tray = { items: {}, order: [] };
    var sel = { type: '', v: {} };
    var OH = null, subKey = 'ret-' + fa2Uuid(), st = { openKey: '', pickN: 1 };
    fa2Shell('Remove / Return', 'Take product out of F&amp;A stock \u2014 pick where it went.',
      '<div class="fa2-lab">Removal type</div>' + fa2Chips('fa2-rty', FA2_REMOVE_TYPES, '') +
      '<div id="fa2-rfields"></div>' +
      '<div class="fa2-lab">Selected</div><div id="fa2-tray"></div>' +
      '<button id="fa2-scanb" type="button">' + fa2ScanIcon(24) + '<span>Scan a barcode</span></button>' +
      '<div id="fa2-scanwrap" hidden>' + ccCamPanelHtml() + '</div>' +
      '<input id="fa2-q" class="cc-in" placeholder="Search ref, lot, or description">' +
      '<div class="fa2-lab">On hand \u2014 tap to choose a quantity</div><div id="fa2-pick" class="k-scroll">' + skel(3) + '</div>' +
      '<div class="k-bar"><button id="fa2-go" class="cc-btn">Submit</button></div>',
      function () { return fa2Load(true).then(function (d) { if (CC.view !== 'fa2ret') return; OH = d; drawPick(); }); });
    var trayApi = kitTray(document.getElementById('fa2-tray'), tray, { empty: 'Nothing selected yet \u2014 tap an item below.', onChange: drawPick });
    // The detail fields follow the removal type, so nobody is asked for a tracking
    // number on a write-off or a reason on a send-back.
    function drawFields() {
      var host = document.getElementById('fa2-rfields'); if (!host) return;
      var defs = FA2_REMOVE_FIELDS[sel.type] || [];
      host.innerHTML = defs.map(function (f) {
        return '<input id="rf-' + f[0] + '" class="cc-in" placeholder="' + esc(f[1] + (f[2] ? ' (required)' : ' (optional)')) + '" value="' + esc(sel.v[f[0]] || '') + '">';
      }).join('');
      defs.forEach(function (f) {
        document.getElementById('rf-' + f[0]).addEventListener('input', function (e) { sel.v[f[0]] = e.target.value; });
      });
    }
    fa2ChipWire('fa2-rty', function (v) { sel.type = v; drawFields(); });
    document.getElementById('fa2-q').addEventListener('input', function () { st.openKey = ''; drawPick(); });
    function rowFor(k) { var m = null; ((OH && OH.master) || []).forEach(function (r) { if (r[MC.ref] + '\u0001' + r[MC.lot] === k) m = r; }); return m; }
    function cardFor(k) { var c = null; [].forEach.call(document.querySelectorAll('#fa2-pick .fa2-pk'), function (x) { if (x.getAttribute('data-k') === k) c = x; }); return c; }
    function addToTray(k, n) {
      var m = rowFor(k); if (!m) return false;
      var oh = fa2Num(m[4]), have = tray.items[k] ? tray.items[k].qty : 0;
      if (have + n > oh) { var c = cardFor(k); kitShake(c, c && c.querySelector('.f2bub')); return false; }
      if (tray.items[k]) tray.items[k].qty = have + n;
      else { tray.items[k] = { ref: m[0], desc: m[1], lot: m[2], exp: m[3], onhand: oh, max: oh, qty: n }; tray.order.push(k); }
      st.openKey = ''; st.pickN = 1;
      trayApi.redraw();
      return true;
    }
    function drawPick() {
      var el = document.getElementById('fa2-pick'); if (!el || !OH) return;
      var q = (document.getElementById('fa2-q') || {}).value || '';
      var rows = (OH.master || []).filter(function (r) { return fa2Num(r[MC.qty]) > 0 && kitMatch(q, [r[MC.ref], r[MC.desc], r[MC.lot]]); });
      if (!rows.length) { el.innerHTML = '<div class="cc-empty">' + (q ? 'No matches.' : 'Nothing on hand.') + '</div>'; return; }
      el.innerHTML = fa2PickListHtml(fa2BandSort(rows), function (k) { return tray.items[k] ? tray.items[k].qty : 0; }, st);
    }
    fa2PickBind('fa2-pick', st, { rowFor: rowFor, cardFor: cardFor, have: function (k) { return tray.items[k] ? tray.items[k].qty : 0; }, add: addToTray, redraw: drawPick });
    // Scanning adds straight from stock — same guard rails as tapping.
    FA2.retScan = function (ref, lot) {
      if (!OH) return 'Still loading stock\u2026';
      var nref = nrm(ref);
      var cands = (OH.master || []).filter(function (r) { return fa2Num(r[MC.qty]) > 0 && nrm(String(r[MC.ref])) === nref; });
      if (!cands.length) { ccBeep('warn'); return ref + ' isn\u2019t in F&A stock'; }
      return fa2ScanPick(cands, lot, tray, addToTray);
    };
    document.getElementById('fa2-scanb').addEventListener('click', function () {
      var w = document.getElementById('fa2-scanwrap'), on = w.hidden;
      w.hidden = !on;
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = on ? 'Stop scanning' : 'Scan a barcode';
      if (on) { ccCamPanelWire(); } else { ccStop(); }
    });
    fa2Load(false).then(function (d) { if (CC.view !== 'fa2ret') return; OH = d; drawPick(); })
      .catch(function () { var el = document.getElementById('fa2-pick'); if (el) el.innerHTML = '<div class="cc-empty">Couldn\u2019t load on-hand.</div>'; });
    document.getElementById('fa2-go').addEventListener('click', function () {
      if (!sel.type) return fa2Err('fa2-err', 'Pick a removal type.');
      var defs = FA2_REMOVE_FIELDS[sel.type] || [];
      for (var i = 0; i < defs.length; i++) {
        if (defs[i][2] && !String(sel.v[defs[i][0]] || '').trim()) return fa2Err('fa2-err', defs[i][1] + ' is required.');
      }
      if (!tray.order.length) return fa2Err('fa2-err', 'Pick at least one item.');
      var v = {}; for (var kk in sel.v) v[kk] = String(sel.v[kk] || '').trim();
      var evs = tray.order.map(function (k) {
        var p = tray.items[k];
        var ev = { type: sel.type, ref: p.ref, desc: p.desc, lot: p.lot, qty: p.qty, entryMethod: 'manual', enteredBy: fa2Who() };
        if (v.trk) ev.tracking = v.trk;
        if (v.reason) ev.reason = v.reason;
        if (v.note) ev.note = v.note;
        if (sel.type === 'External Transfer') { ev.receivedBy = v.terr; ev.from = v.sent; }
        if (sel.type === 'Returned to CT SM') ev.receivedBy = v.recv;
        return ev;
      });
      fa2Submit(evs, subKey, document.getElementById('fa2-go'))
        .then(function () {
          tray.items = {}; tray.order = []; st.openKey = ''; st.pickN = 1; trayApi.redraw(); subKey = 'ret-' + fa2Uuid();
          kitBanner(document.querySelector('.cc-card'), 'Items removed');
          var b = document.getElementById('fa2-go'); if (b) { b.disabled = false; b.textContent = 'Submit'; }
          fa2Load(true).then(function (d2) { if (CC.view !== 'fa2ret') return; OH = d2; drawPick(); }).catch(function () {});
        })
        .catch(function (e) { fa2Err('fa2-err', fa2FailMsg(e)); var b = document.getElementById('fa2-go'); if (b) { b.disabled = false; b.textContent = 'Submit'; } });
    });
  }

  /* ---------- Send back to Stryker ---------- */
  // Same kit as Remove / Return: expiry-banded on-hand cards, a scanner, a tray with
  // per-lot caps, and a sticky Complete bar. F&A logins pick their name first.
  function fa2Send() {
    setTitle('Send back', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Send)) return; fa2Wide(true);
    CC.view = 'fa2send';
    fa2KitCss();
    var fa = fa2IsFA();
    var tray = { items: {}, order: [] };
    var trk = { v: '' };
    var OH = null, subKey = 'send-' + fa2Uuid(), st = { openKey: '', pickN: 1 };
    var namePick = fa ? '<div class="fa2-lab">Your name</div><div id="fa2-nmwrap">' + skel(1, 'sm') + '</div>' : '';
    fa2Shell('Send back to Stryker', 'Works before or after expiration. Save the send-back now; add the tracking # when the label is printed.',
      namePick +
      '<div class="fa2-lab">Going back</div><div id="fa2-tray"></div>' +
      '<button id="fa2-scanb" type="button">' + fa2ScanIcon(24) + '<span>Scan a barcode</span></button>' +
      '<div id="fa2-scanwrap" hidden>' + ccCamPanelHtml() + '</div>' +
      '<input id="fa2-q" class="cc-in" placeholder="Search ref, lot, or description">' +
      '<div class="fa2-lab">On hand \u2014 tap to choose a quantity</div><div id="fa2-pick" class="k-scroll">' + skel(3) + '</div>' +
      '<input id="fa2-trk" class="cc-in" placeholder="Tracking # (optional \u2014 add it later from Home)">' +
      '<div class="k-bar"><button id="fa2-go" class="cc-btn" disabled>Complete send-back</button></div>',
      function () { return loadSend(true); });
    var goBtn = document.getElementById('fa2-go');
    function gate() { var b = document.getElementById('fa2-go'); if (b) b.disabled = !(tray.order.length && (!fa || FA2.faName)); }
    document.getElementById('fa2-trk').addEventListener('input', function (e) { trk.v = e.target.value; gate(); });
    var trayApi = kitTray(document.getElementById('fa2-tray'), tray, { empty: 'Nothing selected yet \u2014 scan a barcode or tap an item below.', onChange: function () { drawPick(); gate(); } });
    document.getElementById('fa2-q').addEventListener('input', function () { st.openKey = ''; drawPick(); });
    function rowFor(k) { var m = null; ((OH && OH.master) || []).forEach(function (r) { if (r[MC.ref] + '\u0001' + r[MC.lot] === k) m = r; }); return m; }
    function cardFor(k) { var c = null; [].forEach.call(document.querySelectorAll('#fa2-pick .fa2-pk'), function (x) { if (x.getAttribute('data-k') === k) c = x; }); return c; }
    function addToTray(k, n) {
      var m = rowFor(k); if (!m) return false;
      var oh = fa2Num(m[4]), have = tray.items[k] ? tray.items[k].qty : 0;
      if (have + n > oh) { var c = cardFor(k); kitShake(c, c && c.querySelector('.f2bub')); return false; }
      if (tray.items[k]) tray.items[k].qty = have + n;
      else { tray.items[k] = { ref: m[0], desc: m[1], lot: m[2], exp: m[3], onhand: oh, max: oh, qty: n }; tray.order.push(k); }
      st.openKey = ''; st.pickN = 1;
      trayApi.redraw();
      return true;
    }
    function drawPick() {
      var el = document.getElementById('fa2-pick'); if (!el || !OH) return;
      var q = (document.getElementById('fa2-q') || {}).value || '';
      var rows = (OH.master || []).filter(function (r) { return fa2Num(r[MC.qty]) > 0 && kitMatch(q, [r[MC.ref], r[MC.desc], r[MC.lot]]); });
      if (!rows.length) { el.innerHTML = '<div class="cc-empty">' + (q ? 'No matches.' : 'Nothing on hand.') + '</div>'; return; }
      el.innerHTML = fa2PickListHtml(fa2BandSort(rows), function (k) { return tray.items[k] ? tray.items[k].qty : 0; }, st);
    }
    fa2PickBind('fa2-pick', st, { rowFor: rowFor, cardFor: cardFor, have: function (k) { return tray.items[k] ? tray.items[k].qty : 0; }, add: addToTray, redraw: drawPick });
    // Scanning adds straight from stock - same guard rails as tapping.
    FA2.retScan = function (ref, lot) {
      if (!OH) return 'Still loading stock\u2026';
      var nref = nrm(ref);
      var cands = (OH.master || []).filter(function (r) { return fa2Num(r[MC.qty]) > 0 && nrm(String(r[MC.ref])) === nref; });
      if (!cands.length) { ccBeep('warn'); return ref + ' isn\u2019t in F&A stock'; }
      return fa2ScanPick(cands, lot, tray, addToTray);
    };
    document.getElementById('fa2-scanb').addEventListener('click', function () {
      var w = document.getElementById('fa2-scanwrap'), on = w.hidden;
      w.hidden = !on;
      this.classList.toggle('on', on);
      this.querySelector('span').textContent = on ? 'Stop scanning' : 'Scan a barcode';
      if (on) { ccCamPanelWire(); } else { ccStop(); }
    });
    function loadSend(force) { return fa2Load(force).then(function (d) {
      if (CC.view !== 'fa2send') return;
      OH = d; drawPick();
      if (fa) {
        var names = fa2Teams('fa');
        var nw = document.getElementById('fa2-nmwrap');
        if (nw) {
          nw.innerHTML = names.length ? fa2Chips('fa2-nm', names, FA2.faName || '') : '<div class="cc-sub2">No F&amp;A team members set yet \u2014 ask Nate to add you in Admin.</div>';
          fa2ChipWire('fa2-nm', function (v) { FA2.faName = v; gate(); });
        }
      }
      gate();
    }).catch(function () { var el = document.getElementById('fa2-pick'); if (el) el.innerHTML = '<div class="cc-empty">Couldn\u2019t load on-hand.</div>'; }); }
    loadSend(false);
    goBtn.addEventListener('click', function () {
      var trkv = trk.v.trim();
      if (fa && !FA2.faName) return fa2Err('fa2-err', 'Pick your name first.');
      if (!tray.order.length) return fa2Err('fa2-err', 'Pick at least one item.');
      var evs = tray.order.map(function (k) {
        var p = tray.items[k];
        return { type: 'Returned to Stryker', ref: p.ref, desc: p.desc, lot: p.lot, qty: p.qty, tracking: trkv, entryMethod: 'manual', enteredBy: fa2Who() };
      });
      var lines = tray.order.length, units = 0; tray.order.forEach(function (k) { units += tray.items[k].qty; });
      var refs = tray.order.map(function (k) { return tray.items[k].ref + (tray.items[k].qty > 1 ? ' \u00d7' + tray.items[k].qty : ''); });
      fa2Submit(evs, subKey, goBtn)
        .then(function (j) {
          ccStop();
          fa2Flash('ok', 'Send-back saved \u2014 ' + lines + ' item' + (lines === 1 ? '' : 's') + ' \u00b7 ' + units + ' unit' + (units === 1 ? '' : 's') + (trkv ? ' \u00b7 tracking ' + trkv : ''));
          location.hash = '#/fa2';
          if (!trkv) {
            // Box can be sealed and the stock is already off the sheet; the tracking #
            // is chased from Home until someone enters it.
            var pend = { opId: (j && j.opId) || FA2.lastOpId || '', ts: new Date().toISOString(), lines: lines, units: units, by: fa2Who(), refs: refs };
            fa2TrkLocalAdd(pend);
            setTimeout(function () { fa2TrackSheet(pend); }, 350);
          }
        })
        .catch(function (e) { fa2Err('fa2-err', fa2FailMsg(e)); goBtn.disabled = false; goBtn.textContent = 'Complete send-back'; });
    });
  }

  /* ---------- Record case usage (+ overdraft warn-and-allow) ---------- */
  function fa2Use() {
    setTitle('Case usage', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Use)) return; fa2Wide(true);
    CC.view = 'fa2use';
    fa2KitCss();
    if (!FA2.form || FA2.form.kind !== 'use') FA2.form = { kind: 'use', bo: '', po: '', fac: '', sur: '', dos: fa2Today() };
    var f = FA2.form;
    var tray = { items: {}, order: [] };
    var over = {};
    var D2 = null, st = { openKey: '', pickN: 1 };
    fa2Shell('Record case usage', 'Manual bill-only entry.',
      '<input id="u-bo" class="cc-in" placeholder="C-number (required)" value="' + esc(f.bo) + '">' +
      '<input id="u-po" class="cc-in" placeholder="PO # (optional)" value="' + esc(f.po) + '">' +
      '<input id="u-fac" class="cc-in" placeholder="Facility (required)" value="' + esc(f.fac) + '">' +
      '<input id="u-sur" class="cc-in" placeholder="Surgeon (required)" value="' + esc(f.sur) + '">' +
      '<label class="a2f" for="u-dos"><span class="a2fl">Date of surgery</span>' +
        '<input id="u-dos" class="cc-in" type="date" value="' + esc(f.dos) + '"></label>' +
      '<div id="u-tray"></div>' +
      '<button id="u-man" type="button" class="cc-mini">+ Manual \u2014 not on the list</button>' +
      '<div id="u-manwrap" class="a2man" hidden>' +
        '<input id="u-mref" class="cc-in" placeholder="REF (part number)">' +
        '<input id="u-mdesc" class="cc-in" placeholder="Description">' +
        '<input id="u-mlot" class="cc-in" placeholder="LOT">' +
        fa2ExpQtyRow('u-mexp', 'u-mqty') +
        '<button id="u-addman" type="button" class="cc-mini">Add to list</button>' +
      '</div>' +
      '<input id="fa2-q" class="cc-in" placeholder="Search ref, lot, or description">' +
      '<div class="fa2-lab">On hand \u2014 tap to choose a quantity</div><div id="fa2-pick" class="k-scroll">' + skel(3) + '</div>' +
      '<div class="k-bar"><button id="fa2-go" class="cc-btn">Save usage</button></div>',
      function () { return fa2Load(true).then(function (d) { if (CC.view !== 'fa2use') return; D2 = d; drawPick(); }); });
    ['bo', 'po', 'fac', 'sur', 'dos'].forEach(function (k) {
      var el = document.getElementById('u-' + k);
      el.addEventListener('input', function (e) { f[k] = e.target.value; });
      if (k === 'dos') el.addEventListener('change', function (e) { f[k] = e.target.value; });
    });
    var trayApi = kitTray(document.getElementById('u-tray'), tray, {
      empty: 'Nothing selected yet \u2014 tap items below.',
      onChange: drawPick,
      allowOver: function () { return true; }
    });
    document.getElementById('fa2-q').addEventListener('input', function () { st.openKey = ''; drawPick(); });
    function rowFor(k) { var m = null; ((D2 && D2.master) || []).forEach(function (r) { if (r[MC.ref] + '\u0001' + r[MC.lot] === k) m = r; }); return m; }
    function cardFor(k) { var c = null; [].forEach.call(document.querySelectorAll('#fa2-pick .fa2-pk'), function (x) { if (x.getAttribute('data-k') === k) c = x; }); return c; }
    function addToTray(k, n) {
      var m = rowFor(k); if (!m) return false;
      var oh = fa2Num(m[4]), have = tray.items[k] ? tray.items[k].qty : 0;
      // using more than is on hand goes through + Manual (late entry), never a silent tap
      if (have + n > oh) { var c = cardFor(k); kitShake(c, c && c.querySelector('.f2bub')); return false; }
      if (tray.items[k]) tray.items[k].qty = have + n;
      else { tray.items[k] = { ref: m[0], desc: m[1], lot: m[2], exp: m[3], onhand: oh, qty: n }; tray.order.push(k); }
      st.openKey = ''; st.pickN = 1;
      trayApi.redraw();
      return true;
    }
    document.getElementById('u-man').addEventListener('click', function () {
      var w = document.getElementById('u-manwrap'); w.hidden = !w.hidden;
      if (!w.hidden) document.getElementById('u-mref').focus();
    });
    fa2ExpWire('u-mexp');
    document.getElementById('u-mref').addEventListener('input', function (e) {
      var d = document.getElementById('u-mdesc');
      if (d && !d.value) { var dv = fa2DescOf(e.target.value); if (dv) d.value = dv; }
    });
    document.getElementById('u-addman').addEventListener('click', function () {
      var ref = document.getElementById('u-mref').value.trim();
      var lot = document.getElementById('u-mlot').value.trim();
      var exp = document.getElementById('u-mexp').value;
      var qty = +document.getElementById('u-mqty').value || 0;
      if (!ref) return fa2Err('fa2-err', 'REF is required.');
      if (!lot) return fa2Err('fa2-err', 'LOT is required.');
      if (!fa2ExpGate('u-mexp', 'fa2-err', 'Add to list')) return;
      if (qty < 1) return fa2Err('fa2-err', 'Qty must be at least 1.');
      var er = document.getElementById('fa2-err'); if (er) er.hidden = true;
      // If this ref+lot is actually on hand, use that row so the overdraft math stays right.
      var m = null;
      ((D2 && D2.master) || []).forEach(function (r) { if (String(r[MC.ref]).toUpperCase() === ref.toUpperCase() && String(r[MC.lot]).toUpperCase() === lot.toUpperCase()) m = r; });
      var k = m ? (m[0] + '\u0001' + m[2]) : (ref + '\u0001' + lot);
      if (tray.items[k]) tray.items[k].qty += qty;
      else if (m) { tray.items[k] = { ref: m[0], desc: m[1], lot: m[2], exp: m[3], onhand: fa2Num(m[4]), qty: qty }; tray.order.push(k); }
      else { tray.items[k] = { ref: ref, desc: document.getElementById('u-mdesc').value.trim(), lot: lot, exp: exp, onhand: 0, qty: qty }; tray.order.push(k); }
      trayApi.redraw();
      ['u-mref', 'u-mdesc', 'u-mlot'].forEach(function (id) { document.getElementById(id).value = ''; });
      fa2ExpReset('u-mexp');
      document.getElementById('u-mqty').value = '1';
      document.getElementById('u-mref').focus();
    });
    function drawPick() {
      var el = document.getElementById('fa2-pick'); if (!el || !D2) return;
      var q = (document.getElementById('fa2-q') || {}).value || '';
      var rows = (D2.master || []).filter(function (r) { return fa2Num(r[MC.qty]) > 0 && kitMatch(q, [r[MC.ref], r[MC.desc], r[MC.lot]]); });
      if (!rows.length) { el.innerHTML = '<div class="cc-empty">' + (q ? 'No matches.' : 'Nothing on hand.') + '</div>'; return; }
      el.innerHTML = fa2PickListHtml(fa2BandSort(rows), function (k) { return tray.items[k] ? tray.items[k].qty : 0; }, st);
    }
    fa2PickBind('fa2-pick', st, { rowFor: rowFor, cardFor: cardFor, have: function (k) { return tray.items[k] ? tray.items[k].qty : 0; }, add: addToTray, redraw: drawPick });
    fa2Load(false).then(function (d) { if (CC.view !== 'fa2use') return; D2 = d; drawPick(); })
      .catch(function () { var el = document.getElementById('fa2-pick'); if (el) el.innerHTML = '<div class="cc-empty">Couldn\u2019t load on-hand.</div>'; });
    document.getElementById('fa2-go').addEventListener('click', function () {
      if (!f.bo.trim()) return fa2Err('fa2-err', 'C-number is required.');
      if (!f.fac.trim()) return fa2Err('fa2-err', 'Facility is required.');
      if (!f.sur.trim()) return fa2Err('fa2-err', 'Surgeon is required.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dos)) return fa2Err('fa2-err', 'Date of surgery is required.');
      if (!tray.order.length) return fa2Err('fa2-err', 'Add at least one item.');
      var overs = tray.order.filter(function (k) { return tray.items[k].qty > tray.items[k].onhand && !over[k]; });
      if (overs.length) return fa2Overdraft(tray.items[overs[0]], overs[0], over, function () { document.getElementById('fa2-go').click(); });
      var evs = [];
      tray.order.forEach(function (k) {
        var p = tray.items[k];
        var eid = fa2Uuid();
        if (over[k]) {
          evs.push({ eventId: fa2Uuid(), type: 'Received', ref: p.ref, desc: p.desc, lot: p.lot, exp: p.exp || over[k].exp || '',
            qty: p.qty - p.onhand, from: over[k].src, eventDate: over[k].date, note: over[k].notes,
            flags: 'Late entry', linkedTo: eid, entryMethod: 'manual', enteredBy: fa2Who() });
        }
        evs.push({ eventId: eid, type: 'Used in case', ref: p.ref, desc: p.desc, lot: p.lot, qty: p.qty,
          caseBO: f.bo.trim(), casePO: f.po.trim(), facility: f.fac.trim(), surgeon: f.sur.trim(), dos: f.dos, patientId: '',
          entryMethod: 'manual', enteredBy: fa2Who() });
      });
      fa2Submit(evs, 'use-' + f.bo.trim(), document.getElementById('fa2-go'))
        .then(function () {
          var savedBo = f.bo.trim(), savedLines = tray.order.length;
          tray.items = {}; tray.order = []; for (var k in over) delete over[k];
          trayApi.redraw();
          // Next case starts with a blank C-number / PO so nothing files under the case just saved.
          f.bo = ''; f.po = '';
          var boEl = document.getElementById('u-bo'), poEl = document.getElementById('u-po');
          if (boEl) boEl.value = ''; if (poEl) poEl.value = '';
          try { window.scrollTo(0, 0); } catch (e0) {}
          kitBanner(document.querySelector('.cc-card'), 'Usage saved for ' + savedBo + ' \u2014 ' + savedLines + ' line' + (savedLines === 1 ? '' : 's') + '. Enter the next C-number.');
          var b = document.getElementById('fa2-go'); if (b) { b.disabled = false; b.textContent = 'Save usage'; }
          fa2Load(true).then(function (d2) { if (CC.view !== 'fa2use') return; D2 = d2; drawPick(); }).catch(function () {});
        })
        .catch(function (e) { fa2Err('fa2-err', fa2FailMsg(e)); var b = document.getElementById('fa2-go'); if (b) { b.disabled = false; b.textContent = 'Save usage'; } });
    });
  }
  function fa2Overdraft(p, key, over, done) {
    var short = p.qty - p.onhand;
    var wrap = document.createElement('div');
    wrap.className = 'fa2-modal';
    wrap.innerHTML =
      '<div class="fa2-mcard">' +
        '<div class="fa2-t">Not enough on hand</div>' +
        '<div class="fa2-s" style="margin:6px 0 10px">' + esc(p.ref) + ' Lot ' + esc(p.lot) + ' \u2014 using ' + p.qty + ', only ' + p.onhand + ' recorded (' + short + ' short).</div>' +
        '<label class="fa2-chk"><input id="od-chk" type="checkbox"> This inventory was already transferred \u2014 it just never got entered</label>' +
        '<div id="od-more" hidden>' +
          '<input id="od-src" class="cc-in" placeholder="Where it came from (required)">' +
          (p.exp ? '' : '<label class="a2f"><span class="a2fl">Expiration of this lot (required)</span><input id="od-exp" class="cc-in" type="date"></label>') +
          '<input id="od-date" class="cc-in" type="date">' +
          '<input id="od-notes" class="cc-in" placeholder="Notes">' +
        '</div>' +
        '<div class="fa2-mrow"><button id="od-cancel" type="button" class="cc-mini">Cancel</button><button id="od-go" type="button" class="cc-btn" disabled>Record &amp; continue</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var chk = wrap.querySelector('#od-chk'), more = wrap.querySelector('#od-more'), go = wrap.querySelector('#od-go'), src = wrap.querySelector('#od-src'), oxp = wrap.querySelector('#od-exp');
    if (oxp) fa2ExpWire('od-exp');
    function gate() { go.disabled = !(chk.checked && src.value.trim() && (!oxp || /^\d{4}-\d{2}-\d{2}$/.test(oxp.value))); }
    chk.addEventListener('change', function () { more.hidden = !chk.checked; gate(); });
    src.addEventListener('input', gate);
    if (oxp) ['input', 'change'].forEach(function (ev) { oxp.addEventListener(ev, gate); });
    wrap.querySelector('#od-cancel').addEventListener('click', function () { wrap.remove(); });
    go.addEventListener('click', function () {
      over[key] = { src: src.value.trim(), date: wrap.querySelector('#od-date').value, notes: wrap.querySelector('#od-notes').value.trim(), exp: oxp ? oxp.value : '' };
      wrap.remove(); done();
    });
  }

  /* ---------- Transactions (imports approve/deny) ---------- */
  var FA2_OUTCOMES = { pending: 'Pending review', 'revised-pending': 'Pending (revised)', auto: 'Auto-applied', approved: 'Approved', denied: 'Denied', duplicate: 'Duplicate', 'ignored-not-a-bo': 'Not a bill only' };
  function fa2Outcome(o) { return FA2_OUTCOMES[o] || String(o || '').replace(/-/g, ' '); }
  // A small in-app yes/no; window.confirm looks foreign in the installed app and can't be styled.
  function fa2Confirm(title, msg, okLabel, danger) {
    return new Promise(function (res) {
      var wrap = document.createElement('div'); wrap.className = 'fa2-modal';
      wrap.innerHTML = '<div class="fa2-mcard"><div class="fa2-t">' + esc(title) + '</div>' +
        (msg ? '<div class="fa2-s" style="margin:6px 0 10px">' + esc(msg) + '</div>' : '') +
        '<div class="fa2-mrow"><button type="button" id="cf-no" class="cc-mini">Cancel</button><button type="button" id="cf-yes" class="cc-btn' + (danger ? ' cc-endb' : '') + '">' + esc(okLabel || 'OK') + '</button></div></div>';
      document.body.appendChild(wrap);
      wrap.querySelector('#cf-no').addEventListener('click', function () { wrap.remove(); res(false); });
      wrap.querySelector('#cf-yes').addEventListener('click', function () { wrap.remove(); res(true); });
    });
  }
  function fa2Trans() {
    setTitle('Transactions', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Trans)) return; fa2Wide(true);
    CC.view = 'fa2trans';
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">Transactions</h2>' +
        '<div class="cc-sub">Bill-only imports \u2014 clean ones auto-apply, the rest wait here.</div>' +
        '<button id="fa2-poll" type="button" class="cc-mini">Check for new Bill Onlys</button>' +
        '<div id="fa2-pollmsg" class="cc-sub2"></div>' +
        '<div id="fa2-list">' + skel(4) + '</div>' +
        '<div id="fa2-err" class="cc-err" hidden></div>' +
      '</div>');
    fa2RefreshWire(function () { return fa2TransLoad(); });
    document.getElementById('fa2-poll').addEventListener('click', function () {
      var b = this, m = document.getElementById('fa2-pollmsg');
      b.disabled = true; b.textContent = 'Checking\u2026'; if (m) m.textContent = '';
      fa2Call('poll_now').then(function (j) {
        b.disabled = false; b.textContent = 'Check for new Bill Onlys';
        if (!j || j.err) { if (m) m.textContent = 'Couldn\u2019t check right now.'; return; }
        var n = j.threads || 0, res = j.results || [];
        var applied = res.filter(function (r) { return r.outcome === 'auto'; }).length;
        var pend = res.filter(function (r) { return String(r.outcome || '').indexOf('pending') > -1; }).length;
        if (m) m.textContent = n ? ('Checked \u2014 ' + n + ' email' + (n > 1 ? 's' : '') + ' found' + (applied ? ', ' + applied + ' auto-applied' : '') + (pend ? ', ' + pend + ' waiting for review' : '') + '.') : 'Checked \u2014 no new bill onlys.';
        fa2TransLoad();
      }).catch(function () { b.disabled = false; b.textContent = 'Check for new Bill Onlys'; if (m) m.textContent = 'Couldn\u2019t reach the server.'; });
    });
    fa2TransLoad();
  }
  function fa2TransLoad() {
    return fa2Call('import_list').then(function (j) {
      if (CC.view !== 'fa2trans') return;
      var el = document.getElementById('fa2-list'); if (!el) return;
      if (!j || !j.ok) { el.innerHTML = '<div class="cc-empty">Couldn\u2019t load imports.</div>'; return; }
      var imps = j.imports || [];
      if (!imps.length) { el.innerHTML = '<div class="cc-empty">No imports yet. Email a bill only to the +fa inbox or upload one here later.</div>'; return; }
      var pend = imps.filter(function (x) { return x.outcome === 'pending' || x.outcome === 'revised-pending'; });
      var rest = imps.filter(function (x) { return x.outcome !== 'pending' && x.outcome !== 'revised-pending'; });
      function card(x, isPend) {
        var lines = (x.detail && x.detail.lines) || [], hdr = (x.detail && x.detail.hdr) || {};
        var iss = lines.filter(function (L) { return L.issue && !L.skipped; }).length;
        var tot = fa2ImpTotal(x);
        var who = [hdr.facility, hdr.surgeon].filter(Boolean).join(' \u00b7 ');
        var po = hdr.po || hdr.casePO || hdr.poNumber || '';
        var sub = [String(x.ts || '').slice(0, 10), po ? 'PO ' + po : '', hdr.dos ? 'DOS ' + hdr.dos : '', lines.length + ' line' + (lines.length === 1 ? '' : 's')]
          .concat(iss ? [iss + ' issue' + (iss > 1 ? 's' : '')] : []).filter(Boolean).join(' \u00b7 ');
        var pc = isPend ? 'wait' : (x.outcome === 'auto' || x.outcome === 'approved' ? 'ok' : (x.outcome === 'denied' ? 'bad' : ''));
        return '<div class="fa2-row">' +
          '<div class="fa2-l"><div class="fa2-t">' + esc(x.bo || '(no BO)') + ' <span class="cc-pill ' + pc + '">' + esc(fa2Outcome(x.outcome)) + '</span></div>' +
          (who ? '<div class="fa2-s fa2-who">' + esc(who) + '</div>' : '') +
          '<div class="fa2-s">' + esc(sub) + (x.pdf ? ' \u00b7 <a class="cc-link" href="' + esc(x.pdf) + '" target="_blank" rel="noopener">PDF</a>' : '') + '</div></div>' +
          '<div class="fa2-r">' + (tot != null ? '<b class="fa2-amt">' + fa2Money(tot) + '</b>' : '') +
            (isPend ? '<button type="button" class="cc-mini fa2-rev" data-id="' + esc(x.importId) + '">Review</button>' : '') + '</div>' +
        '</div>';
      }
      el.innerHTML =
        (pend.length ? '<div class="fa2-eyebrow">Pending (' + pend.length + ')</div>' + pend.map(function (x) { return card(x, true); }).join('') : '') +
        (rest.length ? '<div class="fa2-eyebrow">Recent</div>' + rest.map(function (x) { return card(x, false); }).join('') : '');
      el.onclick = function (e) {
        var b = e.target.closest ? e.target.closest('.fa2-rev') : null; if (!b) return;
        var x = pend.filter(function (p) { return p.importId === b.dataset.id; })[0];
        if (x) fa2TransEdit(x);
      };
    }).catch(function () {
      if (CC.view !== 'fa2trans') return;
      var el = document.getElementById('fa2-list');
      if (el) el.innerHTML = '<div class="cc-empty">Couldn\u2019t reach the server.</div>';
    });
  }
  function fa2TransEdit(x) {
    CC.view = 'fa2tedit';
    setTitle('Review import', '');
    var lines = ((x.detail && x.detail.lines) || []).map(function (L) { return JSON.parse(JSON.stringify(L)); });
    var hdr = (x.detail && x.detail.hdr) || {};
    function lineRow(L, i) {
      return '<div class="fa2-item">' +
        '<div class="fa2-itop"><b>' + esc(L.refRaw) + '</b>' + (L.issue ? '<span class="cc-pill ' + (L.skipped ? '' : 'wait') + '">' + esc(L.issue) + '</span>' : '<span class="cc-pill ok">ok</span>') + '</div>' +
        '<div class="fa2-s">' + esc(L.desc || '') + ' \u00b7 qty ' + esc(L.qty) + (L.lineTotal ? ' \u00b7 $' + esc(L.lineTotal) : '') + '</div>' +
        '<div class="fa2-2col">' +
          '<input class="cc-in fa2-tl" data-f="lot" data-i="' + i + '" placeholder="Lot" value="' + esc(L.lot || '') + '"' + (L.skipped ? ' disabled' : '') + '>' +
          '<label class="fa2-chk"><input type="checkbox" class="fa2-tl" data-f="skip" data-i="' + i + '"' + (L.skipped ? ' checked' : '') + '> Not F&amp;A stock \u2014 skip</label>' +
        '</div>' +
        (L.issue === 'overdraft' ? '<button type="button" class="cc-mini fa2-res" data-i="' + i + '">' + (L.resolve ? 'Overdraft resolved \u2713' : 'Resolve overdraft\u2026') + '</button>' : '') +
      '</div>';
    }
    fa2Shell('Review ' + esc(x.bo || 'import'),
      esc([hdr.facility, hdr.dos, hdr.surgeon].filter(Boolean).join(' \u00b7 ')),
      '<div id="fa2-tlines">' + lines.map(lineRow).join('') + '</div>' +
      '<div class="fa2-mrow">' +
        '<button id="t-deny" type="button" class="cc-mini cc-endb">Deny all</button>' +
        '<button id="t-appr" type="button" class="cc-btn">Approve</button>' +
      '</div>' +
      '<button id="t-back" type="button" class="cc-link" style="margin-top:10px">\u2039 Back to transactions</button>');
    var wrap = document.getElementById('fa2-tlines');
    wrap.addEventListener('input', function (e) {
      var t = e.target; if (!t.classList.contains('fa2-tl')) return;
      var L = lines[+t.dataset.i];
      if (t.dataset.f === 'lot') { L.lot = t.value.trim().toUpperCase(); }
    });
    wrap.addEventListener('change', function (e) {
      var t = e.target; if (!t.classList.contains('fa2-tl') || t.dataset.f !== 'skip') return;
      lines[+t.dataset.i].skipped = t.checked;
      wrap.innerHTML = lines.map(lineRow).join('');
    });
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.fa2-res') : null; if (!b) return;
      var L = lines[+b.dataset.i];
      fa2Overdraft({ ref: L.refRaw, lot: L.lot, qty: L.qty, onhand: 0 }, 'imp', {}, function () {});
      // reuse modal but capture into the line:
      var mo = document.querySelector('.fa2-modal');
      if (mo) {
        var go = mo.querySelector('#od-go');
        go.addEventListener('click', function () {
          L.resolve = { source: mo.querySelector('#od-src').value.trim(), date: mo.querySelector('#od-date').value, notes: mo.querySelector('#od-notes').value.trim() };
          wrap.innerHTML = lines.map(lineRow).join('');
        });
      }
    });
    document.getElementById('t-back').addEventListener('click', function () { fa2Trans(); });
    document.getElementById('t-deny').addEventListener('click', function () {
      fa2Confirm('Deny this whole import?', 'No inventory changes will be made.', 'Deny all', true).then(function (ok) {
        if (!ok) return;
        fa2Call('import_deny', { importId: x.importId, by: fa2Who() }).then(function (j) {
          if (j && j.ok) { fa2Trans(); } else fa2Err('fa2-err', 'Deny failed: ' + ((j && j.err) || 'server'));
        }).catch(function () { fa2Err('fa2-err', 'Couldn\u2019t reach the server.'); });
      });
    });
    document.getElementById('t-appr').addEventListener('click', function () {
      var send = lines.map(function (L) {
        return { refRaw: L.refRaw, desc: L.desc, lot: L.lot, qty: L.qty, unitPrice: L.unitPrice, lineTotal: L.lineTotal, skipped: !!L.skipped, resolve: L.resolve || null };
      });
      var b = document.getElementById('t-appr'); b.disabled = true; b.textContent = 'Applying\u2026';
      fa2Call('import_approve', { importId: x.importId, lines: send, by: fa2Who() }).then(function (j) {
        if (j && j.ok) { fa2CacheKill(); fa2Trans(); }
        else { fa2Err('fa2-err', 'Approve failed: ' + ((j && j.err) || 'server') + (j && j.at !== undefined ? ' (line ' + (j.at + 1) + ')' : '')); b.disabled = false; b.textContent = 'Approve'; }
      }).catch(function () { fa2Err('fa2-err', 'Couldn\u2019t reach the server.'); b.disabled = false; b.textContent = 'Approve'; });
    });
  }

  /* ---------- Admin ---------- */
  function fa2Admin() {
    setTitle('Admin', ''); backBtn.hidden = false;
    ccStop();
    if (!fa2Ensure(fa2Admin)) return; fa2Wide(true);
    CC.view = 'fa2adm';
    if (!FA2.adminPw) {
      fa2Shell('Admin', 'Master password required.',
        '<input id="a-pw" class="cc-in" type="password" autocomplete="off" placeholder="Admin password">' +
        '<button id="a-go" class="cc-btn">Unlock</button>');
      var go = document.getElementById('a-go');
      function tryA() {
        var v = document.getElementById('a-pw').value; if (!v) return;
        var er = document.getElementById('fa2-err'); if (er) er.hidden = true; // don't leave the last failure on screen
        go.disabled = true; go.textContent = 'Checking\u2026';
        fa2Call('admin', { adminPw: v, op: 'toggles_get' }).then(function (j) {
          if (j && j.ok) { FA2.adminPw = v; fa2Admin(); }
          else { go.disabled = false; go.textContent = 'Unlock'; fa2Err('fa2-err', j && j.err === 'adminpw' ? 'Wrong password.' : 'Server error.'); }
        }).catch(function (e) { go.disabled = false; go.textContent = 'Unlock'; fa2Err('fa2-err', fa2FailMsg(e)); });
      }
      go.addEventListener('click', tryA);
      document.getElementById('a-pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryA(); });
      return;
    }
    fa2Shell('Admin', 'Teams control sheet access and email recipients. Changes save instantly.',
      '<div class="fa2-mrow" style="justify-content:flex-start"><button type="button" id="a-rep" class="cc-mini">Send full report</button><button type="button" id="a-welb" class="cc-mini">Send welcome email</button></div>' +
      '<div id="a-body">' + skel(3) + '</div>',
      function () { fa2CacheKill(); return fa2AdminLoad(); });
    document.getElementById('a-rep').addEventListener('click', function () { fa2SendReport(); });
    document.getElementById('a-welb').addEventListener('click', function () { fa2SendWelcome(); });
    fa2AdminLoad();
  }
  function fa2AdminLoad() {
    return Promise.all([
      fa2Call('admin', { adminPw: FA2.adminPw, op: 'teams_get' }),
      fa2Call('admin', { adminPw: FA2.adminPw, op: 'toggles_get' })
    ]).then(function (rs) {
      if (CC.view !== 'fa2adm') return;
      var teams = (rs[0] && rs[0].teams) || [];
      var tg = (rs[1] && rs[1].toggles) || {};
      FA2.teams = teams;
      var body = document.getElementById('a-body'); if (!body) return;
      var seen = {}; teams.forEach(function (t) { var k = String(t.email || '').trim().toLowerCase(); if (k) seen[k] = (seen[k] || 0) + 1; });
      function section(role, label) {
        var list = teams.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return x.t.role === role; });
        return '<div class="fa2-lab">' + label + '</div>' +
          (list.length ? list.map(function (x) {
            var k = String(x.t.email || '').trim().toLowerCase();
            return '<div class="fa2-row"><div class="fa2-l"><div class="fa2-t">' + esc(x.t.name) + '</div><div class="fa2-s">' + esc(x.t.email) + (x.t.active ? '' : ' \u00b7 inactive') + (seen[k] > 1 ? ' \u00b7 <b>listed ' + seen[k] + '\u00d7 \u2014 gets every share email ' + seen[k] + '\u00d7</b>' : '') +
              ' \u00b7 <button type="button" class="cc-link a-wel" data-em="' + esc(x.t.email) + '">send welcome</button></div></div>' +
              '<div class="fa2-r"><button type="button" class="fa2-x a-del" data-i="' + x.i + '">\u00d7</button></div></div>';
          }).join('') : '<div class="cc-sub2">Nobody yet.</div>') +
          '<div class="fa2-2col"><input class="cc-in a-nm" data-r="' + role + '" placeholder="Name"><input class="cc-in a-em" data-r="' + role + '" placeholder="Email"></div>' +
          '<button type="button" class="cc-mini a-add" data-r="' + role + '">+ Add to ' + label + '</button>';
      }
      body.innerHTML =
        section('sports', 'Sports team') +
        section('fa', 'F&amp;A team') +
        '<div class="fa2-lab">Emails</div>' +
        '<label class="fa2-chk"><input id="a-tw" type="checkbox"' + (tg.weeklyEmail ? ' checked' : '') + '> Weekly F&amp;A expiring report (Sun 8 PM)</label>' +
        '<label class="fa2-chk"><input id="a-tm" type="checkbox"' + (tg.monthlyEmail ? ' checked' : '') + '> Monthly sports summary (1st, 8 AM)</label>' +
        '<div class="fa2-lab">Test &amp; tools</div>' +
        '<div class="fa2-mrow">' +
          '<button type="button" id="a-ew" class="cc-mini">Send weekly Exp. now</button>' +
          '<button type="button" id="a-em2" class="cc-mini">Send monthly Exp. now</button>' +
        '</div>' +
        '<div id="a-out" class="cc-sub2"></div>';
      function saveTeams() {
        fa2Call('admin', { adminPw: FA2.adminPw, op: 'teams_set', rows: FA2.teams }).then(function (j) {
          if (j && j.ok) { FA2.teams = j.teams; fa2TeamsSave(j.teams); fa2CacheKill(); fa2AdminLoad(); var o = document.getElementById('a-out'); if (o) { var msg = []; if (j.sharing) msg.push('Sheet access synced' + (j.sharing.added.length ? ' \u2014 added ' + j.sharing.added.join(', ') : '')); if (j.welcomed && j.welcomed.length) msg.push('Welcome email sent to ' + j.welcomed.join(', ')); if (j.welcomeSkipped && j.welcomeSkipped.length) msg.push('No welcome needed for ' + j.welcomeSkipped.map(function (x) { return x.email + ' (' + x.reason.replace(/-/g, ' ') + ')'; }).join(', ') + ' \u2014 use \u201csend welcome\u201d to force one'); if (j.welcomeErrors && j.welcomeErrors.length) msg.push('Email issues: ' + j.welcomeErrors.join('; ')); if (j.sharing && j.sharing.errors.length) msg.push('Access issues: ' + j.sharing.errors.join('; ')); o.textContent = msg.join(' \u00b7 ') + '.'; } }
          else fa2Err('fa2-err', 'Save failed.');
        }).catch(function () { fa2Err('fa2-err', 'Couldn\u2019t reach the server.'); });
      }
      body.onclick = function (e) {
        var w = e.target.closest ? e.target.closest('.a-wel') : null;
        if (w) {
          if (w.disabled) return;
          var em2 = w.dataset.em;
          w.disabled = true; w.textContent = 'sending\u2026';
          fa2Call('admin', { adminPw: FA2.adminPw, op: 'welcome_send', email: em2 }).then(function (j) {
            w.textContent = (j && j.ok) ? 'sent \u2713' : 'failed';
            var o = document.getElementById('a-out');
            if (o) o.textContent = (j && j.ok) ? ('Welcome email sent to ' + em2 + '.') : ('Couldn\u2019t send to ' + em2 + ((j && j.err) ? ' (' + j.err + ')' : '') + '.');
            setTimeout(function () { w.disabled = false; w.textContent = 'send welcome'; }, 4000);
          }).catch(function () { w.disabled = false; w.textContent = 'send welcome'; fa2Err('fa2-err', 'Couldn\u2019t reach the server.'); });
          return;
        }
        var d = e.target.closest ? e.target.closest('.a-del') : null;
        if (d) { var di = +d.dataset.i; fa2Confirm('Remove this person?', 'Their sheet access is revoked too.', 'Remove', true).then(function (ok) { if (ok) { FA2.teams.splice(di, 1); saveTeams(); } }); return; }
        var a = e.target.closest ? e.target.closest('.a-add') : null;
        if (a) {
          if (a.disabled) return;
          var r = a.dataset.r;
          var nm = body.querySelector('.a-nm[data-r="' + r + '"]').value.trim();
          var em = body.querySelector('.a-em[data-r="' + r + '"]').value.trim();
          if (!nm || em.indexOf('@') < 1) return fa2Err('fa2-err', 'Name and a valid email are both needed.');
          var dup = FA2.teams.filter(function (t) { return String(t.email || '').trim().toLowerCase() === em.toLowerCase(); })[0];
          if (dup) return fa2Err('fa2-err', em + ' is already on the ' + (dup.role === 'fa' ? 'F&A' : 'Sports') + ' team \u2014 use a different email.');
          a.disabled = true; a.classList.add('a-busy'); a.textContent = 'Adding\u2026';
          FA2.teams.push({ name: nm, email: em, role: r, active: true });
          saveTeams(); return;
        }
      };
      function tgl() {
        fa2Call('admin', { adminPw: FA2.adminPw, op: 'toggles_set', weeklyEmail: document.getElementById('a-tw').checked, monthlyEmail: document.getElementById('a-tm').checked })
          .catch(function () { fa2Err('fa2-err', 'Couldn\u2019t save toggles.'); });
      }
      document.getElementById('a-tw').addEventListener('change', tgl);
      document.getElementById('a-tm').addEventListener('change', tgl);
      function tool(id, op) {
        document.getElementById(id).addEventListener('click', function () {
          var o = document.getElementById('a-out'); o.textContent = 'Working\u2026';
          fa2Call('admin', { adminPw: FA2.adminPw, op: op }).then(function (j) { o.textContent = JSON.stringify(j); }).catch(function () { o.textContent = 'Server unreachable.'; });
        });
      }
      tool('a-ew', 'email_weekly_now'); tool('a-em2', 'email_monthly_now');
    }).catch(function () {
      var body = document.getElementById('a-body');
      if (body) body.innerHTML = '<div class="cc-empty">Couldn\u2019t reach the server.</div>';
    });
  }

  // Pick anyone on either team, or type an address that isn't on a team at all.
  function fa2SendWelcome() {
    var teams = FA2.teams || [];
    var wrap = document.createElement('div');
    wrap.className = 'fa2-modal';
    function group(role, label) {
      var list = teams.filter(function (t) { return t.role === role && t.email; });
      if (!list.length) return '<div class="fa2-lab">' + label + '</div><div class="cc-sub2">Nobody yet.</div>';
      return '<div class="fa2-lab">' + label + '</div>' + list.map(function (t) {
        return '<label class="fa2-chk"><input type="checkbox" class="sw-em" value="' + esc(t.email) + '"> ' + esc(t.name) + ' <span class="fa2-s">' + esc(t.email) + '</span></label>';
      }).join('');
    }
    wrap.innerHTML =
      '<div class="fa2-mcard" style="max-height:80vh;overflow:auto">' +
        '<div class="fa2-t">Send welcome email</div>' +
        '<div class="fa2-s" style="margin:6px 0 4px">App link, the password for their side, the live sheet, the on-hand list and your contact details.</div>' +
        '<div class="fa2-s" style="margin:0 0 6px;color:#f0c060">Stryker addresses: the email is sent, but Stryker\u2019s mail filter can quarantine it before it reaches their inbox. If someone doesn\u2019t see it, have them check quarantine or ask IT to allow syksmtoolbox@gmail.com.</div>' +
        group('sports', 'Sports team') + group('fa', 'F&amp;A team') +
        '<div class="fa2-lab">Or send to someone not on a team</div>' +
        '<input id="sw-man" class="cc-in" placeholder="name@example.com">' +
        '<input id="sw-name" class="cc-in" placeholder="Their name (optional)">' +
        '<div class="fa2-lab">Which password should that person get?</div>' + fa2Chips('sw-role', ['Sports', 'F&A'], 'Sports') +
        '<div id="sw-err" class="cc-err" hidden></div>' +
        '<div class="fa2-mrow"><button type="button" id="sw-cancel" class="cc-mini">Cancel</button><button type="button" id="sw-go" class="cc-btn">Send</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var role = 'sports';
    fa2ChipWire('sw-role', function (v) { role = v.indexOf('F&A') > -1 ? 'fa' : 'sports'; });
    document.getElementById('sw-cancel').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('sw-go').addEventListener('click', function () {
      var to = [].slice.call(wrap.querySelectorAll('.sw-em:checked')).map(function (c) { return { email: c.value }; });
      var man = document.getElementById('sw-man').value.trim();
      if (man) {
        if (man.indexOf('@') < 1) return fa2Err('sw-err', 'That email doesn\u2019t look right.');
        to.push({ email: man, name: document.getElementById('sw-name').value.trim(), role: role });
      }
      if (!to.length) return fa2Err('sw-err', 'Pick someone, or type an email.');
      var b = document.getElementById('sw-go'); b.disabled = true; b.textContent = 'Sending\u2026';
      var done = 0, bad = [];
      to.reduce(function (chain, p) {
        return chain.then(function () {
          return fa2Call('admin', { adminPw: FA2.adminPw, op: 'welcome_send', email: p.email, name: p.name || '', role: p.role || '' })
            .then(function (j) { if (j && j.ok) done++; else bad.push(p.email); }, function () { bad.push(p.email); });
        });
      }, Promise.resolve()).then(function () {
        wrap.remove();
        kitBanner(document.querySelector('.cc-card'), done + ' welcome email' + (done === 1 ? '' : 's') + ' sent' + (bad.length ? ' \u00b7 ' + bad.length + ' failed' : ''));
        var o = document.getElementById('a-out');
        var corp = to.filter(function (p) { return /@stryker\.com$/i.test(p.email); }).length;
        if (o) o.textContent = 'Welcome sent to ' + done + ' recipient' + (done === 1 ? '' : 's') + (bad.length ? ' \u2014 failed: ' + bad.join(', ') : '') + '.' + (corp ? ' Stryker addresses may land in quarantine \u2014 confirm they received it.' : '');
      });
    });
  }
  function fa2SendReport() {
    var teams = FA2.teams || [];
    var wrap = document.createElement('div');
    wrap.className = 'fa2-modal';
    function group(role, label) {
      var list = teams.filter(function (t) { return t.role === role && t.email; });
      if (!list.length) return '<div class="fa2-lab">' + label + '</div><div class="cc-sub2">Nobody yet.</div>';
      return '<div class="fa2-lab">' + label + '</div>' + list.map(function (t) {
        return '<label class="fa2-chk"><input type="checkbox" class="sr-em" value="' + esc(t.email) + '"> ' + esc(t.name) + ' <span class="fa2-s">' + esc(t.email) + '</span></label>';
      }).join('');
    }
    wrap.innerHTML =
      '<div class="fa2-mcard" style="max-height:80vh;overflow:auto">' +
        '<div class="fa2-t">Send inventory report</div>' +
        '<div class="fa2-s" style="margin:6px 0 4px">Full on-hand list \u2014 REF, description, lot, expiration, qty, last known location.</div>' +
        '<div id="sr-stat" class="cc-sub2">Checking inventory\u2026</div>' +
        group('fa', 'F&amp;A team') + group('sports', 'Sports team') +
        '<div class="fa2-lab">Or type an email</div>' +
        '<input id="sr-man" class="cc-in" placeholder="name@example.com">' +
        '<div id="sr-err" class="cc-err" hidden></div>' +
        '<div class="fa2-mrow"><button type="button" id="sr-cancel" class="cc-mini">Cancel</button><button type="button" id="sr-go" class="cc-btn">Send report</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    fa2Call('admin', { adminPw: FA2.adminPw, op: 'report_preview' }).then(function (j) {
      var st = document.getElementById('sr-stat'); if (!st) return;
      st.textContent = j && j.ok ? (j.lots + ' lots \u00b7 ' + j.units + ' units on hand' + (j.instruction ? ' \u00b7 instruction sheet attached' : '')) : 'Couldn\u2019t read inventory.';
    }).catch(function () { var st = document.getElementById('sr-stat'); if (st) st.textContent = ''; });
    document.getElementById('sr-cancel').addEventListener('click', function () { wrap.remove(); });
    document.getElementById('sr-go').addEventListener('click', function () {
      var to = [].slice.call(wrap.querySelectorAll('.sr-em:checked')).map(function (c) { return c.value; });
      var man = document.getElementById('sr-man').value.trim();
      if (man) { if (man.indexOf('@') < 1) return fa2Err('sr-err', 'That email doesn\u2019t look right.'); to.push(man); }
      if (!to.length) return fa2Err('sr-err', 'Pick at least one recipient.');
      var b = document.getElementById('sr-go'); b.disabled = true; b.textContent = 'Sending\u2026';
      fa2Call('admin', { adminPw: FA2.adminPw, op: 'send_report', to: to }).then(function (j) {
        if (j && j.ok) { wrap.remove(); kitBanner(document.querySelector('.cc-card'), 'Report sent to ' + j.sent + ' recipient' + (j.sent > 1 ? 's' : '')); }
        else { fa2Err('sr-err', (j && j.err === 'norecipients') ? 'No valid recipients.' : 'Couldn\u2019t send.'); b.disabled = false; b.textContent = 'Send report'; }
      }).catch(function () { fa2Err('sr-err', 'Couldn\u2019t reach the server.'); b.disabled = false; b.textContent = 'Send report'; });
    });
  }

  // P7 — any navigation (Back, swipe-back, links) closes the card overlays and releases the viewer's scroll lock
  function closeOverlays() {
    var lb = document.getElementById('lb'); if (LB_CLOSE && lb && !lb.hidden) LB_CLOSE();
    ['share-sheet', 'ug-sheet', 'a2hs-sheet', 'jump-sheet'].forEach(function (id) { var el = document.getElementById(id); if (el && !el.hidden) el.hidden = true; });
    SH_PREP = null;
  }
  // P6/P24: route({ soft: true }) redraws the current screen in place when the search box is cleared — for real, so the
  // Backorder Report and the usage dashboard (which fill themselves after render()) get their data and listeners back.
  // It is not a new visit: no usage "view", What's New and the family chips stay, and the page returns to where it was
  // scrolled before the search started (the entry's record, P35; SOFT_Y when there is none).
  var SOFT_Y = 0;
  // Cycle count, F&A and the territory screens: the navigation-state code never touches these entries (P35/P36 fence).
  function routeIsCT(h) {
    h = String(h || '').split('?')[0];
    return h === '#/cc' || h === '#/cc/fops' || h === '#/fa' || h === '#/ct' || h === '#/teams' || h === '#/signup' || h.indexOf('#/team/') === 0 || h.indexOf('#/fa2') === 0;
  }
  function route(ev) {
    var soft = !!(ev && ev.soft === true);
    var leftCard = null; SCROLL_TOP = false; VT_BACK = null;
    try { leftCard = !soft && content ? content.querySelector('#pcard') : null; } catch (eLc) {} // N11c: the card being left
    if (!soft) { try { ugRoute(); } catch (eUg) {} } // anonymous usage: log the screen / card before anything renders
    var raw = location.hash || '#/';
    var qi = raw.indexOf('?');
    var query = qi > -1 ? raw.slice(qi + 1) : '';
    // P35/P5: save the entry being left (its scroll and filters, read before anything below changes them), then pick up
    // this entry's own record. Cycle count / F&A entries are not tracked and keep scrollRestoration 'auto'.
    var navCT = routeIsCT(qi > -1 ? raw.slice(0, qi) : raw), rec = null;
    try { if (!soft && NAV.cur) navSave(NAV.cur); } catch (eN0) {}
    try { rec = navEnter(!navCT, soft); } catch (eN1) { rec = null; }
    if (leftCard && rec && !navCT) VT_BACK = { sku: leftCard.getAttribute('data-sku') || '', h1: leftCard.querySelector('h1'), hero: leftCard.querySelector('.pc-hero') };
    NAV.pending = null; navCancel(); NAV.extra = null;
    try { if ('scrollRestoration' in history) history.scrollRestoration = navCT ? 'auto' : 'manual'; } catch (eN2) {}
    var qNew = qparam(query, 'q'), ST = null, rf = !soft && rec && rec.f ? rec.f : null;
    if (!navCT && !soft) { try { ST = stRead(query); } catch (eSt) { ST = null; } }
    if (rf && rf.q === qNew) { SFILT = rf.sf || null; SPECF = navClone(rf.sp); SALL = !!rf.sa; } // Back / Forward / reload: this entry's filters
    else if (ST && ST.q) { SFILT = ST.c; SPECF = ST.f; SALL = ST.all; }                         // a shared or reloaded search link
    else if (qNew !== CURQ) { SALL = false; SPECF = {}; }                                       // a new entry with a different query starts clean (as today)
    CURQ = qNew;
    if (qInput && qInput.value !== CURQ) qInput.value = CURQ;
    try { qUi(); } catch (eQ) {}
    var h = qi > -1 ? raw.slice(0, qi) : raw;
    // Renamed categories: old links (favorites, shared cards, home-screen clips) still open.
    h = h.replace(/Knotless(?:%20| )Hard(?:%20| )Body(?:%20| )Anchors/g, 'Knotless%20Anchors');
    var m;
    var dec = function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } };
    var splitCatRest = function (s) {
      s = dec(s);
      var cats = (D.catOrder || []).slice().sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < cats.length; i++) { if (s.indexOf(cats[i] + '/') === 0) return [cats[i], s.slice(cats[i].length + 1)]; }
      var k = s.indexOf('/'); return k > -1 ? [s.slice(0, k), s.slice(k + 1)] : [s, ''];
    };
    // Split an encoded cat/fam[/sub] path on its literal '/' separators BEFORE decoding, so a name that
    // itself contains '/' (encoded as %2F, e.g. the "A/M portal guides" sub) stays in one piece.
    // Falls back to the decode-first split for hand-typed links with raw slashes.
    var splitParts = function (s, want) {
      var raw = s.split('/'), cats = D.catOrder || [];
      for (var n = 1; n <= raw.length - (want - 1); n++) {
        var cat = raw.slice(0, n).map(dec).join('/');
        if (cats.indexOf(cat) === -1) continue;
        var rest = raw.slice(n).map(dec);
        if (rest.length === want - 1) return [cat].concat(rest);
      }
      return null;
    };
    if (soft) { // P6: back to where the screen under the results was when the search started
      NAV.pending = rec && rec.by != null ? { y: rec.by, a: rec.ba } : (SOFT_Y ? { y: SOFT_Y, a: null } : null);
    } else {
      SOFT_Y = 0;
      if (rec && (rec.y > 0 || rec.a)) NAV.pending = rec; // P35: restored by render() once the screen is drawn
      else { if (VT_FROM || VT_CAT) SCROLL_TOP = true; else window.scrollTo(0, 0); if (rec && rec.sx) NAV.pending = rec; } // (at the top, but the chip rows were scrolled); N11a: a pending morph scrolls after its old snapshot
    }
    try { closeOverlays(); } catch (eOv) {}
    var xb = document.getElementById('expban');
    if (xb && Date.now() - (+xb.dataset.born || 0) > 1500) xb.remove();
    var pmv = document.getElementById('pnmove');
    if (pmv && dec(h) !== dec(pmv.dataset.route || '')) pnMoveClose(false); // Back / any navigation away dismisses it
    if (!soft) hideWN(false);
    CURREFRESH = null;
    try { if (PTR_RESET) PTR_RESET(); } catch (ePtr) {} // the pull-to-refresh arrow never follows you to the next screen
    homeBtn.classList.add('away');
    if (!soft) { // P5: family chips come back with the entry (its record, else ?t= in the URL)
      FILT = rf && rf.ft ? navClone(rf.ft) : {};
      if (!rf && ST) ST.t.forEach(function (k) { FILT[k] = 1; });
      delete FILT.fp;
    }
    CURVIEW = null;
    var fpFilt = qparam(query, 'fp'); if (fpFilt) FILT.fp = fpFilt;
    var gp0 = document.getElementById('glosspanel'); if (gp0) gp0.hidden = true;
    if (document.body) document.body.classList.remove('gloss-on');
    var inCT = navCT;
    if (!inCT && !soft) { // P46: the Backorder Report's filter + section (record, else ?bq= / ?bs=)
      var xs = rf && rf.xs ? rf.xs : null;
      BOV = xs && typeof xs.bq === 'string' ? { q: xs.bq, sec: /^(bo|ctl|clr)$/.test(xs.bs || '') ? xs.bs : 'all' }
        : { q: ST ? ST.bq : '', sec: ST && ST.bs ? ST.bs : 'all' };
      if (rf) stWrite(); // the URL follows the restored state (self-heals a URL that fell behind)
    }
    if (!inCT) ccStop();
    ccBar(inCT); // catalog search + info-card scanner hidden everywhere inside CT screens
    if (h.indexOf('#/fa2') !== 0) fa2Wide(false);
    if (h === '#/cc/fops') { terrSet('ct'); return fopsScreen(); }
    if (h === '#/cc') { terrSet('ct'); return ccScreen(); }
    if (h === '#/ct') { terrSet('ct'); return ctScreen(); }
    if (/^#\/fa2\/(add|add2|use|return|trans|admin)$/.test(h) && fa2IsFA()) { location.replace('#/fa2'); return; }
    if (h === '#/fa2/add') { terrSet('ct'); return fa2Add(); }
    if (h === '#/fa2/add2') { terrSet('ct'); return fa2Add2(); }
    if (h === '#/fa2/use') { terrSet('ct'); return fa2Use(); }
    if (h === '#/fa2/return') { terrSet('ct'); return fa2Return(); }
    if (h === '#/fa2/send') { terrSet('ct'); return fa2Send(); }
    if (h === '#/fa2/trans') { terrSet('ct'); return fa2Trans(); }
    if (h === '#/fa2/admin') { terrSet('ct'); return fa2Admin(); }
    if (h === '#/fa2') { terrSet('ct'); return fa2Home(); }
    if (h === '#/fa2/onhand') { terrSet('ct'); return fa2OnHand(); }
    if (h === '#/fa2/history') { terrSet('ct'); return fa2History(); }
    if (h === '#/fa') { location.replace('#/fa2'); return; } // v1 F&A tool retired — v2 is the only entry
    if (h === '#/teams/help/view') return helpViewScreen();
    if (h === '#/teams/help') return helpScreen();
    if (h === '#/teams') return teamsScreen();
    if (h === '#/signup') return signupScreen();
    if ((m = h.match(/^#\/team\/([a-z0-9]+)\/manage$/))) { if (!TERR[m[1]] || !TERR[m[1]].hub) return teamsScreen(); terrSet(m[1]); return manageScreen(); }
    if ((m = h.match(/^#\/team\/([a-z0-9]+)\/cc\/fops$/))) { if (!TERR[m[1]]) return teamsScreen(); terrSet(m[1]); return fopsScreen(); }
    if ((m = h.match(/^#\/team\/([a-z0-9]+)(\/cc)?$/))) { if (!TERR[m[1]]) return teamsScreen(); terrSet(m[1]); return m[2] ? ccScreen() : ctScreen(); }
    if ((m = h.match(/^#\/top\/(implants|arthroscopy)$/))) return topScreen(m[1]);
    if ((m = h.match(/^#\/cat\/(.+)$/))) return catScreen(dec(m[1]));
    if ((m = h.match(/^#\/dgrp\/(.+)$/))) return dispGroupScreen(dec(m[1]));
    if ((m = h.match(/^#\/fam\/(.+)$/))) { var fp = splitParts(m[1], 2) || splitCatRest(m[1]); return famScreen(fp[0], fp[1]); }
    if ((m = h.match(/^#\/sub\/(.+)$/))) {
      var sp3 = splitParts(m[1], 3);
      if (sp3) return subScreen(sp3[0], sp3[1], sp3[2]);
      var sp = splitCatRest(m[1]), famHit = '';
      D.items.forEach(function (it) { if (it.fam && it.fam.length > famHit.length && sp[1].indexOf(it.fam + '/') === 0) famHit = it.fam; });
      if (famHit) return subScreen(sp[0], famHit, sp[1].slice(famHit.length + 1));
      var j = sp[1].lastIndexOf('/'); return subScreen(sp[0], dec(sp[1].slice(0, j)), dec(sp[1].slice(j + 1)));
    }
    if ((m = h.match(/^#\/pn\/(.+)$/))) return pnScreen(dec(m[1]));
    if ((m = h.match(/^#\/item\/(\d+)$/))) return legacyRedirect('item', +m[1]);
    if ((m = h.match(/^#\/instr\/([^\/]+)(?:\/(Capital|Disposables|Instruments))?$/))) {
      var isku = dec(m[1]);
      if (BYPN[nrm(isku)]) return instrScreen(isku, m[2] || '');
      if (/^\d+$/.test(isku) && +isku < D.items.length) return legacyRedirect('item', +isku);
      return instrScreen(isku, m[2] || '');
    }
    if ((m = h.match(/^#\/parts\/(.+)$/))) return partsScreen(dec(m[1]));
    if (h === '#/scan') {
      home();
      setTimeout(function () {
        try { history.replaceState(history.state, '', '#/'); } catch (eSc) {} // keeps the entry's nav id (P35)
        var sb = document.getElementById('scanbtn');
        if (sb) sb.click();
      }, 350);
      return;
    }
    if (h === '#/usage') return usageScreen();
    if (h === '#/about') return aboutScreen();
    if (h === '#/bo') { if (!boOn()) { location.replace('#/'); return; } return boScreen(); }
    if (h === '#/probes') return probesScreen();
    if ((m = h.match(/^#\/probe\/(\d+)$/))) return legacyRedirect('probe', +m[1]);
    if (h === '#/shavers') return shaversScreen();
    if ((m = h.match(/^#\/shaverfam\/(.+)$/))) return shaverFamScreen(dec(m[1]));
    if ((m = h.match(/^#\/shaver\/(\d+)$/))) return legacyRedirect('shaver', +m[1]);
    return home();
  }
  function goBack() { history.length > 1 ? history.back() : (location.hash = '#/'); }
  backBtn.addEventListener('click', goBack);
  homeBtn.addEventListener('click', function () { location.hash = '#/'; });
  // ---- Case Labs (4.154): on Home, the title "SportsMed Toolbox" opens a small menu with one shiny "Case Labs" button (the
  // wordmark style, in a box with a slow sheen). Tapping it — or "here" in the What's New item — hands ToolBox over to the lab:
  // the box grows into the whole screen as the Case Labs stage, the wordmark flies to its centre and the ToolBox page steps away;
  // the lab page (its own document, labs/acl/) starts from that same frame (sessionStorage tbx_lab_enter). Opening the menu
  // starts downloading the lab into the service-worker cache. Reduce Motion: no animation, same navigation. Home screen only;
  // cycle count / F&A never show this title. Everything here is try/catch-guarded (boot must not fail on it).
  var LABS = (function () {
    var LAB_LIST = [{ id: 'acl', url: 'labs/acl/', name: 'ACL Case Lab' }];
    var root = document.documentElement, menu = null, scrim = null, busy = false, fetched = false, on = false;
    var CARET = '<svg class="lb-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    var WORD = 'Case <em>Labs</em>';
    function titleOn(v) {
      on = !!v; title.classList.toggle('labs', on);
      if (on) { if (!title.querySelector('.lb-caret')) title.insertAdjacentHTML('beforeend', CARET); title.setAttribute('role', 'button'); title.setAttribute('tabindex', '0'); title.setAttribute('aria-haspopup', 'menu'); title.setAttribute('aria-expanded', 'false'); }
      else { ['role', 'tabindex', 'aria-haspopup', 'aria-expanded'].forEach(function (a) { title.removeAttribute(a); }); close(true); }
    }
    function build() {
      if (menu) return;
      scrim = document.createElement('div'); scrim.id = 'labscrim'; scrim.hidden = true; document.body.appendChild(scrim);
      menu = document.createElement('div'); menu.id = 'labmenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'SportsMed Toolbox sections'); menu.hidden = true;
      menu.innerHTML = '<button class="lm-case" type="button" role="menuitem" data-lab="acl" aria-label="Case Labs: the ACL Case Lab">' +
        '<span class="lm-shine" aria-hidden="true"></span><span class="lm-word">' + WORD + '</span><span class="lm-sub">ACL · plan, ream and fix in 3D</span></button>';
      document.body.appendChild(menu);
      menu.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-lab]'); if (b) go(b.getAttribute('data-lab'), b); });
      scrim.addEventListener('click', function () { close(); });
      menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); try { title.focus(); } catch (x) {} } });
    }
    function prefetch() { // the lab's files into the SW cache while the menu is open (once per page; Data Saver skips it)
      if (fetched) return; fetched = true;
      try { if (navigator.connection && navigator.connection.saveData) return; } catch (x) {}
      try {
        fetch('labs/acl/files.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
          // the lab opens at labs/acl/ — cache that URL too (the service worker keys by exact path), so it opens offline
          ['labs/acl/'].concat((m && m.files || []).map(function (f) { return 'labs/acl/' + f; })).forEach(function (u, i) { setTimeout(function () { fetch(u).catch(function () {}); }, i * 25); });
        }).catch(function () {});
      } catch (x) {}
    }
    function open() {
      if (!on || busy) return; build(); prefetch();
      var r = document.getElementById('bar').getBoundingClientRect();
      menu.style.top = Math.round(r.bottom + 8) + 'px';
      scrim.hidden = false; menu.hidden = false; title.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(function () { menu.classList.add('open'); scrim.classList.add('open'); });
      var f = menu.querySelector('.lm-case'); if (f) { try { f.focus({ preventScroll: true }); } catch (x) {} }
    }
    function close(now) {
      if (!menu || menu.hidden) return;
      title.setAttribute('aria-expanded', 'false'); menu.classList.remove('open'); scrim.classList.remove('open');
      var done = function () { if (!menu.classList.contains('open')) { menu.hidden = true; scrim.hidden = true; } };
      if (now || motionRM()) done(); else setTimeout(done, 180);
    }
    // the hand-over, compositor-only: the curtain is laid out at its final size (the whole screen) and starts scaled onto the
    // tapped box or row; the wordmark starts over the tapped one (or the row's centre) and ends centred at 30 px, exactly where
    // the lab page draws it on its first frame
    function go(id, from) {
      var lab = LAB_LIST.filter(function (l) { return l.id === id; })[0]; if (!lab || busy) return;
      busy = true;
      try { sessionStorage.setItem('tbx_lab_enter', String(Date.now())); } catch (x) {}
      if (motionRM() || !from || !from.getBoundingClientRect) { location.href = lab.url; return; }
      var W = window.innerWidth || 1, H = window.innerHeight || 1, fr = from.getBoundingClientRect();
      var cur = document.createElement('div'); cur.id = 'labcurtain'; cur.setAttribute('aria-hidden', 'true');
      cur.style.transform = 'translate(' + fr.left + 'px,' + fr.top + 'px) scale(' + Math.max(.01, fr.width / W) + ',' + Math.max(.01, fr.height / H) + ')';
      var word = document.createElement('div'); word.id = 'labword'; word.setAttribute('aria-hidden', 'true'); word.innerHTML = WORD;
      var src = from.querySelector('.lm-word'), fs = src ? (parseFloat(getComputedStyle(src).fontSize) || 19) : 19;
      // measured and placed with transitions off, so the flight starts from the tapped wordmark (or the tapped row, faded in)
      word.style.fontSize = fs + 'px'; word.style.transition = 'none'; word.style.visibility = 'hidden';
      document.body.appendChild(cur); document.body.appendChild(word);
      var ww = word.offsetWidth, wh = word.offsetHeight, sr = src ? src.getBoundingClientRect() : { left: fr.left + fr.width / 2 - ww / 2, top: fr.top + fr.height / 2 - wh / 2 };
      word.style.transform = 'translate(' + sr.left + 'px,' + sr.top + 'px)';
      if (!src) word.style.opacity = '0';
      close(true);
      root.classList.add('tbx-to-lab');
      void cur.offsetWidth; void word.offsetWidth;
      word.style.transition = ''; word.style.visibility = '';
      cur.style.transform = 'none'; cur.classList.add('grow');
      word.style.transform = 'translate(' + (W / 2 - ww / 2) + 'px,' + (H / 2 - wh / 2) + 'px) scale(' + (30 / fs) + ')'; word.style.opacity = ''; word.classList.add('grow');
      setTimeout(function () { location.href = lab.url; }, 520);
    }
    function reset() { // back from the lab through the back/forward cache: undo the hand-over state
      busy = false; root.classList.remove('tbx-to-lab');
      ['labcurtain', 'labword'].forEach(function (id) { var c = document.getElementById(id); if (c && c.parentNode) c.parentNode.removeChild(c); });
      close(true);
    }
    // The menu lives on Home's wordmark only. Watching the title (instead of hooking setTitle) leaves every other screen's
    // code untouched and also catches titles written directly, e.g. "Search" while typing on Home.
    function sync() { var home = title.textContent.replace(/\s+/g, ' ').trim() === 'SportsMed Toolbox'; if (home ? !on || !title.querySelector('.lb-caret') : on) titleOn(home); } // Home re-renders its title: put the caret back
    try { new MutationObserver(sync).observe(title, { childList: true, subtree: true, characterData: true }); } catch (x) {}
    sync();
    title.addEventListener('click', function () { if (!on) return; if (menu && !menu.hidden) close(); else open(); });
    title.addEventListener('keydown', function (e) { if (on && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } });
    // What's New: an item with "lab" hands over the same way, from the tapped row (it counts as read)
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-lab-go]') : null; if (!b) return;
      var id = b.getAttribute('data-lab-go'), r = b.getBoundingClientRect(), from = { getBoundingClientRect: function () { return r; }, querySelector: function () { return null; } };
      try { hideWN(true); } catch (x) {} // read; and gone if this page comes back from the back/forward cache
      go(id, from);
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) { try { reset(); } catch (x) {} } });
    window.addEventListener('hashchange', function () { try { close(true); } catch (x) {} });
    return { title: titleOn, open: open, close: close, go: go, reset: reset };
  })();
  // P36: the same Back within thumb reach in the bottom bar — shown exactly when the header Back is (the header one stays)
  (function () {
    var bb = document.getElementById('bb-back'); if (!bb) return;
    bb.addEventListener('click', function () { try { var a = document.activeElement; if (a && a.blur && a !== document.body) a.blur(); } catch (e) {} goBack(); });
    var sync = function () { var hid = !!backBtn.hidden; if (bb.hidden !== hid) { bb.hidden = hid; qPh(); } };
    try { new MutationObserver(sync).observe(backBtn, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) {}
    bb.hidden = !!backBtn.hidden;
  })();
  // P36/P11: the longest placeholder that fits the search box as it is now (Back shown or not, 320–430 pt, landscape)
  function qPh() {
    try {
      var q = document.getElementById('q'); if (!q || !q.clientWidth) return;
      var cs = getComputedStyle(q), room = q.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 14; // 14: what engines keep for a search field's own clear area
      var c = qPh.c || (qPh.c = document.createElement('canvas').getContext('2d'));
      var opts = ['Search name or part number', 'Search name or part #', 'Search or part #', 'Search'];
      for (var i = 0; i < opts.length; i++) {
        var w = c ? (c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, c.measureText(opts[i]).width) : opts[i].length * (parseFloat(cs.fontSize) || 17) * 0.5;
        if (w <= room || i === opts.length - 1) { if (q.placeholder !== opts[i]) q.placeholder = opts[i]; return; }
      }
    } catch (e) {}
  }
  window.addEventListener('resize', function () { qPh(); });
  (window.requestAnimationFrame || setTimeout)(qPh);

  // ---- bottom search wiring ----
  content = document.getElementById('content');
  qInput = document.getElementById('q');
  document.addEventListener('change', function (e) {
    var sel = e.target && e.target.closest ? e.target.closest('select[data-sfk]') : null;
    if (!sel) return;
    var k = sel.getAttribute('data-sfk');
    if (sel.value) SPECF[k] = sel.value; else delete SPECF[k];
    SALL = false;
    resultsRerender();
  });
  var qClear = document.getElementById('qclear'), qRecent = document.getElementById('qrecent');
  qInput.addEventListener('input', function () {
    var was = CURQ;
    CURQ = qInput.value.trim();
    if (!CURQ) { SFILT = null; SPECF = {}; }
    if (CURQ !== was) SALL = false; // "Show all" belongs to one query
    if (!was && CURQ) { SOFT_Y = Math.round(window.scrollY || 0); try { navNoteBrowse(); } catch (eNb) {} } // P6: where the screen under the results was
    stWrite(); // the query (and its filters) in the URL; the screen's own parameters (fp, t, bq, bs) stay
    if (CURQ) {
      if (title.innerHTML !== 'Search') LAST_TITLE = title.innerHTML;
      title.innerHTML = 'Search';
      content.innerHTML = resultsHTML(); CAT_ON = null;
    } else {
      LAST_TITLE = '';
      route({ soft: true }); // P6/P24: redraw the screen underneath for real (the saved HTML was an empty shell on #/bo and #/usage)
    }
    qUi();
  });
  // P24: a clear button that is there whenever the box has text (iOS shows its own only while the box is focused)
  function qUi() { if (qClear) qClear.hidden = !qInput.value; qrShow(); if (!qInput.value) qPh(); }
  if (qClear) {
    var keepFocus = function (e) { e.preventDefault(); }; // the tap must not blur the box: the keyboard stays if it was up
    qClear.addEventListener('pointerdown', keepFocus); qClear.addEventListener('mousedown', keepFocus);
    qClear.addEventListener('click', function () {
      var had = document.activeElement === qInput;
      qInput.value = ''; qInput.dispatchEvent(new Event('input')); // the same path as deleting the text (usage, URL, repaint)
      if (had) qInput.focus();
    });
  }
  // P20: recent searches — the last 5 committed terms, on this phone, shown as chips while the empty box is focused.
  // Committed = a result opened while the query is on screen, the keyboard's Search key with results showing, or a recent
  // chip tapped; never on idle, so a half-typed "omeg" is never kept. Chips are .qrc, not .schip (that one sets the bucket).
  var QR_KEY = 'tbx_qrecent', QR_MAX = 5;
  function qrList() {
    try { var a = JSON.parse(localStorage.getItem(QR_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x; }).slice(0, QR_MAX) : []; }
    catch (e) { return []; }
  }
  function qrNote(term) {
    try {
      var t = String(term || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (t.length < 2) return;
      var list = qrList().filter(function (x) { return x.toLowerCase() !== t.toLowerCase(); });
      list.unshift(t); localStorage.setItem(QR_KEY, JSON.stringify(list.slice(0, QR_MAX)));
    } catch (e) {}
  }
  function qrShow() {
    if (!qRecent) return;
    var list = document.activeElement === qInput && !qInput.value && !(document.body && document.body.classList.contains('ct-chrome-off')) ? qrList() : [];
    if (document.body) document.body.classList.toggle('qr-on', list.length > 0); // the feedback bubble would sit on the strip
    if (!list.length) { if (!qRecent.hidden) { qRecent.hidden = true; qRecent.innerHTML = ''; } return; }
    qRecent.innerHTML = '<span class="qrl">Recent</span>' + list.map(function (t) { return '<button type="button" class="qrc" data-qr="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') +
      '<button type="button" class="qrx" data-qrclear="1">Clear</button>';
    qRecent.hidden = false;
  }
  if (qRecent) {
    var keepFocus2 = function (e) { e.preventDefault(); }; // a tap on the strip must not blur the box first
    qRecent.addEventListener('pointerdown', keepFocus2); qRecent.addEventListener('mousedown', keepFocus2);
    qRecent.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('.qrc');
      if (c) { var t = c.getAttribute('data-qr'); qInput.value = t; qInput.dispatchEvent(new Event('input')); qrNote(t); qInput.blur(); qUi(); return; }
      if (e.target.closest && e.target.closest('[data-qrclear]')) {
        var had = qrList();
        try { localStorage.removeItem(QR_KEY); } catch (e1) {}
        qInput.blur(); qUi();
        toastMsg('Recent searches cleared', 3000, { action: { label: 'Undo', fn: function () { try { localStorage.setItem(QR_KEY, JSON.stringify(had)); } catch (e2) {} } } });
      }
    });
  }
  qInput.addEventListener('focus', qUi);
  qInput.addEventListener('blur', function () { setTimeout(qUi, 150); }); // late enough that a tap on a chip always lands
  content.addEventListener('click', function (e) { if (CURQ && e.target.closest && e.target.closest('.rowitem[data-go^="#/pn/"]')) qrNote(CURQ); }, true);
  qInput.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (CURQ && content.querySelector('.list .rowitem')) qrNote(CURQ);
    qInput.blur(); // the Search key drops the keyboard and shows the results
  });
  function tbxStart() {
    window.addEventListener('hashchange', route); route();
    window.__tbxRouted = true; // boot succeeded: later errors are bugs, not cache corruption (see heal)
    // P50 — the launch-animation contract: once the first screen has painted (the frame after route()), mark the app
    // ready: html.tbx-ready, the 'tbx-ready' event and window.__tbxReadyAt (performance.now()). A start-up failure
    // sets html.tbx-failed and 'tbx-boot-failed' instead (TBX_FAIL, index.html). Never throws.
    try {
      var tbxReady = function () {
        try {
          if (window.__tbxReadyAt) return;
          window.__tbxReadyAt = (window.performance && performance.now) ? performance.now() : Date.now();
          document.documentElement.classList.add('tbx-ready');
          window.dispatchEvent(new Event('tbx-ready'));
        } catch (eR) {}
      };
      if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(tbxReady, 0); });
      setTimeout(tbxReady, 1000);                   // no frames while the page is hidden: don't keep a waiting animation up
    } catch (eR0) {}
    // N12: iOS applies :active only with a touch listener on the page; don't depend on pull-to-refresh having one
    try { document.addEventListener('touchstart', function () {}, { passive: true }); } catch (eT) {}
    // P35: the entry on screen is saved when the app is hidden or reloaded (update banner), not only when it is left
    var navHide = function () { try { if (NAV.cur) navSave(NAV.cur); } catch (e) {} };
    window.addEventListener('pagehide', navHide);
    document.addEventListener('visibilitychange', function () { if (document.hidden) navHide(); });
    setTimeout(showTour, 700);
    // P51: pay the first-card costs while Home is on screen (Safari has no requestIdleCallback).
    setTimeout(function () {
      try {
        usedByIndex();
        var w = null; for (var wi = 0; wi < D.items.length && !w; wi++) { var x = D.items[wi]; if (!x.hidden && x.specs && x.specs.length > 4 && x.note) w = x; }
        if (!w) return;
        var html = cardHTML({ kind: 'item', cat: w.cat, name: w.name, fam: w.fam, sku: w.sku, uom: w.uom, chips: [], tags: w.tags, specs: w.specs, note: w.note, src: w.src,
          imgs: [], links: [], refs: [], bp: w.bp, vars: variantsFor(w), used: usedWith(w), fav: { route: pnRoute(w.sku), it: { t: w.t || w.name, sku: w.sku } } });
        var box = document.createElement('div');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:absolute;left:-9999px;top:0;width:' + (content.clientWidth || 390) + 'px;visibility:hidden;pointer-events:none;contain:layout paint';
        box.innerHTML = html; document.body.appendChild(box); void box.offsetHeight; box.remove();
      } catch (eW) {}
    }, 2200);
    // Backorder report: never on the render path — first fetch after the home screen has painted,
    // then at most every 30 min, plus whenever the app comes back to the foreground stale.
    setTimeout(function () { try { boRefresh(false); } catch (e) {} }, 1500);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { try { boRefresh(false); } catch (e) {} } });
  }
  if (document.documentElement.classList.contains('authed')) { tbxStart(); }
  else { window.addEventListener('tbx-unlock', tbxStart, { once: true }); }

  // ---- toast helper ----
  // One toast at a time; later ones queue. opts.action = {label, fn} adds a button (Undo etc.).
  var TQ = [], TBUSY = false, TTIMER = null, TCUR = null; // TCUR = the toast on screen (rqToast replaces its own)
  function toastMsg(text, ms, opts) {
    TQ.push({ text: text, ms: ms || 2200, opts: opts || null });
    if (!TBUSY) toastNext();
  }
  function toastNext() {
    var t = TQ.shift(); TCUR = t || null;
    if (!t) { TBUSY = false; return; }
    TBUSY = true;
    var act = t.opts && t.opts.action;
    toast.innerHTML = esc(t.text) + (act ? '<button type="button">' + esc(act.label) + '</button>' : '');
    toast.classList.toggle('act', !!act);
    if (act) toast.querySelector('button').onclick = function () { clearTimeout(TTIMER); try { act.fn(); } catch (e) {} hideToast(); };
    toast.classList.add('on');
    TTIMER = setTimeout(hideToast, act ? Math.max(t.ms, 4000) : t.ms);
  }
  function hideToast() {
    toast.classList.remove('on');
    setTimeout(function () { toast.textContent = 'Copied'; toast.classList.remove('act'); toastNext(); }, 250);
  }

  var LB_CLOSE = null, VIEWER_DEV = null;
  // ---- photo viewer (P32 / N7) — replaces the single-image lightbox ----
  // A card photo opens the card's whole set: swipe (or ← →) between photos, "2 / 4" and the card name at the top,
  // pinch / double-tap / wheel zoom as before, Close at the bottom. Any other image in #content (guide pages, the
  // About logo) still opens alone. No captions or source links yet: they wait for Nate's approved lists.
  (function () {
    var lb = document.getElementById('lb'), track = document.getElementById('lb-track'), closeB = document.getElementById('lb-close'),
        nEl = document.getElementById('lb-n'), tEl = document.getElementById('lb-title'),
        prevB = document.getElementById('lb-prev'), nextB = document.getElementById('lb-next');
    if (!lb || !track || !closeB) return;
    var items = [], idx = 0, img = null, scale = 1, tx = 0, ty = 0, ptrs = {}, lastDist = 0, lastTap = 0, moved = false, sw = null, opener = null;
    function apply() { if (img) img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }
    function place(dx, anim) {
      track.style.transition = anim && !cardRM() ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none';
      track.style.transform = 'translate3d(calc(' + (-idx * 100) + '% + ' + (dx || 0) + 'px),0,0)';
    }
    function show(i, anim) {
      reset();
      idx = Math.max(0, Math.min(items.length - 1, i));
      var s = track.children[idx]; img = s ? s.querySelector('img') : null;
      reset(); place(0, anim);
      if (nEl) nEl.textContent = items.length > 1 ? (idx + 1) + ' / ' + items.length : '';
      if (prevB) prevB.disabled = idx === 0;
      if (nextB) nextB.disabled = idx >= items.length - 1;
      lb.classList.toggle('lb-multi', items.length > 1);
    }
    function openLB(list, i, title, from) {
      if (!list || !list.length) return;
      items = list; opener = from || null;
      track.innerHTML = list.map(function (src) { return '<div class="lb-s">' + photoImgHTML(src, '', 'draggable="false"') + '</div>'; }).join('');
      if (tEl) tEl.textContent = title || '';
      lb.hidden = false; document.body.style.overflow = 'hidden';
      show(i || 0, false);
      try { closeB.focus({ preventScroll: true }); } catch (e0) {}
    }
    function closeLB() {
      if (lb.hidden) return;
      lb.hidden = true; track.innerHTML = ''; img = null; items = []; ptrs = {}; sw = null;
      document.body.style.overflow = '';
      var o = opener; opener = null;
      if (o && o.isConnected) { try { o.focus({ preventScroll: true }); } catch (e1) {} }
    }
    LB_CLOSE = closeLB;
    VIEWER_DEV = { open: openLB, close: closeLB, show: function (i) { show(i, false); }, state: function () { return { open: !lb.hidden, idx: idx, n: items.length, scale: scale }; } };
    content.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var s = t.closest('.pgal-s, .pc-hero');
      if (s) {
        var card = s.closest('.pcard'), h = card && card.querySelector('h1');
        var list = [].map.call(card ? card.querySelectorAll('.pgal-s') : [], function (b) { return b.getAttribute('data-src') || ''; }).filter(Boolean);
        var at = +(s.getAttribute('data-i') || s.getAttribute('data-lb') || 0);
        if (!list.length) { var im0 = s.querySelector('img'); if (im0) list = [(im0.getAttribute('src') || '').split('#')[0]]; at = 0; }
        openLB(list, at, h && h.firstChild ? h.firstChild.textContent : '', s);
        return;
      }
      if (t.tagName === 'IMG' && t.getAttribute('src')) openLB([t.getAttribute('src')], 0, '', null);
    });
    closeB.addEventListener('click', closeLB);
    if (prevB) prevB.addEventListener('click', function () { show(idx - 1, true); });
    if (nextB) nextB.addEventListener('click', function () { show(idx + 1, true); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLB();
      else if (e.key === 'ArrowRight') show(idx + 1, true);
      else if (e.key === 'ArrowLeft') show(idx - 1, true);
    });
    lb.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button, a')) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = false;
      var ks = Object.keys(ptrs);
      if (ks.length === 1) sw = { x0: e.clientX, y0: e.clientY, t0: Date.now(), dx: 0, on: false };
      else {
        if (sw && sw.on) show(idx, true); // a second finger cancels paging (pinch wins)
        sw = null;
        if (ks.length === 2) { var a = ptrs[ks[0]], b = ptrs[ks[1]]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); }
      }
      try { lb.setPointerCapture(e.pointerId); } catch (eC) {}
    });
    lb.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return;
      var ks = Object.keys(ptrs);
      if (ks.length === 2) {
        var other = ks[0] === String(e.pointerId) ? ptrs[ks[1]] : ptrs[ks[0]];
        var d = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (lastDist) { scale = Math.min(6, Math.max(1, scale * (d / lastDist))); apply(); }
        lastDist = d; ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = true;
        return;
      }
      if (ks.length !== 1) return;
      var p = ptrs[e.pointerId];
      if (scale > 1.01) { // zoomed: one finger pans the photo (no paging)
        tx += e.clientX - p.x; ty += e.clientY - p.y; ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = true; apply();
        return;
      }
      if (sw) {
        var dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
        if (!sw.on && items.length > 1 && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) sw.on = true;
        if (sw.on) { // the track follows the finger; the first and last photo rubber-band
          var edge = (idx === 0 && dx > 0) || (idx === items.length - 1 && dx < 0);
          sw.dx = edge ? dx * 0.3 : dx; place(sw.dx, false); moved = true;
          return;
        }
      }
      if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) moved = true;
    });
    lb.addEventListener('pointerup', function (e) {
      delete ptrs[e.pointerId]; lastDist = 0;
      if (sw && sw.on) { // page past 18% of the width, or on a quick flick
        var w = lb.clientWidth || 1, v = sw.dx / Math.max(1, Date.now() - sw.t0), go = idx;
        if (sw.dx < -w * 0.18 || (v < -0.45 && sw.dx < -24)) go = idx + 1;
        else if (sw.dx > w * 0.18 || (v > 0.45 && sw.dx > 24)) go = idx - 1;
        sw = null; show(go, true);
        return;
      }
      sw = null;
      if (moved) return;
      var now = Date.now();
      if (now - lastTap < 320) {
        if (scale > 1.05) reset();
        else if (img) {
          scale = 2.6;
          var r = img.getBoundingClientRect();
          tx -= (e.clientX - r.left) * 1.6; ty -= (e.clientY - r.top) * 1.6;
          apply();
        }
        lastTap = 0;
      } else {
        lastTap = now;
        var self = e.target;
        setTimeout(function () { // a single tap on the dark area (not the photo) closes, as before
          if (lastTap && Date.now() - lastTap >= 320) {
            lastTap = 0;
            if (self === lb || self === track || (self.classList && self.classList.contains('lb-s'))) closeLB();
          }
        }, 330);
      }
    });
    lb.addEventListener('pointercancel', function (e) {
      delete ptrs[e.pointerId]; lastDist = 0;
      if (sw && sw.on) show(idx, true);
      sw = null;
    });
    lb.addEventListener('wheel', function (e) {
      e.preventDefault();
      scale = Math.min(6, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 0.87)));
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    }, { passive: false });
  })();

  // ---- barcode scanner ----
  (function () {
    var btn = document.getElementById('scanbtn'), ov = document.getElementById('scan-ov');
    if (!btn || !ov) return;
    var video = document.getElementById('scan-video'), statusEl = document.getElementById('scan-status'),
        closeB = document.getElementById('scan-close'), teach = document.getElementById('scan-teach'),
        teachCodeEl = document.getElementById('scan-teach-code'), teachQ = document.getElementById('scan-teach-q'),
        teachList = document.getElementById('scan-teach-list');
    var stream = null, running = false, canvas = document.createElement('canvas'), zxPrepared = false, teachKey = '';
    function learned() { try { return JSON.parse(localStorage.getItem('tbx_learned') || '{}'); } catch (e) { return {}; } }
    function parseGS1(txt) {
      var out = { raw: txt, gtin: '', lot: '', exp: '' };
      var t = String(txt).replace(/^\][A-Za-z]\d/, '');
      var GS = String.fromCharCode(29);
      if (t.charAt(0) === '(') {
        var m01 = t.match(/\(01\)(\d{14})/); if (m01) out.gtin = m01[1];
        var m17 = t.match(/\(17\)(\d{6})/); if (m17) out.exp = m17[1];
        var m10 = t.match(/\(10\)([^(]+)/); if (m10) out.lot = m10[1].trim();
        return out;
      }
      var i = 0, guard = 0;
      while (i < t.length - 1 && guard++ < 20) {
        var ai = t.slice(i, i + 2);
        if (ai === '01' && /^\d{14}/.test(t.slice(i + 2))) { out.gtin = t.slice(i + 2, i + 16); i += 16; }
        else if (ai === '17' && /^\d{6}/.test(t.slice(i + 2))) { out.exp = t.slice(i + 2, i + 8); i += 8; }
        else if (ai === '11' || ai === '13' || ai === '15') { i += 8; }
        else if (ai === '10' || ai === '21') {
          var j = t.indexOf(GS, i + 2); if (j < 0) j = t.length;
          if (ai === '10') out.lot = t.slice(i + 2, j);
          i = j + 1;
        }
        else if (ai === '30') { var j3 = t.indexOf(GS, i + 2); if (j3 < 0) j3 = t.length; i = j3 + 1; }
        else { break; }
      }
      return out;
    }
    function julianExp(yyjjj) {
      var y = 2000 + +yyjjj.slice(0, 2), j = +yyjjj.slice(2);
      var d = new Date(y, 0, j);
      if (!j || d.getFullYear() !== y) return '';
      return String(y).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    }
    function parseHIBC(t) {
      // HIBC LIC: '+' LIC(4) product-code UOM-digit [/secondary...] check-char
      var out = { cats: [], lot: '', exp: '' };
      var s2 = t.slice(1);
      if (s2.length > 5) s2 = s2.slice(0, -1); // drop trailing check character
      var parts = s2.split('/');
      var prim = parts[0] || '';
      if (prim.length > 5) {
        var body = prim.slice(4); // drop labeler ID (e.g. B504)
        if (/\d$/.test(body)) body = body.slice(0, -1); // drop unit-of-measure digit
        var cands = [body];
        var noPreCat = body.replace(/^[A-Z]+(?=CAT\d)/i, '');
        if (noPreCat !== body) cands.push(noPreCat);
        var noAlpha = body.replace(/^[A-Z]+/i, '');
        if (noAlpha && noAlpha !== body) cands.push(noAlpha);
        var dm = body.match(/\d{4,}/); if (dm) cands.push(dm[0]);
        var seen = {};
        cands.forEach(function (c) { if (c && !seen[c]) { seen[c] = 1; out.cats.push(c); } });
      }
      for (var k = 1; k < parts.length; k++) {
        var sec = parts[k];
        if (sec.slice(0, 2) === '$$') {
          var r = sec.slice(2), f = r.charAt(0), rest;
          if (f >= '2' && f <= '7') { rest = r.slice(1); } else { f = ''; rest = r; }
          // HIBC date flags: (none)=MMYY, 2=MMDDYY, 3=YYMMDD, 4=YYMMDDHH, 5=YYJJJ, 6=YYJJJHH, 7=no date
          if (f === '3' && /^\d{6}/.test(rest)) { out.exp = rest.slice(0, 6); out.lot = rest.slice(6); }
          else if (f === '4' && /^\d{8}/.test(rest)) { out.exp = rest.slice(0, 6); out.lot = rest.slice(8); }
          else if (f === '2' && /^\d{6}/.test(rest)) { out.exp = rest.slice(4, 6) + rest.slice(0, 4); out.lot = rest.slice(6); }
          else if ((f === '5' || f === '6') && /^\d{5}/.test(rest)) { out.exp = julianExp(rest.slice(0, 5)); out.lot = rest.slice(f === '5' ? 5 : 7); }
          else if (f === '' && /^\d{4}/.test(rest)) { out.exp = rest.slice(2, 4) + rest.slice(0, 2) + '00'; out.lot = rest.slice(4); }
          else { out.lot = rest; }
        } else if (sec.charAt(0) === '$') { out.lot = sec.slice(1).replace(/^\+/, ''); }
      }
      return out;
    }
    var fmtExp = expDisp;
    function resolveCode(txt) {
      var p = parseGS1(txt), sku = null, key = '';
      if (p.gtin && p.gtin.length === 14) {
        key = p.gtin.slice(1, 13);
        sku = (window.TBX_GTIN14 || {})[p.gtin] || learned()[p.gtin] || (window.TBX_GTIN || {})[key] || learned()[key] || null;
      }
      if (!sku && !p.gtin) {
        var th = String(txt).replace(/^\][A-Za-z]\d/, '');
        if (th.charAt(0) === '+') {
          var h = parseHIBC(th);
          p.lot = p.lot || h.lot; p.exp = p.exp || h.exp;
          for (var ci = 0; ci < h.cats.length && !sku; ci++) {
            var hc = nrm(h.cats[ci]);
            if (hc && BYPN[hc]) sku = skuOf(BYPN[hc]);
            else if (hc && BYPN[hc.replace(/^0+/, '')]) sku = skuOf(BYPN[hc.replace(/^0+/, '')]);
            else { var hl = learned(); if (hl[hc]) sku = hl[hc]; }
          }
          if (sku) return { sku: sku, key: nrm(h.cats[0] || txt), p: p };
        }
      }
      if (!sku) {
        var n = nrm(txt);
        if (n && BYPN[n]) sku = skuOf(BYPN[n]);
        else if (n && BYPN[n.replace(/^0+/, '')]) sku = skuOf(BYPN[n.replace(/^0+/, '')]);
        if (!sku && !key && n) { var l = learned(); if (l[n]) sku = l[n]; }
      }
      return { sku: sku, key: key || nrm(txt), p: p };
    }
    function foundToast(p, it) {
      var bits = [];
      if (p.lot) bits.push('Lot ' + p.lot);
      var fe = fmtExp(p.exp);
      if (fe) bits.push('Exp ' + fe);
      var st = expStatus(p.exp);
      if (st && st.k !== 'ok') {
        showExpBanner(st, fe, p.lot);
      } else {
        toastMsg(bits.length ? bits.join(' · ') : 'Found: ' + (it || 'product'), 2600);
      }
    }
    function stopScan() {
      running = false;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      video.srcObject = null;
      if (CC.wake) { try { CC.wake.release(); } catch (e) {} CC.wake = null; }
      ov.hidden = true; teach.hidden = true; teachList.innerHTML = ''; teachQ.value = '';
    }
    function onCode(txt) {
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (ev) {}
      var r = resolveCode(txt);
      try { ugScan(r, txt); } catch (eUg) {}
      if (r.sku) {
        var entry = BYPN[nrm(r.sku)] || BYPNZ[nrm(r.sku).replace(/^0+/, '')];
        if (!entry) {
          // A barcode that still resolves to a part number with no card (e.g. a retired number kept so
          // Cycle Count can still count old stock): say so instead of "Found" and a jump to Home.
          stopScan();
          toastMsg(r.sku + ' — no ToolBox card for this part number', 3200);
          return;
        }
        var it = recOf(entry);
        stopScan();
        if (it && it.hidden && it.moved && BYPN[nrm(it.moved)]) {
          // a retired number still in circulation (old box): open the current card and explain the change
          var cur = recOf(BYPN[nrm(it.moved)]);
          location.hash = pnRoute(it.moved);
          pnMoveShow(it, function () { foundToast(r.p, cur && (cur.t || cur.name)); });
          return;
        }
        location.hash = pnRoute(r.sku);
        foundToast(r.p, it && (it.t || it.name));
      } else if (r.p.gtin || nrm(txt).length >= 4) {
        running = false;
        teachKey = r.key;
        teachCodeEl.textContent = r.p.gtin ? 'GTIN ' + r.p.gtin + (r.p.lot ? ' · Lot ' + r.p.lot : '') : txt.slice(0, 60);
        teach.hidden = false;
        statusEl.textContent = '';
        setTimeout(function () { teachQ.focus(); }, 50);
      } else {
        statusEl.textContent = 'Not a product barcode — keep aiming';
        setTimeout(function () { if (running) tick(); }, 600);
        return;
      }
    }
    UG.scanDev = onCode; // test hook (tools/usage/app-test.js)
    var frameEl = document.getElementById('scan-frame'), tickN = 0;
    function grabRegion() {
      // Map the on-screen targeting box back through object-fit:cover to source pixels,
      // and decode that region at FULL native camera resolution.
      var w = video.videoWidth, h = video.videoHeight;
      var vr = video.getBoundingClientRect(), fr = frameEl.getBoundingClientRect();
      var c2 = canvas.getContext('2d', { willReadFrequently: true });
      var fullSweep = (tickN % 4 === 3) || !vr.width || !fr.width;
      if (fullSweep) {
        var sc = Math.min(1, 1100 / w);
        canvas.width = Math.round(w * sc); canvas.height = Math.round(h * sc);
        c2.drawImage(video, 0, 0, canvas.width, canvas.height);
        return c2.getImageData(0, 0, canvas.width, canvas.height);
      }
      var s = Math.max(vr.width / w, vr.height / h);
      var offX = (w * s - vr.width) / 2, offY = (h * s - vr.height) / 2;
      var pad = 0.14; // a little forgiveness around the box
      var bx = (fr.left - vr.left) - fr.width * pad, by = (fr.top - vr.top) - fr.height * pad;
      var bw = fr.width * (1 + pad * 2), bh = fr.height * (1 + pad * 2);
      var sx = Math.max(0, (bx + offX) / s), sy = Math.max(0, (by + offY) / s);
      var sW = Math.min(w - sx, bw / s), sH = Math.min(h - sy, bh / s);
      if (sW < 40 || sH < 40) {
        var sc2 = Math.min(1, 1100 / w);
        canvas.width = Math.round(w * sc2); canvas.height = Math.round(h * sc2);
        c2.drawImage(video, 0, 0, canvas.width, canvas.height);
        return c2.getImageData(0, 0, canvas.width, canvas.height);
      }
      var out = Math.min(1, 1400 / sW); // keep full res unless the crop is huge
      canvas.width = Math.round(sW * out); canvas.height = Math.round(sH * out);
      c2.drawImage(video, sx, sy, sW, sH, 0, 0, canvas.width, canvas.height);
      return c2.getImageData(0, 0, canvas.width, canvas.height);
    }
    function tick() {
      if (!running) return;
      var done = false;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          tickN++;
          var imgData = grabRegion();
          done = true;
          // Same worker/fallback path as the count scanner, so decode never
          // stalls the preview on the main thread.
          ccDecode(imgData, CC_FULL).then(function (res) {
            if (!running) return;
            if (res && res.length && res[0].text) { onCode(res[0].text); }
            else { setTimeout(tick, 140); }
          }, function () { setTimeout(tick, 400); });
        }
      } catch (e) {}
      if (!done) setTimeout(tick, 250);
    }
    var camBusy = false;
    function camAlive() { var t = stream && stream.getVideoTracks()[0]; return !!(t && t.readyState === 'live' && !t.muted); }
    // iOS ends or mutes the track after a lock or app switch; restart it rather
    // than leaving a frozen preview.
    function recover() {
      if (ov.hidden || !running || camBusy || camAlive()) return;
      camBusy = true;
      statusEl.textContent = 'Restarting camera…';
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
      running = false;
      setTimeout(function () { camBusy = false; if (!ov.hidden) startScan(true); }, 300);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !ov.hidden) { ccWake(); setTimeout(recover, 500); }
    });
    function startScan(again) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toastMsg('Camera not available in this browser', 2600); return;
      }
      ov.hidden = false; if (!again) teach.hidden = true;
      statusEl.textContent = 'Starting camera…';
      ccWorkerInit(); ccWake();
      try {
        if (!zxPrepared && window.ZXingWASM && ZXingWASM.prepareZXingModule) {
          ZXingWASM.prepareZXingModule({ overrides: { locateFile: function (path, prefix) { return 'lib/' + path; } } });
          zxPrepared = true;
        }
      } catch (e) {}
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      })
        .then(function (s) {
          stream = s; video.srcObject = s; running = true;
          try {
            var track = s.getVideoTracks()[0];
            try {
              track.addEventListener('ended', function () { recover(); });
              track.addEventListener('mute', function () { setTimeout(recover, 1500); });
            } catch (e0) {}
            if (track && track.applyConstraints) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
            // flashlight toggle when the camera supports it (dim OR corners)
            var torchBtn = document.getElementById('scan-torch');
            if (torchBtn) {
              torchBtn.hidden = true;
              torchBtn.classList.remove('on');
              var caps = track && track.getCapabilities ? track.getCapabilities() : null;
              if (caps && caps.torch) {
                torchBtn.hidden = false;
                TORCH_ON = false;
                torchBtn.onclick = function () {
                  TORCH_ON = !TORCH_ON;
                  torchBtn.classList.toggle('on', TORCH_ON);
                  track.applyConstraints({ advanced: [{ torch: TORCH_ON }] }).catch(function () {});
                };
              }
            }
          } catch (e2) {}
          statusEl.textContent = 'Fill the box with the barcode';
          video.play && video.play().catch(function () {});
          setTimeout(tick, 350);
        }, function () {
          statusEl.textContent = 'Camera permission needed — allow access in Settings, or type the part number in search instead.';
        });
    }
    var TORCH_ON = false;
    window.__TBX_RESOLVE = resolveCode;
    window.__TBX_PREPZX = function () {
      try {
        if (!zxPrepared && window.ZXingWASM && ZXingWASM.prepareZXingModule) {
          ZXingWASM.prepareZXingModule({ overrides: { locateFile: function (path, prefix) { return 'lib/' + path; } } });
          zxPrepared = true;
        }
      } catch (e) {}
    };
    btn.addEventListener('click', function () { startScan(false); });
    closeB.addEventListener('click', stopScan);
    teachQ.addEventListener('input', function () {
      var q = nrm(teachQ.value);
      if (!q || q.length < 2) { teachList.innerHTML = ''; return; }
      var hits = [], pool = D.items.concat(D.probes, D.shavers);
      for (var i = 0; i < pool.length && hits.length < 8; i++) {
        var it = pool[i];
        if (it.hidden) continue;
        if (nrm(it.sku).indexOf(q) > -1 || nrm(it.name).indexOf(q) > -1) hits.push(it);
      }
      teachList.innerHTML = hits.map(function (it) {
        return '<button class="st-r" data-sku="' + esc(it.sku) + '"><span>' + esc(it.sku) + '</span>' + esc(it.name) + '</button>';
      }).join('');
    });
    teachList.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.st-r');
      if (!b) return;
      var sku = b.getAttribute('data-sku');
      try {
        var l = learned(); l[teachKey] = sku;
        localStorage.setItem('tbx_learned', JSON.stringify(l));
      } catch (e2) {}
      learnQueue(teachKey, sku);
      stopScan();
      location.hash = pnRoute(sku);
      toastMsg('Barcode saved to this product', 2400);
    });
  })();

  // ---- P2: offline photos — the service worker keeps every photo and guide page in its long-lived 'tbx-img' cache ----
  // 3 s after the first screen paints, the page asks the SW for each file this phone hasn't saved yet, 4 at a time
  // (?fill=1: the SW downloads it, checks its hash against img-manifest.json, saves it and answers 204 + x-tbx-stored,
  // so no photo body reaches the page). Order: guide pages (cycle-count help), photos on the rep's favorites and recents,
  // then the rest. Any connection, cellular too (iOS can't tell them apart). Pauses while the app is hidden, stops at
  // the first "offline" answer and resumes on 'online', on foreground, when the SW first takes control and on the next
  // launch — the missing set is recomputed from the cache every time, so nothing downloads twice. Never on the boot
  // path, and a photo failure never blocks anything else. Applying an update stops it for good (phHalt).
  // window.TBX_PHOTOS = { status(), fill(force), scan(), saved(path), on(fn) → off }; the event 'tbx-photo'
  // {detail:{path}} fires for every file saved (cardPhotos swaps the SW's placeholder for the real photo).
  var PH = { have: 0, total: 0, state: 'idle', busy: false, halt: false, bad: {}, got: null, fns: [], t: 0 };
  var PH_OK = false, PH_BASE = '';
  try { PH_OK = 'serviceWorker' in navigator && !!window.caches && !!window.fetch; PH_BASE = new URL('./', location.href).href; } catch (ePh0) { PH_OK = false; }
  function phStatus() { return { have: PH.have, total: PH.total, state: PH.state, busy: PH.busy }; }
  function phEmit() { var st = phStatus(); PH.fns.slice().forEach(function (f) { try { f(st); } catch (e) {} }); }
  function phPath(src) {                       // 'img/x.jpg' for img/x.jpg?t=1, ./img/x.jpg, https://…/img/x.jpg#r
    var u = String(src || '').split('#')[0].split('?')[0];
    if (PH_BASE && u.indexOf(PH_BASE) === 0) u = u.slice(PH_BASE.length);
    return u.replace(/^\.\//, '');
  }
  function phSaved(p) { return PH.got ? !!PH.got[phPath(p)] : null; }   // null = not scanned yet
  function phScan() {
    if (!PH_OK) return Promise.resolve([]);
    return fetch('img-manifest.json').then(function (r) { if (!r.ok) throw new Error('img-manifest ' + r.status); return r.json(); }).then(function (m) {
      return caches.open('tbx-img').then(function (c) { return c.keys(); }).then(function (ks) {
        var have = {}, got = {}, miss = [], n = 0, tot = 0;
        ks.forEach(function (q) { have[q.url] = 1; });
        Object.keys(m.files || {}).forEach(function (p) {
          var img = p.indexOf('img/') === 0; if (img) tot++;
          if (have[PH_BASE + p + '?h=' + m.files[p][0]]) { got[p] = 1; if (img) n++; } else miss.push(p);
        });
        PH.got = got; PH.have = n; PH.total = tot;
        if (!PH.busy && n >= tot) PH.state = 'done';
        phEmit();
        return miss;
      });
    });
  }
  function phOrder(miss) {                     // guide pages, then the photos on favorites and recents, then the rest
    var pri = {};
    try {
      favs().map(function (f) { return f && f.it && f.it.sku; }).concat(recents().map(function (r) { return r && r.sku; })).forEach(function (s) {
        var rec = s ? recOf(BYPN[nrm(s)] || BYPNZ[nrm(s).replace(/^0+/, '')]) : null;
        ((rec && rec.imgs) || []).forEach(function (im) { pri[im] = 1; });
      });
    } catch (e) {}
    return miss.map(function (p, i) { return { p: p, k: (p.indexOf('guide/') === 0 ? 0 : pri[p] ? 1 : 2) * 1e6 + i }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.p; });
  }
  function phFill(force) {
    if (!PH_OK || PH.busy || PH.halt || !navigator.serviceWorker.controller) return Promise.resolve(phStatus());
    if (!force && document.hidden) return Promise.resolve(phStatus());
    PH.busy = true; PH.state = 'filling'; phEmit();
    return phScan().then(function (miss) {
      miss = phOrder(miss.filter(function (p) { return (PH.bad[p] || 0) < 2; }));
      var i = 0, stop = '';
      function one() {
        if (stop || i >= miss.length) return Promise.resolve();
        if (PH.halt) { stop = 'paused'; return Promise.resolve(); }
        if (document.hidden && !force) { stop = 'paused'; return Promise.resolve(); }
        var p = miss[i++];
        return fetch(p + '?fill=1', { cache: 'no-store' }).then(function (r) {
          var st = r.headers.get('x-tbx-stored');
          if (st === null) { stop = 'partial'; return; }         // an older service worker is in control: leave it alone
          if (st === '1') {
            if (!PH.got[p]) { PH.got[p] = 1; if (p.indexOf('img/') === 0) PH.have++; }
            try { window.dispatchEvent(new CustomEvent('tbx-photo', { detail: { path: p } })); } catch (e3) {}
            if (PH.have % 10 === 0) phEmit();
            return;
          }
          var why = r.headers.get('x-tbx-why') || '';
          if (why === 'offline' || why === 'timeout' || why === 'error') stop = 'offline';
          else if (why === 'quota') stop = 'quota';
          else if (why === 'nomanifest') stop = 'partial';
          else if (why === 'hash') PH.bad[p] = (PH.bad[p] || 0) + 1;  // a stale CDN copy right after a deploy: one more try later
          else PH.bad[p] = 2;                                        // httpNNN, unlisted, crypto: skip it this session
        }, function () { stop = 'offline'; }).then(one);
      }
      var w = []; for (var k = 0; k < 4; k++) w.push(one());
      return Promise.all(w).then(function () {
        PH.busy = false;
        PH.state = PH.have >= PH.total ? 'done' : (stop || 'partial');
        phEmit(); return phStatus();
      });
    }).catch(function () { PH.busy = false; PH.state = 'partial'; phEmit(); return phStatus(); });
  }
  // Applying an update stops the fill for good (this page is about to reload): a waiting worker only takes over once
  // the current one has no request in flight, and a running fill always has some.
  function phHalt() { if (PH) { PH.halt = true; clearTimeout(PH.t); } }
  function phSoon(ms) { if (!PH_OK || PH.halt) return; clearTimeout(PH.t); PH.t = setTimeout(function () { phFill(false); }, ms); }
  window.TBX_PHOTOS = { status: phStatus, fill: phFill, scan: phScan, saved: phSaved,
    on: function (f) { PH.fns.push(f); return function () { PH.fns = PH.fns.filter(function (g) { return g !== f; }); }; } };
  // About, under the version line: "Offline photos: 523 of 665 saved — downloading…" (hidden without a service worker)
  function phLine(st) {
    if (!st.total) return '';
    if (st.have >= st.total) return 'Offline photos: all ' + st.total + ' saved ✓';
    var s = 'Offline photos: ' + st.have + ' of ' + st.total + ' saved — ';
    if (st.state === 'quota') return s + 'phone storage is full';
    if (st.state === 'offline' || navigator.onLine === false) return s + 'continues when you’re online';
    if (st.state === 'filling') return s + 'downloading…';
    return s + 'tap to continue';
  }
  function phAbout() {
    var el = document.getElementById('ab-photos');
    if (!el || !PH_OK || !navigator.serviceWorker.controller) return;
    var off = window.TBX_PHOTOS.on(draw);
    function draw(st) {
      if (!el.isConnected) { off(); return; }
      var t = phLine(st);
      el.hidden = !t;
      el.innerHTML = /tap to continue$/.test(t) ? '<button type="button" class="ab-ph-go" data-act="phfill">' + esc(t) + '</button>' : esc(t);
    }
    draw(phStatus());
    phScan().then(function () { if (PH.have < PH.total && !PH.busy && PH.state !== 'quota' && navigator.onLine !== false) phFill(false); }, function () {});
  }
  document.addEventListener('click', function (e) {
    if (!(e.target.closest && e.target.closest('[data-act="phfill"]'))) return;
    toastMsg('Downloading photos…', 1800);
    PH.bad = {}; phFill(true);
  });
  try {
    if (PH_OK) {
      phSoon(3000);                                   // TBX_BOOT has just routed: the first screen paints first
      window.addEventListener('online', function () { phSoon(1500); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) phSoon(2000); });
      navigator.serviceWorker.addEventListener('controllerchange', function () { phSoon(2000); });   // first install
    }
  } catch (ePh1) {}

  // ---- P34 (in-card side): a card photo that really failed to load ----
  // A photo the phone hasn't saved comes from the service worker as its own "Photo downloads when online" picture — a
  // normal load — so the error below only fires on a real failure (a missing file, or no service worker and no signal).
  // ONE helper, attached once to the element that holds the card photos (today #content); re-attach it to any new card
  // markup. For every <img> under root whose src is a card photo (img/…; the cycle-count guide pages are left alone):
  //   error      → the photo is hidden and "Photo not saved offline yet · Tap to try again" takes its place; a tap retries
  //   'online'   → failed photos, and photos not known to be saved (they may show the SW's picture), load again
  //   'tbx-photo' {detail:{path}} (the background fill saved it) → that photo loads again
  // A retry is src = path + '?t=' + time: a fresh load for the browser, the same file for the SW (it ignores the query).
  var PH_ICO = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.3"/></svg>';
  function cardPhotos(root) {
    if (!root || root.__tbxPhotos) return;
    root.__tbxPhotos = 1;
    function isPhoto(im) { return !!(im && im.tagName === 'IMG' && /^img\//.test(phPath(im.getAttribute('src')))); }
    function reload(im) {
      var nx = im.nextElementSibling;
      if (nx && nx.classList && nx.classList.contains('ph-miss')) nx.parentNode.removeChild(nx);
      im.classList.remove('ph-failed');
      im.src = phPath(im.getAttribute('src')) + '?t=' + Date.now();
    }
    function again(only) {
      [].forEach.call(root.querySelectorAll('img'), function (im) {
        if (!isPhoto(im)) return;
        var p = phPath(im.getAttribute('src'));
        if (only ? p === only : (im.classList.contains('ph-failed') || phSaved(p) !== true)) reload(im);
      });
    }
    root.addEventListener('error', function (e) {        // capture: <img> errors don't bubble (and never reach heal)
      var im = e.target;
      if (!isPhoto(im) || im.classList.contains('ph-failed')) return;
      im.classList.add('ph-failed');
      im.insertAdjacentHTML('afterend', '<button type="button" class="ph-miss" aria-label="Photo not saved offline yet · Tap to try again">' +
        PH_ICO + '<b>Photo not saved offline yet</b><em>Tap to try again</em></button>');
    }, true);
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.ph-miss'), im = b && b.previousElementSibling;
      if (im && isPhoto(im)) reload(im);
    });
    window.addEventListener('online', function () { try { again(''); } catch (e1) {} });
    window.addEventListener('tbx-photo', function (ev) { try { if (ev.detail && ev.detail.path) again(ev.detail.path); } catch (e2) {} });
  }
  try { cardPhotos(content); } catch (ePh2) {}

  // ---- service worker + update banner + manual check ----
  var TBX_REG = null, TBX_WANT = false, TBX_RELOADED = false;
  // P8: reload because THIS page asked for the update (banner, Check for updates) — decided when the new worker takes
  // over, not from a flag frozen at boot. A takeover nobody here asked for never reloads an active user.
  function tbxApplyUpdate() {
    TBX_WANT = true;
    try { phHalt(); } catch (eH) {}          // P2: the photo fill's requests drain, so the new worker can take over
    var w = TBX_REG && TBX_REG.waiting;
    if (w) w.postMessage('SKIP_WAITING');
    setTimeout(function () {                   // the takeover can be missed (raced a newer worker, or another window took it)
      if (TBX_RELOADED) return;
      if (TBX_REG && TBX_REG.waiting) { TBX_REG.waiting.postMessage('SKIP_WAITING'); return; }
      TBX_RELOADED = true; location.reload();
    }, 4000);
  }
  function updBanner(text, fn) { // g3 P18/P12: the feedback bubble steps aside while the banner shows
    var b = document.getElementById('updbanner'); if (!b) return;
    if (text) b.textContent = text;
    b.hidden = false; document.body.classList.add('upd-on');
    b.onclick = function () { b.hidden = true; document.body.classList.remove('upd-on'); fn(); };
  }
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      var was = hadController; hadController = true;
      if (TBX_WANT) { if (!TBX_RELOADED) { TBX_RELOADED = true; location.reload(); } return; }
      if (was) updBanner('Updated — tap to refresh', function () { location.reload(); });
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      TBX_REG = reg;
      if (!reg) return;
      function offer(w) {
        if (!w) return;
        updBanner('Update ready \u2014 tap to refresh', tbxApplyUpdate);
      }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state !== 'installed' || !navigator.serviceWorker.controller) return;
          // A manual "Check for updates" installs straight away; a background
          // find just shows the banner.
          if (AUTO_UPD) { AUTO_UPD = false; tbxApplyUpdate(); }
          else offer(reg.waiting || nw);
        });
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) reg.update();
      });
    });
  }
  var AUTO_UPD = false;
  function checkForUpdate() {
    if (!('serviceWorker' in navigator) || !TBX_REG) {
      toastMsg('Updates are handled by your browser here', 2400);
      return;
    }
    toastMsg('Checking for updates…', 1600);
    var reg = TBX_REG;
    reg.update().then(function () {
      setTimeout(function () {
        if (reg.waiting) {
          toastMsg('Update found — installing…', 2200);
          tbxApplyUpdate();
          return;
        }
        if (reg.installing) { AUTO_UPD = true; toastMsg('Downloading update…', 2600); return; }
        toastMsg('You’re up to date — v' + APPVER + ' · ' + D.built, 2800);
      }, 900);
    }).catch(function () {
      toastMsg('Couldn’t check — are you offline?', 2400);
    });
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-act="checkupd"]')) { checkForUpdate(); return; }
    if (e.target.closest && e.target.closest('[data-act="cyclecount"]')) { location.hash = '#/ct'; return; }
    if (e.target.closest && e.target.closest('[data-act="otherteams"]')) { location.hash = '#/teams'; return; }
    if (e.target.closest && e.target.closest('[data-act="lockdev"]')) { lockDevice(); }
  });

  // P19: sign out of everything on this phone — team login, territory and F&A logins, the usage dashboard key — but keep
  // the rep's own things (favorites, recents, taught barcodes, drafts, location memory, the anonymous usage id) and EVERY
  // unsent scan. A territory (or F&A) with unsent work keeps its login until the next unlock sends it: nothing is stranded.
  // P45: unsent feedback (tbx_fbq + its screenshots in Cache Storage tbx-fbq) and the rep's feedback name (tbx_fb_name)
  // are the rep's own too — kept; the queue sends after the next unlock. Only the keys listed in `drop` ever go.
  function lockDevice() {
    var LS = localStorage, keys = [], i;
    try { for (i = 0; i < LS.length; i++) keys.push(LS.key(i)); } catch (e0) {}
    var pend = {}, n = 0;
    keys.forEach(function (k) { var m = /^tbx_(.+)_ops$/.exec(k); if (!m) return; var c = 0; try { c = (JSON.parse(LS.getItem(k) || '[]') || []).length; } catch (e1) {} if (c) { pend[m[1]] = 1; n += c; } });
    var fa = false; try { fa = !!LS.getItem('tbx_fa2_pend'); } catch (e2) {}
    var msg = 'Lock this device?\n\nToolBox will ask for the team password next time. Territory, F&A and dashboard logins on this phone are signed out too.';
    if (n || fa) msg += '\n\n' + (n ? n + ' cycle-count scan' + (n === 1 ? '' : 's') : '') + (n && fa ? ' and ' : '') + (fa ? 'an F&A save' : '') +
      ' haven’t uploaded yet. ' + (n + (fa ? 1 : 0) === 1 ? 'It stays' : 'They stay') + ' on this phone and upload the next time ToolBox is unlocked.';
    if (!confirm(msg)) return;
    var drop = ['tbx_k2', 'tbx_key', 'tbx_rm', 'tbx_uadm'];
    keys.forEach(function (k) {
      var m = /^tbx_((?:[a-z0-9-]+_)?cc)(|_roster|_sheet)$/.exec(k);   // territory login + its roster / sheet link
      if (m && !pend[m[1]]) drop.push(k);
    });
    if (!fa) drop.push('tbx_fa2', 'tbx_fa2_cache', 'tbx_fa2_teams');
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e3) {} });
    try { sessionStorage.removeItem('tbx_k2'); sessionStorage.removeItem('tbx_key'); } catch (e4) {}
    location.reload();
  }

  // ---- keep the bottom search bar above the iOS keyboard ----
  (function () {
    var vv = window.visualViewport;
    var bar = document.getElementById('bottombar');
    if (!vv || !bar) return;
    var raf = 0;
    function adjust() {
      raf = 0;
      var focused = document.activeElement && bar.contains(document.activeElement);
      var overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (focused && overlap > 60) {
        bar.style.transition = motionRM() ? 'none' : 'transform .15s ease'; // M0
        bar.style.transform = 'translateY(-' + Math.round(overlap) + 'px)';
      } else {
        bar.style.transform = '';
      }
    }
    function queue() { if (!raf) raf = requestAnimationFrame(adjust); }
    vv.addEventListener('resize', queue);
    vv.addEventListener('scroll', queue);
    document.addEventListener('focusin', queue);
    document.addEventListener('focusout', function () { setTimeout(queue, 80); });
  })();

  try { window.TBX_FEEDBACK_INIT(D.fb); } catch (eFb) {}
  // dev/test hooks (harmless in production)
  window.TBX_DEV = { expStatus: expStatus, showExpBanner: showExpBanner, cardText: cardText, composeCardPNG: composeCardPNG,
    usage: { UG: UG, UGD: UGD, on: ugOn, off: function () { return UG_OFF; }, offWhy: ugOffWhy, id: ugId, ev: ugEv, flush: ugFlush, route: ugRoute, start: ugStart, scanRecord: ugScan, scan: function (t) { if (UG.scanDev) UG.scanDev(t); } },
    // sync engine, for tools/cc-test
    fa2: { scanCode: fa2ScanCode, state: function () { return FA2; } },
    cc: { CC: CC, SY: SY, deriveCore: ccDeriveCore, derive: ccDerive, enqueue: ccEnqueue, flush: ccFlush, pull: ccPull, syncSt: ccSyncSt, syncLoad: ccSyncLoad, terrSet: terrSet, isExpired: ccIsExpired, expInput: ccExpInput, hubTerrAdd: hubTerrAdd, TERR: TERR, TORDER: TORDER, histPrune: ccHistPrune, expIso: expIso, expDisp: expDisp, catCount: catCount, fops: { keyMat: fopsKeyMat, keyLot: fopsKeyLot, dash: fopsDash, reconcile: fopsReconcile, ver: fopsVer, readXlsx: fopsReadXlsx, readCsv: fopsReadCsv, fromGrid: fopsFromGrid, parseFile: fopsParseFile, st: fopsSt, onPull: fopsOnPull, fetch: fopsFetch, status: fopsStatus, local: fopsLocal, hint: fopsHint, hintHTML: fopsHintHTML, card: fopsCard, head: fopsHead, remove: fopsRemove, progress: fopsProgress, preview: fopsPreview, xlsx: fopsXlsxBytes, xlsxRows: fopsXlsxRows, deliver: fopsDeliver, download: fopsDownload, FO: FO } } };
  try { window.TBX_DEV.card = { closeOverlays: closeOverlays, shPrep: shPrep, shareLinkText: shareLinkText, cardHTML: cardHTML, keyFacts: keyFactsFor,
    statusRows: statusRowsFor, statusProviders: STATUS_PROVIDERS, photoImgHTML: photoImgHTML, viewer: VIEWER_DEV,
    setV2: function (fn) { CARD2.render = fn || specCard; } }; } catch (eDv) {}
  try { window.TBX_DEV.quote = QUOTE; } catch (eDq) {} // R10: the quote drawer's bag and loading (tools/motion-test/qbag.js)
};

/* ---- Feedback: screenshot + silent send, kept for later when it can't go now (P45) ----
   Relay URL, token and address live in the encrypted payload (TOOLBOX.fb), not
   in this public bundle. Wired from TBX_BOOT once the data has been unlocked.
   A note that can't go now (offline, no answer in 15 s, or the relay answers anything but "ok") waits on the phone:
   the words in localStorage tbx_fbq (≤20 notes, ≤2,000 characters each, never a picture), the screenshot in Cache
   Storage "tbx-fbq" (≤2 MB in all; the oldest pictures give way first, their notes stay). Oldest first, one at a time,
   it is sent 5 s after start, when the phone comes back online and when the app comes back to the front. After three
   refusals a note stops retrying and About offers Email it · Discard. Separate from the usage queue (tbx_uq). The
   rep's name is remembered (tbx_fb_name). Lock this device keeps all of it; the service worker never deletes tbx-fbq. */
window.TBX_FEEDBACK_INIT = function (cfg) {
  if (window.__tbxFbInit) return; window.__tbxFbInit = true;
  cfg = cfg || {};
  var EMAIL = cfg.email || '';
  var FEEDBACK_URL = cfg.url || '';
  var TOKEN = cfg.token || '';
  if (!EMAIL && !FEEDBACK_URL) return; // nowhere to send: no bubble
  var SHOT = null, SHOTC = null, VIEW = null; // screenshot (data URL + its canvas); the screen as it was when the form opened
  var QKEY = 'tbx_fbq', QCACHE = 'tbx-fbq', QMAX = 20, QNOTE = 2000, QSHOTS = 2 * 1024 * 1024, QBIG = 200 * 1024, QTRIES = 3;

  var fab = document.createElement('button');
  fab.id = 'fb-fab'; fab.setAttribute('aria-label', 'Send feedback');
  // P41: the line chat icon (same 24-grid set as the app's ICON map, which lives inside TBX_BOOT)
  fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V17h-2A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5z"/><path d="M8 11h.01M12 11h.01M16 11h.01" stroke-width="2.6"/></svg>';
  document.body.appendChild(fab);
  // P12 (Nate's spec): the bubble fades out while the page is moving and fades back once it has been still for 600 ms.
  // Only a finger, a wheel or the momentum after them counts; programmatic scrolls (route, scrollIntoView) do not.
  (function () {
    var idle = null, touching = false, dragged = false, sx = 0, sy = 0, lastDrag = 0, lastWheel = 0;
    function away() { if (!fab.classList.contains('fb-away')) fab.classList.add('fb-away'); clearTimeout(idle); idle = setTimeout(back, 600); }
    function back() { if (touching && dragged) { idle = setTimeout(back, 600); return; } idle = null; fab.classList.remove('fb-away'); }
    document.addEventListener('touchstart', function (e) { touching = true; dragged = false; lastDrag = 0; var t = e.touches && e.touches[0]; if (t) { sx = t.clientX; sy = t.clientY; } }, { passive: true, capture: true }); // a new touch stops momentum
    document.addEventListener('touchmove', function (e) { var t = e.touches && e.touches[0]; if (t && (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8)) { dragged = true; away(); } }, { passive: true, capture: true });
    var up = function () { touching = false; if (dragged) lastDrag = Date.now(); }; // a tap is not movement: route()'s scroll-to-top after it must not blink the bubble
    document.addEventListener('touchend', up, { passive: true, capture: true });
    document.addEventListener('touchcancel', up, { passive: true, capture: true });
    window.addEventListener('wheel', function () { lastWheel = Date.now(); away(); }, { passive: true });
    window.addEventListener('scroll', function () { if ((touching && dragged) || Date.now() - lastDrag < 1500 || Date.now() - lastWheel < 400) away(); }, { passive: true }); // drag, its momentum, or a wheel
    // keyboard up (a text field has focus): the bubble would float over the keys
    document.addEventListener('focusin', function (e) { var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.closest('#fb-ov')) document.body.classList.add('kb-on'); });
    document.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) document.body.classList.remove('kb-on'); }, 80); });
  })();

  var ov = document.createElement('div');
  ov.id = 'fb-ov'; ov.hidden = true;
  ov.innerHTML = '<div id="fb-card">' +
    '<div id="fb-t">Send feedback</div>' +
    '<div id="fb-ctx"></div>' +
    '<div id="fb-shotrow"><img id="fb-shot" alt=""><span id="fb-shotcap">Capturing screenshot&hellip;</span></div>' +
    '<input id="fb-name" type="text" placeholder="Your name" autocomplete="name">' +
    '<textarea id="fb-note" maxlength="2000" placeholder="What should be added, fixed, or changed on this screen?"></textarea>' +
    '<div id="fb-row"><button id="fb-cancel" type="button">Cancel</button><button id="fb-send" type="button">Send</button></div>' +
    '<div id="fb-hint"></div>' +
    '</div>';
  document.body.appendChild(ov);

  var $ = function (id) { return document.getElementById(id); };
  function ctx() {
    var tEl = $('title');
    var t = tEl ? tEl.textContent.replace(/\s+/g, ' ').trim() : '';
    var h = ''; try { h = decodeURIComponent(location.hash || '#/home'); } catch (e) { h = location.hash || '#/home'; }
    return { t: t || 'Home', h: h };
  }
  function loadLib(cb) {
    if (window.html2canvas) return cb(true);
    var s = document.createElement('script');
    s.src = 'html2canvas.min.js';
    s.onload = function () { cb(true); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  var CAPN = 0;
  function capture() {
    SHOT = null; SHOTC = null;
    var n = ++CAPN; // a capture still running from an earlier opening must not land on this one
    $('fb-shot').style.display = 'none';
    $('fb-shotrow').style.display = 'flex';
    $('fb-shotcap').textContent = 'Capturing screenshot\u2026';
    var v = VIEW || { x: window.scrollX, y: window.scrollY, w: window.innerWidth, h: window.innerHeight };
    loadLib(function (ok) {
      if (n !== CAPN) return;
      if (!ok || !window.html2canvas) { $('fb-shotrow').style.display = 'none'; return; }
      html2canvas(document.body, {
        backgroundColor: '#1E1E1E', scale: 1.5, logging: false,
        x: v.x, y: v.y, width: v.w, height: v.h, // as it was when the bubble was tapped, before the keyboard moved anything
        ignoreElements: function (el) { return el.id === 'fb-fab' || el.id === 'fb-ov'; }
      }).then(function (c) {
        if (n !== CAPN) return;
        SHOTC = c; SHOT = c.toDataURL('image/jpeg', 0.7);
        $('fb-shot').src = SHOT; $('fb-shot').style.display = 'block';
        $('fb-shotcap').textContent = 'Screenshot of this screen attached';
      }).catch(function () { if (n === CAPN) $('fb-shotrow').style.display = 'none'; });
    });
  }
  function resetSend() { var b = $('fb-send'); b.disabled = false; b.textContent = 'Send'; }
  function savedName() { try { return localStorage.getItem('tbx_fb_name') || ''; } catch (e) { return ''; } }
  function keepName(n) { try { if (n) localStorage.setItem('tbx_fb_name', n.slice(0, 60)); else localStorage.removeItem('tbx_fb_name'); } catch (e) {} }
  // P23: the bubble and "Ask Nate to add ..." open the same form; pre = {note, shot:false}. Keep window.TBX_FB_OPEN(pre).
  function openFb(pre) {
    pre = pre || {};
    var c = ctx();
    VIEW = { x: window.scrollX, y: window.scrollY, w: window.innerWidth, h: window.innerHeight };
    $('fb-ctx').textContent = 'Screen: ' + c.t + '  (' + c.h + ')';
    $('fb-hint').textContent = !FEEDBACK_URL ? 'Opens your email app \u2014 goes straight to Nate.' : navigator.onLine === false
      ? 'You\u2019re offline \u2014 it\u2019ll be kept and sent when you have signal.' : 'Sends quietly in the background \u2014 goes straight to Nate.';
    resetSend();
    ov.dataset.pre = pre.note || '';
    if (pre.note) $('fb-note').value = pre.note;
    var nm = $('fb-name'), nt = $('fb-note');
    if (!nm.value) nm.value = savedName();
    ov.hidden = false;
    if (pre.shot === false) { SHOT = null; SHOTC = null; ++CAPN; $('fb-shotrow').style.display = 'none'; } else capture();
    // focus inside the tap itself (a timer is too late for iOS to raise the keyboard): the note once the name is known
    try { var f = nm.value ? nt : nm; f.focus({ preventScroll: true }); if (f === nt) nt.setSelectionRange(nt.value.length, nt.value.length); } catch (eF) {}
  }
  function closeFb() { // an untouched pre-filled note does not linger for the next time the form opens
    ov.hidden = true;
    if (ov.dataset.pre && $('fb-note').value === ov.dataset.pre) $('fb-note').value = '';
  }
  window.TBX_FB_OPEN = openFb;
  fab.addEventListener('click', function () { openFb(); });
  $('fb-cancel').addEventListener('click', closeFb);
  ov.addEventListener('click', function (e) { if (e.target === ov) closeFb(); });

  function mailBody(name, note, c) { return note + '\n\n\u2014 ' + (name || 'Anonymous') + '\nScreen: ' + c.t + '\nRoute: ' + c.h; }
  function mailHref(name, note, c) { return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Toolbox feedback \u2014 ' + c.t) + '&body=' + encodeURIComponent(mailBody(name, note, c)); }
  function viaMail(name, note, c) {
    if (!EMAIL) { $('fb-hint').textContent = 'Couldn\u2019t send \u2014 try again when you have signal.'; return; }
    location.href = mailHref(name, note, c);
    ov.hidden = true; $('fb-note').value = '';
  }

  // ---- the queue (P45) ----
  function qLoad() { try { var a = JSON.parse(localStorage.getItem(QKEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.id && x.note; }) : []; } catch (e) { return []; } }
  function qSave(a) { try { if (a.length) localStorage.setItem(QKEY, JSON.stringify(a)); else localStorage.removeItem(QKEY); return true; } catch (e) { return false; } }
  function qEdit(id, fn) { var a = qLoad(); a.forEach(function (x) { if (x.id === id) fn(x); }); qSave(a); }
  function qId() { var s = Date.now().toString(36); try { var r = crypto.getRandomValues(new Uint8Array(4)); for (var i = 0; i < 4; i++) s += (r[i] % 36).toString(36); } catch (e) { s += Math.random().toString(36).slice(2, 6); } return s; }
  function shotUrl(id) { return './__fbq/' + id + '.jpg'; }
  function hasCache() { try { return !!(window.caches && caches.open); } catch (e) { return false; } }
  function shotGet(id) {
    if (!hasCache()) return Promise.resolve(null);
    return caches.open(QCACHE).then(function (c) { return c.match(shotUrl(id)); }).then(function (r) { return r ? r.blob() : null; }).catch(function () { return null; });
  }
  function shotDel(id) { if (hasCache()) caches.open(QCACHE).then(function (c) { return c.delete(shotUrl(id)); }).catch(function () {}); }
  function toBlob(d) {
    var bin = atob(String(d).slice(String(d).indexOf(',') + 1)), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: 'image/jpeg' });
  }
  function toData(b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result || '')); }; fr.onerror = function () { res(''); }; fr.readAsDataURL(b); }); }
  function smaller(c) { // scale 1 (the capture is 1.5×), JPEG 0.6
    try { var w = Math.max(1, Math.round(c.width / 1.5)), h = Math.max(1, Math.round(c.height / 1.5)), s = document.createElement('canvas');
      s.width = w; s.height = h; s.getContext('2d').drawImage(c, 0, 0, w, h); return s.toDataURL('image/jpeg', 0.6); } catch (e) { return null; }
  }
  // the picture goes to Cache Storage, never localStorage; queued pictures stay under 2 MB (the oldest give way, their notes stay)
  function keepShot(id, shot, canvas) {
    var blob = null;
    try { blob = toBlob(shot); if (blob.size > QBIG && canvas) { var s2 = smaller(canvas); if (s2) blob = toBlob(s2); } } catch (e) { blob = null; }
    if (!blob || blob.size > QSHOTS || !hasCache()) { qEdit(id, function (x) { x.shot = 0; }); return; }
    caches.open(QCACHE).then(function (c) {
      return c.put(shotUrl(id), new Response(blob, { headers: { 'content-type': 'image/jpeg' } }));
    }).then(function () {
      var a = qLoad(), me = null, tot = blob.size, drop = [];
      a.forEach(function (x) { if (x.id === id) me = x; else tot += x.shot > 0 ? x.shot : 0; });
      if (!me) { shotDel(id); return; }                  // sent or discarded meanwhile
      me.shot = blob.size;
      for (var i = 0; i < a.length && tot > QSHOTS; i++) if (a[i].id !== id && a[i].shot > 0) { tot -= a[i].shot; a[i].shot = 0; drop.push(a[i].id); }
      qSave(a); drop.forEach(shotDel);
    }).catch(function () { qEdit(id, function (x) { x.shot = 0; }); shotDel(id); }); // no room: the note goes on its own
  }
  function enqueue(item, shot, canvas) { // → false when the phone can't hold it (20 notes waiting, or storage full)
    var a = qLoad();
    if (a.length >= QMAX) return false;
    item.shot = shot ? -1 : 0; a.push(item);             // -1: the picture is still being stored
    if (!qSave(a)) return false;
    if (shot) keepShot(item.id, shot, canvas);
    qPaint();
    return true;
  }
  function payload(x, img) { return { token: TOKEN, name: x.name, note: x.note, screen: x.screen, route: x.route, ua: x.ua, image: img || null, id: x.id }; }
  // → 'ok' | 'net' (no answer, a timeout, or a server error: try again later) | 'no:<what the relay said>' (a refusal)
  function post(body) {
    var ac = null; try { if (typeof AbortController !== 'undefined') ac = new AbortController(); } catch (e0) {}
    var to = ac ? setTimeout(function () { try { ac.abort(); } catch (e1) {} }, 15000) : null;
    var p;
    try {
      p = fetch(FEEDBACK_URL, { method: 'POST', body: JSON.stringify(body), signal: ac ? ac.signal : undefined }).then(function (r) {
        return r.text().then(function (txt) {
          txt = (txt || '').trim();
          if (txt.indexOf('ok') === 0) return 'ok';
          if (r.status >= 500 || r.status === 429 || r.status === 408) return 'net';
          return 'no:' + (txt ? txt.slice(0, 40) : 'nothing');
        });
      });
    } catch (e2) { p = Promise.reject(e2); }
    return p.catch(function () { return 'net'; }).then(function (v) { if (to) clearTimeout(to); return v; });
  }
  var F = { busy: false, timer: null, at: 0, back: 0 };
  function soon(ms) {
    var at = Date.now() + ms;
    if (F.timer && F.at <= at) return;
    if (F.timer) clearTimeout(F.timer);
    F.at = at; F.timer = setTimeout(function () { F.timer = null; flush(); }, ms);
  }
  function flush() { // oldest first, one at a time
    if (F.busy || !FEEDBACK_URL) return;
    var a = qLoad(), x = null, now = Date.now();
    for (var i = 0; i < a.length && !x; i++) if ((a[i].tries || 0) < QTRIES) x = a[i];
    if (!x || navigator.onLine === false) return;        // offline: the 'online' event brings it back
    if (x.shot === -1 && now - x.t < 15000) { soon(2000); return; }
    F.busy = true;
    shotGet(x.id).then(function (b) { return b ? toData(b) : ''; }).then(function (img) { return post(payload(x, img)); }).then(function (res) {
      F.busy = false;
      if (res === 'ok') { qSave(qLoad().filter(function (y) { return y.id !== x.id; })); shotDel(x.id); F.back = 0; qPaint(); soon(1500); return; }
      if (res === 'net') { F.back = Math.min(300000, F.back ? F.back * 2 : 20000); soon(F.back); return; }
      qEdit(x.id, function (y) { y.tries = (y.tries || 0) + 1; y.err = res.slice(3); }); // refused: after 3, About offers Email it · Discard
      qPaint(); soon(20000);
    }).catch(function () { F.busy = false; soon(60000); });
  }
  function queued(item, why) {
    var b = $('fb-send');
    if (!enqueue(item, SHOT, SHOTC)) { // 20 notes already waiting (or no room): today's email fallback
      resetSend();
      $('fb-hint').textContent = EMAIL ? 'Couldn\u2019t send \u2014 opening your email app instead.' : 'Couldn\u2019t send \u2014 try again when you have signal.';
      if (EMAIL) setTimeout(function () { viaMail(item.name, item.note, { t: item.screen, h: item.route }); }, 600);
      return;
    }
    b.disabled = true; b.textContent = 'Saved \u2713';
    $('fb-hint').textContent = why === 'no' ? 'Couldn\u2019t send right now \u2014 ToolBox will try again on its own.' : 'You\u2019re offline \u2014 it\u2019ll send automatically when you have signal.';
    setTimeout(function () { ov.hidden = true; $('fb-note').value = ''; resetSend(); }, 1800);
    soon(why === 'offline' ? 60000 : 20000);             // (offline: the 'online' event is the real trigger)
  }
  $('fb-send').addEventListener('click', function () {
    var name = $('fb-name').value.trim();
    var note = $('fb-note').value.trim().slice(0, QNOTE);
    if (!note) { $('fb-note').focus(); return; }
    var c = ctx();
    keepName(name);
    if (!FEEDBACK_URL) return viaMail(name, note, c);
    var item = { id: qId(), t: Date.now(), name: name, note: note, screen: c.t, route: c.h, ua: navigator.userAgent, tries: 0, err: '' };
    if (navigator.onLine === false) return queued(item, 'offline');
    var b = $('fb-send'); b.disabled = true; b.textContent = 'Sending\u2026';
    post(payload(item, SHOT)).then(function (res) {
      if (res === 'ok') {
        b.textContent = 'Sent \u2713';
        setTimeout(function () { ov.hidden = true; $('fb-note').value = ''; resetSend(); }, 900);
        soon(1500); // signal is back: anything waiting goes too
        return;
      }
      if (res !== 'net') { item.tries = 1; item.err = res.slice(3); }
      queued(item, res === 'net' ? 'net' : 'no');
    });
  });

  // About: what is waiting, and the notes that couldn't go (Email it · Discard)
  function qPaint() {
    var el = document.getElementById('fbq-note'); if (!el) return;
    var a = qLoad(), dead = a.filter(function (x) { return (x.tries || 0) >= QTRIES; }), wait = a.length - dead.length, h = '';
    if (wait) h += '<div class="tip fbq-wait">' + wait + ' feedback note' + (wait === 1 ? ' is' : 's are') + ' waiting for signal \u2014 ' + (wait === 1 ? 'it sends' : 'they send') + ' automatically.</div>';
    if (dead.length) {
      h += '<div class="tip fbq-dead"><b>' + dead.length + ' feedback note' + (dead.length === 1 ? '' : 's') + ' couldn\u2019t send</b>';
      dead.forEach(function (x) {
        var s = String(x.note).replace(/\s+/g, ' '); s = s.length > 60 ? s.slice(0, 60) + '\u2026' : s;
        h += '<div class="fbq-row"><span class="fbq-s">\u201C' + fbEsc(s) + '\u201D</span> ' +
          (EMAIL ? '<button type="button" class="footlink" data-fbq="mail" data-fbq-id="' + fbEsc(x.id) + '">Email it</button>' :
            '<button type="button" class="footlink" data-fbq="retry" data-fbq-id="' + fbEsc(x.id) + '">Try again</button>') +
          '<span class="footsep">&middot;</span><button type="button" class="footlink" data-fbq="drop" data-fbq-id="' + fbEsc(x.id) + '">Discard</button></div>';
      });
      h += '</div>';
    }
    el.innerHTML = h;
  }
  function fbEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-fbq]') : null; if (!t) return;
    var id = t.getAttribute('data-fbq-id'), act = t.getAttribute('data-fbq'), x = qLoad().filter(function (y) { return y.id === id; })[0];
    if (!x) { qPaint(); return; }
    if (act === 'retry') { qEdit(id, function (y) { y.tries = 0; y.err = ''; }); qPaint(); soon(0); return; }
    if (act === 'mail' && EMAIL) location.href = mailHref(x.name, x.note, { t: x.screen, h: x.route }); // text only, like before
    qSave(qLoad().filter(function (y) { return y.id !== id; })); shotDel(id); qPaint();
  });
  window.TBX_FBQ = { paint: qPaint, flush: function () { soon(0); }, list: qLoad };
  setTimeout(function () { soon(0); }, 5000);                                   // 5 s after start
  window.addEventListener('online', function () { soon(1000); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) soon(2000); });
  qPaint();
};
