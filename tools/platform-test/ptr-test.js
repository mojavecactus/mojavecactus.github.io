// P48 — pull to refresh: the stuck ↻ fix and the pull on the Backorder Report, in a real browser engine.
//   APP_PW=<catalog pw> node tools/platform-test/ptr-test.js [--site <dir>] [--engine chromium|webkit] [--mode fixed|baseline] [--port N] [--json out.json]
// The real app (served by tserver.js, service worker blocked) unlocked with the catalog password. Every hub is faked:
// fake cycle-count and F&A logins are seeded, the F&A hub is tools/fa2-test/fakehub.js, and the payload's backorder
// hub is swapped for a fake one; any other non-localhost request gets {"ok":false}. Nothing reaches a real hub.
// Touches: Chromium gets trusted touches through CDP (Input.dispatchTouchEvent), WebKit gets TouchEvents built with
// document.createTouch at the same point. "App hidden" is document.hidden plus a visibilitychange event.
// Checks (--mode fixed, the default, expects the P48 behaviour; --mode baseline expects the old bugs on an old build):
//   a full pull on the cycle-count home and on F&A: one refresh, the arrow spins, then clears (same in both modes)
//   touchcancel mid-pull, leaving the screen mid-pull, the app hidden mid-pull: no arrow left behind
//   a refresh that never settles lets go of the arrow after 20 s (watchdog) and the next pull works
//   the Backorder Report: a pull fetches the report once and spins the arrow and the ↻; offline, the arrow still clears
const pw = require('playwright');
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const { FakeHub } = require('../fa2-test/fakehub.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; };
const SITE = path.resolve(arg('site', path.resolve(__dirname, '../..'))), ENGINE = arg('engine', 'chromium'), MODE = arg('mode', 'fixed'), FIXED = MODE !== 'baseline';
const PORT = +arg('port', 9060 + Math.floor(Math.random() * 30)), BASE = 'http://localhost:' + PORT + '/';
const PWD = process.env.APP_PW || process.env.TBX_PW;
if (!PWD || !fs.existsSync(path.join(SITE, 'index.html'))) { console.error('need APP_PW (catalog password) and a site with index.html'); process.exit(2); }
const R = { site: path.basename(SITE), engine: ENGINE, mode: MODE, checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); };
const expect = (name, buggy, fixed, detail) => check((FIXED ? '[fixed] ' : '[bug]   ') + name, FIXED ? fixed : buggy, detail);

// ---- fake hubs (counted) ----
const CC_URL = 'https://script.google.com/macros/s/fake-cc/exec', FA_URL = 'https://script.google.com/macros/s/fake-fa/exec', BO_URL = 'https://script.google.com/macros/s/fake-bo/exec';
const DEV = "Nate's iPhone", FA_TOKEN = 'ptr-sports';
const CC_ROWS = [{ id: 'r0', ts: '2026-09-21T14:00:00Z', dev: DEV, ref: '3910500471', desc: 'OMEGA', lot: 'LOTA', exp: '2028-01-31', qty: 2, loc: 'Trunk' }];
const BO = { ok: true, ver: 1, weekOf: '2026-09-21', clearedDays: 30, highspot: '', controlled: [], cleared: [],
  backorders: [{ sku: '3910500471', desc: 'OMEGA', since: '2026-09-14', clearDate: '', clearText: '', note: '' }] };
const N = { ccPull: 0, faRead: 0, bo: 0 }, hold = { faReads: 0 };
const fa = new FakeHub(); fa.scopeOf = t => t === FA_TOKEN ? 'sports' : null;
fa.seed([{ type: 'Received', ref: '3910500471', desc: 'Omega', lot: 'LOTA', exp: '2028-01-31', qty: 5, receivedBy: 'Katie F', dropName: 'seed' },
  { type: 'Received', ref: '3910500393', desc: 'Iconix', lot: 'LOTB', exp: '2026-10-15', qty: 2, receivedBy: 'Katie F', dropName: 'seed' }]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
async function hubs(route) {
  const rq = route.request(), url = rq.url();
  const json = j => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(j) }).catch(() => {});
  if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS }).catch(() => {});
  let body = null; try { body = JSON.parse(rq.postData() || 'null'); } catch (e) {}
  if (url.indexOf(CC_URL) === 0) {
    const act = (url.match(/[?&]action=(\w+)/) || [])[1];
    if (act === 'pull') { N.ccPull++; return json({ ok: true, rows: CC_ROWS }); }
    if (act === 'roster') return json({ devices: [DEV, "Mia's iPhone"] });
    if (body && body.action === 'batch') { const ids = (body.ops || []).map(o => o.opId); return json({ ok: true, applied: ids, fresh: ids, rows: CC_ROWS }); }
    return json({ ok: true });
  }
  if (url.indexOf(FA_URL) === 0 && body) {
    if (body.action === 'read') { N.faRead++; if (hold.faReads > 0) { hold.faReads--; return; } } // held: never answered (the app aborts it)
    return json(fa.handle(body));
  }
  if (url.indexOf(BO_URL) === 0) { N.bo++; await sleep(150); return json(BO); }
  return json({ ok: false });
}

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'tserver.js')], { env: { ...process.env, ROOT_OLD: SITE, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(700);
  const b = await pw[ENGINE].launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript((S) => {
      try {
        localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99');
        localStorage.setItem('tbx_cc', JSON.stringify({ url: S.cc, token: 'tok' })); localStorage.setItem('tbx_cc_dev', S.dev);
        localStorage.setItem('tbx_cc_roster', JSON.stringify([S.dev, "Mia's iPhone"]));
        localStorage.setItem('tbx_fa2', JSON.stringify({ url: S.fa, token: S.tok, scope: 'sports' }));
      } catch (e) {}
      let t; // the payload's hubs are swapped before the app reads them: fake backorder hub, no usage logging
      Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v) { v.bo = { url: S.bo, key: 'k' }; v.usage = null; } t = v; } });
    }, { cc: CC_URL, fa: FA_URL, bo: BO_URL, dev: DEV, tok: FA_TOKEN });
    await ctx.route(/^https?:\/\/(?!localhost)/, hubs);
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.fill('#lockpw', PWD); await p.evaluate(() => document.getElementById('lockform').requestSubmit());
    await p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100, null, { timeout: 60000 });

    // ---- touch driver: trusted CDP touches in Chromium, TouchEvents at the same point in WebKit ----
    const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(p) : null;
    const T = { x: 0, y: 0, last: 0 };
    async function touch(type, y) { // type: start | move | end | cancel; x stays where the touch started
      if (y === undefined) y = T.last; T.last = y;
      if (cdp) {
        const ty = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' }[type];
        return cdp.send('Input.dispatchTouchEvent', { type: ty, touchPoints: type === 'end' || type === 'cancel' ? [] : [{ x: T.x, y, id: 1 }] });
      }
      await p.evaluate(({ type, x, y }) => {
        if (type === 'start') window.__ptrT = document.elementFromPoint(x, y) || document.body;
        const tg = window.__ptrT || document.body, t = document.createTouch(window, tg, 1, x, y + (window.scrollY || 0), x, y);
        const none = document.createTouchList(), one = document.createTouchList(t), gone = type === 'end' || type === 'cancel';
        tg.dispatchEvent(new TouchEvent('touch' + type, { touches: gone ? none : one, targetTouches: gone ? none : one, changedTouches: one, bubbles: true, cancelable: type !== 'cancel' }));
      }, { type, x: T.x, y });
    }
    async function at(sel) { // start point: the middle of an element that is not an input (inputs never start a pull)
      const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; }, sel);
      if (!r) throw new Error('no ' + sel); T.x = r.x; T.y = r.y; return r.y;
    }
    async function pullFrom(sel, dy) { const y = await at(sel); await touch('start', y); for (const f of [0.3, 0.6, 1]) { await touch('move', y + Math.round(dy * f)); await sleep(16); } return y; }
    const ptr = () => p.evaluate(() => { const e = document.getElementById('ptr'); return { op: e.style.opacity || '', spin: e.classList.contains('spin') }; });
    const shown = s => s.spin || (s.op !== '' && s.op !== '0');
    async function settled(ms) { const t0 = Date.now(); let s; do { s = await ptr(); if (!shown(s)) return true; await sleep(100); } while (Date.now() - t0 < ms); return false; }
    async function go(h, sel, ms) { await p.evaluate(x => { location.hash = x; }, h); if (sel) await p.waitForSelector(sel, { timeout: 15000 }); await sleep(ms || 400); }
    async function hideApp() {
      await p.evaluate(() => {
        const set = v => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v ? 'hidden' : 'visible' }); };
        set(true); document.dispatchEvent(new Event('visibilitychange'));
        set(false); document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden; delete document.visibilityState; // back to the real getters
      });
    }

    // 1. cycle-count home: a full pull refreshes once, spins, then clears — the same in both modes
    await go('#/cc', '#cc-cards .ctc', 800);
    let n0 = N.ccPull; await pullFrom('.cc-h', 130); await touch('end', T.y + 130);
    let mid = await ptr(), gone = await settled(6000);
    check('cc: a full pull refreshes once and spins, then the arrow clears', mid.spin && N.ccPull === n0 + 1 && gone, { mid, pulls: N.ccPull - n0, cleared: gone });

    // 2. the system takes the touch mid-pull (touchcancel: notification centre, a call, an edge swipe)
    await pullFrom('.cc-h', 60); const half = await ptr();
    await touch('cancel'); await sleep(80); let s = await ptr();
    expect('cc: touchcancel mid-pull leaves no arrow', shown(half) && shown(s), shown(half) && !shown(s), { during: half, after: s });

    // 3. leaving the screen mid-pull (the arrow used to ride along to Home)
    await pullFrom('.cc-h', 70); await go('#/', '.tile', 300); s = await ptr();
    expect('leaving the screen mid-pull: no arrow on Home', shown(s), !shown(s), s);
    await touch('end', T.y + 70); await sleep(60);

    // 4. the app goes to the background mid-pull
    await go('#/cc', '#cc-cards .ctc', 600);
    await pullFrom('.cc-h', 70); await hideApp(); await sleep(60); s = await ptr();
    expect('app hidden mid-pull: no arrow when it comes back', shown(s), !shown(s), s);
    await touch('cancel'); await sleep(60);

    // 5. F&A home: a full pull refreshes once, spins, then clears — the same in both modes
    await go('#/fa2', '#fa2-pills .cc-pill', 800);
    n0 = N.faRead; await pullFrom('.cc-h', 130); await touch('end', T.y + 130);
    mid = await ptr(); gone = await settled(6000);
    check('fa2: a full pull refreshes once and spins, then the arrow clears', mid.spin && N.faRead === n0 + 1 && gone, { mid, reads: N.faRead - n0, cleared: gone });

    // 6. a refresh that never settles in time (both read attempts hang until the app gives up at ~25 s)
    await sleep(300); hold.faReads = 2;
    await pullFrom('.cc-h', 130); await touch('end', T.y + 130); const t0 = Date.now();
    mid = await ptr();
    await sleep(21500 - (Date.now() - t0)); s = await ptr();
    expect('watchdog: a refresh that never settles lets go of the arrow after 20 s', mid.spin && shown(s), mid.spin && !shown(s), { mid, at21s: s });
    n0 = N.faRead; await pullFrom('.cc-h', 130); await touch('end', T.y + 130);
    mid = await ptr(); gone = await settled(6000);
    expect('watchdog: pull to refresh works again right after', N.faRead === n0, N.faRead === n0 + 1 && mid.spin && gone, { mid, reads: N.faRead - n0, cleared: gone }); // old build: still busy, the pull is ignored
    await sleep(Math.max(0, 26500 - (Date.now() - t0))); // the abandoned refresh settles (~25.5 s) before the next screen

    // 7. P48: the Backorder Report — a pull fetches the report once; the arrow and the report's own ↻ spin, then clear
    await go('#/bo', '#bo-body .bo-row', 300);
    await p.waitForFunction(() => { const r = document.getElementById('bo-refresh'); return r && !r.classList.contains('spin'); }, null, { timeout: 10000 });
    n0 = N.bo; await pullFrom('.bo-title', 130); await touch('end', T.y + 130);
    mid = await ptr(); const rbSpin = await p.evaluate(() => document.getElementById('bo-refresh').classList.contains('spin'));
    gone = await settled(6000); const sub = await p.evaluate(() => document.getElementById('bo-sub').textContent);
    expect('P48: a pull on the Backorder Report fetches it once, spins the arrow and the ↻, then clears', N.bo === n0 && !mid.spin,
      N.bo === n0 + 1 && mid.spin && rbSpin && gone && /updated just now/.test(sub), { calls: N.bo - n0, mid, refreshBtnSpin: rbSpin, cleared: gone, sub });

    // 8. P48 offline: the report can't be fetched, the arrow still clears (the saved report stays)
    await ctx.setOffline(true); await sleep(200);
    await pullFrom('.bo-title', 130); await touch('end', T.y + 130);
    mid = await ptr(); gone = await settled(6000);
    const rows = await p.evaluate(() => document.querySelectorAll('#bo-body .bo-row').length);
    expect('P48 offline: the pull clears the arrow and keeps the saved report', !mid.spin, mid.spin && gone && rows > 0, { mid, cleared: gone, rows });
    await ctx.setOffline(false);

    check('no page errors', errs.length === 0, errs.join(' | ') || 'none');
    await ctx.close();
  } catch (e) { check('harness ran', false, String(e && e.stack || e).slice(0, 400)); }
  R.pass = R.checks.every(c => c.ok);
  console.log((R.pass ? 'ALL PASS' : 'FAILED') + ' — ptr-test ' + R.site + ' (' + ENGINE + ', ' + MODE + ')');
  const out = arg('json', ''); if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  await b.close(); srv.kill(); process.exit(R.pass ? 0 : 1);
})();
