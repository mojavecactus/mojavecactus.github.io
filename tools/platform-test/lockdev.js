// P19 (4.143) — "Lock this device": which tbx_* keys go, which stay. Seeds one key of every class (credentials, unsent
// scans, the rep's own data, caches, prefs), including a territory with UNSENT scans, taps About → Lock this device
// (accepting the confirm), reloads, and diffs. Any new tbx_* key belongs in SEED with the class it should have.
//   APP_PW=<catalog pw> node tools/platform-test/lockdev.js [--site <dir>] [--engine chromium|webkit] [--json out.json]
const pw = require('playwright');
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; };
const SITE = path.resolve(arg('site', path.resolve(__dirname, '../..'))), ENGINE = arg('engine', 'chromium');
const PORT = +arg('port', 9010 + Math.floor(Math.random() * 30)), BASE = 'http://localhost:' + PORT + '/';
const PWD = process.env.APP_PW || process.env.TBX_PW;
if (!PWD || !fs.existsSync(path.join(SITE, 'index.html'))) { console.error('need APP_PW (catalog password) and a site with index.html'); process.exit(2); }
const R = { site: path.basename(SITE), engine: ENGINE, checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + JSON.stringify(detail) : '')); };
const creds = JSON.stringify({ url: 'https://example.invalid/exec', token: 'tok', devices: ["Nate's iPhone"] });
const op = n => JSON.stringify(Array.from({ length: n }, (_, i) => ({ opId: 'o' + i, t: 'add', ref: '3910500580', lot: 'L' + i, qty: 1, loc: 'Trunk', ts: '2026-09-24T10:00:00Z' })));
const SEED = {
  // credentials / secrets
  tbx_cc: creds, tbx_buf_cc: creds, tbx_la_cc: creds, tbx_fa2: '{"t":"fa-token"}', tbx_uadm: 'admin-key',
  tbx_buf_cc_roster: '["A"]', tbx_buf_cc_sheet: 'https://docs.google.com/spreadsheets/d/x', tbx_cc_roster: '["A"]',
  // unsent work — never deleted (tbx_fbq: feedback waiting for signal, P45; its screenshot is in Cache Storage tbx-fbq)
  tbx_cc_ops: op(2), tbx_buf_cc_ops: '[]', tbx_learn_q: '[{"code":"0100","sku":"1"}]', tbx_uq: '{"q":[],"fly":null}',
  tbx_fbq: JSON.stringify([{ id: 'fbqlock0001', t: 1, name: 'Nate', note: 'kept through Lock', screen: 'Home', route: '#/', ua: 'x', tries: 0, err: '', shot: 1234 }]),
  // the rep's own data
  tbx_favs: '[{"route":"#/pn/1","it":{"t":"x","sku":"1"}}]', tbx_recents: '[{"sku":"1","label":"x"}]', tbx_learned: '{"0100":"1"}',
  tbx_cc_dev: "Nate's iPhone", tbx_fb_name: 'Nate', tbx_cc_base: '[]', tbx_cc_hist: '{}', tbx_cc_locs: '["Trunk"]', tbx_fa2_draft: '{"form":{}}', tbx_fa2_trk: '[]',
  // cache / prefs
  tbx_fa2_cache: '{"t":1,"d":{}}', tbx_fa2_teams: '[]', tbx_bo: '{"at":1,"data":{}}', tbx_hubterrs: '[]', tbx_fsort: 'az', tbx_uid: 'abcdefghij'
};
const MUST_GO = ['tbx_k2', 'tbx_rm', 'tbx_uadm', 'tbx_buf_cc', 'tbx_buf_cc_roster', 'tbx_buf_cc_sheet', 'tbx_la_cc', 'tbx_fa2', 'tbx_fa2_cache', 'tbx_fa2_teams'];
const MUST_STAY = ['tbx_cc', 'tbx_cc_ops', 'tbx_cc_dev', 'tbx_cc_base', 'tbx_cc_hist', 'tbx_cc_locs', 'tbx_buf_cc_ops', 'tbx_learn_q', 'tbx_uq', 'tbx_favs', 'tbx_recents',
  'tbx_learned', 'tbx_fa2_draft', 'tbx_fa2_trk', 'tbx_hubterrs', 'tbx_fsort', 'tbx_uid', 'tbx_tour_done', 'tbx_fbq', 'tbx_fb_name'];
(async () => {
  const srv = spawn('node', [path.join(__dirname, 'tserver.js')], { env: { ...process.env, ROOT_OLD: SITE, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(700);
  const b = await pw[ENGINE].launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); } catch (e) {}
      // hermetic: no live hub in the page — in WebKit, context.route() doesn't apply once a service worker controls it
      let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v) { delete v.usage; delete v.bo; delete v.fb; } t = v; } });
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
    const p = await ctx.newPage();
    let dialog = ''; p.on('dialog', d => { dialog = d.message(); d.accept(); });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { document.getElementById('lockrem').checked = true; });
    await p.fill('#lockpw', PWD); await p.evaluate(() => document.getElementById('lockform').requestSubmit());
    await p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100);
    await p.evaluate((S) => { for (const k in S) localStorage.setItem(k, S[k]); }, SEED);
    await p.evaluate(async () => { const c = await caches.open('tbx-fbq'); await c.put('./__fbq/fbqlock0001.jpg', new Response(new Blob([new Uint8Array(1234)], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } })); });
    await p.evaluate(() => { location.hash = '#/about'; }); await sleep(600);
    await p.click('[data-act="lockdev"]');
    await p.waitForLoadState('load'); await sleep(1500);
    const fbqShot = await p.evaluate(async () => !!(await (await caches.open('tbx-fbq')).match('./__fbq/fbqlock0001.jpg')));
    const left = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^tbx_/.test(k)) o[k] = 1; } return { ls: Object.keys(o).sort(), ss: sessionStorage.getItem('tbx_k2') ? ['tbx_k2'] : [] }; });
    R.left = left; R.dialog = dialog;
    const stillThere = MUST_GO.filter(k => left.ls.includes(k)).concat(left.ss.map(k => 'session:' + k));
    const lost = MUST_STAY.filter(k => !left.ls.includes(k));
    check('credentials and secrets are cleared', stillThere.length === 0, stillThere.length ? 'still stored: ' + stillThere.join(', ') : 'none left');
    check('unsent scans, the rep\'s data and prefs are kept (incl. the login of a territory with unsent scans)', lost.length === 0, lost.length ? 'lost: ' + lost.join(', ') : 'all kept');
    check('queued feedback keeps its screenshot (Cache Storage tbx-fbq)', fbqShot, fbqShot ? 'kept' : 'lost');
    check('the confirm names the unsent scans', /2 cycle-count scans/.test(dialog), dialog.replace(/\n+/g, ' / ') || '(no confirm shown)');
    check('the lock screen is shown after locking', await p.evaluate(() => !document.documentElement.classList.contains('authed')), '');
    await ctx.close();
  } catch (e) { check('harness ran', false, String(e && e.stack || e).slice(0, 300)); }
  R.pass = R.checks.every(c => c.ok);
  console.log((R.pass ? 'ALL PASS' : 'FAILED') + ' — lockdev ' + R.site + ' (' + ENGINE + ')');
  const out = arg('json', ''); if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  await b.close(); srv.kill(); process.exit(R.pass ? 0 : 1);
})();
