// Throttled static server that behaves like GitHub Pages for the platform tests (gzip for text, shared bandwidth
// cap, per-request latency, max-age=600) plus test switches. Started by boot-failsafe.js / lockdev.js / sw-upgrade.js;
// not run on its own.
//   ROOT_OLD / ROOT_NEW   the two builds; GET /__ctl?root=old|new switches which one is served
//   BUMP_NEW=1            serve the NEW root's sw.js with "-bump" appended to CACHE (re-release an identical build)
//   SW_ALT=<file>         with /__ctl?swalt=1, /sw.js is this file instead (e.g. tools/emergency/sw-emergency.js)
// Control: GET /__ctl?rate=<bytes/s|0>&rtt=<ms>&offline=<0|1>&root=<old|new>&failimg=<0|1|NNN>&swalt=<0|1>&reset=1
//   → JSON {S, stats}. failimg=1 drops every img/ and guide/pages/ request (a network failure), failimg=NNN answers them
//   with HTTP NNN; everything else is served normally.
// stats.byClass splits wire bytes into img (img/, guide/pages/), payload, sw, other; stats.imgReqs counts image requests.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const PORT = +process.env.PORT;
const ROOTS = { old: process.env.ROOT_OLD, new: process.env.ROOT_NEW || process.env.ROOT_OLD };
let S = { rate: 0, rtt: 0, offline: 0, root: 'old', failimg: 0, swalt: 0 };
const stats = { bytes: 0, reqs: 0, byClass: {}, imgReqs: 0, log: [] };
const gz = new Map();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.css': 'text/css' };
const GZ = /\.(html|js|json|webmanifest|svg|wasm|css)$/;
let tokens = 0, last = Date.now();
function take(n) {
  return new Promise(res => {
    (function t() {
      if (!S.rate) return res();
      const now = Date.now(); tokens = Math.min(S.rate / 4, tokens + (now - last) * S.rate / 1000); last = now;
      if (tokens >= n) { tokens -= n; return res(); }
      setTimeout(t, Math.max(5, (n - tokens) / S.rate * 1000));
    })();
  });
}
const cls = p => /^\/(img|guide\/pages)\//.test(p) ? 'img' : p === '/payload.enc.json' ? 'payload' : p === '/sw.js' ? 'sw' : 'other';
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__ctl') {
    for (const k of ['rate', 'rtt', 'offline', 'failimg', 'swalt']) if (u.searchParams.has(k)) S[k] = +u.searchParams.get(k);
    if (u.searchParams.has('root')) S.root = u.searchParams.get('root');
    if (u.searchParams.has('reset')) { stats.bytes = 0; stats.reqs = 0; stats.byClass = {}; stats.imgReqs = 0; stats.log = []; }
    res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
    return res.end(JSON.stringify({ S, stats: { bytes: stats.bytes, reqs: stats.reqs, byClass: stats.byClass, imgReqs: stats.imgReqs } }));
  }
  if (S.offline) { req.socket.destroy(); return; }
  let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
  const root = ROOTS[S.root];
  const file = p === '/sw.js' && S.swalt && process.env.SW_ALT ? path.resolve(process.env.SW_ALT) : path.join(root, p);
  if (S.rtt) await new Promise(r => setTimeout(r, S.rtt));
  if (S.failimg && cls(p) === 'img') {
    if (S.failimg === 1) { req.socket.destroy(); return; }
    res.statusCode = S.failimg; res.setHeader('content-type', 'text/html'); res.setHeader('cache-control', 'no-store'); return res.end('failimg');
  }
  fs.readFile(file, async (err, buf) => {
    if (err) { res.statusCode = 404; res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>404</title>not found'); }
    if (p === '/sw.js' && S.root === 'new' && process.env.BUMP_NEW) buf = Buffer.from(String(buf).replace(/var CACHE = '([^']+)';/, "var CACHE = '$1-bump';"));
    const ext = path.extname(file);
    res.setHeader('content-type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('cache-control', 'max-age=600');
    let body = buf;
    if (req.method === 'HEAD') { res.setHeader('content-length', buf.length); res.writeHead(200); return res.end(); }
    if (GZ.test(file) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      const key = file + ':' + S.root + ':' + buf.length;
      if (!gz.has(key)) gz.set(key, zlib.gzipSync(buf, { level: 6 }));
      body = gz.get(key); res.setHeader('content-encoding', 'gzip');
    }
    res.setHeader('content-length', body.length);
    stats.reqs++; const c = cls(p); if (c === 'img') stats.imgReqs++;
    res.writeHead(200);
    for (let i = 0; i < body.length; i += 16384) {
      const chunk = body.subarray(i, i + 16384);
      await take(chunk.length);
      if (res.destroyed || S.offline) { res.destroy(); return; }
      stats.bytes += chunk.length; stats.byClass[c] = (stats.byClass[c] || 0) + chunk.length;
      if (!res.write(chunk)) await new Promise(r => res.once('drain', r));
    }
    res.end();
  });
});
srv.keepAliveTimeout = 5000;
srv.listen(PORT, '127.0.0.1', () => console.log('listening ' + PORT));
