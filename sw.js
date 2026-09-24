var CACHE = 'tbx-v385-20260924';
// P2: photos (img/) and guide pages (guide/pages/) are NOT in these lists. They live in their own long-lived cache,
// IMG, keyed by content hash from img-manifest.json (tools/img-manifest.mjs): <scope>img/x.jpg?h=<16 hex of sha256>.
// A release keeps every photo the phone already has, downloads only new or changed ones and prunes removed ones.
// Old caches are deleted ONLY through isShell() — every later sw.js (a rollback too) must keep that filter, or phones
// lose their offline photos. The page fills missing photos in the background (TBX_PHOTOS in the app bundle).
var IMG = 'tbx-img';
var IMG_MANIFEST = '73f1a23f75c2a2c8';   // stamped by tools/img-manifest.mjs: a photo change always changes sw.js
var ASSETS = ['./', './index.html', './app-4.150.js', './ccscan.js', './html2canvas.min.js', './payload.enc.json', './cc.enc.json', './cc-buf.enc.json', './cc-la.enc.json', './cc-syr.enc.json', './cc-ri.enc.json', './cc-wm.enc.json', './cc-sbx.enc.json', './fa2.enc.json', './fa2-fa.enc.json', './manifest.webmanifest', './img-manifest.json', './img-dims.js', './icon-180.png', './icon-512.png', './icon-512-maskable.png', './favicon.svg', './lib/inflate.js', './lib/zxing-reader.js', './lib/zxing_reader.wasm'];
// Core = everything the app needs to run and scan offline. These must land.
var CORE = ['./', './index.html', './app-4.150.js', './ccscan.js', './html2canvas.min.js', './payload.enc.json', './cc.enc.json', './cc-buf.enc.json', './cc-la.enc.json', './cc-syr.enc.json', './cc-ri.enc.json', './cc-wm.enc.json', './cc-sbx.enc.json', './fa2.enc.json', './fa2-fa.enc.json', './manifest.webmanifest', './img-manifest.json', './img-dims.js', './lib/inflate.js', './lib/zxing-reader.js', './lib/zxing_reader.wasm'];
var SCOPE = self.registration.scope, SCOPE_PATH = new URL(SCOPE).pathname;
function vurl(u) { return u + (u.indexOf('?') < 0 ? '?v=' : '&v=') + CACHE; }
function isShell(k) { return /^tbx-v\d+-/.test(k); }     // the per-release app-shell caches; never IMG
function noop() {}
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var core = CORE.filter(function (u) { return ASSETS.indexOf(u) > -1 || u === './'; });
    // Only the core blocks the update. Icons are best-effort and photos are never part of the install (they come from
    // the old caches below, or from the network later), so one bad download on weak signal can never strand a phone.
    return c.addAll(core.map(vurl)).then(function () {
      var rest = ASSETS.filter(function (u) { return CORE.indexOf(u) < 0; });
      return Promise.all(rest.map(function (u) { return c.add(vurl(u)).catch(noop); }));
    });
  }).then(function () { return migrate(20000).catch(noop); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(migrate(15000).catch(noop)
    .then(function () { return prune().catch(noop); })
    .then(function () { return caches.keys(); })
    .then(function (keys) {
      return Promise.all(keys.filter(function (k) { return isShell(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
    .then(function () { return self.clients.claim(); }));
});

// ---- P2: the photo manifest (in CORE, so each worker version reads its own copy) ----
var MF = null;
function manifest() {
  if (!MF) {
    MF = caches.open(CACHE).then(function (c) { return c.match('./img-manifest.json', { ignoreSearch: true }); })
      .then(function (r) { return r || fetch(vurl('./img-manifest.json')); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (!(m && m.files)) throw new Error('no manifest'); return m; })
      .catch(function () { MF = null; return null; });   // try again on the next request
  }
  return MF;
}
function relOf(url) {                                      // 'img/x.jpg' for <scope>img/x.jpg?anything
  var p = url.pathname.indexOf(SCOPE_PATH) === 0 ? url.pathname.slice(SCOPE_PATH.length) : '';
  try { p = decodeURIComponent(p); } catch (x) {}
  return p;
}
function keyOf(rel, h) { return SCOPE + rel + '?h=' + h; }
function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }
function typeOf(rel) { var x = (/\.(\w+)$/.exec(rel) || [])[1] || ''; return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' }[x.toLowerCase()] || 'application/octet-stream'; }
// Store only bytes whose sha256 matches the manifest, so a stale CDN copy right after a deploy (or an old cache's
// previous version of a file) can never be saved under the new key. Resolves '' once stored, otherwise why not.
function verifyPut(rel, h, res) {
  var type = res.headers.get('content-type') || typeOf(rel);
  return res.arrayBuffer().then(function (buf) {
    if (!(self.crypto && crypto.subtle)) return 'crypto';          // fail closed: never store unverified bytes
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      if (hex(d).slice(0, 16) !== h) return 'hash';
      return caches.open(IMG).then(function (c) { return c.put(keyOf(rel, h), new Response(buf, { headers: { 'content-type': type } })); })
        .then(function () { return ''; }, function () { return 'quota'; });
    });
  }).catch(function () { return 'error'; });
}
// Copy every manifest file an older app-shell cache already holds (tbx-v378 and older precached photos as
// ./img/x.jpg?v=tbx-v…) into IMG — hash-checked, so a photo that changed in this release is downloaded fresh instead.
// No network; idempotent; bounded by budgetMs (activate runs it again). Newest old cache first.
function migrate(budgetMs) {
  var t0 = Date.now();
  return Promise.all([manifest(), caches.keys(), caches.open(IMG)]).then(function (r) {
    var M = r[0], P = r[2], olds = r[1].filter(function (k) { return isShell(k) && k !== CACHE; }).reverse();
    if (!M || !olds.length) return 0;
    return P.keys().then(function (have) {
      var got = {}, where = {};
      have.forEach(function (q) { got[q.url] = 1; });
      if (!Object.keys(M.files).some(function (p) { return !got[keyOf(p, M.files[p][0])]; })) return 0;
      // one keys() walk per old cache (a match with ignoreSearch would scan the whole cache for every photo)
      return olds.reduce(function (chain, k) {
        return chain.then(function () {
          return caches.open(k).then(function (O) {
            return O.keys().then(function (ks) {
              ks.forEach(function (q) {
                var p = relOf(new URL(q.url));
                if (M.files[p] && !got[keyOf(p, M.files[p][0])]) (where[p] = where[p] || []).push([O, q]);
              });
            });
          });
        });
      }, Promise.resolve()).then(function () {
        var list = Object.keys(where), i = 0, n = 0, full = false;
        function one(p, j) {                                // try each old copy until one hashes right
          var w = where[p][j]; if (!w) return Promise.resolve();
          return w[0].match(w[1]).then(function (res) {
            if (!res || !res.ok) return one(p, j + 1);
            return verifyPut(p, M.files[p][0], res).then(function (why) {
              if (!why) { n++; return; }
              if (why === 'quota') { full = true; return; }
              return one(p, j + 1);
            });
          });
        }
        function worker() {
          if (full || i >= list.length || Date.now() - t0 > budgetMs) return Promise.resolve();
          return one(list[i++], 0).then(worker, worker);
        }
        return Promise.all([worker(), worker(), worker(), worker()]).then(function () { return n; });
      });
    });
  });
}
// Drop saved files this release no longer lists (removed, or replaced by a new version). A manifest that would drop
// more than half of what is saved is treated as broken and ignored: a bad release must never wipe the offline photos.
function prune() {
  return Promise.all([manifest(), caches.open(IMG)]).then(function (r) {
    var M = r[0], P = r[1]; if (!M || !M.n) return 0;
    var want = {}; Object.keys(M.files).forEach(function (p) { want[keyOf(p, M.files[p][0])] = 1; });
    return P.keys().then(function (ks) {
      var drop = ks.filter(function (q) { return !want[q.url]; });
      if (drop.length > 20 && drop.length > ks.length / 2) return 0;
      return Promise.all(drop.map(function (q) { return P.delete(q); })).then(function () { return drop.length; });
    });
  });
}

// ---- P34: a photo that isn't saved and can't be downloaded gets this picture instead of a broken image ----
// Only for image requests (never cached, never handed to fetch() callers, so the filler can't mistake it for a photo).
var PH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
  '<rect width="800" height="600" fill="#262626"/>' +                   // full bleed: the card's own corners clip it
  '<g fill="none" stroke="#8C8C8C" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M318 214h44l18-28h80l18 28h44a18 18 0 0 1 18 18v118a18 18 0 0 1-18 18H318a18 18 0 0 1-18-18V232a18 18 0 0 1 18-18z"/>' +
  '<circle cx="400" cy="290" r="40"/></g>' +
  '<text x="400" y="440" fill="#C9C9C9" font-family="-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif" font-size="38" font-weight="600" text-anchor="middle">Photo downloads when online</text>' +
  '</svg>';
function isImgReq(req) { return req.mode !== 'navigate' && (req.destination === 'image' || /^image\//.test(req.headers.get('accept') || '')); }
function placeholder(req) {
  if (!isImgReq(req)) return Response.error();
  return new Response(PH_SVG, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store', 'x-tbx-placeholder': '1' } });
}
// The page's background filler asks with ?fill=1: 204 + x-tbx-stored 1|0 and x-tbx-why (no body reaches the page).
function stored(ok, why) { return new Response(null, { status: 204, headers: { 'x-tbx-stored': ok ? '1' : '0', 'x-tbx-why': String(why || '') } }); }
function within(p, ms, late) { return new Promise(function (res, rej) { var t = setTimeout(function () { res(late()); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (x) { clearTimeout(t); rej(x); }); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                      // HEAD/POST go to the network (P4's online probe relies on this)
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  var rel = relOf(url);
  if (/^(img|guide\/pages)\//.test(rel)) { e.respondWith(photo(e, req, rel, url.searchParams.get('fill') === '1')); return; }
  e.respondWith(shell(req).catch(function (err) { if (isImgReq(req)) return placeholder(req); throw err; }));
});
function shell(req) {                                    // the app shell: cache-first, as before
  return caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) c.put(req, res.clone());
        return res;
      });
    });
  });
}
// img/… and guide/pages/…: the saved copy for this release's hash; else download ?h=<hash> (busts the Pages CDN for a
// changed file), check the hash and save it; else (offline) the P34 picture. The query of the page's request is ignored.
function photo(e, req, rel, fill) {
  return manifest().then(function (M) {
    var ent = M && M.files[rel];
    if (!ent) {                                          // not listed (or no manifest yet): any saved version, else the shell path
      if (fill) return stored(false, M ? 'unlisted' : 'nomanifest');
      return caches.open(IMG).then(function (P) { return M ? null : P.match(SCOPE + rel, { ignoreSearch: true }); })
        .then(function (hit) { return hit || shell(req); })
        .catch(function () { return placeholder(req); });
    }
    var key = keyOf(rel, ent[0]);
    return caches.open(IMG).then(function (P) { return P.match(key); }).then(function (hit) {
      if (hit) return fill ? stored(true, 'had') : hit;
      var got = fetch(key).then(function (res) {
        if (!res.ok) return fill ? stored(false, 'http' + res.status) : res;
        var put = verifyPut(rel, ent[0], fill ? res : res.clone());
        if (fill) return put.then(function (why) { return stored(!why, why); });
        e.waitUntil(put);
        return res;
      }, function () { return fill ? stored(false, 'offline') : placeholder(req); });
      // a stalled download must not hold the worker (a waiting update only takes over once no request is in flight)
      return fill ? within(got, 60000, function () { return stored(false, 'timeout'); }) : got;
    });
  }).catch(function () { return fill ? stored(false, 'error') : placeholder(req); });
}
self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  // P4: after a repair (shell cache deleted while online) the page asks for the full shell again, so CC/F&A files
  // that weren't opened during the repair session are offline-ready again.
  if (e.data === 'PRECACHE' && e.waitUntil) e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE.map(vurl)); }).catch(function () {}));
});
