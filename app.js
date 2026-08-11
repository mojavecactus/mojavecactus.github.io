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
  var content, qInput, CURQ = '', LAST_BROWSE = '', CUR_IT = null;
  var APPVER = '4.4';
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
    var nav = e.target.closest('[data-go]');
    if (nav) {
      var go = nav.getAttribute('data-go');
      // variant chips ('chip link') swap the card in place, so Back exits to the list, not the prior variant
      if (nav.classList.contains('link')) { history.replaceState(null, '', go); route(); }
      else location.hash = go;
    }
  });

  // ---- search index ----
  var IMPLANT_CATS = ['Iconix', 'Artelon', 'Corkscrew Anchors', 'Hard Body Suture Anchors',
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
      if (c === 'Capital' && b.indexOf('Instruments') === -1) b.push('Instruments');
      if (c === 'Disposables' && b.indexOf('Disposables') === -1) b.push('Disposables');
      if (c === 'Suture' && b.indexOf('Suture') === -1) b.push('Suture');
      if (IMPLANT_CATS.indexOf(c) !== -1 && b.indexOf('Implants') === -1) b.push('Implants');
    });
    if (it.fam === 'CrossFlow arthroscopy pump' && b.indexOf('Arthroscopy') === -1) b.push('Arthroscopy');
    return b;
  }
  D.items.forEach(function (it) {
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
  var SBUCKETS = ['Arthroscopy', 'Disposables', 'Implants', 'Instruments', 'Suture'];
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
      return '<span class="chip' + (c.dim ? ' dim' : '') + '">' + esc(c.t) + '</span>'; }).join('');
    var rows = (o.specs || []).filter(function (s) { return s[1]; }).map(function (s) {
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
      (o.uom ? '<div class="uomline">Unit: ' + esc(o.uom) + '</div>' : '') +
      (fav ? '<div class="favrow">' + fav + '</div>' : '') +
      (chips ? '<div class="chips">' + chips + '</div>' : '') +
      (o.vars && o.vars.length ? '<div class="eyebrow vhead">Variants</div><div class="chips">' + o.vars.map(function (v) {
        return '<button class="chip link" data-go="' + v.go + '">' + esc(v.t) + '</button>';
      }).join('') + '</div>' : '') +
      (rows ? '<div class="ledger">' + rows + '</div>' : (built ? '<div class="empty">Specs coming — part number and description confirmed from the 2026 catalog.</div>' : '')) +
      (o.used && o.used.length ? '<div class="eyebrow vhead">Used with</div><div class="linkrow">' + o.used.map(function (u) {
        return '<button class="linkbtn" data-go="' + u.go + '">' + esc(u.t) + ' &#x203A;</button>';
      }).join('') + '</div>' : '') +
      ((o.imgs || []).map(function (im) {
        return '<img class="photo' + ((im.indexOf('serfas-') > -1 || im.indexOf('shaver-') > -1) ? ' photo-sm' : '') + '" src="' + esc(im) + '" alt="Product reference photo" loading="lazy">';
      }).join('')) +
      (o.links && o.links.length ? '<div class="linkrow">' + o.links.map(function (l) {
        return '<button class="linkbtn" data-go="' + l.go + '">' + esc(l.t) + ' &#x203A;</button>';
      }).join('') + '</div>' : '') +
      (o.bp ? '<div class="bp"><div class="bp-h">RFT Best Practice</div><div class="bp-b">' + esc(o.bp).replace(/\n/g, '<br>') + '</div></div>' : '') +
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
      if (fams.indexOf(x.fam) === -1) return;
      if (x.cat !== 'Disposables' && x.cat !== 'Capital') return;
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
    if (it.cat === 'Disposables' && !out.some(function (x) { return x.it.cat === 'Capital'; })) return [];
    return out;
  }

  function variantsFor(it) {
    if (!it.sz || ['Disposables', 'Capital', 'Suture'].indexOf(it.cat) !== -1) return [];
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
    if (inst.cat !== 'Disposables' && inst.cat !== 'Capital') return [];
    var groups = {}, order = [];
    D.items.forEach(function (a) {
      if (a.cat === 'Disposables' || a.cat === 'Capital' || a.cat === 'Suture') return;
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
  var TILE_ICONS = {
    'Arthroscopy': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l6-6"/><path d="M8 13l3 3 9-9-3-3-9 9z"/><path d="M14 4l6 6"/><circle cx="18.5" cy="5.5" r="1" fill="#FDB515" stroke="none"/></svg>',
    'Disposables': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-4.5L21 8l-9 4.5L3 8z"/><path d="M3 8v8l9 4.5 9-4.5V8"/><path d="M12 12.5V20"/></svg>',
    'Implants': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3h5"/><path d="M12 3v2.5"/><path d="M9 5.5h6v10l-3 5.5-3-5.5v-10z"/><path d="M9 8.5h6M9 11.5h6M9 14.5h6"/></svg>',
    'Instruments': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.7 6.3a5 5 0 0 1-6.6 6.6L7 20a2.1 2.1 0 0 1-3-3l7.1-7.1a5 5 0 0 1 6.6-6.6L14.5 6.5l3 3 3.2-3.2z"/></svg>',
    'Suture': '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7.5" y="3.5" width="9" height="12" rx="1.5"/><path d="M7.5 7h9M7.5 10h9M7.5 13h9"/><path d="M12 15.5c0 3 6.5 2 6.5 5.5"/></svg>'
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
      { label: 'Arthroscopy', go: '#/top/arthroscopy', n: D.probes.length + D.shavers.length + pumpTubing().length },
      { label: 'Disposables', go: '#/cat/' + encodeURIComponent('Disposables'), n: D.counts['Disposables'] || 0 },
      { label: 'Implants', go: '#/top/implants', n: implantCount() },
      { label: 'Instruments', go: '#/cat/' + encodeURIComponent('Capital'), n: D.counts['Capital'] || 0 },
      { label: 'Suture', go: '#/cat/' + encodeURIComponent('Suture'), n: D.counts['Suture'] || 0 }
    ];
    tileDefs.sort(function (a, b) { return a.label.localeCompare(b.label); });
    var tiles = tileDefs.map(function (t) {
      return '<button class="tile" data-go="' + t.go + '">' +
        '<span class="tico">' + (TILE_ICONS[t.label] || '') + '</span>' +
        '<span class="tl"><b>' + esc(t.label) + '</b><span class="n">' + t.n + ' items</span></span>' +
        '<span class="ct">&#x203A;</span></button>';
    }).join('');
    tiles += '<button class="tile tile-scan" data-act="scan">' +
      '<span class="tico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FDB515" stroke-width="1.8" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10.5 8v8M13.5 8v5M13.5 16v0M16.5 8v8"/></svg></span>' +
      '<span class="tl"><b>Scan</b><span class="n">barcode &#8594; card</span></span>' +
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
    'Biologics & cartilage': ['ProChondrix CR', 'RegenKit THT (A-PRP)'],
    'Cannulas & portal access': ['Dri-Lok cannula', 'FlowPort', 'GateWay flexible cannula', 'Portal entry kit', 'Transport', 'Samurai blades'],
    'Pump & fluid management': ['CrossFlow arthroscopy pump'],
    'Reamers & drilling': ['VersiTomic Flexible Reaming System', 'VersiTomic Low Profile Reaming System', 'VersiTomic RetroReamer', 'MicroFX OCD Osteochondral Drilling System', 'Phoenix Microfracture Drill'],
    'Suture passing systems': ['ArthroTunneler system', 'G-Force tenodesis system', 'InJector II capsule closure', 'SharpShooter meniscal repair system', 'SlingShot capsule restoration system', 'NanoPass suture management system', 'Champion SlingShot suture passer', 'Champion+ Slider suture passer']
  };
  function dispFamGroup() {
    var m = {};
    Object.keys(DISP_GROUPS).forEach(function (g) { DISP_GROUPS[g].forEach(function (f) { m[f] = g; }); });
    return m;
  }
  function dispGroupsScreen() {
    setTitle('Disposables', ''); backBtn.hidden = false;
    var famGroup = dispFamGroup(), counts = {};
    D.items.forEach(function (it) {
      if (it.cat !== 'Disposables' && it.cat2 !== 'Disposables') return;
      var g = it.dgrp || famGroup[it.fam] || 'More disposables';
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
    setTitle(g, ''); backBtn.hidden = false;
    var famGroup = dispFamGroup(), fams = {}, order = [];
    D.items.forEach(function (it) {
      if (it.cat !== 'Disposables' && it.cat2 !== 'Disposables') return;
      var itg = it.dgrp || famGroup[it.fam] || 'More disposables';
      if (itg !== g) return;
      if (!fams[it.fam]) { fams[it.fam] = 0; order.push(it.fam); }
      fams[it.fam]++;
    });
    if (!order.length) return dispGroupsScreen();
    if (order.length === 1) return famScreen('Disposables', order[0]);
    order.sort();
    render('<div class="list">' + order.map(function (f) {
      return '<button class="rowitem" data-go="#/fam/' + encodeURIComponent('Disposables') + '/' + encodeURIComponent(f) + '">' +
        '<div class="rl"><b class="ti">' + esc(f) + '</b><span class="ld dim2">' + fams[f] + ' items</span></div>' +
        '<div class="ct">&#x203A;</div></button>';
    }).join('') + '</div>');
  }
  function catScreen(c) {
    if (c === 'Disposables') return dispGroupsScreen();
    var fams = {}, order = [];
    D.items.forEach(function (it) {
      if (it.cat !== c && it.cat2 !== c) return;
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
    var base = D.items.filter(baseFilter);
    var avail = FTOKENS.filter(function (tk) {
      if (famLabel && famLabel.indexOf(tk.t) !== -1) return false;
      var n = base.filter(tk.f).length; return n > 0 && n < base.length;
    });
    var active = avail.filter(function (tk) { return FILT[tk.t]; });
    var pass = function (it) {
      if (!baseFilter(it)) return false;
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
      if ((it.cat !== c && it.cat2 !== c) || it.fam !== f || !it.sub) return;
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
    if (it.sub) chips.push({ t: it.sub, dim: true });
    if (it.grp) chips.push({ t: it.grp, dim: true });
    var links = [];
    if (instrFor(it).length) links.push({ t: 'Instrumentation', go: '#/instr/' + encodeURIComponent(it.sku) });
    (it.links || []).forEach(function (l) {
      if (l.go) links.push({ t: l.t, go: l.go });
      else if (BYPN[nrm(l.sku)]) links.push({ t: l.t, go: pnRoute(l.sku) });
    });
    render(specCard({ name: it.name, fam: it.fam, sku: it.sku, uom: it.uom, chips: chips, tags: it.tags,
      specs: it.specs, note: it.note, src: it.src, imgs: it.imgs, warn: it.warn, links: links, bp: it.bp,
      vars: variantsFor(it), used: usedWith(it),
      fav: { route: pnRoute(it.sku), it: { t: it.t || it.name, sz: it.sz || '', ld: it.ld || '', sku: it.sku } } }));
  }
  function probeCard(p) {
    setTitle('Arthro ', 'Probes'); backBtn.hidden = false;
    CUR_IT = p;
    render(specCard({ name: p.name, fam: p.fam, sku: p.sku, uom: p.uom, tags: p.tags, specs: p.specs, imgs: p.imgs, note: p.note,
      src: 'SERFAS energy probes guide 1000904464 Rev A (2023) — part numbers, diameters, lengths; RF settings from legacy Toolbox site, verify against console',
      fav: { route: pnRoute(p.sku), it: { t: p.name, sku: p.sku } } }));
  }
  function shaverCard(s) {
    setTitle('Shaver ', 'Blades'); backBtn.hidden = false;
    CUR_IT = s;
    render(specCard({ name: s.name, fam: (s.fam ? s.fam + ' series' : 'Shaver blades & burs'), sku: s.sku, uom: s.uom, tags: s.tags, specs: s.specs, imgs: s.imgs, warn: s.warn,
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
        '<span class="footsep">&middot;</span><button class="footlink" data-act="lockdev">Lock this device</button></div>' +
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
      '<div class="about-quote">\u201cIf your tools don\u2019t work, make them work. If you can\u2019t make them work, make some that do work.\u201d<span class="aq-by">\u2014 Homer Stryker</span></div>');
  }
  function instrScreen(sku) {
    var e = BYPN[nrm(sku)];
    if (!e || e.kind !== 'item') return home();
    var it = D.items[e.idx];
    backBtn.hidden = false;
    setTitle('Instrumentation', '');
    var list = instrFor(it);
    var order = ['Disposables', 'Capital'], label = { Disposables: 'Disposables', Capital: 'Instruments' };
    var html = '<div class="eyebrow">' + esc((it.t || it.name) + (it.sz ? ' ' + it.sz : '')) + '</div>';
    order.forEach(function (c) {
      var grp = list.filter(function (x) { return x.it.cat === c; });
      if (!grp.length) return;
      html += '<div class="grouphead">' + esc(label[c]) + '</div><div class="list">' +
        grp.map(function (x) { return rowHTML(pnRoute(x.it.sku), x.it, ''); }).join('') + '</div>';
    });
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
  var CC = { creds: null, dev: '', loc: '', locBase: '', subloc: '', notes: '', mode: 'single', rows: [], hist: {}, stream: null, running: false, poll: null, cool: { code: '', t: 0 }, canvas: document.createElement('canvas'), ctx: null, tickTO: null, track: null, focusIv: null, listSig: '', busy: false, view: 'gate', tgt: 'cc', ret: null, gateMsg: '' };
  function ccLS(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function ccB64d(x) { var bin = atob(x), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function ccExp(e6) { if (!e6 || e6.length !== 6) return ''; var dd = e6.slice(4); return '20' + e6.slice(0, 2) + '-' + e6.slice(2, 4) + (dd !== '00' ? '-' + dd : ''); }
  function ccIsExpired(exp) {
    if (!exp) return false;
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(exp); if (!m) return false;
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 0;
    var end = d ? new Date(y, mo - 1, d, 23, 59, 59) : new Date(y, mo, 0, 23, 59, 59);
    return Date.now() > end.getTime();
  }
  function ccBar(hide) { var b = document.getElementById('bottombar'); if (b) b.style.display = hide ? 'none' : ''; }
  function ccStop() {
    if (!CC) return;
    CC.running = false;
    if (CC.tickTO) { clearTimeout(CC.tickTO); CC.tickTO = null; }
    if (CC.focusIv) { clearInterval(CC.focusIv); CC.focusIv = null; }
    if (CC.stream) { try { CC.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} CC.stream = null; }
    CC.track = null;
    if (CC.poll) { clearInterval(CC.poll); CC.poll = null; }
    ccBar(false);
  }
  function ccPost(body) {
    var url;
    if (CC.tgt === 'fa') {
      var s = FA.sess || {};
      body.token = CC.creds.fa.token; body.dev = CC.dev;
      body.sid = s.sid; body.started = s.started; body.cname = s.cname; body.from = s.from; body.drop = s.drop; body.snotes = s.snotes; body.sby = s.sby;
      url = CC.creds.fa.url;
    } else {
      body.token = CC.creds.token; body.dev = CC.dev; body.loc = CC.loc; body.notes = CC.notes;
      url = CC.creds.url;
    }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function ccList() {
    if (CC.tgt === 'fa') return faList().then(function () { ccRenderList(); });
    return fetch(CC.creds.url + '?token=' + encodeURIComponent(CC.creds.token) + '&action=list')
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.rows) { CC.rows = j.rows; ccCacheSave('cc'); ccRenderList(); } });
  }
  function ccScreen() {
    setTitle('Cycle Count', ''); backBtn.hidden = false;
    ccStop();
    if (!ctEnsure(ccScreen)) return;
    CC.tgt = 'cc'; CC.view = 'cchome';
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
    document.getElementById('cc-rf').addEventListener('click', function () { ccHomeLoad('cc', true); });
    document.getElementById('cc-cards').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('.ctc') : null; if (!c) return;
      var loc = c.dataset.loc; if (!loc) return;
      CC.loc = loc;
      var p = loc.split(' \u2014 '); CC.locBase = p[0]; CC.subloc = p.slice(1).join(' \u2014 ');
      CC.notes = ''; CC.tgt = 'cc'; ccCount();
    });
    ccHomeLoad('cc', false);
  }
  function ccGate() {
    CC.view = 'gate';
    var gm = CC.gateMsg || 'CT team access \u2014 enter the password.'; CC.gateMsg = '';
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">CT Team</h2>' +
        '<div class="cc-sub">' + esc(gm) + '</div>' +
        '<input id="cc-pw" class="cc-in" type="password" autocomplete="off" placeholder="Password">' +
        '<div id="cc-err" class="cc-err" hidden>Wrong password.</div>' +
        '<button id="cc-go" class="cc-btn">Unlock</button>' +
      '</div>');
    var go = document.getElementById('cc-go'), pw = document.getElementById('cc-pw');
    function tryPw() {
      var v = pw.value; if (!v) return;
      go.disabled = true; go.textContent = 'Checking\u2026';
      fetch('cc.enc.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (P) {
        return crypto.subtle.importKey('raw', new TextEncoder().encode(v), 'PBKDF2', false, ['deriveKey'])
          .then(function (km) { return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ccB64d(P.salt), iterations: P.it }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
          .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ccB64d(P.iv) }, key, ccB64d(P.ct)); });
      }).then(function (buf) {
        CC.creds = JSON.parse(new TextDecoder().decode(buf));
        ccLS('tbx_cc', JSON.stringify(CC.creds));
        var nx = CC.ret || ccScreen; CC.ret = null; nx();
      }).catch(function () {
        go.disabled = false; go.textContent = 'Unlock';
        var er = document.getElementById('cc-err'); if (er) er.hidden = false;
      });
    }
    go.addEventListener('click', tryPw);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPw(); });
    setTimeout(function () { pw.focus(); }, 60);
  }
  function ccDevice() {
    CC.view = 'device';
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">Name this device</h2>' +
        '<div class="cc-sub">Shown next to every scan from this phone (e.g. &ldquo;Nate&rsquo;s iPhone&rdquo;).</div>' +
        '<input id="cc-dev" class="cc-in" type="text" autocomplete="off" placeholder="Device name">' +
        '<button id="cc-devgo" class="cc-btn">Continue</button>' +
      '</div>');
    document.getElementById('cc-devgo').addEventListener('click', function () {
      var v = document.getElementById('cc-dev').value.trim();
      if (!v) return;
      CC.dev = v; ccLS('tbx_cc_dev', v); var nx = CC.ret || ccScreen; CC.ret = null; nx();
    });
  }
  function ccSession() {
    CC.view = 'session';
    ccBar(false);
    var locs = [], sublocs = [];
    try { locs = JSON.parse(ccLS('tbx_cc_locs') || '[]'); } catch (e) {}
    try { sublocs = JSON.parse(ccLS('tbx_cc_sublocs') || '[]'); } catch (e) {}
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
        '<div class="cc-sub2">Scans feed the shared team sheet in real time.</div>' +
      '</div>');
    document.getElementById('cc-start').addEventListener('click', function () {
      var loc = document.getElementById('cc-loc').value.trim();
      if (!loc) { document.getElementById('cc-loc').focus(); return; }
      var subloc = document.getElementById('cc-subloc').value.trim();
      CC.locBase = loc; CC.subloc = subloc;
      CC.loc = subloc ? loc + ' \u2014 ' + subloc : loc;
      CC.notes = document.getElementById('cc-notes').value.trim();
      var ls = [loc].concat(locs.filter(function (l) { return l !== loc; })).slice(0, 8);
      ccLS('tbx_cc_locs', JSON.stringify(ls));
      if (subloc) { var ss = [subloc].concat(sublocs.filter(function (l) { return l !== subloc; })).slice(0, 12); ccLS('tbx_cc_sublocs', JSON.stringify(ss)); }
      ccCount();
    });
  }
  function ccStatus(t) { var el = document.getElementById('cc-stat'); if (el) el.textContent = t; }
  function ccCount() {
    CC.view = 'count';
    CC.listSig = '';
    ccBar(true);
    render(
      '<div id="ccwrap">' +
        '<div id="cctop">' +
          '<video id="ccvid" playsinline muted autoplay></video>' +
          '<div id="cc-target" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
          '<div id="cc-flash" aria-hidden="true"></div>' +
          '<button id="cc-torch" class="cc-torch" hidden>&#9889;</button>' +
          '<button id="cc-focus" class="cc-focus" aria-label="Refocus camera" title="Tap to refocus">&#9678;</button>' +
          '<div id="cc-stat" class="cc-stat">Starting camera\u2026</div>' +
          '<div id="ccbar">' +
            '<div class="cc-toggle"><button id="cc-m1" class="on">Single</button><button id="cc-m2">Continuous</button></div>' +
            '<button id="cc-manual" class="cc-mini">+ Manual</button>' +
            '<button id="cc-end" class="cc-mini cc-endb">End</button>' +
          '</div>' +
        '</div>' +
        '<div id="cchead"><span id="cc-locname">' + (CC.tgt === 'fa' && FA.sess ? esc(FA.sess.cname || ((FA.sess.from || '?') + ' \u2192 ' + (FA.sess.drop || '?'))) : esc(CC.loc)) + '</span><span id="cc-tot"></span></div>' +
        '<div id="cclist"><div class="cc-empty">Loading list\u2026</div></div>' +
        '<div id="cc-sheet" hidden></div>' +
      '</div>');
    document.getElementById('cc-m1').addEventListener('click', function () { CC.mode = 'single'; ccModeUI(); });
    document.getElementById('cc-m2').addEventListener('click', function () { CC.mode = 'cont'; ccModeUI(); });
    document.getElementById('cc-end').addEventListener('click', function () { ccStop(); if (CC.tgt === 'fa') { faScreen(); } else { ccScreen(); } });
    document.getElementById('cc-manual').addEventListener('click', function () { ccManual(); });
    document.getElementById('cc-focus').addEventListener('click', function (e) { e.stopPropagation(); ccRefocus(true); ccStatus('Refocusing\u2026'); });
    document.getElementById('ccvid').addEventListener('click', function () { ccRefocus(true); });
    document.getElementById('cclist').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.ccrow') : null;
      if (!row) return;
      var r = ccRowsSrc().filter(function (x) { return x.id === row.dataset.id; })[0];
      if (r) ccEditor(r);
    });
    ccStartCam();
    ccHistLoad();
    ccList().catch(function () { ccStatus('Sheet unreachable \u2014 check signal'); });
    CC.poll = setInterval(function () { if (CC.view === 'count') ccList().catch(function () {}); }, 4000);
  }
  function ccModeUI() {
    var m1 = document.getElementById('cc-m1'), m2 = document.getElementById('cc-m2');
    if (m1) m1.classList.toggle('on', CC.mode === 'single');
    if (m2) m2.classList.toggle('on', CC.mode === 'cont');
    ccStatus(CC.mode === 'cont' ? 'Continuous: every scan counts 1' : 'Single: scan once, then set quantity');
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
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(function (st) {
        CC.stream = st; CC.running = true; CC.ctx = null;
        var v = document.getElementById('ccvid');
        if (!v) { ccStop(); return; }
        v.srcObject = st; v.play && v.play().catch(function () {});
        try {
          var track = st.getVideoTracks()[0];
          CC.track = track;
          if (track && track.applyConstraints) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
          var tb = document.getElementById('cc-torch');
          var caps = track && track.getCapabilities ? track.getCapabilities() : null;
          if (tb && caps && caps.torch) {
            tb.hidden = false; var on = false;
            tb.onclick = function (e) { if (e) e.stopPropagation(); on = !on; tb.classList.toggle('on', on); track.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {}); };
          }
          // keep the label crisp: gentle single-shot refocus nudge every few seconds
          if (CC.focusIv) clearInterval(CC.focusIv);
          CC.focusIv = setInterval(function () { if (CC.running && CC.view === 'count') ccRefocus(false); }, 4500);
        } catch (e) {}
        ccModeUI();
        ccSchedule(400);
      }, function () { ccStatus('Camera permission needed \u2014 allow in Settings'); });
  }
  function ccTick() {
    if (!CC.running || CC.view !== 'count') return;
    var v = document.getElementById('ccvid');
    if (!v || v.readyState < 2 || !v.videoWidth) { ccSchedule(250); return; }
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
      ZXingWASM.readBarcodes(img, { formats: ['DataMatrix', 'Code128', 'QRCode', 'EAN-13', 'UPC-A', 'PDF417'], maxNumberOfSymbols: 1, tryHarder: true })
        .then(function (res) {
          if (!CC.running) return;
          if (res && res.length && res[0].text) ccOnCode(res[0].text);
          else ccSchedule(150);
        }, function () { ccSchedule(400); });
    } catch (e) { ccSchedule(300); }
  }
  function ccSchedule(ms) { if (CC.tickTO) clearTimeout(CC.tickTO); CC.tickTO = setTimeout(ccTick, ms || 250); }
  function ccResume(ms) { ccSchedule(ms || 250); }
  function ccFlashGreen() {
    var f = document.getElementById('cc-flash'); if (!f) return;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function ccHistKey(loc, ref, lot) { return String(loc) + '|' + String(ref) + '|' + String(lot || ''); }
  function ccHistSave() { try { localStorage.setItem('tbx_cc_hist', JSON.stringify(CC.hist)); } catch (e) {} }
  function ccHistLoad() { try { CC.hist = JSON.parse(localStorage.getItem('tbx_cc_hist') || '{}') || {}; } catch (e) { CC.hist = {}; } }
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
  }
  function ccOnCode(txt) {
    var now = Date.now();
    if (txt === CC.cool.code && now - CC.cool.t < 2000) { ccSchedule(200); return; }
    CC.cool = { code: txt, t: now };
    var r = window.__TBX_RESOLVE ? window.__TBX_RESOLVE(txt) : { sku: null, p: {} };
    var lot = (r.p && r.p.lot) || '', exp = ccExp(r.p && r.p.exp);
    var ref = null, desc = '', fam = '';
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
    if (CC.mode === 'single') {
      ccConfirm(ref, desc, fam, lot, exp); return;
    }
    try { navigator.vibrate && navigator.vibrate(35); } catch (ev2) {}
    ccStatus('+1 ' + ref + (lot ? ' \u00b7 Lot ' + lot : ''));
    ccAdd(ref, desc, fam, lot, exp);
    ccSchedule(350);
  }
  function ccConfirm(ref, desc, fam, lot, exp) {
    CC.running = false;
    var sheet = document.getElementById('cc-sheet');
    if (!sheet) { CC.running = true; ccSchedule(300); return; }
    var ex = ccRowsSrc().filter(function (x) { return ccMatch(x, ref, lot); })[0];
    if (ex) ccFlash(ex.id);
    ccModalOpen(sheet);
    try { navigator.vibrate && navigator.vibrate(ex ? [30, 60, 30] : 35); } catch (ev) {}
    function closeModal() { ccModalClose(sheet); }
    sheet.innerHTML =
      '<div class="cc-sh-h">' + esc(ref) + (desc ? ' \u2014 ' + esc(desc) : '') + '</div>' +
      '<div class="cc-sub">' + (lot ? 'Lot ' + esc(lot) : 'No lot') + (exp ? ' \u00b7 Exp ' + esc(exp) : '') + '</div>' +
      (ccIsExpired(exp) ? '<div class="cc-exptag">EXPIRED</div>' : '') +
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
      closeModal(); CC.running = true;
      ccStatus('Added ' + ref + (q > 1 ? ' \u00d7' + q : '') + (lot ? ' \u00b7 Lot ' + lot : ''));
      ccAdd(ref, desc, fam, lot, exp, q); ccSchedule(500);
    };
    document.getElementById('cc-cx').onclick = function () {
      closeModal(); CC.running = true; ccStatus('Cancelled \u2014 keep scanning'); ccSchedule(350);
    };
  }
  function ccAdd(ref, desc, fam, lot, exp, qty) {
    qty = Math.max(1, Math.round(+qty || 1));
    var expired = ccIsExpired(exp);
    var nowIso = new Date().toISOString();
    var ex = ccRowsSrc().filter(function (x) { return ccMatch(x, ref, lot); })[0];
    var tmp = null;
    if (ex) { ex.qty = (+ex.qty || 0) + qty; ex.ts = nowIso; }
    else {
      tmp = { id: 'tmp' + Date.now(), ts: nowIso, dev: CC.dev, ref: ref, desc: desc, fam: fam, lot: lot, exp: exp, expired: expired, qty: qty, pending: true };
      if (CC.tgt === 'fa') { var fs = FA.sess || {}; tmp.sid = fs.sid; tmp.started = fs.started; tmp.cname = fs.cname; tmp.from = fs.from; tmp.drop = fs.drop; tmp.snotes = fs.snotes; tmp.sby = fs.sby; FA.rows.unshift(tmp); }
      else { tmp.loc = CC.loc; CC.rows.unshift(tmp); }
    }
    var key = ccHK({ ref: ref, lot: lot });
    if (!CC.hist[key]) CC.hist[key] = [];
    CC.hist[key].push(qty); ccHistSave();
    ccRenderList();
    ccPost({ action: 'add', ref: ref, desc: desc, fam: fam, lot: lot, exp: exp, expired: expired, qty: qty, mode: CC.mode })
      .then(function (j) { if (j && j.ok) { if (tmp) tmp.id = j.id; ccList().catch(function () {}); } else { ccStatus('Save failed \u2014 rescan'); } })
      .catch(function () { ccStatus('No signal \u2014 scan NOT saved'); });
  }
  function ccUnknown(r, lot, exp) {
    CC.running = false;
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
      if (e) { var it = e.kind === 'item' ? D.items[e.idx] : e.kind === 'probe' ? D.probes[e.idx] : D.shavers[e.idx]; ref = it.sku; if (!desc) desc = it.t || it.name || ''; fam = it.fam || ''; }
      sheet.hidden = true; CC.running = true;
      ccAdd(ref, desc, fam, lotv || lot, exp); ccSchedule(400);
    });
    document.getElementById('cc-uskip').addEventListener('click', function () { sheet.hidden = true; CC.running = true; ccSchedule(300); });
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
      '<div id="cc-mhint" class="cc-hint" hidden>Part number and lot are both required.</div>' +
      '<div class="cc-sh-row"><button id="cc-madd" class="cc-btn">Add to count</button><button id="cc-mx" class="cc-mini">Cancel</button></div>';
    var pnEl = document.getElementById('cc-mpn'), lotEl = document.getElementById('cc-mlot'), hintEl = document.getElementById('cc-mhint');
    function clearNeed() { hintEl.hidden = true; pnEl.classList.remove('cc-need'); lotEl.classList.remove('cc-need'); }
    pnEl.addEventListener('input', clearNeed); lotEl.addEventListener('input', clearNeed);
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
      sheet.hidden = true; CC.running = true;
      ccAdd(ref, desc, fam, lot, ''); ccSchedule(400);
    });
    document.getElementById('cc-mx').addEventListener('click', function () { sheet.hidden = true; CC.running = true; ccSchedule(300); });
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
        r.qty = nq; r.ts = new Date().toISOString();
        if (!CC.hist[key]) CC.hist[key] = [];
        CC.hist[key].push(delta); ccHistSave();
        ccRenderList();
        ccPost({ action: 'setqty', id: r.id, qty: nq }).then(function () { ccList().catch(function () {}); }).catch(function () { ccStatus('Save failed \u2014 check signal'); });
      };
      document.getElementById('cc-qdel').onclick = function () {
        if (!confirm('Delete ' + r.ref + (r.lot ? ' lot ' + r.lot : '') + ' from the count?')) return;
        closeModal(); CC.running = true; ccSchedule(300);
        CC.rows = CC.rows.filter(function (x) { return x.id !== r.id; });
        delete CC.hist[key]; ccHistSave();
        ccRenderList();
        ccPost({ action: 'del', id: r.id }).then(function () { ccList().catch(function () {}); }).catch(function () {});
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
      : CC.rows.filter(function (x) { return x.loc === CC.loc; });
    rows.sort(function (a, b) { return String(b.ts).localeCompare(String(a.ts)); });
    var tot = 0; rows.forEach(function (x) { tot += (+x.qty || 0); });
    var totEl = document.getElementById('cc-tot');
    if (totEl) totEl.textContent = rows.length + ' lines \u00b7 ' + tot + ' units';
    if (!rows.length) { if (CC.listSig !== 'empty') { list.innerHTML = '<div class="cc-empty">' + (CC.tgt === 'fa' ? 'No scans in this count yet' : 'No scans yet at this location') + ' \u2014 point the camera at a barcode.</div>'; CC.listSig = 'empty'; } return; }
    var sig = rows.map(function (x) { return x.id + ':' + x.qty + ':' + (x.lot || '') + ':' + (x.exp || '') + ':' + (x.pending ? 1 : 0) + ':' + (x.desc || ''); }).join('|');
    if (sig === CC.listSig) return;
    CC.listSig = sig;
    list.innerHTML = rows.map(function (x) {
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
  var FA = { rows: [], sess: null, byId: {} };
  function ctEnsure(then) {
    if (!CC.creds) { var st = ccLS('tbx_cc'); if (st) { try { CC.creds = JSON.parse(st); } catch (e) {} } }
    if (!CC.creds) { CC.ret = then; ccGate(); return false; }
    if (!CC.dev) CC.dev = ccLS('tbx_cc_dev') || '';
    if (!CC.dev) { CC.ret = then; ccDevice(); return false; }
    return true;
  }
  function ccRowsSrc() { return CC.tgt === 'fa' ? FA.rows : CC.rows; }
  function ccMatch(x, ref, lot) {
    if (CC.tgt === 'fa') return !!FA.sess && x.sid === FA.sess.sid && x.ref === ref && String(x.lot) === String(lot);
    return x.loc === CC.loc && x.ref === ref && String(x.lot) === String(lot);
  }
  function ccHK(o) {
    if (CC.tgt === 'fa') return 'fa|' + String(o.sid || (FA.sess && FA.sess.sid) || '') + '|' + String(o.ref) + '|' + String(o.lot || '');
    return ccHistKey(o.loc !== undefined ? o.loc : CC.loc, o.ref, o.lot);
  }
  function ctScreen() {
    setTitle('CT Team', ''); backBtn.hidden = false;
    ccStop();
    if (!ctEnsure(ctScreen)) return;
    CC.view = 'hub';
    render(
      '<div class="card cc-card">' +
        '<h2 class="cc-h">CT Team</h2>' +
        '<div class="cc-sub">Device: <b>' + esc(CC.dev) + '</b></div>' +
        '<button id="ct-cc" class="ct-big">Cycle Count<span>Trunk &amp; closet counts by location</span></button>' +
        '<button id="ct-fa" class="ct-big">F&amp;A Inventory<span>Product handed off to the Foot &amp; Ankle team</span></button>' +
      '</div>');
    document.getElementById('ct-cc').addEventListener('click', function () { location.hash = '#/cc'; });
    document.getElementById('ct-fa').addEventListener('click', function () { location.hash = '#/fa'; });
  }
  function ccHomeCards() {
    var el = document.getElementById('cc-cards'); if (!el) return;
    var by = {};
    CC.rows.forEach(function (x) {
      var s = by[x.loc]; if (!s) s = by[x.loc] = { loc: x.loc, lines: 0, units: 0, last: '' };
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
  function faList() {
    return fetch(CC.creds.fa.url + '?token=' + encodeURIComponent(CC.creds.fa.token) + '&action=list')
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.rows) { FA.rows = j.rows; ccCacheSave('fa'); } return FA.rows; });
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
        '<div class="cc-sub2">The count appears for the whole team after the first scan.</div>' +
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
  function ccCacheSave(t) { try { localStorage.setItem('tbx_' + t + '_rows', JSON.stringify(t === 'fa' ? FA.rows : CC.rows)); } catch (e) {} }
  function ccCacheLoad(t) { try { var v = localStorage.getItem('tbx_' + t + '_rows'); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function ccHomeLoad(t, manual) {
    var fa = t === 'fa';
    var sy = document.getElementById(fa ? 'fa-sync' : 'cc-sync');
    var rf = document.getElementById(fa ? 'fa-rf' : 'cc-rf');
    var rows = fa ? FA.rows : CC.rows;
    if (!rows.length) { var c = ccCacheLoad(t); if (c && c.length) { if (fa) { FA.rows = c; } else { CC.rows = c; } rows = c; } }
    var paint = fa ? faCards : ccHomeCards;
    if (rows.length) { paint(); if (sy) sy.textContent = manual ? 'Refreshing\u2026' : 'Updating\u2026'; }
    else if (sy && manual) { sy.textContent = 'Refreshing\u2026'; }
    if (rf) { rf.classList.add('spin'); rf.disabled = true; }
    function done() { var r2 = document.getElementById(fa ? 'fa-rf' : 'cc-rf'); if (r2) { r2.classList.remove('spin'); r2.disabled = false; } }
    return (fa ? faList() : ccList()).then(function () {
      paint();
      var s2 = document.getElementById(fa ? 'fa-sync' : 'cc-sync'); if (s2) s2.textContent = '';
      done();
    }).catch(function () {
      var s2 = document.getElementById(fa ? 'fa-sync' : 'cc-sync');
      var e2 = document.getElementById(fa ? 'fa-cards' : 'cc-cards');
      if (!(fa ? FA.rows : CC.rows).length && e2) { e2.innerHTML = '<div class="cc-empty">Sheet unreachable \u2014 check signal.</div>'; }
      else if (s2) { s2.textContent = 'Offline \u2014 showing last saved counts.'; }
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
    if (h !== '#/cc' && h !== '#/fa' && h !== '#/ct') ccStop();
    if (h === '#/cc') return ccScreen();
    if (h === '#/ct') return ctScreen();
    if (h === '#/fa') return faScreen();
    if ((m = h.match(/^#\/top\/(implants|arthroscopy)$/))) return topScreen(m[1]);
    if ((m = h.match(/^#\/cat\/(.+)$/))) return catScreen(dec(m[1]));
    if ((m = h.match(/^#\/dgrp\/(.+)$/))) return dispGroupScreen(dec(m[1]));
    if ((m = h.match(/^#\/fam\/(.+)$/))) { var fp = splitCatRest(m[1]); return famScreen(fp[0], fp[1]); }
    if ((m = h.match(/^#\/sub\/(.+)$/))) { var sp = splitCatRest(m[1]); var j = sp[1].lastIndexOf('/'); return subScreen(sp[0], dec(sp[1].slice(0, j)), dec(sp[1].slice(j + 1))); }
    if ((m = h.match(/^#\/pn\/(.+)$/))) return pnScreen(dec(m[1]));
    if ((m = h.match(/^#\/item\/(\d+)$/))) return legacyRedirect('item', +m[1]);
    if ((m = h.match(/^#\/instr\/(.+)$/))) {
      m[1] = dec(m[1]);
      if (BYPN[nrm(m[1])]) return instrScreen(m[1]);
      if (/^\d+$/.test(m[1]) && +m[1] < D.items.length) return legacyRedirect('item', +m[1]);
      return instrScreen(m[1]);
    }
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
    content.innerHTML = CURQ ? resultsHTML() : LAST_BROWSE;
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
        sku = (window.TBX_GTIN14 || {})[p.gtin] || (window.TBX_GTIN || {})[key] || learned()[key] || null;
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
