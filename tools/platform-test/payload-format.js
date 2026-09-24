// P49/P50 — every payload format the gate must open, in a real browser (Playwright, own Pages-like server).
//   APP_PW=<catalog pw> node tools/platform-test/payload-format.js [--site <dir>] [--engine chromium|webkit] [--only fallback,prefetch,old,unknown] [--json out.json]
// --site defaults to the repo root and must hold a compressed JSON payload (z:'deflate-raw', f:'json'); the variants
// below are built from it in a temp folder (links to the site's files + a rewritten payload.enc.json).
//   fallback  no DecompressionStream (iOS < 16.4), one that rejects 'deflate-raw', one that fails while inflating:
//             lib/inflate.js (fflate, deferred) takes over — password unlock, Remember-me reload, offline cold launch.
//             Also: inflate.js arriving late (the gate waits for the deferred script) and failing once (the gate loads
//             it again) on a Remember-me launch.
//   prefetch  the download started in <head>: one payload request per launch (password unlock, Remember-me reload);
//             when it failed, the password unlock fetches it again
//   old       an old-format payload (no z/f: the three files as JS text) still opens — unlock, reload, offline launch
//   unknown   an envelope with an unknown z or f: the "ToolBox didn't open" card, never "Incorrect password", the saved
//             login kept — on a Remember-me launch and on a password unlock
const pw = require('playwright');
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os'); const crypto = require('crypto');
const { payloadGlobals } = require('../payload-lib.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; };
const SITE = path.resolve(arg('site', path.resolve(__dirname, '../..'))), ENGINE = arg('engine', 'chromium'), ONLY = arg('only', '');
const PORT = +arg('port', 9230 + Math.floor(Math.random() * 30)), BASE = 'http://localhost:' + PORT + '/';
const PWD = process.env.APP_PW || process.env.TBX_PW;
if (!PWD || !fs.existsSync(path.join(SITE, 'index.html'))) { console.error('need APP_PW (catalog password) and a site with index.html'); process.exit(2); }
const P0 = JSON.parse(fs.readFileSync(path.join(SITE, 'payload.enc.json'), 'utf8'));
if (P0.z !== 'deflate-raw' || P0.f !== 'json') { console.error('--site must hold a compressed JSON payload (tools/encrypt-data.mjs)'); process.exit(2); }
const R = { site: path.basename(SITE), engine: ENGINE, checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); };
const run = n => !ONLY || ONLY.split(',').includes(n);
const ctl = q => fetch(BASE + '__ctl?' + q).then(r => r.json());

// ---- variants of the site: links to its files, a different payload.enc.json ----
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tbx-payload-'));
function variant(name, envelope) {
  const d = path.join(TMP, name); fs.mkdirSync(d);
  for (const f of fs.readdirSync(SITE)) {
    if (['.git', 'tools', 'node_modules', 'payload.enc.json', 'data.js', 'gtin.js', 'whatsnew.js'].includes(f)) continue;
    fs.symlinkSync(path.join(SITE, f), path.join(d, f));
  }
  fs.writeFileSync(path.join(d, 'payload.enc.json'), JSON.stringify(envelope));
  return d;
}
// the old format: data.js + gtin.js + whatsnew.js as JS text (what tools/encrypt-data.mjs wrote before P49/P50)
function oldEnvelope() {
  const G = payloadGlobals(SITE, PWD);
  const txt = ['window.TOOLBOX=' + JSON.stringify(G.TOOLBOX).replace(/-/g, '\\u002d') + ';\n',
    'window.TBX_GTIN=' + JSON.stringify(G.TBX_GTIN) + ';\nwindow.TBX_GTIN14=' + JSON.stringify(G.TBX_GTIN14 || {}) + ';\n',
    'window.TBX_WN = ' + JSON.stringify(G.TBX_WN, null, 2) + ';\n'].join('\n');
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.pbkdf2Sync(PWD, salt, 210000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(txt, 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', it: 210000, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}
// the key a Remember-me phone holds for this payload (the primary password's PBKDF2 key, raw, base64)
const savedKey = P => crypto.pbkdf2Sync(PWD, Buffer.from(P.salt, 'base64'), P.it, 32, 'sha256').toString('base64');

const MODES = {
  'no DecompressionStream': () => { delete window.DecompressionStream; },
  "DecompressionStream without 'deflate-raw'": () => { const D = window.DecompressionStream; window.DecompressionStream = function (f) { if (f === 'deflate-raw') throw new TypeError('Unsupported format'); return new D(f); }; },
  'DecompressionStream that fails while inflating': () => { const D = window.DecompressionStream; window.DecompressionStream = function (f) { return new D(f === 'deflate-raw' ? 'deflate' : f); }; }
};
async function newCtx(b, o = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: o.sw === false ? 'block' : 'allow' });
  if (o.init) await ctx.addInitScript(o.init);
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); } catch (e) {}
    // hermetic: no live hub in the page (in WebKit, context.route() doesn't apply once a service worker controls it)
    let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v) { delete v.usage; delete v.bo; delete v.fb; } t = v; } });
  });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
  return ctx;
}
const home = (p, ms = 30000) => p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100, null, { timeout: ms }).then(() => true, () => false);
const state = p => p.evaluate(() => ({
  content: document.getElementById('content').innerHTML.length > 100,
  card: !!(document.getElementById('booterr') && !document.getElementById('booterr').hidden),
  code: ((document.querySelector('#booterr .be-code') || {}).textContent || '').slice(0, 90),
  k2: !!(localStorage.getItem('tbx_k2') || sessionStorage.getItem('tbx_k2')),
  lockErr: (document.getElementById('lockerr') || {}).textContent || '', failed: document.documentElement.classList.contains('tbx-failed')
})).catch(e => ({ err: String(e).slice(0, 100) }));
async function unlock(p) {
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { document.getElementById('lockrem').checked = true; });
  await p.fill('#lockpw', PWD); await p.evaluate(() => document.getElementById('lockform').requestSubmit());
}
// password unlock, Remember-me reload, offline cold launch — on whatever root the server serves
async function threeSteps(b, label, init) {
  await ctl('offline=0');
  const ctx = await newCtx(b, { init }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await unlock(p);
  check(label + ': password unlock', await home(p), { errs, ds: await p.evaluate(() => typeof DecompressionStream).catch(() => '?') });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  for (let i = 0; i < 60; i++) { if (await p.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); if (await c.match('payload.enc.json', { ignoreSearch: true }) && await c.match('lib/inflate.js', { ignoreSearch: true })) return true; } return false; })) break; await sleep(500); }
  await p.reload({ waitUntil: 'domcontentloaded' });
  check(label + ': Remember-me reload', await home(p), { errs });
  await ctl('offline=1');
  const q = await ctx.newPage(); q.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await q.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
  check(label + ': offline cold launch', await home(q), { errs });
  await ctl('offline=0'); await ctx.close();
}
// a Remember-me launch (no service worker) with a saved key and lib/inflate.js held back or failing once
async function lateInflate(b, label, how) {
  const ctx = await newCtx(b, { sw: false, init: MODES['no DecompressionStream'] });
  let n = 0;
  await ctx.route(/\/lib\/inflate\.js/, async r => { n++; if (how === 'late') { await sleep(2500); return r.continue(); } if (n === 1) return r.abort('failed'); return r.continue(); });
  const p0 = await ctx.newPage(); await p0.goto(BASE + '__h'); await p0.evaluate(k => localStorage.setItem('tbx_k2', k), savedKey(P0)); await p0.close();
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  const ok = await home(p, 20000); const s = await state(p);
  check(label, ok && !s.card && s.k2, { requests: n, card: s.card, code: s.code, errs });
  await ctx.close();
}
// P50 head prefetch (no service worker): one payload request per launch; a password unlock after a failed prefetch
// fetches it again (the rep typed for a while — signal may be back)
async function prefetch(b) {
  const ctx = await newCtx(b, { sw: false }); let n = 0, failFirst = false;
  await ctx.route(/\/payload\.enc\.json/, r => { n++; if (failFirst && n === 1) return r.abort('internetdisconnected'); return r.continue(); });
  let p = await ctx.newPage(); await unlock(p); const ok1 = await home(p); const n1 = n;
  await p.reload({ waitUntil: 'domcontentloaded' }); const ok2 = await home(p);
  check('prefetch: unlock and Remember-me reload make one payload request each', ok1 && ok2 && n1 === 1 && n === 2, { n1, n });
  await p.evaluate(() => { localStorage.removeItem('tbx_k2'); sessionStorage.removeItem('tbx_k2'); }); await p.close();
  n = 0; failFirst = true;
  p = await ctx.newPage(); await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(800);
  await p.fill('#lockpw', PWD); await p.evaluate(() => document.getElementById('lockform').requestSubmit());
  const ok3 = await home(p, 20000); const s = await state(p);
  check('prefetch: a failed head download is fetched again at unlock', ok3 && n === 2 && !s.card && !s.lockErr, { n, card: s.card, lockErr: s.lockErr });
  await ctx.close();
}
async function unknown(b, label) {
  // Remember-me launch: the saved key decrypts, the format is unknown → the card, key kept
  const ctx = await newCtx(b, { sw: false });
  const p0 = await ctx.newPage(); await p0.goto(BASE + '__h'); await p0.evaluate(k => { localStorage.setItem('tbx_k2', k); localStorage.setItem('tbx_rm', '1'); }, savedKey(P0)); await p0.close();
  const p = await ctx.newPage(); await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3500);
  const s = await state(p);
  check(label + ': Remember-me launch shows the "didn\'t open" card, saved login kept', s.card && /E-DECODE/.test(s.code) && s.k2 && s.failed && !s.content, s);
  // password unlock: never "Incorrect password"; the key is saved (the password was right)
  await p.evaluate(() => { localStorage.removeItem('tbx_k2'); sessionStorage.removeItem('tbx_k2'); });
  await unlock(p); await sleep(3500);
  const s2 = await state(p);
  check(label + ': password unlock shows the card, not "Incorrect password"', s2.card && /E-DECODE/.test(s2.code) && s2.k2 && !/Incorrect/.test(s2.lockErr), s2);
  await ctx.close();
}

(async () => {
  const roots = { site: SITE };
  if (run('old')) roots.old = variant('old', oldEnvelope());
  if (run('unknown')) { roots.z = variant('z', { ...P0, z: 'zstd' }); roots.f = variant('f', { ...P0, f: 'yaml' }); }
  const b = await pw[ENGINE].launch();
  let srv = null;
  const serve = async (root) => { if (srv) srv.kill(); srv = spawn('node', [path.join(__dirname, 'tserver.js')], { env: { ...process.env, ROOT_OLD: root, PORT: String(PORT) }, stdio: 'ignore' }); await sleep(700); };
  try {
    if (run('fallback')) {
      await serve(roots.site);
      for (const [name, fn] of Object.entries(MODES)) await threeSteps(b, 'fallback, ' + name, fn);
      await lateInflate(b, 'fallback: Remember-me launch waits for a late lib/inflate.js', 'late');
      await lateInflate(b, 'fallback: Remember-me launch loads lib/inflate.js again when it failed', 'fail-once');
    }
    if (run('prefetch')) { await serve(roots.site); await prefetch(b); }
    if (run('old')) {
      await serve(roots.old);
      const P = JSON.parse(fs.readFileSync(path.join(roots.old, 'payload.enc.json'), 'utf8'));
      check('old: the variant payload has no z/f', !P.z && !P.f, Object.keys(P));
      await threeSteps(b, 'old format (no z/f)', null);
    }
    if (run('unknown')) {
      await serve(roots.z); await unknown(b, 'unknown z');
      await serve(roots.f); await unknown(b, 'unknown f');
    }
  } catch (e) { check('harness ran', false, String(e && e.stack || e).slice(0, 300)); }
  R.pass = R.checks.every(c => c.ok);
  console.log((R.pass ? 'ALL PASS' : 'FAILED') + ' — payload-format ' + R.site + ' (' + ENGINE + ')');
  const out = arg('json', ''); if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  await b.close(); if (srv) srv.kill(); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(R.pass ? 0 : 1);
})();
