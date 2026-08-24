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
  window.addEventListener('error', function () { heal(); });
  window.__tbxHeal = heal;
})();
window.TBX_BOOT = function () {
  if (window.__tbxBooted) return;
  window.__tbxBooted = true;
  var D = window.TOOLBOX, view = document.getElementById('view'),
      title = document.getElementById('title'), backBtn = document.getElementById('back'),
      homeBtn = document.getElementById('home'), toast = document.getElementById('toast');
  var content, qInput, CURQ = '', LAST_BROWSE = '', LAST_TITLE = '', CUR_IT = null;
  var APPVER = '4.58';
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
  function setTitle(a, b) { title.innerHTML = b ? esc(a) + '<em>' + esc(b) + '</em>' : esc(a); }
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

  // ---- favorites (per device) with permalink migration ----
  function favs() { try { return JSON.parse(localStorage.getItem('tbx_favs') || '[]'); } catch (e) { return []; } }
  (function migrateFavs() {
    var list = favs(), changed = false;
    list.forEach(function (f) {
      var sku = f.it && f.it.sku;
      if (sku && f.route !== pnRoute(sku)) { f.route = pnRoute(sku); changed = true; }
    });
    if (changed) localStorage.setItem('tbx_favs', JSON.stringify(list));
  })();
  function isFav(route) { return favs().some(function (f) { return f.route === route; }); }
  function toggleFav(f) {
    var list = favs();
    if (list.some(function (x) { return x.route === f.route; })) {
      list = list.filter(function (x) { return x.route !== f.route; });
    } else { list.unshift(f); }
    localStorage.setItem('tbx_favs', JSON.stringify(list.slice(0, 40)));
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
      try { localStorage.setItem('tbx_favs', JSON.stringify(favs().filter(function (x) { return x.route !== rt; }))); } catch (e2) {}
      uf.innerHTML = '&#9734;'; uf.classList.add('off');
      var uw = uf.closest('.rowwrap');
      setTimeout(function () {
        if (uw) uw.classList.add('bye');
        setTimeout(function () { if (content.classList.contains('homeview')) home(); }, 280);
      }, 240);
      return;
    }
    var cr = e.target.closest('[data-clearrec]');
    if (cr) {
      try { localStorage.removeItem('tbx_recents'); } catch (e6) {}
      var rws = content.querySelectorAll('[data-unrec]');
      for (var ri = 0; ri < rws.length; ri++) { var rw = rws[ri].closest('.rowwrap'); if (rw) rw.classList.add('bye'); }
      setTimeout(function () { if (content.classList.contains('homeview')) home(); }, 300);
      return;
    }
    var ur = e.target.closest('[data-unrec]');
    if (ur) {
      var sk = ur.getAttribute('data-unrec');
      try {
        localStorage.setItem('tbx_recents', JSON.stringify(recents().filter(function (x) { return x.sku !== sk; })));
      } catch (e3) {}
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
      if (nav.classList.contains('link')) { history.replaceState(null, '', go); route(); }
      else location.hash = go;
    }
  });

  // ---- search index ----
  var IMPLANT_CATS = ['Iconix', 'Artelon', 'Corkscrew Anchors', 'NanoTack',
    'Knee/Meniscus Anchors', 'Knotless Hard Body Anchors', 'Other', 'Screws'];
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
  function rowsFor(list) {
    return '<div class="list">' + list.map(function (r) { return rowHTML(r.route, r.it, r.sub); }).join('') + '</div>';
  }
  var SFILT = null;
  var SBUCKETS = ['Arthroscopy', 'Biologics', 'Capital', 'Disposables', 'Implants', 'Instruments', 'Suture'];
  function resultsHTML() {
    var hits = searchAll(CURQ);
    if (!hits.length) {
      SFILT = null;
      return '<div class="empty">No matches for &ldquo;' + esc(CURQ) + '&rdquo;. Try fewer letters or a part-number fragment.</div>';
    }
    var counts = {};
    hits.forEach(function (h) { (h.buckets || []).forEach(function (b) { counts[b] = (counts[b] || 0) + 1; }); });
    var avail = SBUCKETS.filter(function (b) { return counts[b]; });
    if (SFILT && !counts[SFILT]) SFILT = null;
    var shown = SFILT ? hits.filter(function (h) { return (h.buckets || []).indexOf(SFILT) !== -1; }) : hits;
    var chips = avail.length > 1
      ? '<div class="schips"><button class="schip' + (!SFILT ? ' on' : '') + '" data-sf="">All &middot; ' + hits.length + '</button>' +
        avail.map(function (b) {
          return '<button class="schip' + (SFILT === b ? ' on' : '') + '" data-sf="' + esc(b) + '">' + esc(b) + ' &middot; ' + counts[b] + '</button>';
        }).join('') + '</div>'
      : '';
    return chips + '<div class="list" style="margin-top:8px">' +
      shown.slice(0, 60).map(function (h) { return rowHTML(h.route, h.it, h.sub); }).join('') + '</div>' +
      (shown.length > 60 ? '<div class="empty">Showing top 60 of ' + shown.length + ' &mdash; add a word to narrow.</div>' : '');
  }
  function render(browseHTML) {
    LAST_BROWSE = browseHTML;
    content.classList.remove('homeview');
    if (CURQ) { if (title.innerHTML !== 'Search') LAST_TITLE = title.innerHTML; title.innerHTML = 'Search'; }
    content.innerHTML = CURQ ? resultsHTML() : browseHTML;
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
  function usedWith(inst) {
    if (inst.cat !== 'Disposables' && inst.cat !== 'Instruments' && inst.cat !== 'Capital') return [];
    var groups = {}, order = [];
    D.items.forEach(function (a) {
      if (a.cat === 'Disposables' || a.cat === 'Instruments' || a.cat === 'Capital' || a.cat === 'Suture') return;
      if (!a.specs || !a.specs.length) return;
      var l = instrFor(a);
      for (var i = 0; i < l.length; i++) {
        if (l[i].it.sku === inst.sku) {
          var famShort = FAMSHORT[a.fam] || (a.fam || '').split(' ')[0];
          var key = famShort + '|' + (a.sz || '');
          if (!groups[key]) { groups[key] = { fam: a.fam, cat: a.cat, famShort: famShort, sz: a.sz || '', items: [] }; order.push(key); }
          groups[key].items.push(a);
          break;
        }
      }
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
  function implantCount() {
    var n = 0; IMPLANT_CATS.forEach(function (c) { n += D.counts[c] || 0; }); return n;
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
    'Disposables': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-4.5L21 8l-9 4.5L3 8z"/><path d="M3 8v8l9 4.5 9-4.5V8"/><path d="M12 12.5V20"/></svg>',
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
        var inner = '<b>' + esc(i.d) + '</b>' + esc(i.t);
        var cls = 'wn-i' + (idx ? ' wn-x' : '');
        return i.sku ? '<button class="' + cls + '" data-go="' + pnRoute(i.sku) + '">' + inner + '</button>'
                     : '<div class="' + cls + '">' + inner + '</div>';
      }).join('') +
      (WN2.items.length > 1 ? '<button id="wnmore">Show all ' + WN2.items.length + ' &#x203A;</button>' : '');
    document.body.appendChild(el);
  }
  // ---- expiration status ----
  function expStatus(e6) {
    if (!e6 || e6.length !== 6) return null;
    var y = 2000 + +e6.slice(0, 2), mm = +e6.slice(2, 4), dd = +e6.slice(4);
    if (!mm || mm > 12) return null;
    var d = dd ? new Date(y, mm - 1, dd) : new Date(y, mm, 0);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    var days = Math.round((d - today) / 86400000);
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
      { label: 'Allografts & Biologics', go: '#/cat/' + encodeURIComponent('Allografts & Biologics'), n: D.counts['Allografts & Biologics'] || 0 },
      { label: 'Disposables', go: '#/cat/' + encodeURIComponent('Disposables'), n: D.counts['Disposables'] || 0 },
      { label: 'Implants', go: '#/top/implants', n: implantCount() },
      { label: 'Instruments', go: '#/cat/' + encodeURIComponent('Instruments'), n: D.counts['Instruments'] || 0 },
      { label: 'Capital', go: '#/cat/' + encodeURIComponent('Capital'), n: D.counts['Capital'] || 0 },
      { label: 'Suture', go: '#/cat/' + encodeURIComponent('Suture'), n: D.counts['Suture'] || 0 }
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
    var fv = favs();
    var favHTML = fv.length ? '<div class="eyebrow">Favorites</div><div class="list">' + fv.map(function (f) {
      var it = f.it || { t: f.label, sku: f.pn };
      return '<div class="rowwrap">' + rowHTML(f.route, it, '') +
        '<button class="rwact" data-unfav-route="' + esc(f.route) + '" aria-label="Remove favorite">&#9733;</button></div>';
    }).join('') + '</div>' : '';
    var rc = recents();
    var recHTML = rc.length ? '<div class="eyebrow ebrow"><span>Recent</span><button class="clearrec" data-clearrec="1">Clear all</button></div><div class="list">' + rc.slice(0, 3).map(function (r) {
      return '<div class="rowwrap">' + rowHTML(pnRoute(r.sku), { t: r.label, sku: r.sku }, '') +
        '<button class="rwact rwx" data-unrec="' + esc(r.sku) + '" aria-label="Remove from recents">&#x2715;</button></div>';
    }).join('') + '</div>' : '';
    render(favHTML + recHTML + '<div class="eyebrow">Browse</div><div class="tiles">' + tiles + '</div>' +
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
      var tiles = icats.filter(function (c) { return D.counts[c]; }).map(function (c) {
        return '<button class="tile" data-go="#/cat/' + encodeURIComponent(c) + '">' +
          '<span class="tl"><b>' + esc(c) + '</b><span class="n">' + D.counts[c] + ' items</span></span>' +
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
    'Anchor disposables': ['CinchLock knotless anchor', 'Gravity anchor', 'Iconix all-suture anchor', 'Knotilus+ knotless anchor', 'NanoTack suture anchor', 'Titanium wedge interference screws', 'AIR+'],
    'Cannulas & portal access': ['Dri-Lok cannula', 'FlowPort', 'GateWay flexible cannula', 'Portal entry kit', 'Transport', 'Samurai blades'],
    'Pump & fluid management': ['CrossFlow arthroscopy pump'],
    'Reamers & drilling': ['VersiTomic Flexible Reaming System', 'VersiTomic Low Profile Reaming System', 'VersiTomic RetroReamer', 'MicroFX OCD Osteochondral Drilling System', 'Phoenix Microfracture Drill'],
    'Reposables': [],
    'Suture passing systems': ['ArthroTunneler system', 'G-Force tenodesis system', 'InJector II capsule closure', 'SharpShooter meniscal repair system', 'SlingShot capsule restoration system', 'NanoPass suture management system', 'Champion SlingShot suture passer', 'Champion+ Slider suture passer']
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
    'Guardian + DARTs': ['Guardian + DARTs']
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
      if (it.cat !== cat && it.cat2 !== cat) return;
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
      if (it.cat !== cat && it.cat2 !== cat) return;
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
      var list = D.items.filter(function (it) { return it.cat === c && it.fam === fam && it[field] === sel; });
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
    setTitle('Arthro ', 'Probes'); backBtn.hidden = false;
    CUR_IT = p;
    render(specCard({ name: p.name, fam: p.fam, sku: p.sku, uom: p.uom, tags: p.tags, specs: p.specs, imgs: p.imgs, imgFull: p.imgFull, note: p.note,
      src: p.src || 'SERFAS energy probes guide 1000904464 Rev A (2023) — part numbers, diameters, lengths; RF settings from legacy Toolbox site, verify against console',
      fav: { route: pnRoute(p.sku), it: { t: p.name, sku: p.sku } } }));
  }
  function shaverCard(s) {
    setTitle('Shaver ', 'Blades'); backBtn.hidden = false;
    CUR_IT = s;
    render(specCard({ name: s.name, fam: (s.fam ? s.fam + ' series' : 'Shaver blades & burs'), sku: s.sku, uom: s.uom, tags: s.tags, specs: s.specs, imgs: s.imgs, imgFull: s.imgFull, warn: s.warn,
      note: s.note || 'Speed settings held pending verification of the console parameter fields — flagged for review.',
      src: s.src || 'Part numbers cross-checked against the 2026 Sports Medicine product guide (Jan 2026); descriptions from the Cutter and bur guide 1000900564 Rev C (2024) and CrossBlade brochures. Reference images from Cutters and burs competitive cross reference 1000904542 Rev A (2023).',
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
        '<div class="tip"><b>Save your go-tos.</b> The Save button on any card pins it to Favorites at the top of home.</div>' +
        '<div class="tip"><b>Take it offline.</b> Once loaded, everything works offline with zero signal preventing blackouts in hospital deadzones.</div>' +
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
  function ccExp(e6) { if (!e6 || e6.length !== 6) return ''; var dd = e6.slice(4); return '20' + e6.slice(0, 2) + '-' + e6.slice(2, 4) + (dd !== '00' ? '-' + dd : ''); }
  function ccIsExpired(exp) {
    if (!exp) return false;
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(exp); if (!m) return false;
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 0;
    var end = d ? new Date(y, mo - 1, d, 23, 59, 59) : new Date(y, mo, 0, 23, 59, 59);
    return Date.now() > end.getTime();
  }
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
  }
  // ---- offline-first sync engine: scans land in a local ledger instantly and
  // ---- upload in the background as idempotent ops (opId-deduped server side).
  var SY = { cc: { timer: null, inflight: false, retry: 0, lastOk: 0 }, fa: { timer: null, inflight: false, retry: 0, lastOk: 0 } };
  function ccNRef(x) { return String(x == null ? '' : x).replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }
  function ccNLot(x) { return String(x == null ? '' : x).trim().toUpperCase(); }
  function ccNLoc(x) { return String(x == null ? '' : x).trim().toLowerCase(); }
  function ccKeyCC(loc, ref, lot) { return ccNLoc(loc) + '||' + ccNRef(ref) + '||' + ccNLot(lot); }
  function ccKeyFA(sid, ref, lot) { return String(sid == null ? '' : sid).trim() + '||' + ccNRef(ref) + '||' + ccNLot(lot); }
  function ccSyncSt(t) {
    if (t === 'fa') return FA;
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
  var BSAVE = { cc: null, fa: null };
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
    if (t === 'fa') { r.sid = op.sid; r.started = op.started || ''; r.cname = op.cname || ''; r.from = op.from || ''; r.drop = op.drop || ''; r.snotes = op.snotes || ''; r.sby = op.sby || ''; }
    else { r.loc = op.loc; r.notes = op.notes || ''; }
    return r;
  }
  function ccDeriveCore(base, ops, t, dev) {
    var rows = base.map(function (r) { var c = {}; for (var k in r) c[k] = r[k]; return c; });
    var idx = {};
    function keyRow(x) { return t === 'fa' ? ccKeyFA(x.sid, x.ref, x.lot) : ccKeyCC(x.loc, x.ref, x.lot); }
    function reindex() { idx = {}; for (var i = 0; i < rows.length; i++) { var k = keyRow(rows[i]); if (!(k in idx)) idx[k] = i; } }
    reindex();
    ops.forEach(function (op) {
      var k = t === 'fa' ? ccKeyFA(op.sid, op.ref, op.lot) : ccKeyCC(op.loc, op.ref, op.lot);
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
    var rows = ccDeriveCore(st.base || [], st.ops || [], t, t === 'fa' ? ccDevFor('cc') : ccDevFor(t));
    st.rows = rows;
    return rows;
  }
  function ccEndpoint(t) {
    if (t === 'fa') { var c = ccCredsFor('cc'); return (c && c.fa) ? c.fa : null; }
    return ccCredsFor(t);
  }
  function ccEnqueue(t, op) {
    op.opId = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    if (!op.ts) op.ts = new Date().toISOString();
    ccSyncSt(t).ops.push(op);
    ccSyncSave(t);
    ccDerive(t);
    ccRenderList();
    if (CC.view === 'cchome' && t === CC.tgt) ccHomeCards();
    if (CC.view === 'fahome' && t === 'fa') faCards();
    ccPill();
    ccFlushSoon(t, 1200);
  }
  function ccFlushSoon(t, ms) { var y = ccSY(t); if (y.timer) clearTimeout(y.timer); y.timer = setTimeout(function () { ccFlush(t); }, ms || 800); }
  function ccFlush(t, keep) {
    var y = ccSY(t), st = ccSyncSt(t), ep = ccEndpoint(t);
    var dv = t === 'fa' ? ccDevFor('cc') : ccDevFor(t);
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
          if (j && j.err === 'dev') ccStatus('This device isn\u2019t on the roster \u2014 tap change on ' + terrByTgt(t === 'fa' ? 'cc' : t).name);
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
        if (CC.view === 'fahome' && t === 'fa') faCards();
        ccPill();
        if (st.ops.length) ccFlushSoon(t, 400);
      })
      .catch(function () { y.inflight = false; y.retry = Math.min(y.retry + 1, 5); ccPill(); ccFlushSoon(t, 4000 * Math.max(1, y.retry)); });
  }
  function ccPull(t) {
    var ep = ccEndpoint(t);
    if (!ep) return Promise.reject(new Error('nocreds'));
    var y = ccSY(t), startOk = y.lastOk;
    var q = t === 'fa' ? '&action=list' : '&action=pull&dev=' + encodeURIComponent((t === 'fa' ? ccDevFor('cc') : ccDevFor(t)) || '');
    return fetch(ep.url + '?token=' + encodeURIComponent(ep.token) + q)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.rows) {
          // A flush that landed (or is in flight) while this GET ran has fresher
          // rows than this snapshot — keep the flush's base in that case.
          if (y.lastOk === startOk && !y.inflight) { ccSyncSt(t).base = j.rows; ccSyncSave(t, true); }
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
    ccFlushSoon(terrTgt(), 300); ccFlushSoon('fa', 600);
    ccAllCcTgts().forEach(function (tg, i) { if (tg !== terrTgt() && ccPendingLS(tg)) ccFlushSoon(tg, 900 + i * 300); });
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { try { ccFlush(terrTgt(), true); ccFlush('fa', true); } catch (e) {} } else if (document.visibilityState === 'visible') { try { if (CC.view === 'count') { ccWake(); ccBeepInit(); setTimeout(function () { ccCamRecover(); }, 500); } ccFlushSoon(terrTgt(), 800); ccFlushSoon('fa', 1200); ccAllCcTgts().forEach(function (tg, i2) { if (tg !== terrTgt() && ccPendingLS(tg)) ccFlushSoon(tg, 1600 + i2 * 300); }); } catch (e2) {} } });
  window.addEventListener('pagehide', function () { try { ccSaveBaseNow(terrTgt()); ccSaveBaseNow('fa'); } catch (e) {} });
  // Boot: if this phone has queued scans from a previous session, load creds and push them out silently.
  // Deferred a tick so the whole module (incl. FA below) has evaluated first.
  setTimeout(function () {
    try {
      if (ccLS('tbx_cc') && ((ccLS('tbx_cc_ops') || '[]') !== '[]' || (ccLS('tbx_fa_ops') || '[]') !== '[]')) {
        if (CC.terr === 'ct') {
          if (!CC.creds) CC.creds = JSON.parse(ccLS('tbx_cc'));
          if (!CC.dev) CC.dev = ccLS('tbx_cc_dev') || '';
          if (!CC.syncLoaded) { CC.syncLoaded = true; ccSyncLoad('cc'); ccSyncLoad('fa'); }
        }
        ccFlushSoon('cc', 2000); ccFlushSoon('fa', 3000);
      }
      TORDER.concat(HORDER).forEach(function (k, i) {
        var tg = TERR[k].tgt;
        if (tg !== terrTgt() && ccPendingLS(tg) && ccLS('tbx_' + tg)) ccFlushSoon(tg, 4000 + i * 500);
      });
    } catch (eBoot) {}
  }, 0);
  function ccScreen() {
    setTitle('Cycle Count', ''); backBtn.hidden = false;
    ccStop();
    if (!ctEnsure(ccScreen)) return;
    CC.tgt = terrTgt(); CC.view = 'cchome';
    render(
      '<div class="card cc-card cc-home">' +
        '<button id="cc-rf" class="cc-rfb" aria-label="Refresh counts">&#x21bb;</button>' +
        '<h2 class="cc-h">Cycle Count</h2>' +
        '<div class="cc-sub">Counts by location \u2014 open one to keep adding, or start fresh.</div>' +
        '<button id="cc-new" class="cc-btn">Start new count</button>' +
        '<div id="cc-sync" class="cc-sync"></div>' +
        '<div id="cc-cards" class="ctc-wrap"><div class="cc-empty">Loading counts\u2026</div></div>' +
      '</div>');
    document.getElementById('cc-new').addEventListener('click', function () { ccSession(); });
    document.getElementById('cc-rf').addEventListener('click', function () { ccHomeLoad(terrTgt(), true); });
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
    CC.view = 'gate';
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
        okc(JSON.parse(new TextDecoder().decode(buf)));
      }).catch(function () {
        bad();
      });
    }
    go.addEventListener('click', tryPw);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPw(); });
    setTimeout(function () { pw.focus(); }, 60);
  }
  function ccDevice() {
    CC.view = 'device';
    function draw(list) {
      render(
        '<div class="card cc-card">' +
          '<h2 class="cc-h">Whose phone is this?</h2>' +
          '<div class="cc-sub">Every scan from this phone goes to its own tab on the team sheet.</div>' +
          '<select id="cc-dev" class="cc-in cc-sel"><option value="" disabled selected>Select this device\u2026</option>' + list.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('') + '</select>' +
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
    if (!list.length && CC.terr === 'ct') list = ["Matt's iPhone", "Nate's iPhone", "Mia's iPhone", "Manny's iPhone", "Isabella's iPhone", "Megan's iPhone"];
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
        '<div id="cctop">' +
          '<video id="ccvid" playsinline muted autoplay></video>' +
          '<div id="cc-target" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
          '<div id="cc-flash" aria-hidden="true"></div>' +
          '<button id="cc-end" class="cc-endtop">End</button>' +
          '<button id="cc-torch" class="cc-torch" hidden>&#9889;</button>' +
          '<button id="cc-help" class="cc-help" aria-label="Camera help" title="Camera not working?">?</button>' +
          '<div id="cc-stat" class="cc-stat">Starting camera\u2026</div>' +
          '<div id="ccbar">' +
            '<button id="cc-manual" class="cc-mini">+ Manual</button>' +
            '<button id="cc-cam" class="cc-mini">Camera off</button>' +
          '</div>' +
        '</div>' +
        '<div id="cchead"><span id="cc-locname">' + (CC.tgt === 'fa' && FA.sess ? esc(FA.sess.cname || ((FA.sess.from || '?') + ' \u2192 ' + (FA.sess.drop || '?'))) : esc(CC.loc)) + '</span><span id="cc-pill" class="cc-pill"></span><span id="cc-tot"></span></div>' +
        '<div id="cclist"><div class="cc-empty">Loading list\u2026</div></div>' +
        '<div id="cc-sheet" hidden></div>' +
      '</div>');
    CC.mode = 'single';
    document.getElementById('cc-end').addEventListener('click', function () { ccStop(); ccFlushSoon(CC.tgt, 100); if (CC.tgt === 'fa') { faScreen(); } else { ccScreen(); } });
    document.getElementById('cc-manual').addEventListener('click', function () { ccManual(); });
    document.getElementById('cc-cam').addEventListener('click', function () { ccCamSet(CC.camOff); });
    document.getElementById('cc-help').addEventListener('click', function (e) { e.stopPropagation(); ccCamHelp(false); });
    document.getElementById('ccvid').addEventListener('click', function () { ccRefocus(true); });
    document.getElementById('cclist').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.ccrow') : null;
      if (!row) return;
      var r = ccRowsSrc().filter(function (x) { return x.id === row.dataset.id; })[0];
      if (r) ccEditor(r);
    });
    ccBeepInit();
    CC.camOff = false;
    ccStartCam();
    ccHistLoad();
    ccWake();
    var t0 = CC.tgt;
    ccDerive(t0); ccRenderList(); ccPill();
    ccPull(t0).then(function () { ccRenderList(); }).catch(function () {});
    ccFlushSoon(t0, 600);
  }
  function ccModeUI() {
    ccStatus('Aim at a barcode \u2014 each scan confirms quantity');
  }
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
    if (!CC.running || CC.view !== 'count') return;
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
        '<br><br>Counting still works without the camera \u2014 use <b>+ Manual</b> to type a part number and lot.' +
      '</div>' +
      '<div class="cc-sh-row"><button id="cc-hx" class="cc-cancel">Close</button><button id="cc-hr" class="cc-btn">Reload</button></div>';
    document.getElementById('cc-hx').onclick = function () { ccModalClose(sheet); CC.running = true; ccSchedule(300); };
    document.getElementById('cc-hr').onclick = function () { location.reload(); };
  }
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
    ccStatus('Camera off \u2014 tap + Manual to add items');
  }
  function ccCamAlive() { var t = CC.track; return !!(t && t.readyState === 'live' && !t.muted); }
  function ccCamRecover() {
    if (CC.camOff || CC.view !== 'count' || CC.camBusy || ccCamAlive()) return;
    CC.camBusy = true;
    ccStatus('Restarting camera\u2026');
    try { if (CC.stream) CC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    CC.stream = null; CC.track = null; CC.running = false;
    if (CC.tickTO) { clearTimeout(CC.tickTO); CC.tickTO = null; }
    setTimeout(function () { CC.camBusy = false; if (CC.view === 'count') ccStartCam(); }, 300);
  }
  function ccResume(ms) { ccSchedule(ms || 250); }
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
      var it = e ? (e.kind === 'item' ? D.items[e.idx] : e.kind === 'probe' ? D.probes[e.idx] : D.shavers[e.idx]) : null;
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
      (lot ? '' : '<input id="cc-clot" class="cc-in" type="text" autocomplete="off" autocapitalize="characters" placeholder="Lot from the box (optional)">') +
      (ex ? '<div class="cc-note">Already in list here: <b>' + (+ex.qty || 0) + '</b> \u00b7 this adds on top</div>' : '') +
      '<div class="cc-qlabel">' + (ex ? 'Add quantity' : 'Quantity') + '</div>' +
      '<div class="cc-qtyrow"><button id="cc-cqm" class="cc-qbtn" aria-label="Decrease">\u2212</button>' +
        '<input id="cc-cqv" class="cc-qin" type="number" inputmode="numeric" min="1" value="1">' +
        '<button id="cc-cqp" class="cc-qbtn" aria-label="Increase">+</button></div>' +
      '<div class="cc-sh-row"><button id="cc-cx" class="cc-cancel">Cancel</button><button id="cc-cok" class="cc-btn">Confirm</button></div>';
    var qv = document.getElementById('cc-cqv');
    document.getElementById('cc-cqm').onclick = function () { qv.value = Math.max(1, (+qv.value || 1) - 1); };
    document.getElementById('cc-cqp').onclick = function () { qv.value = Math.max(1, (+qv.value || 0) + 1); };
    document.getElementById('cc-cok').onclick = function () {
      var q = Math.max(1, Math.round(+qv.value || 1));
      var lv = document.getElementById('cc-clot');
      var useLot = lot || (lv ? lv.value.trim() : '');
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
    if (t === 'fa') { var fs = FA.sess || {}; op.sid = fs.sid; op.started = fs.started; op.cname = fs.cname; op.from = fs.from; op.drop = fs.drop; op.snotes = fs.snotes; op.sby = fs.sby; }
    else { op.loc = CC.loc; op.notes = CC.notes || ''; }
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
      '<div class="cc-sub2">No part number on this barcode. Type it below, or cancel and scan the product barcode \u2014 the lot is kept either way.</div>' +
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
      if (e3) { var it = e3.kind === 'item' ? D.items[e3.idx] : e3.kind === 'probe' ? D.probes[e3.idx] : D.shavers[e3.idx]; ref = it.sku; desc = it.t || it.name || ''; fam = it.fam || ''; }
      ccModalClose(sheet); CC.running = true;
      ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (lot ? ' \u00b7 Lot ' + lot : ''));
      ccRearm(600);
      ccAdd(ref, desc, fam, lot, exp, q); ccSchedule(220);
    };
    document.getElementById('cc-lx').onclick = function () {
      ccModalClose(sheet); CC.running = true;
      ccStatus('Lot held \u2014 scan the product barcode');
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
      if (!v) { document.getElementById('cc-upn').focus(); return; }
      var lotv = document.getElementById('cc-ulot').value.trim();
      var descv = document.getElementById('cc-udesc').value.trim();
      var e = BYPN[v] || BYPN[v.replace(/^0+/, '')];
      var desc = descv, fam = '', ref = v;
      if (e) {
        var it = e.kind === 'item' ? D.items[e.idx] : e.kind === 'probe' ? D.probes[e.idx] : D.shavers[e.idx];
        ref = it.sku; if (!desc) desc = it.t || it.name || ''; fam = it.fam || '';
        // Only remember it when the typed number matched a real catalogue item,
        // and key it on the full GTIN so packaging levels stay distinct.
        if (r.p && r.p.gtin && r.p.gtin.length === 14) {
          try {
            var L = JSON.parse(localStorage.getItem('tbx_learned') || '{}');
            if (!L[r.p.gtin]) { L[r.p.gtin] = ref; localStorage.setItem('tbx_learned', JSON.stringify(L)); }
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
      if (e) { var it = e.kind === 'item' ? D.items[e.idx] : e.kind === 'probe' ? D.probes[e.idx] : D.shavers[e.idx]; ref = it.sku; desc = it.t || it.name || ''; fam = it.fam || ''; }
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
        if (t === 'fa') { op.sid = r.sid; op.started = r.started; op.cname = r.cname; op.from = r.from; op.drop = r.drop; op.snotes = r.snotes; op.sby = r.sby; }
        else { op.loc = r.loc; op.notes = r.notes || ''; }
        ccEnqueue(t, op);
      };
      document.getElementById('cc-qdel').onclick = function () {
        if (!confirm('Delete ' + r.ref + (r.lot ? ' lot ' + r.lot : '') + ' from the count?')) return;
        closeModal(); CC.running = true; ccSchedule(300);
        delete CC.hist[key]; ccHistSave();
        var t = CC.tgt;
        var op = { t: 'del', ref: r.ref, lot: r.lot || '' };
        if (t === 'fa') { op.sid = r.sid; } else { op.loc = r.loc; }
        ccEnqueue(t, op);
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
    var rows = CC.tgt === 'fa'
      ? FA.rows.filter(function (x) { return FA.sess && x.sid === FA.sess.sid; })
      : CC.rows.filter(function (x) { return ccNLoc(x.loc) === ccNLoc(CC.loc); });
    rows.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
    var tot = 0; rows.forEach(function (x) { tot += (+x.qty || 0); });
    var totEl = document.getElementById('cc-tot');
    if (totEl) totEl.textContent = rows.length + ' lines \u00b7 ' + tot + ' units';
    if (!rows.length) { if (CC.listSig !== 'empty') { list.innerHTML = '<div class="cc-empty">' + (CC.tgt === 'fa' ? 'No scans in this count yet' : 'No scans yet at this location') + ' \u2014 point the camera at a barcode.</div>'; CC.listSig = 'empty'; } return; }
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

  // ---- CT team hub + F&A inventory (shares the cycle-count scan pipeline via CC.tgt) ----
  var FA = { rows: [], base: [], ops: [], sess: null, byId: {} };
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
    if (!CC.syncLoaded) { CC.syncLoaded = true; ccSyncLoad(terrTgt()); if (TERR[CC.terr].fa) ccSyncLoad('fa'); }
    return true;
  }
  function ccRowsSrc() { return CC.tgt === 'fa' ? FA.rows : CC.rows; }
  function ccMatch(x, ref, lot) {
    if (CC.tgt === 'fa') return !!FA.sess && x.sid === FA.sess.sid && ccNRef(x.ref) === ccNRef(ref) && ccNLot(x.lot) === ccNLot(lot);
    return ccNLoc(x.loc) === ccNLoc(CC.loc) && ccNRef(x.ref) === ccNRef(ref) && ccNLot(x.lot) === ccNLot(lot);
  }
  function ccHK(o) {
    if (CC.tgt === 'fa') return 'fa|' + String(o.sid || (FA.sess && FA.sess.sid) || '') + '|' + ccNRef(o.ref) + '|' + ccNLot(o.lot);
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
        (TR.fa ? '<button id="ct-fa" class="ct-big">F&amp;A Inventory<span>Product handed off to the Foot &amp; Ankle team</span></button>' : '') +
      '</div>');
    document.getElementById('ct-cc').addEventListener('click', function () { location.hash = TR.id === 'ct' ? '#/cc' : '#/team/' + TR.id + '/cc'; });
    var mg = document.getElementById('ct-mg');
    if (mg) mg.addEventListener('click', function () { location.hash = '#/team/' + TR.id + '/manage'; });
    var fb = document.getElementById('ct-fa');
    if (fb) fb.addEventListener('click', function () { location.hash = '#/fa'; });
    var lb = document.getElementById('ct-learn');
    if (lb) lb.addEventListener('click', function () {
      var t = ccLearnText();
      function done() { lb.textContent = 'copied'; setTimeout(function () { lb.textContent = 'copy'; }, 1800); }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function () { prompt('Copy these and send them over:', t); }); return; }
      } catch (e) {}
      prompt('Copy these and send them over:', t);
    });
    document.getElementById('ct-devchg').addEventListener('click', function () {
      var pend = (CC.ops || []).length + (TR.fa ? (FA.ops || []).length : 0);
      if (pend) { alert('This phone still has ' + pend + ' unsent scan' + (pend > 1 ? 's' : '') + '. Get signal so they finish syncing, then change the device.'); ccFlushSoon(terrTgt(), 200); if (TR.fa) ccFlushSoon('fa', 500); return; }
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
        if (!confirm('Remove ' + b3.dataset.rm + ' from ' + P.name + '? Their tab and scans stay on the sheet.')) return;
        mcall({ op: 'removemember', email: b3.dataset.rm }, b3, function (e2, r) { if (e2) return msg(eMsg(e2), true); show(r); });
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
      '<a class="cc-btn" style="display:inline-block; text-decoration:none; margin-top:14px" href="guide/SMToolBox_Cycle_Count_Scanner_Guide.pdf" target="_blank" rel="noopener">Open the guide (PDF)</a>' +
      '<div class="cc-sub2">Opens in a new tab \u2014 you can save or share it from there. Needs signal the first time.</div>' +
      '<div id="help-body"></div></div>');
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
    if (!arr.length) { el.innerHTML = '<div class="cc-empty">No counts yet \u2014 start the first one above.</div>'; return; }
    el.innerHTML = arr.map(function (s) {
      return '<div class="ctc" data-loc="' + esc(s.loc) + '">' +
        '<div class="ctc-main"><div class="ctc-t">' + esc(s.loc) + '</div>' +
        '<div class="ctc-n">Last activity ' + esc(faFmt(s.last)) + '</div></div>' +
        '<div class="ctc-r">' + s.lines + ' lines<br>' + s.units + ' units</div>' +
      '</div>';
    }).join('');
  }
  function faScreen() {
    setTitle('F&A Inventory', ''); backBtn.hidden = false;
    ccStop();
    if (!ctEnsure(faScreen)) return;
    if (!CC.creds.fa) {
      CC.creds = null; try { localStorage.removeItem('tbx_cc'); } catch (e) {}
      CC.ret = faScreen; CC.gateMsg = 'New CT tools added \u2014 enter the team password once to enable them.';
      ccGate(); return;
    }
    CC.tgt = 'fa'; CC.view = 'fahome';
    render(
      '<div class="card cc-card cc-home">' +
        '<button id="fa-rf" class="cc-rfb" aria-label="Refresh counts">&#x21bb;</button>' +
        '<h2 class="cc-h">F&amp;A Inventory</h2>' +
        '<div class="cc-sub">Product handed to the Foot &amp; Ankle team, one count per drop.</div>' +
        '<button id="fa-new" class="cc-btn">Start new count</button>' +
        '<div id="fa-sync" class="cc-sync"></div>' +
        '<div id="fa-cards" class="ctc-wrap"><div class="cc-empty">Loading counts\u2026</div></div>' +
      '</div>');
    document.getElementById('fa-new').addEventListener('click', function () { faNew(); });
    document.getElementById('fa-rf').addEventListener('click', function () { ccHomeLoad('fa', true); });
    document.getElementById('fa-cards').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.ctc') : null; if (!c) return;
      var s = FA.byId[c.dataset.sid]; if (!s) return;
      FA.sess = { sid: s.sid, started: s.started, cname: s.cname, from: s.from, drop: s.drop, snotes: s.snotes, sby: s.sby };
      CC.tgt = 'fa'; ccCount();
    });
    ccHomeLoad('fa', false);
  }
  function faFmt(iso) {
    var d = new Date(iso); if (isNaN(d)) return String(iso || '');
    var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return mo + ' ' + d.getDate() + ', ' + d.getFullYear() + ' \u00b7 ' + h + ':' + ('0' + d.getMinutes()).slice(-2) + ' ' + ap;
  }
  function faCards() {
    var el = document.getElementById('fa-cards'); if (!el) return;
    var by = {}; FA.byId = {};
    FA.rows.forEach(function (x) {
      var s = by[x.sid];
      if (!s) { s = by[x.sid] = { sid: x.sid, started: x.started, cname: x.cname, from: x.from, drop: x.drop, snotes: x.snotes, sby: x.sby, lines: 0, units: 0, last: '' }; FA.byId[x.sid] = s; }
      s.lines++; s.units += (+x.qty || 0);
      if (String(x.ts) > String(s.last)) s.last = x.ts;
    });
    var arr = Object.keys(by).map(function (k) { return by[k]; });
    arr.sort(function (a, b) { return String(b.started).localeCompare(String(a.started)); });
    if (!arr.length) { el.innerHTML = '<div class="cc-empty">No counts yet \u2014 start the first one above.</div>'; return; }
    el.innerHTML = arr.map(function (s) {
      return '<div class="ctc" data-sid="' + esc(s.sid) + '">' +
        '<div class="ctc-main"><div class="ctc-t">' + esc(s.cname || faFmt(s.started)) + '</div>' +
        (s.cname ? '<div class="ctc-l">' + esc(faFmt(s.started)) + '</div>' : '') +
        '<div class="ctc-l">' + esc(s.from || '?') + ' \u2192 ' + esc(s.drop || '?') + '</div>' +
        (s.snotes ? '<div class="ctc-n">' + esc(s.snotes) + '</div>' : '') +
        '<div class="ctc-n">Started by ' + esc(s.sby || '?') + '</div></div>' +
        '<div class="ctc-r">' + s.lines + ' lines<br>' + s.units + ' units</div>' +
      '</div>';
    }).join('');
  }
  function faNew() {
    CC.view = 'fanew';
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    var dv = d.toISOString().slice(0, 16);
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">Start a count</h2>' +
        '<div class="cc-sub">Device: <b>' + esc(CC.dev) + '</b></div>' +
        '<label class="cc-lab" for="fa-dt">Date &amp; time</label>' +
        '<input id="fa-dt" class="cc-in" type="datetime-local" value="' + dv + '">' +
        '<input id="fa-name" class="cc-in" type="text" autocomplete="off" placeholder="Count name (e.g. Hartford drop)">' +
        '<input id="fa-from" class="cc-in" type="text" autocomplete="off" placeholder="From location (e.g. Nate\u2019s trunk)">' +
        '<input id="fa-drop" class="cc-in" type="text" autocomplete="off" placeholder="Dropped location (e.g. F&amp;A rep \u2014 Hartford)">' +
        '<input id="fa-notes" class="cc-in" type="text" autocomplete="off" placeholder="Notes (optional)">' +
        '<button id="fa-go" class="cc-btn">Start Scanning</button>' +
        '<div class="cc-sub2">The count appears for the whole team once it syncs.</div>' +
      '</div>');
    document.getElementById('fa-go').addEventListener('click', function () {
      var cname = document.getElementById('fa-name').value.trim();
      var from = document.getElementById('fa-from').value.trim();
      var drop = document.getElementById('fa-drop').value.trim();
      if (!cname) { document.getElementById('fa-name').focus(); return; }
      if (!from) { document.getElementById('fa-from').focus(); return; }
      if (!drop) { document.getElementById('fa-drop').focus(); return; }
      var dt = document.getElementById('fa-dt').value;
      var iso; try { iso = dt ? new Date(dt).toISOString() : new Date().toISOString(); } catch (e) { iso = new Date().toISOString(); }
      FA.sess = { sid: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), started: iso, cname: cname, from: from, drop: drop, snotes: document.getElementById('fa-notes').value.trim(), sby: CC.dev };
      CC.tgt = 'fa'; ccCount();
    });
  }

  // ---- home cache + refresh (instant paint from last-known rows, background sync) ----
  function ccHomeLoad(t, manual) {
    var fa = t === 'fa';
    var sy = document.getElementById(fa ? 'fa-sync' : 'cc-sync');
    var rf = document.getElementById(fa ? 'fa-rf' : 'cc-rf');
    ccDerive(t);
    var rows = fa ? FA.rows : CC.rows;
    var paint = fa ? faCards : ccHomeCards;
    if (rows.length) { paint(); if (sy) sy.textContent = manual ? 'Refreshing\u2026' : 'Updating\u2026'; }
    else if (sy && manual) { sy.textContent = 'Refreshing\u2026'; }
    if (rf) { rf.classList.add('spin'); rf.disabled = true; }
    function done() { var r2 = document.getElementById(fa ? 'fa-rf' : 'cc-rf'); if (r2) { r2.classList.remove('spin'); r2.disabled = false; } }
    function syncLine() {
      var st = ccSyncSt(t);
      var s2 = document.getElementById(fa ? 'fa-sync' : 'cc-sync');
      if (s2) s2.textContent = st.ops.length ? (st.ops.length + ' scan' + (st.ops.length > 1 ? 's' : '') + ' still syncing \u2014 sends automatically.') : '';
    }
    ccFlushSoon(t, 250);
    return ccPull(t).then(function () {
      paint(); syncLine(); done();
    }).catch(function () {
      var e2 = document.getElementById(fa ? 'fa-cards' : 'cc-cards');
      var s2 = document.getElementById(fa ? 'fa-sync' : 'cc-sync');
      if (!(fa ? FA.rows : CC.rows).length && e2) { e2.innerHTML = '<div class="cc-empty">Sheet unreachable \u2014 working offline. Scans still save on this phone and sync later.</div>'; }
      else if (s2) { s2.textContent = 'Offline \u2014 showing this phone\u2019s saved counts.'; }
      done();
    });
  }

  // ---- router ----
  function legacyRedirect(kind, n) {
    var pool = kind === 'item' ? D.items : kind === 'probe' ? D.probes : D.shavers;
    var o = pool[n];
    if (o) { location.replace(pnRoute(o.sku)); return; }
    if (BYPN[nrm(String(n))]) { location.replace(pnRoute(String(n))); return; }
    location.replace('#/');
  }
  function route() {
    var raw = location.hash || '#/';
    var qi = raw.indexOf('?');
    var query = qi > -1 ? raw.slice(qi + 1) : '';
    CURQ = qparam(query, 'q');
    if (qInput && qInput.value !== CURQ) qInput.value = CURQ;
    var h = qi > -1 ? raw.slice(0, qi) : raw;
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
    homeBtn.classList.add('away');
    FILT = {}; CURVIEW = null;
    var fpFilt = qparam(query, 'fp'); if (fpFilt) FILT.fp = fpFilt;
    var gp0 = document.getElementById('glosspanel'); if (gp0) gp0.hidden = true;
    var inCT = (h === '#/cc' || h === '#/fa' || h === '#/ct' || h === '#/teams' || h === '#/signup' || h.indexOf('#/team/') === 0);
    if (!inCT) ccStop();
    ccBar(inCT); // catalog search + info-card scanner hidden everywhere inside CT screens
    if (h === '#/cc') { terrSet('ct'); return ccScreen(); }
    if (h === '#/ct') { terrSet('ct'); return ctScreen(); }
    if (h === '#/fa') { terrSet('ct'); return faScreen(); }
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
    setTimeout(showTour, 700);
  }
  if (document.documentElement.classList.contains('authed')) { tbxStart(); }
  else { window.addEventListener('tbx-unlock', tbxStart, { once: true }); }

  // ---- toast helper ----
  function toastMsg(text, ms) {
    var old = toast.textContent;
    toast.textContent = text;
    toast.classList.add('on');
    setTimeout(function () { toast.classList.remove('on'); setTimeout(function () { toast.textContent = old; }, 250); }, ms || 2200);
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
    function skuOf(entry) {
      if (!entry) return null;
      var pool = entry.kind === 'item' ? D.items : entry.kind === 'probe' ? D.probes : D.shavers;
      return (pool[entry.idx] || {}).sku || null;
    }
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
          if (f === '3' && /^\d{6}/.test(rest)) { out.exp = rest.slice(0, 6); out.lot = rest.slice(6); }
          else if (f === '2' && /^\d{6}/.test(rest)) { out.exp = rest.slice(4, 6) + rest.slice(0, 4); out.lot = rest.slice(6); }
          else if (f === '' && /^\d{4}/.test(rest)) { out.exp = rest.slice(2, 4) + rest.slice(0, 2) + '00'; out.lot = rest.slice(4); }
          else { out.lot = rest; }
        } else if (sec.charAt(0) === '$') { out.lot = sec.slice(1).replace(/^\+/, ''); }
      }
      return out;
    }
    function fmtExp(e6) {
      if (!e6 || e6.length !== 6) return '';
      var mm = e6.slice(2, 4), dd = e6.slice(4);
      return '20' + e6.slice(0, 2) + '-' + mm + (dd !== '00' ? '-' + dd : '');
    }
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
      ov.hidden = true; teach.hidden = true; teachList.innerHTML = ''; teachQ.value = '';
    }
    function onCode(txt) {
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (ev) {}
      var r = resolveCode(txt);
      if (r.sku) {
        var entry = BYPN[nrm(r.sku)];
        var it = entry ? (entry.kind === 'item' ? D.items[entry.idx] : entry.kind === 'probe' ? D.probes[entry.idx] : D.shavers[entry.idx]) : null;
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
          ZXingWASM.readBarcodes(imgData, {
            formats: ['DataMatrix', 'Code128', 'QRCode', 'EAN-13', 'UPC-A', 'PDF417'],
            maxNumberOfSymbols: 1, tryHarder: true
          }).then(function (res) {
            if (!running) return;
            if (res && res.length && res[0].text) { onCode(res[0].text); }
            else { setTimeout(tick, 140); }
          }, function () { setTimeout(tick, 400); });
        }
      } catch (e) {}
      if (!done) setTimeout(tick, 250);
    }
    function startScan() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toastMsg('Camera not available in this browser', 2600); return;
      }
      ov.hidden = false; teach.hidden = true;
      statusEl.textContent = 'Starting camera…';
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
    btn.addEventListener('click', startScan);
    closeB.addEventListener('click', stopScan);
    teachQ.addEventListener('input', function () {
      var q = nrm(teachQ.value);
      if (!q || q.length < 2) { teachList.innerHTML = ''; return; }
      var hits = [];
      for (var i = 0; i < D.items.length && hits.length < 8; i++) {
        var it = D.items[i];
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
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(reg.waiting || nw);
        });
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) reg.update();
      });
    });
  }
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
        var nw = reg.installing;
        if (nw) {
          toastMsg('Downloading update…', 2600);
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
          });
          return;
        }
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

  // dev/test hooks (harmless in production)
  window.TBX_DEV = { expStatus: expStatus, showExpBanner: showExpBanner, cardText: cardText, composeCardPNG: composeCardPNG };
};

/* ---- Feedback: screenshot + silent send (mailto fallback) ---- */
(function () {
  var EMAIL = 'ngmerrell@gmail.com';
  var FEEDBACK_URL = 'https://script.google.com/macros/s/AKfycbw6KHN9bBKviBe8siMrsdDkKCq7s_iLUqGA6K4jUog3vIQ1nqP8Q-E6lHcY8nVM49i96A/exec';
  var TOKEN = 'tbx-fb-7391';
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
})();
