// P45 — feedback written offline is kept and sent once signal is back. An installed phone (service worker + cache +
// Remember me) loses signal on a card, opens the bubble (the screenshot must still work: html2canvas is precached),
// sends, reloads without signal, gets signal back, and the relay must get the note EXACTLY ONCE, with its screenshot.
// Then: the name is remembered and the note field has the focus; the 2 MB screenshot budget drops the oldest picture
// (its note stays); a service-worker update keeps the queue's Cache Storage (tbx-fbq) while it replaces the shell cache.
//   APP_PW=<catalog pw> node tools/platform-test/feedback-offline.js [--site <dir>] [--engine chromium|webkit] [--port N] [--json out.json]
// Hermetic: the page never sees a real hub. TOOLBOX.usage / .bo are removed and TOOLBOX.fb points at a fake relay on
// localhost:<port+1> (Playwright's route() does not apply to a service-worker-controlled page in WebKit, so nothing here
// relies on it; every other outside request is still answered locally where route() works).
// "No signal" = the site unreachable (the server's offline switch) + the relay unreachable (sockets dropped) while the
// service worker serves the app, plus navigator.onLine = false and an 'offline' event (Playwright's setOffline() is not
// used: in WebKit it also fails loads a service worker would answer, and Cache Storage writes).
const pw = require('playwright');
const http = require('http'); const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; };
const SITE = path.resolve(arg('site', path.resolve(__dirname, '../..'))), ENGINE = arg('engine', 'chromium');
const PORT = +arg('port', 9040 + Math.floor(Math.random() * 30)), BASE = 'http://localhost:' + PORT + '/', RELAY = 'http://localhost:' + (PORT + 1) + '/relay';
const PWD = process.env.APP_PW || process.env.TBX_PW;
if (!PWD || !fs.existsSync(path.join(SITE, 'index.html'))) { console.error('need APP_PW (catalog password) and a site with index.html'); process.exit(2); }
const R = { site: path.basename(SITE), engine: ENGINE, checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 300) : '')); };
const ctl = q => fetch(BASE + '__ctl?' + q).then(r => r.json());
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) {} await sleep(250); } return false; };

// the fake feedback relay: 'ok' | 'refuse' (answers something else) | 'down' (drops the connection, like no signal)
const relay = []; let mode = 'ok', tried = 0;
const rsrv = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': '*' }); return res.end(); }
  let raw = ''; req.on('data', d => { raw += d; }); req.on('end', () => {
    if (mode === 'down') { tried++; req.socket.destroy(); return; }
    let body = null; try { body = JSON.parse(raw); } catch (e) {}
    if (body) relay.push({ at: Date.now(), body });
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
    res.end(mode === 'ok' ? 'ok' : 'error: test refusal');
  });
});

(async () => {
  await new Promise(r => rsrv.listen(PORT + 1, '127.0.0.1', r));
  const srv = spawn('node', [path.join(__dirname, 'tserver.js')], { env: { ...process.env, ROOT_OLD: SITE, ROOT_NEW: SITE, BUMP_NEW: '1', PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(700);
  const b = await pw[ENGINE].launch();
  const noSignal = async (p, on) => {
    mode = on ? 'down' : 'ok'; await ctl('offline=' + (on ? 1 : 0));
    if (p) await p.evaluate((on) => { // what iOS reports; the app only uses it as a hint (a failed send is kept too)
      if (on) Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); else delete navigator.onLine;
      window.dispatchEvent(new Event(on ? 'offline' : 'online'));
    }, on);
  };
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await ctx.addInitScript((relayUrl) => {
      try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); } catch (e) {}
      let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; },
        set(v) { if (v) { delete v.usage; delete v.bo; v.fb = { url: relayUrl, token: 'test-token', email: '' }; } t = v; } });
    }, RELAY);
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
    // WebKit also reports a card photo that isn't cached yet failing to load without signal (the service worker's network
    // fallback rejects — P34's placeholder is another release): not a script error
    const LOADFAIL = /FetchEvent\.respondWith received an error|^(Error: )?Cannot load http/;
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => { const m = String(e); if (!LOADFAIL.test(m)) errs.push(m.slice(0, 160)); });
    p.on('dialog', d => d.dismiss().catch(() => {}));
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { document.getElementById('lockrem').checked = true; });
    await p.fill('#lockpw', PWD); await p.evaluate(() => document.getElementById('lockform').requestSubmit());
    await p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100, null, { timeout: 60000 });
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 });
    const shellReady = await until(() => p.evaluate(async () => { for (const k of await caches.keys()) { if (!/^tbx-v\d+-/.test(k)) continue; const c = await caches.open(k); if (await c.match('html2canvas.min.js', { ignoreSearch: true }) && await c.match('payload.enc.json', { ignoreSearch: true })) return true; } return false; }), 60000);
    check('install: the shell cache holds html2canvas (screenshots work offline)', shellReady);
    await p.evaluate(() => { location.hash = '#/pn/3910500580'; }); await sleep(1200);

    // ---- no signal: write it, send it ----
    await noSignal(p, true);
    const h2c = await p.evaluate(() => fetch('html2canvas.min.js').then(r => r.status + ' ' + (r.headers.get('content-type') || '')).catch(e => 'ERR ' + e));
    check('no signal: html2canvas still loads (from the service-worker cache)', /^200 /.test(h2c), h2c);
    await p.click('#fb-fab');
    const focusName = await p.evaluate(() => document.activeElement && document.activeElement.id);
    const shot = await until(() => p.evaluate(() => /attached/.test(document.getElementById('fb-shotcap').textContent)), 20000);
    check('no signal: the screenshot is still taken', shot, await p.evaluate(() => document.getElementById('fb-shotcap').textContent));
    check('first time: the name field has the focus', focusName === 'fb-name', focusName);
    await p.fill('#fb-name', 'Nate'); await p.fill('#fb-note', 'P45 test note (fake relay)');
    await p.click('#fb-send'); await sleep(200);
    const ui = await p.evaluate(() => ({ btn: document.getElementById('fb-send').textContent, hint: document.getElementById('fb-hint').textContent }));
    check('no signal: "Saved ✓" and the offline hint', ui.btn === 'Saved ✓' && /offline — it’ll send automatically when you have signal/.test(ui.hint), ui);
    const stored = await until(() => p.evaluate(() => { const q = JSON.parse(localStorage.getItem('tbx_fbq') || '[]'); return q.length === 1 && q[0].shot > 0; }), 10000);
    const q1 = await p.evaluate(async () => {
      const q = JSON.parse(localStorage.getItem('tbx_fbq') || '[]'), c = await caches.open('tbx-fbq'), keys = (await c.keys()).map(r => new URL(r.url).pathname);
      const res = q[0] ? await c.match('./__fbq/' + q[0].id + '.jpg') : null, blob = res ? await res.blob() : null;
      let ls = ''; for (let i = 0; i < localStorage.length; i++) ls += localStorage.getItem(localStorage.key(i)) || '';
      return { q, keys, type: blob && blob.type, size: blob ? blob.size : 0, lsHasImage: /data:image/.test(ls), itemBytes: JSON.stringify(q[0] || {}).length };
    });
    check('kept: the note in tbx_fbq (no picture there), the screenshot in Cache Storage tbx-fbq', stored && q1.q.length === 1 && q1.keys.length === 1 && q1.type === 'image/jpeg' && q1.size > 5000 && q1.size === q1.q[0].shot && !q1.lsHasImage && q1.itemBytes < 4096,
      { n: q1.q.length, keys: q1.keys, type: q1.type, size: q1.size, shot: q1.q[0] && q1.q[0].shot, lsHasImage: q1.lsHasImage });
    check('no signal: nothing was sent (no attempt either)', relay.length === 0 && tried === 0, { sent: relay.length, tried });

    // ---- still no signal: a reload (the app opens from the service-worker cache) keeps it; its attempts fail ----
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100, null, { timeout: 30000 });
    await sleep(7000); // past the flush 5 s after start
    const q2 = await p.evaluate(() => JSON.parse(localStorage.getItem('tbx_fbq') || '[]'));
    check('reload without signal: still waiting, nothing delivered (the try after start failed)', q2.length === 1 && q2[0].id === q1.q[0].id && relay.length === 0 && tried >= 1, { n: q2.length, sent: relay.length, tried });
    await p.evaluate(() => { location.hash = '#/about'; }); await sleep(600);
    const about = await p.evaluate(() => (document.getElementById('fbq-note') || {}).textContent || '');
    check('About: "1 feedback note is waiting for signal"', /1 feedback note is waiting for signal/.test(about), about);

    // ---- signal is back ('online'): sent once ----
    await noSignal(p, false);
    const sent = await until(() => relay.length >= 1, 20000);
    await sleep(2500);
    const r0 = relay[0] && relay[0].body;
    const img = r0 && r0.image ? Buffer.from(String(r0.image).split(',')[1] || '', 'base64').length : 0;
    check('signal back: the relay got it once, with its id, name, note, screen and screenshot', sent && relay.length === 1 && r0.id === q1.q[0].id && r0.name === 'Nate' && r0.note === 'P45 test note (fake relay)' &&
      /pn\/3910500580/.test(r0.route) && /^data:image\/jpeg;base64,/.test(r0.image) && img === q1.size && r0.token === 'test-token', r0 && { id: r0.id, route: r0.route, img, want: q1.size, n: relay.length });
    const gone = await until(() => p.evaluate(async () => !localStorage.getItem('tbx_fbq') && (await (await caches.open('tbx-fbq')).keys()).length === 0), 8000);
    check('signal back: the queue and its screenshot are cleared; About is quiet again', gone && !(await p.evaluate(() => (document.getElementById('fbq-note') || {}).textContent || '')));
    await p.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); if (window.TBX_FBQ) window.TBX_FBQ.flush(); });
    await sleep(5000);
    check('no duplicate (online again, foreground, flush)', relay.length === 1, relay.length);

    // ---- the name is remembered; the note field has the focus ----
    await p.evaluate(() => { location.hash = '#/'; }); await sleep(500);
    await p.evaluate(() => { document.getElementById('fb-name').value = ''; });
    await p.click('#fb-fab'); await sleep(150);
    const again = await p.evaluate(() => ({ name: document.getElementById('fb-name').value, focus: document.activeElement && document.activeElement.id, saved: localStorage.getItem('tbx_fb_name') }));
    check('the name is remembered (tbx_fb_name) and the note field has the focus', again.name === 'Nate' && again.saved === 'Nate' && again.focus === 'fb-note', again);
    await p.click('#fb-cancel');

    // ---- 2 MB of queued screenshots: the oldest picture gives way, its note stays ----
    await noSignal(p, true);
    await p.evaluate(async () => {
      const c = await caches.open('tbx-fbq'), seed = [];
      for (let i = 0; i < 2; i++) {
        const id = 'budgetseed' + i; seed.push({ id, t: Date.now() - 60000 * (5 - i), name: 'Nate', note: 'seed ' + i, screen: 'Home', route: '#/', ua: 'x', tries: 0, err: '', shot: 1050000 });
        await c.put('./__fbq/' + id + '.jpg', new Response(new Blob([new Uint8Array(1050000)], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } }));
      }
      localStorage.setItem('tbx_fbq', JSON.stringify(seed));
    });
    await p.click('#fb-fab');
    await until(() => p.evaluate(() => /attached/.test(document.getElementById('fb-shotcap').textContent)), 20000);
    await p.fill('#fb-note', 'P45 budget note'); await p.click('#fb-send');
    const settled = await until(() => p.evaluate(() => { const q = JSON.parse(localStorage.getItem('tbx_fbq') || '[]'); return q.length === 3 && q[2].shot > 0; }), 10000);
    const bud = await p.evaluate(async () => {
      const q = JSON.parse(localStorage.getItem('tbx_fbq') || '[]'), c = await caches.open('tbx-fbq');
      const has = async (id) => !!(await c.match('./__fbq/' + id + '.jpg'));
      return { shots: q.map(x => x.shot), notes: q.map(x => x.note), c0: await has('budgetseed0'), c1: await has('budgetseed1'), c2: q[2] ? await has(q[2].id) : false };
    });
    check('budget: over 2 MB → the oldest screenshot is dropped, its note kept; the newest picture is stored', settled && bud.shots[0] === 0 && !bud.c0 && bud.shots[1] === 1050000 && bud.c1 && bud.shots[2] > 0 && bud.c2 && bud.notes.length === 3, bud);

    // ---- a service-worker update replaces the shell cache and keeps tbx-fbq (the relay refuses meanwhile) ----
    await noSignal(p, false); mode = 'refuse'; await sleep(1500);
    const before = await p.evaluate(async () => caches.keys());
    await ctl('root=new');
    await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    const waiting = await until(() => p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.waiting); }), 60000);
    await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r && r.waiting) r.waiting.postMessage('SKIP_WAITING'); });
    const swapped = await until(() => p.evaluate(async () => (await caches.keys()).some(k => /-bump$/.test(k)) && !(await caches.keys()).some(k => /^tbx-v\d+-\d{8}$/.test(k))), 30000);
    await sleep(1500);
    const after = await p.evaluate(async () => { const c = await caches.open('tbx-fbq'); return { keys: await caches.keys(), n: (await c.keys()).length, q: JSON.parse(localStorage.getItem('tbx_fbq') || '[]').length }; });
    check('update: the new service worker drops the old shell cache but keeps tbx-fbq and its screenshots', waiting && swapped && after.keys.indexOf('tbx-fbq') > -1 && after.n >= 2 && after.q === 3, { before, after });
    check('no page errors', errs.length === 0, errs);
    await ctx.close();
  } catch (e) { check('harness ran', false, String(e && e.stack || e).slice(0, 400)); }
  R.pass = R.checks.every(c => c.ok);
  console.log((R.pass ? 'ALL PASS' : 'FAILED') + ' — feedback-offline ' + R.site + ' (' + ENGINE + ')');
  const out = arg('json', ''); if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  await b.close(); srv.kill(); rsrv.close(); process.exit(R.pass ? 0 : 1);
})();
