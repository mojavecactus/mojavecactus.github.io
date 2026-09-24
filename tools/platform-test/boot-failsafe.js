// P4 (4.143) — what a start-up failure does to an installed phone (service worker + full cache + Remember me).
//   APP_PW=<catalog pw> node tools/platform-test/boot-failsafe.js [--site <dir>] [--engine chromium|webkit] [--only name,name] [--json out.json]
// --site defaults to the repo root (decrypted data.js not needed). WebKit needs a Playwright WebKit build
// (PLAYWRIGHT_BROWSERS_PATH=<dir holding it>); never run `playwright install` into system paths for this.
// Scenarios (each on a freshly installed profile):
//   bug-online      data bug in a release (TOOLBOX.probes = null → TBX_BOOT throws), online auto-boot
//   bug-offline-pw  same bug, offline, password unlock with the unlock animation on (the heal() wipe case)
//   wrong-key       the stored key no longer matches the payload (re-encrypted with a new salt)
//   bad-key         the stored key is garbage (can never import)
//   no-data-offline offline launch whose cache lost payload.enc.json
//   stall           TBX_BOOT returns without rendering (TOOLBOX missing) → the 4-s watchdog; online, then offline
//   offline-ok      offline cold launch, no bug (regression)
// PASS: the saved key survives everything except a wrong/garbage key, the SW stays registered,
// caches are never wiped offline, a visible "ToolBox didn't open" card with Try again replaces the blank screen.
const pw = require('playwright');
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; };
const SITE = path.resolve(arg('site', path.resolve(__dirname, '../..'))), ENGINE = arg('engine', 'chromium'), ONLY = arg('only', '');
const PORT = +arg('port', 8960 + Math.floor(Math.random() * 30)), BASE = 'http://localhost:' + PORT + '/';
const PWD = process.env.APP_PW || process.env.TBX_PW; if (!PWD || !fs.existsSync(path.join(SITE, 'index.html'))) { console.error('need APP_PW (catalog password) and a site with index.html'); process.exit(2); }
const ctl = q => fetch(BASE + '__ctl?' + q).then(r => r.json());
const R = { site: path.basename(SITE), engine: ENGINE, checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); };

async function installed(b) {
  await ctl('offline=0&rate=0&rtt=0');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); } catch (e) {}
    const mode = localStorage.getItem('__sim');
    if (mode === 'bug' || mode === 'stall') {
      let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v && mode === 'bug') v.probes = null; t = mode === 'stall' ? undefined : v; } });
    }
  });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { document.getElementById('lockrem').checked = true; });
  await p.fill('#lockpw', PWD);
  await p.evaluate(() => document.getElementById('lockform').requestSubmit());
  await p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100, null, { timeout: 60000 });
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60000 });
  // core must be cached; photos are irrelevant here
  for (let i = 0; i < 120; i++) { const ok = await p.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); if (await c.match('payload.enc.json', { ignoreSearch: true }) && await c.match('index.html', { ignoreSearch: true })) return true; } return false; }); if (ok) break; await sleep(500); }
  await p.close();
  return ctx;
}
const state = (pg) => pg.evaluate(async () => {
  const s = { authed: document.documentElement.classList.contains('authed'), k2: !!localStorage.getItem('tbx_k2'),
    content: (document.getElementById('content') || { innerHTML: '' }).innerHTML.length,
    lockVisible: getComputedStyle(document.getElementById('lock')).visibility !== 'hidden' && getComputedStyle(document.getElementById('lock')).opacity !== '0',
    card: !!(document.getElementById('booterr') && !document.getElementById('booterr').hidden),
    cardText: document.getElementById('booterr') ? document.getElementById('booterr').innerText.replace(/\s+/g, ' ').slice(0, 260) : '',
    lockMsg: (document.querySelector('#lock .lk-sub') || {}).textContent || '', lockErr: (document.getElementById('lockerr') || {}).textContent || '' };
  try { s.caches = (await caches.keys()).length; s.shell = (await caches.keys()).filter(k => /^tbx-v\d+-/.test(k)).length; } catch (e) { s.caches = 'err'; }
  try { s.sw = (await navigator.serviceWorker.getRegistrations()).length; } catch (e) { s.sw = 'err'; }
  return s;
}).catch(e => ({ err: String(e).slice(0, 120) }));
async function launch(ctx, opts = {}) {
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 100)));
  await p.goto(BASE, { waitUntil: 'load' }).catch(e => errs.push('goto: ' + String(e).split('\n')[0].slice(0, 80)));
  p.__errs = errs; return p;
}
const run = n => !ONLY || ONLY.split(',').includes(n);

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'tserver.js')], { env: { ...process.env, ROOT_OLD: SITE, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(700);
  const b = await pw[ENGINE].launch();
  try {
    if (run('bug-online')) {
      const ctx = await installed(b);
      const p0 = await ctx.newPage(); await p0.goto(BASE + '__h'); await p0.evaluate(() => localStorage.setItem('__sim', 'bug')); await p0.close();
      const p = await launch(ctx); await sleep(7000);
      const s = await state(p);
      check('bug-online: saved login kept', s.k2, s);
      check('bug-online: "didn\'t open" card with Try again instead of a blank screen', s.card && /Try again/.test(s.cardText), s.cardText);
      check('bug-online: service worker still registered, shell cache kept', s.sw >= 1 && s.shell >= 1, { sw: s.sw, shell: s.shell });
      // the fix ships (bug gone) → Try again boots without the password
      await p.evaluate(() => localStorage.removeItem('__sim'));
      const tryBtn = await p.$('#be-retry');
      if (tryBtn) { await tryBtn.click(); await p.waitForLoadState('load').catch(() => {}); await sleep(3000); }
      else { await p.reload({ waitUntil: 'load' }); await sleep(3000); }
      const s2 = await state(p);
      check('bug-online: Try again after the fix opens Home without the password', s2.content > 100 && !s2.lockVisible, { content: s2.content, lock: s2.lockVisible });
      await ctx.close();
    }
    if (run('bug-offline-pw')) {
      const ctx = await installed(b);
      const p0 = await ctx.newPage(); await p0.goto(BASE + '__h');
      await p0.evaluate(() => { localStorage.setItem('__sim', 'bug'); localStorage.removeItem('tbx_k2'); localStorage.removeItem('tbx_rm'); localStorage.removeItem('tbx_heal_ts'); }); await p0.close();
      await ctl('offline=1');
      const p = await launch(ctx);
      await p.evaluate(() => sessionStorage.clear()).catch(() => {});
      await p.fill('#lockpw', PWD); await p.evaluate(() => document.getElementById('lockform').requestSubmit());
      await sleep(6000);
      const s = await state(p);
      check('bug-offline-pw: no wipe while offline (caches + SW intact)', s.sw >= 1 && s.shell >= 1, { sw: s.sw, caches: s.caches });
      check('bug-offline-pw: card shown, not "Incorrect password"', s.card && !/Incorrect/.test(s.lockErr), { card: s.card, lockErr: s.lockErr, text: s.cardText });
      const r = await p.reload({ waitUntil: 'domcontentloaded' }).then(() => 'loaded').catch(e => 'FAILED: ' + String(e).split('\n')[0].slice(0, 70));
      const s2 = await state(p);
      check('bug-offline-pw: next offline launch still opens from the cache', r === 'loaded' && !s2.err, { r, s2: { lock: s2.lockVisible, card: s2.card, content: s2.content } });
      await ctl('offline=0'); await ctx.close();
    }
    if (run('wrong-key') || run('bad-key')) {
      for (const kind of ['wrong-key', 'bad-key'].filter(run)) {
        const ctx = await installed(b);
        const p0 = await ctx.newPage(); await p0.goto(BASE + '__h');
        await p0.evaluate((kind) => { const r = new Uint8Array(32); crypto.getRandomValues(r); localStorage.setItem('tbx_k2', kind === 'bad-key' ? '%%not-base64%%' : btoa(String.fromCharCode.apply(null, r))); }, kind); await p0.close();
        const p = await launch(ctx); await sleep(4000);
        const s = await state(p);
        check(kind + ': key cleared and the lock screen shown', !s.k2 && s.lockVisible && !s.card, s);
        await ctx.close();
      }
    }
    if (run('no-data-offline')) {
      const ctx = await installed(b);
      const p0 = await ctx.newPage(); await p0.goto(BASE + '__h');
      await p0.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) if (/payload\.enc\.json/.test(r.url)) await c.delete(r); } }); await p0.close();
      await ctl('offline=1');
      const p = await launch(ctx); await sleep(6000);
      const s = await state(p);
      check('no-data-offline: key kept, card says it needs signal once', s.k2 && s.card && /signal/.test(s.cardText), s);
      await ctl('offline=0'); await ctx.close();
    }
    if (run('stall')) {
      for (const off of [0, 1]) {
        const ctx = await installed(b);
        const p0 = await ctx.newPage(); await p0.goto(BASE + '__h'); await p0.evaluate(() => { localStorage.setItem('__sim', 'stall'); localStorage.removeItem('tbx_heal_ts'); }); await p0.close();
        await ctl('offline=' + off);
        const p = await launch(ctx); await sleep(12000);
        const s = await state(p);
        if (off) check('stall offline: no wipe, SW kept, card shown', s.sw >= 1 && s.shell >= 1 && s.card, { sw: s.sw, shell: s.shell, card: s.card, text: s.cardText });
        else check('stall online: one repair reload at most, then the card; SW kept', s.sw >= 1 && s.card, { sw: s.sw, shell: s.shell, card: s.card, k2: s.k2 });
        await ctl('offline=0'); await ctx.close();
      }
    }
    if (run('offline-ok')) {
      const ctx = await installed(b);
      await ctl('offline=1');
      const p = await launch(ctx); await sleep(4000);
      const s = await state(p);
      check('offline-ok: offline cold launch opens Home', s.content > 100 && !s.card, { content: s.content, card: s.card });
      await ctl('offline=0'); await ctx.close();
    }
  } catch (e) { check('harness ran', false, String(e && e.stack || e).slice(0, 300)); }
  R.pass = R.checks.every(c => c.ok);
  console.log((R.pass ? 'ALL PASS' : 'FAILED') + ' — boot-failsafe ' + R.site + ' (' + ENGINE + ')');
  const out = arg('json', ''); if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  await b.close(); srv.kill(); process.exit(R.pass ? 0 : 1);
})();
