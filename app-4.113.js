(function () {
  function heal() {
    try {
      if (sessionStorage.getItem('tbx_healed')) return;
      sessionStorage.setItem('tbx_healed', '1');
    } catch (e) {}
    var jobs = [];
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    function go() { location.reload(); }
    Promise.all(jobs).then(go, go);
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
  window.addEventListener('error', function () { if (healOK()) heal(); });
  window.__tbxHeal = function () { if (healOK()) heal(); };
})();
window.TBX_BOOT = function () {
  if (window.__tbxBooted) return;
  window.__tbxBooted = true;
  var D = window.TOOLBOX,
      title = document.getElementById('title'), backBtn = document.getElementById('back'),
      homeBtn = document.getElementById('home'), toast = document.getElementById('toast');
  var content, qInput, CURQ = '', LAST_BROWSE = '', LAST_TITLE = '', CUR_IT = null;
  var APPVER = '4.113';
  if (!D) { return; }
  if (!document.getElementById('content') || !document.getElementById('q') ||
      !document.getElementById('glosspanel')) {
    window.__tbxHeal(); return;
  }
  try { sessionStorage.removeItem('tbx_healed'); } catch (e) {}
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
  }

  // ---- copy ----
  function copy(text) {
    function done() { toast.classList.add('on'); setTimeout(function () { toast.classList.remove('on'); }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  document.addEventListener('click', function (e) {
    var gp = document.getElementById('glosspanel');
    if (!gp) return;
    var gt = e.target.closest('.gterm');
    if (gt) {
      var key = gt.getAttribute('data-g');
      gp.innerHTML = '<b>' + esc(key) + '</b>' + esc(GLOSS[key] || '');
      gp.hidden = false; e.stopPropagation(); return;
    }
    if (!gp.hidden) { gp.hidden = true; return; }
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
        if (CURCOUNT && CURCOUNT() === 0) { FILT = {}; FILT[ft] = 1; }
      }
      if (CURVIEW) CURVIEW();
      return;
    }
    var fpc = e.target.closest('[data-fp]');
    if (fpc) {
      FILT.fp = fpc.getAttribute('data-fp');
      var fpBase = (location.hash || '').split('?')[0];
      history.replaceState(null, '', fpBase + '?fp=' + encodeURIComponent(FILT.fp));
      if (CURVIEW) CURVIEW();
      return;
    }
    var b = e.target.closest('[data-copy]'); if (b) { copy(b.getAttribute('data-copy')); return; }
    var uf = e.target.closest('[data-unfav-route]');
    if (uf) {
      var rt = uf.getAttribute('data-unfav-route');
      var wasFav = favs().filter(function (x) { return x.route === rt; })[0];
      try { localStorage.setItem('tbx_favs', JSON.stringify(favs().filter(function (x) { return x.route !== rt; }))); } catch (e2) {}
      uf.innerHTML = '&#9734;'; uf.classList.add('off');
      var uw = uf.closest('.rowwrap');
      setTimeout(function () {
        if (uw) uw.classList.add('bye');
        setTimeout(function () { if (content.classList.contains('homeview')) home(); }, 280);
      }, 240);
      if (wasFav) toastMsg('Removed from Favorites', 3000, { action: { label: 'Undo', fn: function () { toggleFav(wasFav); if (content.classList.contains('homeview')) home(); } } });
      return;
    }
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
      fv.classList.toggle('on', isFav(f.route));
      fv.textContent = isFav(f.route) ? '★ Favorited' : '☆ Favorite';
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
    INDEX.push({ hay: nrm(raw), words: wordsOf(raw), skun: nrm(it.sku), buckets: bucketsOf(it),
      it: it, sub: it.cat + ' · ' + it.fam, route: pnRoute(it.sku) });
  });
  D.probes.forEach(function (p) {
    var raw = p.name + ' ' + p.sku + ' probe wand serfas arthro ' + p.fam;
    INDEX.push({ hay: nrm(raw), words: wordsOf(raw), skun: nrm(p.sku), buckets: ['Arthroscopy'],
      it: { t: p.name, sku: p.sku, uom: p.uom, tags: p.tags }, sub: 'SERFAS RF Wands · ' + p.fam, route: pnRoute(p.sku) });
  });
  D.shavers.forEach(function (s) {
    var raw = s.name + ' ' + s.sku + ' shaver blade bur';
    INDEX.push({ hay: nrm(raw), words: wordsOf(raw), skun: nrm(s.sku), buckets: ['Arthroscopy'],
      it: { t: s.name, sku: s.sku, uom: s.uom, tags: s.tags }, sub: 'Shaver blades', route: pnRoute(s.sku) });
  });
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
    for (var i = 0; i < e.words.length; i++) {
      if (editLE(t, e.words[i], maxD)) return true;
    }
    return false;
  }
  function searchAll(q) {
    var AL = { LOCKED: 'NONSLIDING', FF: 'FORCEFIBER', BIO: 'BIOCOMPOSITE', BIOCOMP: 'BIOCOMPOSITE', AVK: 'ALPHAVENTKNOTLESS',
      AV: 'ALPHAVENT', XB: 'XBRAID', NANO: 'NANOTACK', FIBRE: 'FIBER', PT: 'PUNCHTAP', ICX: 'ICONIX' };
    var terms = nrm(q).length ? q.toUpperCase().split(/\s+/).map(nrm).filter(Boolean)
      .map(function (t) { return AL[t] || t; }) : [];
    if (!terms.length) return [];
    var merged = [];
    for (var i = 0; i < terms.length; i++) {
      if (terms[i] === 'NON' && terms[i + 1] === 'SLIDING') { merged.push('NONSLIDING'); i++; }
      else merged.push(terms[i]);
    }
    var qn = nrm(q);
    function collect(allowFuzzy) {
      var out = [];
      for (var k = 0; k < INDEX.length; k++) {
        var e = INDEX[k], score = 0, ok = true;
        for (var m = 0; m < merged.length; m++) {
          var t = merged[m], pos;
          if (t === 'SLIDING') {
            if (e.hay.indexOf('SLIDING') !== -1 && e.hay.indexOf('NONSLIDING') === -1) { score += 20; continue; }
            ok = false; break;
          }
          pos = e.hay.indexOf(t);
          if (pos !== -1) { score += 30 - Math.min(25, pos / 10); continue; }
          if (allowFuzzy && termFuzzy(e, t)) { score += 6; continue; }
          ok = false; break;
        }
        if (!ok) continue;
        if (e.skun === qn) score += 500;
        else if (qn.length >= 4 && e.skun.indexOf(qn) === 0) score += 180;
        e.score = score;
        out.push(e);
      }
      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    }
    var res = collect(false);
    if (!res.length) res = collect(true);
    return res;
  }

  // ---- shared fragments ----
  function rowHTML(route, it, subline, hideSz) {
    var t = it.t || it.name || '', sz = hideSz ? '' : (it.sz || ''), ld = it.ld || '', uom = it.uom || '';
    var tags = (it.tags || []).map(function (tg) { return '<span class="subtag">' + esc(tg) + '</span>'; }).join('');
    var line2 = ld ? '<span class="ld">' + esc(ld) + '</span>' :
                (subline ? '<span class="ld dim2">' + esc(subline) + '</span>' : '');
    return '<button class="rowitem" data-go="' + route + '">' +
      '<div class="pnL mono">' + esc(it.sku || '') + (uom ? '<span class="uomL">' + esc(uom) + '</span>' : '') + '</div>' +
      '<div class="rl"><b class="ti">' + esc(t) + (sz ? ' <span class="sz">' + esc(sz) + '</span>' : '') + '</b>' +
      line2 + '</div>' + (tags ? '<div class="subtags">' + tags + '</div>' : '') + '</button>';
  }
  var SFILT = null, SSORT = 'rel', SALL = false;
  var SBUCKETS = ['Arthroscopy', 'Biologics', 'Capital', 'Disposables', 'Implants', 'Instruments', 'Suture'];
  function resultsHTML() {
    var hits = searchAll(CURQ);
    if (!hits.length) {
      SFILT = null;
      return emptyHTML('&#x1F50D;', 'No matches for \u201c' + CURQ + '\u201d', 'Try fewer letters or a part-number fragment \u2014 dashes are optional.', '<button class="footlink" data-act="scan">Scan the barcode instead &#x203A;</button>');
    }
    var counts = {};
    hits.forEach(function (h) { (h.buckets || []).forEach(function (b) { counts[b] = (counts[b] || 0) + 1; }); });
    var avail = SBUCKETS.filter(function (b) { return counts[b]; });
    if (SFILT && !counts[SFILT]) SFILT = null;
    var shown = SFILT ? hits.filter(function (h) { return (h.buckets || []).indexOf(SFILT) !== -1; }) : hits;
    if (SSORT === 'sku') shown = shown.slice().sort(function (a, b) { return a.skun < b.skun ? -1 : a.skun > b.skun ? 1 : 0; });
    var chips = '<div class="schips">' +
      (avail.length > 1 ? '<button class="schip' + (!SFILT ? ' on' : '') + '" data-sf="">All &middot; ' + hits.length + '</button>' +
        avail.map(function (b) {
          return '<button class="schip' + (SFILT === b ? ' on' : '') + '" data-sf="' + esc(b) + '">' + esc(b) + ' &middot; ' + counts[b] + '</button>';
        }).join('') : '<span class="schip on" style="pointer-events:none">' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + '</span>') +
      '<button class="schip sort' + (SSORT === 'sku' ? ' on' : '') + '" data-ssort="1" aria-pressed="' + (SSORT === 'sku') + '">' + (SSORT === 'sku' ? 'Part # A\u2013Z' : 'Best match') + ' &#x21C5;</button>' +
      '</div>';
    var CAP = SALL ? shown.length : 60;
    return chips + '<div class="list" style="margin-top:8px">' +
      shown.slice(0, CAP).map(function (h) { return rowHTML(h.route, h.it, h.sub); }).join('') + '</div>' +
      (shown.length > CAP ? '<button class="showall" data-sall="1">Show all ' + shown.length + ' &#x203A;</button>' : '');
  }
  try { SSORT = localStorage.getItem('tbx_ssort') === 'sku' ? 'sku' : 'rel'; } catch (e0) {}
  var VT_FROM = null;
  function vtOK() {
    return !!document.startViewTransition && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function render(browseHTML) {
    LAST_BROWSE = browseHTML;
    var paint = function () {
      content.classList.remove('homeview');
      if (CURQ) { if (title.innerHTML !== 'Search') LAST_TITLE = title.innerHTML; title.innerHTML = 'Search'; }
      content.innerHTML = CURQ ? resultsHTML() : browseHTML;
    };
    var from = VT_FROM; VT_FROM = null;
    if (from && from.isConnected && vtOK()) {
      // Row -> card: the tapped title and the new h1 share a transition name for the morph.
      from.style.viewTransitionName = 'tbx-title';
      content.classList.remove('vt'); // no fade-in on top of the morph (re-adding it later replays it = flash)
      var t = document.startViewTransition(function () {
        paint();
        var h = content.querySelector('.card h1'); if (h) h.style.viewTransitionName = 'tbx-title';
      });
      t.finished.then(function () {
        var h2 = content.querySelector('.card h1'); if (h2) h2.style.viewTransitionName = '';
      }, function () {});
      return;
    }
    paint();
    content.classList.remove('vt'); void content.offsetWidth; content.classList.add('vt');
  }
  function mark(s) {
    var e = esc(s);
    GKEYS.forEach(function (k) {
      var kk = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('(^|[^\\w-])(' + kk + ')(?![\\w-])', 'i');
      e = e.replace(re, function (m, p1, p2) {
        return p1 + '<button class="gterm" data-g="' + esc(k) + '">' + p2 + '</button>';
      });
    });
    return e;
  }
  function specCard(o) {
    var chips = (o.chips || []).map(function (c) {
      return '<span class="chip' + (c.k ? ' ' + c.k : '') + (c.dim ? ' dim' : '') + '">' + esc(c.t) + '</span>'; }).join('');
    var rows = (o.specs || []).filter(function (s) { return s[1]; }).map(function (s) {
      if (!s[0]) return '<div class="lhead">' + esc(s[1]) + '</div>';
      return '<div class="lr"><div class="lk">' + esc(s[0]) + '</div><div class="lv">' + mark(s[1]) + '</div></div>';
    }).join('');
    var built = !!rows || !!o.note || !!o.bp || !!(o.imgs && o.imgs.length);
    var tagb = (o.tags || []).map(function (tg) { return ' <span class="subtag">' + esc(tg) + '</span>'; }).join('');
    var fav = '';
    if (o.fav) {
      var on = isFav(o.fav.route);
      fav = '<button class="favbtn' + (on ? ' on' : '') + '" data-fav=\'' + esc(JSON.stringify(o.fav)) + '\'>' +
        (on ? '★ Favorited' : '☆ Favorite') + '</button>' +
        '<button class="favbtn" data-share="1">&#8599; Share</button>';
    }
    return '<div class="card"><h1>' + esc(o.name) + tagb + '</h1><div class="fam">' + esc(o.fam || '') + '</div>' +
      (!built ? '<div class="nobuild">Not built yet</div>' : '') +
      (o.warn ? '<div class="warn">&#9888; ' + esc(o.warn) + '</div>' : '') +
      '<div class="pnblock"><div class="num mono">' + esc(o.sku) + '</div>' +
      '<button class="copy" data-copy="' + esc(o.sku) + '">Copy</button></div>' +
      (o.uom ? '<div class="uomline">Unit: <b>' + esc(o.uom) + '</b></div>' : '') +
      (fav ? '<div class="favrow">' + fav + '</div>' : '') +
      (o.refs && o.refs.length ? '<div class="reflinkrow">' + o.refs.map(function (r) {
        return r.menu ? '<button class="refbtn" data-lmenu=\'' + esc(JSON.stringify({ t: r.t, items: r.menu })) + '\'>' + esc(r.t) + '</button>'
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

  // ---- instrumentation resolver ----
  function instrFor(it) {
    if (!it || !it.fam) return [];
    var ov = it.instr || {};
    if (ov.incl) {
      var out0 = [];
      ov.incl.forEach(function (sku) {
        D.items.some(function (x) {
          if (x.sku === sku) { out0.push({ it: x }); return true; }
          return false;
        });
      });
      return out0;
    }
    var fams = ov.fams || [ov.fam || it.fam];
    var own = ov.sz !== undefined ? ov.sz : (it.sz || '');
    var excl = ov.excl || [];
    var req = ov.req || '';
    var sibs = {};
    D.items.forEach(function (x) {
      if (fams.indexOf(x.fam) !== -1 && x.sz) sibs[x.sz] = 1;
    });
    var VARIANTS = { 'CinchLock knotless anchor': ['SS', 'Flex'] };
    var vtoks = VARIANTS[it.fam] || [];
    var ownV = '';
    vtoks.forEach(function (v) {
      if (new RegExp('\\b' + v + '\\b').test(it.name || '')) ownV = ownV || v;
    });
    var out = [];
    D.items.forEach(function (x) {
      if (x.hidden || fams.indexOf(x.fam) === -1) return;
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
  var TILE_ICONS = {
    'Arthroscopy': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l6-6"/><path d="M8 13l3 3 9-9-3-3-9 9z"/><path d="M14 4l6 6"/><circle cx="18.5" cy="5.5" r="1" fill="#FDB515" stroke="none"/></svg>',
    'Allografts & Biologics': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c0-5 1.5-8 4.5-10.5"/><path d="M20 4.5c0 5.2-3.2 8.5-8 8.5 0-5.2 3.2-8.5 8-8.5z"/><path d="M4.5 8c3.4 0 5.5 2.3 5.5 6-3.4 0-5.5-2.3-5.5-6z"/></svg>',
    'Disposables': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M4.5 8h15" stroke-dasharray="2 1.6"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>',
    'Implants': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3h5"/><path d="M12 3v2.5"/><path d="M9 5.5h6v10l-3 5.5-3-5.5v-10z"/><path d="M9 8.5h6M9 11.5h6M9 14.5h6"/></svg>',
    'Instruments': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.7 6.3a5 5 0 0 1-6.6 6.6L7 20a2.1 2.1 0 0 1-3-3l7.1-7.1a5 5 0 0 1 6.6-6.6L14.5 6.5l3 3 3.2-3.2z"/></svg>',
    'Suture': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="3.5" width="9" height="12" rx="1.5"/><path d="M7.5 7h9M7.5 10h9M7.5 13h9"/><path d="M12 15.5c0 3 6.5 2 6.5 5.5"/></svg>',
    'Capital': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="9" rx="1.5"/><path d="M8 14v3.5M16 14v3.5"/><circle cx="8" cy="19.5" r="1.3"/><circle cx="16" cy="19.5" r="1.3"/><path d="M9 8.5h6"/></svg>'
  };
  var WN_TIMER = null, WN_SHOWN = false;
  function hideWN(markSeen) {
    if (WN_TIMER) { clearTimeout(WN_TIMER); WN_TIMER = null; }
    var el = document.getElementById('wncard');
    if (!el) return;
    if (markSeen) { try { localStorage.setItem('tbx_wn_seen', String((window.TBX_WN || {}).v || 1)); } catch (e) {} }
    el.classList.add('bye');
    setTimeout(function () { el.remove(); }, 260);
  }
  function showWN() {
    try {
      var WN = window.TBX_WN;
      if (!WN || !WN.items || !WN.items.length) return;
      if (+(localStorage.getItem('tbx_wn_seen') || 0) >= WN.v) return;
    } catch (e) { return; }
    if (WN_SHOWN || document.getElementById('wncard')) return;
    WN_SHOWN = true;
    var WN2 = window.TBX_WN;
    var el = document.createElement('div');
    el.id = 'wncard';
    el.innerHTML = '<div class="wn-h"><span>What&#8217;s new</span>' +
      '<button id="wndismiss" aria-label="Dismiss">&#x2715;</button></div>' +
      WN2.items.map(function (i, idx) {
        var inner = '<b>' + esc(i.d) + '</b>' + esc(i.t) + (i.link ? '<span class="wn-link">' + esc(i.link) + '</span>' : '');
        var cls = 'wn-i' + (idx ? ' wn-x' : '');
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
    b.innerHTML = '<div class="xb-ico">' + (st.k === 'expired' ? '&#9888;' : '&#9200;') + '</div>' +
      '<div class="xb-t">' + (st.k === 'expired' ? 'Last Scan is EXPIRED!' : 'Last Scan Expires Soon') + '</div>' +
      (st.k === 'soon' ? '<div class="xb-days">' + st.days + ' day' + (st.days === 1 ? '' : 's') + ' left</div>' : '') +
      (lot ? '<div class="xb-sub">Lot ' + esc(lot) + '</div>' : '') +
      (feStr ? '<div class="xb-sub">Exp ' + esc(feStr) + '</div>' : '') +
      (st.k === 'expired' ? '<div class="xb-dn">Do not use</div>' : '') +
      '<button id="expban-x" aria-label="Dismiss">&#x2715;</button>';
    document.body.appendChild(b);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#expban-x')) {
      var b = document.getElementById('expban');
      if (b) b.remove();
    }
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
    var name = it.t || it.name || '', fam = it.fam || '', sku = it.sku || '', uom = it.uom || '';
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
    var L = [it.t || it.name || ''];
    L.push('REF ' + it.sku + (it.uom ? ' · ' + it.uom : ''));
    if (it.fam) L.push(it.fam);
    var sp = (it.specs || []).filter(function (s) { return s && s[1]; });
    if (sp.length) L.push('');
    sp.forEach(function (s) { L.push('• ' + s[0] + ': ' + s[1]); });
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
  function shareAsImage(it) {
    toastMsg('Building image…', 1400);
    return composeCardPNG(it).then(function (c) {
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    }).then(function (blob) {
      if (!blob) { toastMsg('Could not build image', 2200); return; }
      var fname = (nrm(it.sku) || 'card').toLowerCase() + '-card.png';
      var file = null;
      try { file = new File([blob], fname, { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        return navigator.share({ files: [file], title: it.t || it.name || 'SportsMed Toolbox' }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          dlBlob(blob, fname);
        });
      }
      dlBlob(blob, fname);
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
  function shareLinkOf(it) {
    var url = cardLink(it);
    if (navigator.share) {
      return navigator.share({ title: it.t || it.name || 'SportsMed Toolbox', url: url }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        return copyToClip(url).then(function () { toastMsg('Link copied', 2200); });
      });
    }
    return copyToClip(url).then(function () { toastMsg('Link copied', 2200); });
  }
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
        if (!opt) return;
        sh.hidden = true;
        var act = opt.getAttribute('data-sh');
        if (act === 'img') shareAsImage(CUR_IT);
        else if (act === 'link') shareLinkOf(CUR_IT);
        else if (act === 'copy') copyToClip(cardText(CUR_IT)).then(function () { toastMsg('Details copied — paste anywhere', 2400); });
      });
    }
    sh.innerHTML = '<div class="as-card"><h3>Share this card</h3>' +
      '<div class="sh-sub">' + esc(it.t || it.name || '') + ' · ' + esc(it.sku || '') + '</div>' +
      '<button class="shopt" data-sh="img"><span class="si">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg></span>' +
        '<span class="sl">Send as image<span>A compact branded card — texts great</span></span></button>' +
      '<button class="shopt" data-sh="link"><span class="si">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg></span>' +
        '<span class="sl">Share link<span>Opens this card in the app</span></span></button>' +
      '<button class="shopt" data-sh="copy"><span class="si">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></span>' +
        '<span class="sl">Copy details<span>Name, REF and specs as text</span></span></button>' +
      '<button class="as-close">Cancel</button></div>';
    sh.hidden = false;
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
      '<button class="ago" data-act="a2hs">How</button><button class="ax" data-act="a2hs-x" aria-label="Dismiss">&#x2715;</button></div>';
  }
  function a2hsSheet() {
    var sh = document.getElementById('a2hs-sheet');
    if (!sh) {
      sh = document.createElement('div');
      sh.id = 'a2hs-sheet';
      var ios = /iPad|iPhone|iPod/.test(navigator.userAgent || '');
      var steps = ios
        ? '<li>Open this site in <b>Safari</b></li><li>Tap the <b>Share</b> button (square with an arrow)</li><li>Scroll down and tap <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li>'
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
    var s = e.target.closest && e.target.closest('[data-act="scan"]');
    if (s) { var sb = document.getElementById('scanbtn'); if (sb) sb.click(); return; }
    var ss = e.target.closest && e.target.closest('[data-ssort]');
    if (ss) { SSORT = SSORT === 'sku' ? 'rel' : 'sku'; try { localStorage.setItem('tbx_ssort', SSORT); } catch (e7) {} content.innerHTML = resultsHTML(); return; }
    var sa = e.target.closest && e.target.closest('[data-sall]');
    if (sa) { SALL = true; content.innerHTML = resultsHTML(); return; }
    var sc = e.target.closest && e.target.closest('.schip');
    if (sc) {
      SFILT = sc.getAttribute('data-sf') || null;
      content.innerHTML = resultsHTML();
      return;
    }
    var mo = e.target.closest && e.target.closest('#wnmore');
    if (mo) {
      if (WN_TIMER) { clearTimeout(WN_TIMER); WN_TIMER = null; }
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
        '<span class="tico">' + (TILE_ICONS[t.label] || '') + '</span>' +
        '<span class="tl"><b>' + esc(t.label) + '</b><span class="n">' + t.n + ' items</span></span>' +
        '<span class="ct">&#x203A;</span></button>';
    }).join('');
    tiles += '<button class="tile tile-inv" data-act="otherteams">' +
      '<span class="tico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#141414" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg></span>' +
      '<span class="tl"><b>Inventory Management</b><span class="n">Territory Cycle Counts</span></span>' +
      '<span class="ct">&#x203A;</span></button>';
    var fv = favs(), fsort = 'recent';
    try { fsort = localStorage.getItem('tbx_fsort') === 'az' ? 'az' : 'recent'; } catch (e0) {}
    if (fsort === 'az') fv = fv.slice().sort(function (a, b) { var x = ((a.it && a.it.t) || a.label || ''), y = ((b.it && b.it.t) || b.label || ''); return x.localeCompare(y); });
    var favHTML = fv.length ? '<div class="eyebrow ebrow"><span>Favorites</span>' + (fv.length > 1 ? '<button class="clearrec" data-fsort="' + (fsort === 'az' ? 'recent' : 'az') + '">' + (fsort === 'az' ? 'A\u2013Z \u00b7 sort by recent' : 'Recent \u00b7 sort A\u2013Z') + '</button>' : '') + '</div><div class="list">' + fv.map(function (f) {
      var it = f.it || { t: f.label, sku: f.pn };
      return '<div class="rowwrap">' + rowHTML(f.route, it, '') +
        '<button class="rwact" data-unfav-route="' + esc(f.route) + '" aria-label="Remove favorite">&#9733;</button></div>';
    }).join('') + '</div>' : '';
    var rc = recents();
    var recHTML = rc.length ? '<div class="eyebrow ebrow"><span>Recent</span><button class="clearrec" data-clearrec="1">Clear all</button></div><div class="list">' + rc.slice(0, 6).map(function (r) {
      return '<div class="rowwrap">' + rowHTML(pnRoute(r.sku), { t: r.label, sku: r.sku }, '') +
        '<button class="rwact rwx" data-unrec="' + esc(r.sku) + '" aria-label="Remove from recents">&#x2715;</button></div>';
    }).join('') + '</div>' : '';
    var hint = (!fv.length && !rc.length) ? '<div class="emp" style="padding:6px 12px 2px"><span>Cards you open show up here as Recents \u2014 tap &#9734; on any card to pin it to Favorites.</span></div>' : '';
    render(hint + favHTML + recHTML + '<div class="eyebrow">Browse</div><div class="tiles">' + tiles + '</div>' +
      a2hsHTML() +
      '<div class="foot">Works offline once loaded &middot; v' + APPVER + ' &middot; ' + esc(D.built) +
      '<br><button class="footlink" data-go="#/about">About &amp; tips &#x203A;</button>' +
      '<span class="footsep">&middot;</span>' +
      '<button class="footlink" data-act="checkupd">Check for updates</button></div>');
    content.classList.add('homeview');
    homeBtn.classList.remove('away');
    showWN();
  }
  function topScreen(which) {
    backBtn.hidden = false;
    if (which === 'implants') {
      setTitle('Implants', '');
      var icats = IMPLANT_CATS.slice().sort(function (a, b) {
        if (a === 'Other') return 1; if (b === 'Other') return -1;
        return a.localeCompare(b);
      });
      var tiles = icats.filter(function (c) { return catCount(c); }).map(function (c) {
        return '<button class="tile" data-go="#/cat/' + encodeURIComponent(c) + '">' +
          '<span class="tl"><b>' + esc(c) + '</b><span class="n">' + catCount(c) + ' items</span></span>' +
          '<span class="ct">&#x203A;</span></button>';
      }).join('');
      render('<div class="tiles">' + tiles + '</div>');
      return;
    }
    setTitle('Arthroscopy', '');
    render('<div class="list">' +
      '<button class="rowitem" data-go="#/dgrp/' + encodeURIComponent('Arthroscopy capital') + '">' +
      '<div class="rl"><b class="ti">Arthroscopy Capital</b>' +
      '<span class="ld dim2">' + capArthro().length + ' items</span></div><div class="ct">&#x203A;</div></button>' +
      '<button class="rowitem" data-go="#/fam/' + encodeURIComponent('Disposables') + '/' + encodeURIComponent('CrossFlow arthroscopy pump') + '">' +
      '<div class="rl"><b class="ti">Pump Tubing</b>' +
      '<span class="ld dim2">' + pumpTubing().length + ' items</span></div><div class="ct">&#x203A;</div></button>' +
      '<button class="rowitem" data-go="#/probes"><div class="rl"><b class="ti">SERFAS RF Wands</b>' +
      '<span class="ld dim2">' + D.probes.length + ' items</span></div><div class="ct">&#x203A;</div></button>' +
      '<button class="rowitem" data-go="#/shavers"><div class="rl"><b class="ti">Shaver Blades &amp; Burs</b>' +
      '<span class="ld dim2">' + D.shavers.length + ' items</span></div><div class="ct">&#x203A;</div></button>' +
      '</div>');
  }
  var DISP_GROUPS = {
    'Adaptable disposables': ['Adaptable positioning system'],
    'Anchor disposables': ['CinchLock knotless anchor', 'Gravity anchor', 'Iconix all-suture anchor', 'Knotilus+ knotless anchor', 'NanoTack suture anchor', 'Titanium wedge interference screws', 'AIR+', 'Biosteon HA/PLLA interference screws'],
    'Cannulas & portal access': ['Dri-Lok cannula', 'FlowPort', 'GateWay flexible cannula', 'Portal entry kit', 'Transport', 'Samurai blades'],
    'Guardian/DARTs + HipCheck': ['Guardian + DARTs', 'Hip Check'],
    'Pump & fluid management': ['CrossFlow arthroscopy pump', 'FloSteady arthroscopy pump'],
    'Reamers & drilling': ['VersiTomic Flexible Reaming System', 'VersiTomic Low Profile Reaming System', 'VersiTomic RetroReamer', 'MicroFX OCD Osteochondral Drilling System', 'Phoenix Microfracture Drill'],
    'PRP disposables': ['RegenKit THT (A-PRP)'],
    'Reposables': [],
    'Suture passing systems': ['ArthroTunneler system', 'G-Force tenodesis system', 'InJector II capsule closure', 'SharpShooter meniscal repair system', 'SlingShot capsule restoration system', 'NanoPass suture management system', 'Champion SlingShot suture passer', 'Champion+ Slider suture passer', 'VersiPass suture passer']
  };
  var ALLO_GROUPS = {
    'PRP': ['RegenKit THT (A-PRP)'],
    'ProChondrix': ['ProChondrix CR'],
    'GraftJacket': ['GraftJacket Now Ultra-Thick'],
    'Evergen': ['Tendon', 'Meniscus', 'Fresh Osteochondral', 'Chips and Cubes', 'Cortical Bone Blocks',
      'Ilium Tricortical', 'Structural Bone', 'UniCort Dowels', 'Wedges',
      'Matrix HD acellular human dermis', 'Fortiva porcine dermis']
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
    setTitle(cfg.title[0], cfg.title[1]); backBtn.hidden = false;
    var famGroup = dispFamGroup(cat), counts = {};
    D.items.forEach(function (it) {
      if (it.hidden || (it.cat !== cat && it.cat2 !== cat)) return;
      var g = grpOf(it, famGroup, cfg.fallback);
      counts[g] = (counts[g] || 0) + 1;
    });
    var names = Object.keys(counts).sort();
    render('<div class="tiles">' + names.map(function (g) {
      return '<button class="tile" data-go="#/dgrp/' + encodeURIComponent(g) + '">' +
        '<span class="tl"><b>' + esc(g) + '</b><span class="n">' + counts[g] + ' items</span></span>' +
        '<span class="ct">&#x203A;</span></button>';
    }).join('') + '</div>');
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
      return '<button class="rowitem" data-go="#/fam/' + encodeURIComponent(cat) + '/' + encodeURIComponent(f) + '">' +
        '<div class="rl"><b class="ti">' + esc(f) + '</b><span class="ld dim2">' + fams[f] + ' items</span></div>' +
        '<div class="ct">&#x203A;</div></button>';
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
    var parts = c.split(' '); setTitle(parts[0] + ' ', parts.slice(1).join(' ')); backBtn.hidden = false;
    order.sort();
    render('<div class="list">' + order.map(function (f) {
      return '<button class="rowitem" data-go="#/fam/' + encodeURIComponent(c) + '/' + encodeURIComponent(f) + '">' +
        '<div class="rl"><b class="ti">' + esc(f) + '</b><span class="ld dim2">' + fams[f] + ' items</span></div>' +
        '<div class="ct">&#x203A;</div></button>';
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
        return '<button class="rowitem" data-go="#/sub/' + encodeURIComponent(c) + '/' + encodeURIComponent(f) + '/' + encodeURIComponent(s) + '">' +
          '<div class="rl"><b class="ti">' + esc(s) + '</b><span class="ld dim2">' + subs[s] + ' items</span></div>' +
          '<div class="ct">&#x203A;</div></button>';
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
    var parts = it.cat.split(' '); setTitle(parts[0] + ' ', parts.slice(1).join(' '));
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
          links.push({ t: 'Associated capital', go: it.sub
            ? '#/sub/' + encodeURIComponent('Capital') + '/' + encodeURIComponent(it.fam) + '/' + encodeURIComponent(it.sub)
            : '#/fam/' + encodeURIComponent('Capital') + '/' + encodeURIComponent(it.fam) });
      }
      (it.links || []).forEach(function (l) {
        if (l.menu) { refs.push({ t: l.t, menu: l.menu }); return; }
        var e = l.sku ? BYPN[nrm(l.sku)] : null;
        var tgtHidden = e && e.kind === 'item' && D.items[e.idx].hidden;
        if (!it.hidden && !tgtHidden) return;
        var entry = l.go ? { t: l.t, go: l.go } : (e ? { t: l.t, go: pnRoute(l.sku) } : null);
        if (entry) (tgtHidden ? refs : links).push(entry);
      });
    } else {
      if (relAll.length) links.push({ t: 'Instrumentation', go: '#/instr/' + encodeURIComponent(it.sku) });
      (it.links || []).forEach(function (l) {
        if (l.menu) { refs.push({ t: l.t, menu: l.menu }); return; }
        var e = l.sku ? BYPN[nrm(l.sku)] : null;
        var tgtHidden = e && e.kind === 'item' && D.items[e.idx].hidden;
        var entry = l.go ? { t: l.t, go: l.go } : (e ? { t: l.t, go: pnRoute(l.sku) } : null);
        if (entry) (tgtHidden ? refs : links).push(entry);
      });
    }
    render(specCard({ name: it.name, fam: it.fam, sku: it.sku, uom: it.uom, chips: chips, tags: it.tags,
      specs: it.specs, note: it.note, src: it.src, imgs: it.imgs, imgFull: it.imgFull, warn: it.warn, links: links, refs: refs, bp: it.bp,
      vars: variantsFor(it), used: usedWith(it),
      fav: { route: pnRoute(it.sku), it: { t: it.t || it.name, sz: it.sz || '', ld: it.ld || '', sku: it.sku } } }));
  }
  function probeCard(p) {
    setTitle('SERFAS ', 'RF Wands'); backBtn.hidden = false;
    CUR_IT = p;
    render(specCard({ name: p.name, fam: p.fam, sku: p.sku, uom: p.uom, tags: p.tags, specs: p.specs, imgs: p.imgs, imgFull: p.imgFull, note: p.note,
      src: p.src,
      fav: { route: pnRoute(p.sku), it: { t: p.name, sku: p.sku } } }));
  }
  function shaverCard(s) {
    setTitle('Shaver ', 'Blades'); backBtn.hidden = false;
    CUR_IT = s;
    render(specCard({ name: s.name, fam: (s.fam ? s.fam + ' series' : 'Shaver blades & burs'), sku: s.sku, uom: s.uom, tags: s.tags, specs: s.specs, imgs: s.imgs, imgFull: s.imgFull, warn: s.warn,
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
    var e = BYPN[nrm(sku)];
    if (!e) return home();
    if (e.kind === 'item') { noteRecent(D.items[e.idx].sku, D.items[e.idx].t || D.items[e.idx].name); return itemCard(D.items[e.idx]); }
    if (e.kind === 'probe') { noteRecent(D.probes[e.idx].sku, D.probes[e.idx].name); return probeCard(D.probes[e.idx]); }
    noteRecent(D.shavers[e.idx].sku, D.shavers[e.idx].name);
    return shaverCard(D.shavers[e.idx]);
  }
  function aboutScreen() {
    setTitle('About', ''); backBtn.hidden = false;
    render(
      '<div class="card about-card" style="text-align:center">' +
        '<img class="about-logo" src="favicon.svg" alt="SportsMed Toolbox logo">' +
        '<h1 style="margin:0">Sports<span style="color:var(--amber)">Med</span> Toolbox</h1>' +
        '<div style="color:var(--muted); font-size:13px; margin-top:5px">v' + APPVER + ' &middot; data updated ' + esc(D.built) + '</div>' +
        '<div style="margin-top:6px"><button class="footlink" data-act="checkupd">Check for updates</button>' +
        '<span class="footsep">&middot;</span><button class="footlink" data-act="cyclecount">CT Team</button>' +
        '</div>' +
      '</div>' +
      '<div class="grouphead ab-gh">Tips</div>' +
      '<div class="card about-card">' +
        '<div class="tip"><b>Search smart.</b> Part numbers work with or without dashes.</div>' +
        '<div class="tip"><b>Scan the label.</b> The barcode button reads any package barcode &mdash; the card opens with lot and expiration shown.</div>' +
        '<div class="tip"><b>Zoom the fine print.</b> Tap any product photo to view it fullscreen; pinch or double-tap to zoom.</div>' +
        '<div class="tip"><b>Save your go-tos.</b> Tap &#9734; Favorite on any card to pin it to Favorites at the top of home.</div>' +
        '<div class="tip"><b>Take it offline.</b> Once loaded, everything works with zero signal &mdash; no blackouts in hospital dead zones.</div>' +
        '<div class="tip"><b>Install it.</b> Add the site to your home screen for the full app experience. <button class="footlink" data-act="a2hs" style="padding:0">Show me how &#x203A;</button></div>' +
      '</div>' +
      '<div class="grouphead ab-gh">Credits</div>' +
      '<div class="card about-card">' +
        '<div class="tip"><b style="color:var(--bone)">Created by Nate Merrell</b><br>Built for the CT Sports Medicine Team.</div>' +
        '<div class="tip">Questions, corrections, or a product you want added? Use the feedback bubble on any screen.</div>' +
      '</div>' +
      '<div class="about-quote">\u201cIf your tools don\u2019t work, make them work. If you can\u2019t make them work, make some that do work.\u201d<span class="aq-by">\u2014 Homer Stryker</span></div>' +
      '<div style="text-align:center; margin:18px 0 6px"><button class="footlink" data-act="lockdev">Lock this device</button></div>');
  }
  function instrScreen(sku, cat) {
    var e = BYPN[nrm(sku)];
    if (!e || e.kind !== 'item') return home();
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
    if (!e || e.kind !== 'item') return home();
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
    setTitle('SERFAS ', 'RF Wands'); backBtn.hidden = false;
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
  var SHFAMS = ['Formula', 'CrossBlade', 'TPS'];
  function shDia(s) {
    var d = '';
    (s.specs || []).some(function (p) { if (p[0] === 'Diameter') { d = p[1]; return true; } return false; });
    return d;
  }
  function shSize(s) { var m = String(shDia(s)).match(/([\d.]+)/); return m ? parseFloat(m[1]) : 999; }
  function shaversScreen() {
    setTitle('Shaver ', 'Blades & Burs'); backBtn.hidden = false;
    var counts = {};
    D.shavers.forEach(function (s) { var f = s.fam || 'Formula'; counts[f] = (counts[f] || 0) + 1; });
    render('<div class="list">' + SHFAMS.slice().sort().filter(function (fm) { return counts[fm]; }).map(function (fm) {
      return '<button class="rowitem" data-go="#/shaverfam/' + encodeURIComponent(fm) + '">' +
        '<div class="rl"><b class="ti">' + esc(fm) + '</b><span class="ld dim2">' + counts[fm] + ' items</span></div>' +
        '<div class="ct">&#x203A;</div></button>';
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
    wm:  { id: 'wm',  name: 'Western Mass', enc: 'cc-wm.enc.json',  tgt: 'wm_cc',  gate: 'Western Mass team access \u2014 enter the password.', fa: false }
  };
  var TORDER = ['buf', 'la', 'ri', 'syr', 'wm'];
  // ---- Hub: self-serve territories (served by the syksmtoolbox Apps Script) ----
  var HUB = { url: '', key: '' };
  try { if (window.TOOLBOX && window.TOOLBOX.hub && window.TOOLBOX.hub.url) HUB = window.TOOLBOX.hub; } catch (eHub) {}
  var HORDER = [];
  var GMRE = /^[^@\s]+@(gmail|googlemail)\.com$/i;
  function hubOn() { return !!(HUB && HUB.url); }
  function hubTerrAdd(t, save) {
    if (!t || !t.slug) return;
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
        if (j >= 0) { var row = rows[j]; row.qty = (+row.qty || 0) + q; row.ts = op.ts || row.ts; if (!row.desc && op.desc) row.desc = op.desc; if (!row.exp && op.exp) row.exp = op.exp; if (op.expired) row.expired = true; }
        else { rows.push(ccOpRow(t, op, q, dev)); idx[k] = rows.length - 1; }
      } else if (op.t === 'set') {
        var q2 = Math.max(0, Math.round(+op.qty || 0));
        if (j >= 0) { rows[j].qty = q2; rows[j].ts = op.ts || rows[j].ts; }
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
    ccSyncSt(t).ops.push(op);
    ccSyncSave(t);
    ccDerive(t);
    ccRenderList();
    if (CC.view === 'cchome' && t === CC.tgt) ccHomeCards();
    ccPill();
    ccFlushSoon(t, 1200);
  }
  function ccFlushSoon(t, ms) { var y = ccSY(t); if (y.timer) clearTimeout(y.timer); y.timer = setTimeout(function () { ccFlush(t); }, ms || 800); }
  function ccFlush(t, keep) {
    var y = ccSY(t), st = ccSyncSt(t), ep = ccEndpoint(t);
    var dv = ccDevFor(t);
    if (!ep || !dv) { ccPill(); return; }
    if (y.inflight) {
      if (Date.now() - (y.inAt || 0) < 25000) { ccPill(); ccFlushSoon(t, 6000); return; }
      y.inflight = false;
    }
    if (!st.ops.length) { ccPill(); return; }
    y.inflight = true; y.inAt = Date.now(); ccPill();
    var batch = st.ops.slice(0, keep ? 25 : 150);
    fetch(ep.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: ep.token, action: 'batch', dev: dv, ops: batch, norows: 1 }), keepalive: !!keep })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        y.inflight = false;
        if (!j || !j.ok || !j.applied) {
          // Not on the roster: nothing will change until the device is re-picked
          // (which flushes again), so don't sit in a retry loop.
          if (j && j.err === 'dev') { ccStatus('This device isn\u2019t on the roster \u2014 tap change on ' + terrByTgt(t).name); ccPill(); return; }
          if (j && j.err === 'busy') { ccPill(); ccFlushSoon(t, 1500 + Math.floor(Math.random() * 2500)); return; }
          y.retry = Math.min(y.retry + 1, 5); ccPill(); ccFlushSoon(t, 5000 * Math.max(1, y.retry)); return;
        }
        var done = {}; j.applied.forEach(function (id) { done[id] = 1; });
        var fresh = {}; (j.fresh || j.applied).forEach(function (id) { fresh[id] = 1; });
        var settled = st.ops.filter(function (o) { return fresh[o.opId]; });
        st.ops = st.ops.filter(function (o) { return !done[o.opId]; });
        if (j.rows) st.base = j.rows;
        else if (settled.length) {
          st.base = ccDeriveCore(st.base, settled, t, dv).map(function (r) { if (r.pending) { var c = {}; for (var k in r) c[k] = r[k]; delete c.pending; return c; } return r; });
        }
        y.retry = 0; y.lastOk = Date.now();
        ccSyncSave(t, true); ccDerive(t); ccRenderList();
        if (CC.view === 'cchome' && t === CC.tgt) ccHomeCards();
            ccPill();
        if (st.ops.length) ccFlushSoon(t, 400);
      })
      .catch(function () { y.inflight = false; y.retry = Math.min(y.retry + 1, 5); ccPill(); ccFlushSoon(t, 4000 * Math.max(1, y.retry)); });
  }
  function ccPull(t) {
    var ep = ccEndpoint(t);
    if (!ep) return Promise.reject(new Error('nocreds'));
    var y = ccSY(t), startOk = y.lastOk;
    var q = '&action=pull&dev=' + encodeURIComponent(ccDevFor(t) || '');
    return fetch(ep.url + '?token=' + encodeURIComponent(ep.token) + q)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.rows) {
          if (j.sheetUrl && t !== 'cc') { try { ccLS('tbx_' + t + '_sheet', String(j.sheetUrl)); } catch (eS) {} var sl = document.querySelector('.sheetlink'); if (!sl && CC.view === 'cchome' && t === CC.tgt) { var sy0 = document.getElementById('cc-sync'); if (sy0) sy0.insertAdjacentHTML('afterend', sheetLinkHTML(j.sheetUrl)); } }
          // A flush that landed (or is in flight) while this GET ran has fresher
          // rows than this snapshot — keep the flush's base in that case.
          if (y.lastOk === startOk && !y.inflight) { ccSyncSt(t).base = j.rows; ccSyncSave(t, true); }
          y.lastPull = Date.now();
          ccDerive(t); ccPill();
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
        '<button id="cc-new" class="cc-btn">Start new count</button>' +
        '<div id="cc-sync" class="cc-sync"></div>' +
        sheetLinkHTML(ccSheetUrl()) +
        '<div id="cc-cards" class="ctc-wrap">' + skel(3) + '</div>' +
      '</div>');
    document.getElementById('cc-new').addEventListener('click', function () { ccSession(); });
    CURREFRESH = function () { return ccHomeLoad(terrTgt(), true); };
    document.getElementById('cc-cards').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.ctc') : null; if (!c) return;
      var loc = c.dataset.loc; if (!loc) return;
      CC.loc = loc;
      var p = loc.split(' \u2014 '); CC.locBase = p[0]; CC.subloc = p.slice(1).join(' \u2014 ');
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
        CC.dev = v; ccLS(terrKey('_dev'), v); var nx = CC.ret || ccScreen; CC.ret = null; nx();
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
    CC.worker = null; CC.workerFailed = true; CC.wcb = {};
  }
  function ccDecode(img, opts) {
    if (!CC.worker) return ZXingWASM.readBarcodes(img, opts);
    return new Promise(function (resolve) {
      var id = ++CC.wid, done = false;
      var wd = setTimeout(function () {
        if (done) return; done = true; delete CC.wcb[id];
        ccWorkerDrop(); // unresponsive worker: fall back to the main thread
        resolve(null);
      }, 5000);
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
    try { dev = ccLS('tbx_cc_dev') || ''; } catch (e2) {}
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
      closeModal(); CC.running = true;
      ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (useLot ? ' \u00b7 Lot ' + useLot : ''));
      ccRearm(600); // counted it: allow the very next scan of the same item quickly
      ccAdd(ref, desc, fam, useLot, exp, q); ccSchedule(220);
    };
    document.getElementById('cc-cx').onclick = function () {
      closeModal(); ccRearm(2200); CC.running = true; ccStatus('Cancelled \u2014 keep scanning'); ccSchedule(300);
    };
  }
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
      ccModalClose(sheet); CC.running = true;
      ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (lot ? ' \u00b7 Lot ' + lot : ''));
      ccRearm(600);
      ccAdd(ref, desc, fam, lot, exp, q); ccSchedule(220);
    };
    document.getElementById('cc-lx').onclick = function () {
      ccModalClose(sheet); CC.running = true;
      ccStatus('Cancelled \u2014 keep scanning');
      ccSchedule(300);
    };
  }
  function ccUnknown(r, lot, exp) {
    CC.running = false;
    ccBeep('warn');
    var sheet = document.getElementById('cc-sheet');
    sheet.classList.remove('cc-modal');
    sheet.hidden = false;
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
      sheet.hidden = true; CC.running = true; ccRearm();
      ccAdd(ref, desc, fam, lotv || lot, exp); ccSchedule(400);
    });
    document.getElementById('cc-uskip').addEventListener('click', function () { sheet.hidden = true; CC.running = true; ccRearm(); ccSchedule(300); });
  }
  function ccManual() {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    sheet.classList.remove('cc-modal');
    sheet.hidden = false;
    sheet.innerHTML =
      '<div class="cc-sh-h">Manual add</div>' +
      '<input id="cc-mpn" class="cc-in" type="text" autocomplete="off" placeholder="Part number">' +
      '<input id="cc-mlot" class="cc-in" type="text" autocomplete="off" placeholder="Lot">' +
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
      sheet.hidden = true; CC.running = true; ccRearm();
      var q = Math.max(1, Math.round(+qvEl.value || 1));
      ccAdd(ref, desc, fam, lot, '', q); ccSchedule(400);
    });
    document.getElementById('cc-mx').addEventListener('click', function () { sheet.hidden = true; CC.running = true; ccRearm(); ccSchedule(300); });
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
        '<div class="cc-qlabel">Final quantity</div>' +
        '<div class="cc-qtyrow"><button id="cc-qm" class="cc-qbtn">\u2212</button><input id="cc-qv" class="cc-qin" type="number" inputmode="numeric" value="' + q + '"><button id="cc-qp" class="cc-qbtn">+</button></div>' +
        (breakdown ? '<div class="cc-break">' + esc(breakdown) + '</div>' : '') +
        '<div class="cc-sh-row"><button id="cc-qdel" class="cc-cancel cc-endb">Delete line</button><button id="cc-qdone" class="cc-btn">Done</button></div>';
      var qv = document.getElementById('cc-qv');
      document.getElementById('cc-qm').onclick = function () { qv.value = Math.max(0, (+qv.value || 0) - 1); };
      document.getElementById('cc-qp').onclick = function () { qv.value = (+qv.value || 0) + 1; };
      document.getElementById('cc-qdone').onclick = function () {
        var nq = Math.max(0, Math.round(+qv.value || 0));
        closeModal(); CC.running = true; ccSchedule(300);
        if (nq === (+r.qty || 0)) return;
        var delta = nq - (+r.qty || 0);
        if (!CC.hist[key]) CC.hist[key] = [];
        CC.hist[key].push(delta); ccHistSave();
        var t = CC.tgt;
        var op = { t: 'set', ref: r.ref, lot: r.lot || '', qty: nq, desc: r.desc || '', fam: r.fam || '', exp: r.exp || '', expired: !!(r.expired || ccIsExpired(r.exp)) };
        op.loc = r.loc; op.notes = r.notes || '';
        ccEnqueue(t, op);
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
        (TR.fa ? '<button id="ct-fa2" class="ct-big">F&amp;A Inventory <em class="fa2-em">beta</em><span>Live drops, usage, send-backs &amp; history</span></button>' : '') +
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
        ccLS('tbx_' + j.tgt, JSON.stringify(j.creds));
        ccLS('tbx_' + j.tgt + '_dev', j.selfDev);
        ccLS('tbx_' + j.tgt + '_roster', JSON.stringify(j.creds.devices || []));
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
      '<div class="cc-sub">The full cycle-count guide \u2014 setup, scanning, syncing, and the team sheet.</div>' +
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
    for (var i = 1; i <= 6; i++) pages += '<img src="guide/pages/p' + i + '.webp" loading="lazy" alt="Guide page ' + i + '" style="display:block; width:100%; border-radius:10px; margin:0 0 12px; background:#fff">';
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
  function faFmt(iso) {
    var d = new Date(iso); if (isNaN(d)) return String(iso || '');
    var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return mo + ' ' + d.getDate() + ', ' + d.getFullYear() + ' \u00b7 ' + h + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + ap;
  }

  // ---- home cache + refresh (instant paint from last-known rows, background sync) ----
  function ccHomeLoad(t, manual) {
    var sy = document.getElementById('cc-sync');
    var rf = document.getElementById('cc-rf');
    ccDerive(t);
    var rows = CC.rows;
    var paint = ccHomeCards;
    if (rows.length) { paint(); if (sy) sy.textContent = manual ? 'Refreshing\u2026' : 'Updating\u2026'; }
    else if (sy && manual) { sy.textContent = 'Refreshing\u2026'; }
    if (rf) { rf.classList.add('spin'); rf.disabled = true; }
    function done() { var r2 = document.getElementById('cc-rf'); if (r2) { r2.classList.remove('spin'); r2.disabled = false; } }
    function syncLine() {
      var st = ccSyncSt(t);
      var s2 = document.getElementById('cc-sync');
      if (s2) s2.innerHTML = st.ops.length ? esc(st.ops.length + ' scan' + (st.ops.length > 1 ? 's' : '') + ' still syncing \u2014 sends automatically.') : sinceHTML(Math.max(ccSY(t).lastOk || 0, ccSY(t).lastPull || 0), 'Synced');
    }
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

  // ---- pull-to-refresh: screens register CURREFRESH (a function returning a promise) ----
  var CURREFRESH = null;
  (function () {
    var ind = document.createElement('div'); ind.id = 'ptr'; ind.innerHTML = '&#x21bb;'; document.body.appendChild(ind);
    var y0 = null, pulling = false, busy = false;
    function top() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }
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
      if (!pulling || dy < 80 || !CURREFRESH) { ind.style.opacity = '0'; return; }
      busy = true; ind.style.opacity = '1'; ind.style.transform = 'translate(-50%,0)'; ind.classList.add('spin');
      try { navigator.vibrate && navigator.vibrate(12); } catch (ev) {}
      var done = function () { busy = false; ind.classList.remove('spin'); ind.style.opacity = '0'; ind.style.transform = 'translate(-50%,-40px)'; };
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
  function fa2Submit(events, label, btn) {
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
    setTitle('F&A Inventory', 'beta', 'sup'); backBtn.hidden = false;
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
        '<h2 class="cc-h">F&amp;A Inventory <em class="fa2-em">beta</em></h2>' +
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
    FA2.pendLE = null; fa2HeldDraw();
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
      sub: (lot ? 'Lot ' + esc(lot) : 'No lot on this barcode') + (exp ? ' \u00b7 Exp ' + esc(exp) : (lot ? ' \u00b7 no expiry on this barcode' : '')),
      expired: ccIsExpired(exp),
      fields: (lot ? '' : '<input id="cc-clot" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Lot from the box (or scan the lot barcode next)">') +
              (exp ? '' : '<label class="a2f"><span class="a2fl">Expiration \u2014 optional here, needed before saving</span><input id="cc-cexp" class="cc-in" type="date"></label>'),
      note: had ? 'Already in list: <b>' + had.qty + '</b> \u00b7 this adds on top' : '',
      qtyLabel: had ? 'Add quantity' : 'Quantity',
      onOk: function (q) {
        var lv = document.getElementById('cc-clot'), xv = document.getElementById('cc-cexp');
        var useLot = lot || (lv ? lv.value.trim() : '');
        var useExp = exp || ((xv && /^\d{4}-\d{2}-\d{2}$/.test(xv.value)) ? xv.value : '');
        fa2AddItem({ ref: ref, desc: desc, lot: useLot, exp: useExp, qty: q }, true);
        ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (useLot ? ' \u00b7 Lot ' + useLot : ' \u00b7 scan its lot barcode next'));
      }
    });
    if (document.getElementById('cc-cexp')) fa2ExpWire('cc-cexp');
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
              '<input id="cc-lpn" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Part number">',
      okLabel: 'Add',
      onOk: function (q) {
        var pn = document.getElementById('cc-lpn'), v = pn ? pn.value.trim() : '';
        if (!v) { if (pn) { pn.classList.add('cc-need'); try { pn.focus(); } catch (e) {} } return false; }
        FA2.pendLE = null; fa2HeldDraw();
        fa2AddItem({ ref: v, desc: fa2DescOf(v), lot: lot, exp: exp, qty: q }, true);
        ccStatus('Added ' + v + (q > 1 ? ' \u00d7' + q : '') + (lot ? ' \u00b7 Lot ' + lot : ''));
      },
      onCancel: function () { ccStatus('Lot held \u2014 now scan the product barcode'); }
    });
    var pn0 = document.getElementById('cc-lpn');
    if (pn0) { pn0.addEventListener('input', function () { pn0.classList.remove('cc-need'); }); }
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
    var p = FA2.pendLE;
    if (!p || Date.now() - p.t >= FA2_HELD_MS) { FA2.pendLE = null; h.hidden = true; h.innerHTML = ''; return; }
    h.hidden = false;
    h.innerHTML = '<span class="f2bub">' + (p.lot ? 'Lot ' + esc(p.lot) : '') + (p.lot && p.exp ? ' \u00b7 ' : '') + (p.exp ? 'Exp ' + esc(p.exp) : '') + ' held for the next product</span>' +
      '<button type="button" id="a2-heldx" class="k-x" aria-label="Forget held lot">\u00d7</button>';
    document.getElementById('a2-heldx').addEventListener('click', function () { FA2.pendLE = null; fa2HeldDraw(); ccStatus('Held lot cleared'); });
    FA2.heldTO = setTimeout(fa2HeldDraw, FA2_HELD_MS - (Date.now() - p.t) + 50);
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
      if (exp && !fa2ExpGate('ie-exp', 'ie-err', 'Save changes')) return;
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
    if (w) { w.hidden = !bad; w.textContent = bad ? bad + ' item' + (bad > 1 ? 's need' : ' needs') + ' a lot and expiration \u2014 scan its lot barcode next, or remove it and use + Manual.' : ''; }
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
          evs.push({ eventId: fa2Uuid(), type: 'Received', ref: p.ref, desc: p.desc, lot: p.lot, exp: p.exp || over[k].exp || '2099-12',
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
          '<input id="od-date" class="cc-in" type="date">' +
          '<input id="od-notes" class="cc-in" placeholder="Notes">' +
        '</div>' +
        '<div class="fa2-mrow"><button id="od-cancel" type="button" class="cc-mini">Cancel</button><button id="od-go" type="button" class="cc-btn" disabled>Record &amp; continue</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var chk = wrap.querySelector('#od-chk'), more = wrap.querySelector('#od-more'), go = wrap.querySelector('#od-go'), src = wrap.querySelector('#od-src');
    function gate() { go.disabled = !(chk.checked && src.value.trim()); }
    chk.addEventListener('change', function () { more.hidden = !chk.checked; gate(); });
    src.addEventListener('input', gate);
    wrap.querySelector('#od-cancel').addEventListener('click', function () { wrap.remove(); });
    go.addEventListener('click', function () {
      over[key] = { src: src.value.trim(), date: wrap.querySelector('#od-date').value, notes: wrap.querySelector('#od-notes').value.trim() };
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

  function route() {
    var raw = location.hash || '#/';
    var qi = raw.indexOf('?');
    var query = qi > -1 ? raw.slice(qi + 1) : '';
    if (qparam(query, 'q') !== CURQ) SALL = false;
    CURQ = qparam(query, 'q');
    if (qInput && qInput.value !== CURQ) qInput.value = CURQ;
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
    window.scrollTo(0, 0);
    var xb = document.getElementById('expban');
    if (xb && Date.now() - (+xb.dataset.born || 0) > 1500) xb.remove();
    hideWN(false);
    CURREFRESH = null;
    homeBtn.classList.add('away');
    FILT = {}; CURVIEW = null;
    var fpFilt = qparam(query, 'fp'); if (fpFilt) FILT.fp = fpFilt;
    var gp0 = document.getElementById('glosspanel'); if (gp0) gp0.hidden = true;
    var inCT = (h === '#/cc' || h === '#/fa' || h === '#/ct' || h === '#/teams' || h === '#/signup' || h.indexOf('#/team/') === 0 || h.indexOf('#/fa2') === 0);
    if (!inCT) ccStop();
    ccBar(inCT); // catalog search + info-card scanner hidden everywhere inside CT screens
    if (h.indexOf('#/fa2') !== 0) fa2Wide(false);
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
    if ((m = h.match(/^#\/team\/([a-z0-9]+)(\/cc)?$/))) { if (!TERR[m[1]]) return teamsScreen(); terrSet(m[1]); return m[2] ? ccScreen() : ctScreen(); }
    if ((m = h.match(/^#\/top\/(implants|arthroscopy)$/))) return topScreen(m[1]);
    if ((m = h.match(/^#\/cat\/(.+)$/))) return catScreen(dec(m[1]));
    if ((m = h.match(/^#\/dgrp\/(.+)$/))) return dispGroupScreen(dec(m[1]));
    if ((m = h.match(/^#\/fam\/(.+)$/))) { var fp = splitCatRest(m[1]); return famScreen(fp[0], fp[1]); }
    if ((m = h.match(/^#\/sub\/(.+)$/))) { var sp = splitCatRest(m[1]); var j = sp[1].lastIndexOf('/'); return subScreen(sp[0], dec(sp[1].slice(0, j)), dec(sp[1].slice(j + 1))); }
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
        history.replaceState(null, '', '#/');
        var sb = document.getElementById('scanbtn');
        if (sb) sb.click();
      }, 350);
      return;
    }
    if (h === '#/about') return aboutScreen();
    if (h === '#/probes') return probesScreen();
    if ((m = h.match(/^#\/probe\/(\d+)$/))) return legacyRedirect('probe', +m[1]);
    if (h === '#/shavers') return shaversScreen();
    if ((m = h.match(/^#\/shaverfam\/(.+)$/))) return shaverFamScreen(dec(m[1]));
    if ((m = h.match(/^#\/shaver\/(\d+)$/))) return legacyRedirect('shaver', +m[1]);
    return home();
  }
  backBtn.addEventListener('click', function () { history.length > 1 ? history.back() : (location.hash = '#/'); });
  homeBtn.addEventListener('click', function () { location.hash = '#/'; });

  // ---- bottom search wiring ----
  content = document.getElementById('content');
  qInput = document.getElementById('q');
  qInput.addEventListener('input', function () {
    CURQ = qInput.value.trim();
    if (!CURQ) SFILT = null;
    var base = (location.hash || '#/').split('?')[0];
    history.replaceState(null, '', base + (CURQ ? '?q=' + encodeURIComponent(CURQ) : ''));
    if (CURQ) {
      if (title.innerHTML !== 'Search') LAST_TITLE = title.innerHTML;
      title.innerHTML = 'Search';
      content.innerHTML = resultsHTML();
    } else {
      if (LAST_TITLE) { title.innerHTML = LAST_TITLE; LAST_TITLE = ''; }
      content.innerHTML = LAST_BROWSE;
    }
  });
  function tbxStart() {
    window.addEventListener('hashchange', route); route();
    window.__tbxRouted = true; // boot succeeded: later errors are bugs, not cache corruption (see heal)
    setTimeout(showTour, 700);
  }
  if (document.documentElement.classList.contains('authed')) { tbxStart(); }
  else { window.addEventListener('tbx-unlock', tbxStart, { once: true }); }

  // ---- toast helper ----
  // One toast at a time; later ones queue. opts.action = {label, fn} adds a button (Undo etc.).
  var TQ = [], TBUSY = false, TTIMER = null;
  function toastMsg(text, ms, opts) {
    TQ.push({ text: text, ms: ms || 2200, opts: opts || null });
    if (!TBUSY) toastNext();
  }
  function toastNext() {
    var t = TQ.shift();
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

  // ---- image lightbox (tap to zoom) ----
  (function () {
    var lb = document.getElementById('lb'), img = document.getElementById('lb-img'),
        closeB = document.getElementById('lb-close');
    if (!lb) return;
    var scale = 1, tx = 0, ty = 0, ptrs = {}, lastDist = 0, lastTap = 0, moved = false;
    function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }
    function openLB(src) { img.src = src; reset(); lb.hidden = false; document.body.style.overflow = 'hidden'; }
    function closeLB() { lb.hidden = true; img.src = ''; document.body.style.overflow = ''; }
    content.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.getAttribute('src')) { openLB(t.getAttribute('src')); }
    });
    closeB.addEventListener('click', closeLB);
    lb.addEventListener('pointerdown', function (e) {
      if (e.target === closeB) return;
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = false;
      var ks = Object.keys(ptrs);
      if (ks.length === 2) {
        var a = ptrs[ks[0]], b = ptrs[ks[1]];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      lb.setPointerCapture && lb.setPointerCapture(e.pointerId);
    });
    lb.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return;
      var ks = Object.keys(ptrs);
      if (ks.length === 2) {
        var other = ks[0] === String(e.pointerId) ? ptrs[ks[1]] : ptrs[ks[0]];
        var d = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (lastDist) {
          var ns = Math.min(6, Math.max(1, scale * (d / lastDist)));
          scale = ns; apply();
        }
        lastDist = d;
        ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        moved = true;
      } else if (ks.length === 1 && scale > 1) {
        var p = ptrs[e.pointerId];
        tx += e.clientX - p.x; ty += e.clientY - p.y;
        ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        moved = true; apply();
      } else if (Math.abs(e.clientX - ptrs[e.pointerId].x) > 8 || Math.abs(e.clientY - ptrs[e.pointerId].y) > 8) {
        moved = true;
      }
    });
    lb.addEventListener('pointerup', function (e) {
      delete ptrs[e.pointerId];
      lastDist = 0;
      if (moved) return;
      var now = Date.now();
      if (now - lastTap < 320) {
        if (scale > 1.05) { reset(); }
        else {
          scale = 2.6;
          var r = img.getBoundingClientRect();
          tx -= (e.clientX - r.left) * 1.6; ty -= (e.clientY - r.top) * 1.6;
          apply();
        }
        lastTap = 0;
      } else {
        lastTap = now;
        var self = e.target;
        setTimeout(function () {
          if (lastTap && Date.now() - lastTap >= 320) { lastTap = 0; if (self === lb) closeLB(); }
        }, 330);
      }
    });
    lb.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; lastDist = 0; });
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
      if (r.sku) {
        var entry = BYPN[nrm(r.sku)];
        var it = entry ? (recOf(entry)) : null;
        stopScan();
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

  // ---- service worker + update banner + manual check ----
  var TBX_REG = null;
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return; // first-visit SW claim: page already works, reloading here is the first-run jank
      if (reloaded) return; reloaded = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      TBX_REG = reg;
      var banner = document.getElementById('updbanner');
      function offer(w) {
        if (!w) return;
        banner.hidden = false;
        banner.onclick = function () { banner.hidden = true; w.postMessage('SKIP_WAITING'); };
      }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state !== 'installed' || !navigator.serviceWorker.controller) return;
          // A manual "Check for updates" installs straight away; a background
          // find just shows the banner.
          if (AUTO_UPD) { AUTO_UPD = false; (reg.waiting || nw).postMessage('SKIP_WAITING'); }
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
          reg.waiting.postMessage('SKIP_WAITING');
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
    if (e.target.closest && e.target.closest('[data-act="lockdev"]')) {
      try { sessionStorage.removeItem('tbx_k2'); sessionStorage.removeItem('tbx_key'); } catch (e2) {}
      try { localStorage.removeItem('tbx_k2'); localStorage.removeItem('tbx_key'); localStorage.removeItem('tbx_rm'); } catch (e3) {}
      location.reload();
    }
  });

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
        bar.style.transition = 'transform .15s ease';
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
    // sync engine, for tools/cc-test
    cc: { CC: CC, SY: SY, deriveCore: ccDeriveCore, derive: ccDerive, enqueue: ccEnqueue, flush: ccFlush, pull: ccPull, syncSt: ccSyncSt, syncLoad: ccSyncLoad, terrSet: terrSet, isExpired: ccIsExpired, expIso: expIso, expDisp: expDisp, catCount: catCount } };
};

/* ---- Feedback: screenshot + silent send (mailto fallback) ----
   Relay URL, token and address live in the encrypted payload (TOOLBOX.fb), not
   in this public bundle. Wired from TBX_BOOT once the data has been unlocked. */
window.TBX_FEEDBACK_INIT = function (cfg) {
  if (window.__tbxFbInit) return; window.__tbxFbInit = true;
  cfg = cfg || {};
  var EMAIL = cfg.email || '';
  var FEEDBACK_URL = cfg.url || '';
  var TOKEN = cfg.token || '';
  if (!EMAIL && !FEEDBACK_URL) return; // nowhere to send: no bubble
  var SHOT = null;

  var fab = document.createElement('button');
  fab.id = 'fb-fab'; fab.setAttribute('aria-label', 'Send feedback'); fab.innerHTML = '&#x1F4AC;';
  document.body.appendChild(fab);

  var ov = document.createElement('div');
  ov.id = 'fb-ov'; ov.hidden = true;
  ov.innerHTML = '<div id="fb-card">' +
    '<div id="fb-t">Send feedback</div>' +
    '<div id="fb-ctx"></div>' +
    '<div id="fb-shotrow"><img id="fb-shot" alt=""><span id="fb-shotcap">Capturing screenshot&hellip;</span></div>' +
    '<input id="fb-name" type="text" placeholder="Your name" autocomplete="name">' +
    '<textarea id="fb-note" placeholder="What should be added, fixed, or changed on this screen?"></textarea>' +
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
  function capture() {
    SHOT = null;
    $('fb-shot').style.display = 'none';
    $('fb-shotrow').style.display = 'flex';
    $('fb-shotcap').textContent = 'Capturing screenshot\u2026';
    loadLib(function (ok) {
      if (!ok || !window.html2canvas) { $('fb-shotrow').style.display = 'none'; return; }
      html2canvas(document.body, {
        backgroundColor: '#1E1E1E', scale: 1.5, logging: false,
        x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight,
        ignoreElements: function (el) { return el.id === 'fb-fab' || el.id === 'fb-ov'; }
      }).then(function (c) {
        SHOT = c.toDataURL('image/jpeg', 0.7);
        $('fb-shot').src = SHOT; $('fb-shot').style.display = 'block';
        $('fb-shotcap').textContent = 'Screenshot of this screen attached';
      }).catch(function () { $('fb-shotrow').style.display = 'none'; });
    });
  }
  function resetSend() { var b = $('fb-send'); b.disabled = false; b.textContent = 'Send'; }
  fab.addEventListener('click', function () {
    var c = ctx();
    $('fb-ctx').textContent = 'Screen: ' + c.t + '  (' + c.h + ')';
    $('fb-hint').textContent = FEEDBACK_URL
      ? 'Sends quietly in the background \u2014 goes straight to Nate.'
      : 'Opens your email app \u2014 goes straight to Nate.';
    resetSend();
    ov.hidden = false;
    capture();
    setTimeout(function () { var n = $('fb-name'); if (n && !n.value) n.focus(); }, 60);
  });
  $('fb-cancel').addEventListener('click', function () { ov.hidden = true; });
  ov.addEventListener('click', function (e) { if (e.target === ov) ov.hidden = true; });

  function viaMail(name, note, c) {
    if (!EMAIL) { $('fb-hint').textContent = 'Couldn\u2019t send \u2014 try again when you have signal.'; return; }
    var subject = 'Toolbox feedback \u2014 ' + c.t;
    var body = note + '\n\n\u2014 ' + (name || 'Anonymous') + '\nScreen: ' + c.t + '\nRoute: ' + c.h;
    location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    ov.hidden = true; $('fb-note').value = '';
  }
  $('fb-send').addEventListener('click', function () {
    var name = $('fb-name').value.trim();
    var note = $('fb-note').value.trim();
    if (!note) { $('fb-note').focus(); return; }
    var c = ctx();
    if (!FEEDBACK_URL) return viaMail(name, note, c);
    var b = $('fb-send'); b.disabled = true; b.textContent = 'Sending\u2026';
    var fail = function (reason) {
      resetSend();
      $('fb-hint').textContent = 'Silent send failed (' + reason + ') \u2014 opening your email app instead.';
      setTimeout(function () { viaMail(name, note, c); }, 600);
    };
    fetch(FEEDBACK_URL, {
      method: 'POST',
      body: JSON.stringify({ token: TOKEN, name: name, note: note, screen: c.t, route: c.h, ua: navigator.userAgent, image: SHOT })
    }).then(function (r) { return r.text(); }).then(function (txt) {
      txt = (txt || '').trim();
      if (txt.indexOf('ok') === 0) {
        b.textContent = 'Sent \u2713';
        setTimeout(function () { ov.hidden = true; $('fb-note').value = ''; resetSend(); }, 900);
      } else {
        fail('relay said: ' + (txt ? txt.slice(0, 24) : 'nothing'));
      }
    }).catch(function () { fail('network'); });
  });
};
