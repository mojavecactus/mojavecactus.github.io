// P2 / P34 — the service worker across an update: offline photos, the placeholder, the background fill.
//   APP_PW=<catalog pw> node tools/platform-test/sw-upgrade.js --scenario <name> [--old <live build dir>] [--new <dir>]
//        [--engine chromium|webkit] [--rate 200000] [--rtt 150] [--offline-after 10000] [--port N] [--work <dir>]
//        [--json out.json]
// --new defaults to the repo root; --old is a plain copy of the build that is live on phones (e.g. `git worktree add`
// or `git archive <live sha> | tar -x -C <dir>`). --rate is bytes/s (200000 ≈ 1.6 Mbps), --rtt ms per request.
// When OLD and NEW carry the same CACHE (an unreleased working tree), NEW's sw.js is served with "-bump" appended.
// Scenarios (each on a fresh browser profile; hub/relay calls never leave the machine):
//   update     returning rep, OLD saved every photo → NEW released over the throttled link → "Update ready" → tap →
//              offline --offline-after ms later: every photo (and 11 on 8 common cards) opens offline, no unchanged
//              photo was downloaded, then the offline launch, gate, a card, #/cc, #/ct and #/fa2.
//   prune      NEW (all photos saved) → a copy of NEW that drops one photo and changes another (built in --work):
//              the removed one is pruned, only the changed one downloads, stored under its new hash.
//   resume     first install of NEW over the throttled link: the fill saves photos 4 at a time; the app is closed
//              after 25 s and reopened: the fill resumes where it stopped, never downloads a saved photo twice, and
//              completes; About says so; every photo opens offline.
//   photofail  every photo request fails while OLD and then NEW install: the update still activates, the fill stops
//              quietly, offline cards show the SW placeholder (never a broken image) and the app still works offline;
//              back online, the card on screen swaps in the real photos and the fill completes; a photo that answers
//              HTTP 500 shows "Photo not saved offline yet · Tap to try again", and a tap loads it.
//   busy       an update is applied while the fill is running: the page reloads promptly (the fill stops so the new
//              worker can take over) and the fill resumes under the new worker.
//   emergency  NEW with every photo saved → tools/emergency/sw-emergency.js served as sw.js: it takes over without a
//              tap, the offline launch opens Home, every photo still opens offline, every cache is kept.
// WebKit (the iPhone engine) needs PLAYWRIGHT_BROWSERS_PATH pointing at a Playwright WebKit build; never run
// `playwright install` into system paths for this.
const pw = require('playwright');
const { spawn, execFileSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os');
const crypto = require('crypto');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; };
const REPO = path.resolve(__dirname, '../..');
const SC = arg('scenario', 'update'), ENGINE = arg('engine', 'chromium');
const NEWDIR = path.resolve(arg('new', REPO)), OLDDIR = arg('old', '') ? path.resolve(arg('old')) : '';
const RATE = +arg('rate', 200000), RTT = +arg('rtt', 150), OFF_AFTER = +arg('offline-after', 10000);
const PORT = +arg('port', 8960 + Math.floor(Math.random() * 30)), BASE = 'http://localhost:' + PORT + '/';
const WORK = path.resolve(arg('work', os.tmpdir()));
const PWD = process.env.APP_PW || process.env.TBX_PW;
const SCEN = ['update', 'prune', 'resume', 'photofail', 'busy', 'emergency'];
if (!PWD || !SCEN.includes(SC) || !fs.existsSync(path.join(NEWDIR, 'index.html')) || (['update', 'photofail'].includes(SC) && !fs.existsSync(path.join(OLDDIR, 'index.html')))) {
  console.error('usage: APP_PW=… node sw-upgrade.js --scenario ' + SCEN.join('|') + ' [--old <live build>] [--new <dir>] (update/photofail need --old)'); process.exit(2);
}
const IMG = 'tbx-img';
const SKUS = ['3910500580', '3910500582', '234109206', '3910500740', '242200008', '300034100', '3910947200', '3910500569'];
const ctl = q => fetch(BASE + '__ctl?' + q).then(r => r.json());
const R = { scenario: SC, engine: ENGINE, old: OLDDIR && path.basename(OLDDIR), new: path.basename(NEWDIR), checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const cacheOf = dir => (/var CACHE = '([^']+)';/.exec(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')) || [])[1];
const manifestOf = dir => { const f = path.join(dir, 'img-manifest.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).files : null; };
const photoList = dir => {                                // the build's photos: its manifest, else a pre-P2 sw.js ASSETS list
  const m = manifestOf(dir); if (m) return Object.keys(m).filter(p => p.startsWith('img/'));
  return [...fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').matchAll(/'\.\/(img\/[^']+)'/g)].map(x => x[1]);
};
const coreOf = dir => JSON.parse(/var CORE = (\[[^\]]*\]);/.exec(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'))[1].replace(/'/g, '"'));
const mb = n => (n / 1e6).toFixed(2) + ' MB';

const NETERR = /due to access control checks|Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED/;
let NET_OFF = false;                                      // the phone's other traffic (hubs) fails while "offline"
const ERRS = [];
async function newCtx(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); } catch (e) {} });
  await ctx.route(/^https?:\/\/(?!localhost)/, r => NET_OFF ? r.abort('internetdisconnected')
    : r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false}' }));
  return ctx;
}
async function page(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => ERRS.push(String(e && e.message || e).slice(0, 160)));
  return p;
}
async function unlock(p) {
  await p.waitForSelector('#lockpw', { state: 'attached', timeout: 60000 });
  const locked = await p.evaluate(() => !document.documentElement.classList.contains('authed'));
  if (locked) {
    await p.evaluate(() => { const r = document.getElementById('lockrem'); if (r) r.checked = true; });
    await p.fill('#lockpw', PWD);
    await p.evaluate(() => document.getElementById('lockform').requestSubmit());
  }
  await p.waitForFunction(() => document.getElementById('content') && document.getElementById('content').innerHTML.length > 100, null, { timeout: 180000 });
  return locked;
}
const controlled = p => p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 300000 });
const cacheStat = p => p.evaluate(async () => { const o = {}; for (const k of await caches.keys()) { const ks = await (await caches.open(k)).keys(); o[k] = { img: ks.filter(r => /\/img\//.test(r.url)).length, all: ks.length }; } return o; });
const maxImg = s => Object.values(s).reduce((a, x) => Math.max(a, x.img), 0);
async function waitFor(fn, ms, every = 500) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return Date.now() - t0; await sleep(every); } return -1; }
const fillAll = p => p.evaluate(() => window.TBX_PHOTOS && window.TBX_PHOTOS.fill(true)).catch(() => {});
const phStatus = p => p.evaluate(() => window.TBX_PHOTOS ? window.TBX_PHOTOS.status() : null).catch(() => null);
async function update(p) {                                // a background update check, as on foreground
  for (let i = 0; i < 20; i++) {
    const ok = await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r ? r.update().then(() => true) : false)).catch(() => false);
    if (ok) return; await sleep(500);
  }
  throw new Error('registration.update() never succeeded');
}
// every photo, fetched through the SW: a real image, the P34 placeholder, or a failure
async function photoAudit(p, list) {
  return p.evaluate(async (list) => {
    const r = { ok: 0, placeholder: 0, fail: 0, failed: [] };
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async (u) => {
        try {
          const res = await fetch(u, { headers: { accept: 'image/*' } });
          if (res.headers.get('x-tbx-placeholder')) r.placeholder++;
          else if (res.ok && /^image\//.test(res.headers.get('content-type') || '') && (await res.blob()).size > 200) r.ok++;
          else { r.fail++; r.failed.push(u); }
        } catch (e) { r.fail++; r.failed.push(u); }
      }));
    }
    r.failed = r.failed.slice(0, 5);
    return r;
  }, list);
}
// the photos of the card on screen: loaded, what the SW serves for them now, the in-card panel, reloaded (?t=)
const cardImgs = p => p.evaluate(async () => Promise.all([...document.querySelectorAll('#content img.photo')].map(async i => {
  let ph = null; try { ph = !!(await fetch(i.getAttribute('src'), { headers: { accept: 'image/*' } })).headers.get('x-tbx-placeholder'); } catch (e) {}
  return { loaded: i.complete && i.naturalWidth > 0, ph, failed: i.classList.contains('ph-failed'), panel: !!(i.nextElementSibling && i.nextElementSibling.classList.contains('ph-miss')), again: /\?t=/.test(i.getAttribute('src')) };
})));
async function openCard(p, sku) {
  await p.evaluate(h => { location.hash = h; }, '#/pn/' + sku); await sleep(500);
  await p.evaluate(() => document.querySelectorAll('#content img').forEach(i => { i.loading = 'eager'; }));
  await waitFor(() => p.evaluate(() => [...document.querySelectorAll('#content img.photo')].every(i => i.complete)), 8000, 200);
  await sleep(300);
}
async function cardAudit(p) {
  const r = { real: 0, placeholder: 0, broken: 0, panel: 0 };
  for (const s of SKUS) {
    await openCard(p, s);
    (await cardImgs(p)).forEach(x => { if (x.panel || x.failed) r.panel++; else if (!x.loaded) r.broken++; else if (x.ph) r.placeholder++; else r.real++; });
  }
  return r;
}
// "Offline check": the app still works with no signal — launch, gate, a card, cycle count, F&A
async function offlineChecks(ctx, label, core) {
  const e0 = ERRS.length, q = await page(ctx);
  let t0 = Date.now();
  await q.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const home = await q.waitForFunction(() => document.documentElement.classList.contains('authed') && document.getElementById('content').innerHTML.length > 100, null, { timeout: 30000 }).then(() => true, () => false);
  check(label + ': cold launch offline opens Home (saved login)', home, home ? (Date.now() - t0) + ' ms' : 'blank');
  const coreR = await q.evaluate(async (core) => { const bad = []; for (const u of core) { try { const r = await fetch(u); if (!r.ok) bad.push(u + ' ' + r.status); } catch (e) { bad.push(u + ' ' + e.message); } } return bad; }, core);
  check(label + ': every sw.js CORE file is served offline', !coreR.length, coreR.length ? coreR : core.length + ' files');
  const scr = {};
  await openCard(q, SKUS[0]);
  scr.card = await q.evaluate(() => !!document.querySelector('#content .card h1'));
  await q.evaluate(() => { ['tbx_cc', 'tbx_cc_dev', 'tbx_cc_roster'].forEach(k => localStorage.removeItem(k)); location.hash = '#/cc'; }); await sleep(900);
  scr.ccGate = await q.evaluate(() => !!document.querySelector('#content .cc-card') && !document.querySelector('#content .cc-home'));
  await q.evaluate(() => { localStorage.setItem('tbx_cc', JSON.stringify({ url: 'https://example.invalid/cc', token: 'tok' })); localStorage.setItem('tbx_cc_dev', 'Test phone'); localStorage.setItem('tbx_cc_roster', JSON.stringify(['Test phone'])); location.hash = '#/'; });
  await sleep(400); await q.evaluate(() => { location.hash = '#/cc'; }); await sleep(1200);
  scr.ccHome = await q.evaluate(() => !!document.querySelector('#content .cc-home'));
  await q.evaluate(() => { location.hash = '#/ct'; }); await sleep(900);
  scr.ct = await q.evaluate(() => document.getElementById('content').innerHTML.length > 100 && !document.querySelector('#content .cc-home'));
  await q.evaluate(() => { location.hash = '#/fa2'; }); await sleep(1200);
  scr.fa2 = await q.evaluate(() => document.getElementById('content').innerHTML.length > 100 && /F&A/.test(document.getElementById('title').textContent));
  await q.evaluate(() => { ['tbx_cc', 'tbx_cc_dev', 'tbx_cc_roster'].forEach(k => localStorage.removeItem(k)); });
  check(label + ': a card, #/cc (gate and home), #/ct and #/fa2 open offline', Object.values(scr).every(Boolean), scr);
  // the password gate: no saved login, offline
  const key = await q.evaluate(() => { const k = localStorage.getItem('tbx_k2'); localStorage.removeItem('tbx_k2'); sessionStorage.removeItem('tbx_k2'); return k; });
  await q.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const gate = await q.waitForSelector('#lockpw', { state: 'visible', timeout: 20000 }).then(() => true, () => false);
  t0 = Date.now();
  let unlocked = false;
  if (gate) { await q.fill('#lockpw', PWD); await q.evaluate(() => document.getElementById('lockform').requestSubmit()); unlocked = await q.waitForFunction(() => document.documentElement.classList.contains('authed') && document.getElementById('content').innerHTML.length > 100, null, { timeout: 30000 }).then(() => true, () => false); }
  check(label + ': the password gate unlocks offline', gate && unlocked, gate ? (unlocked ? (Date.now() - t0) + ' ms' : 'did not unlock') : 'no gate');
  await q.evaluate(k => { if (k) localStorage.setItem('tbx_k2', k); }, key);
  await q.close();
  // WebKit reports a hub request that fails offline ("… due to access control checks") as a page error; the live
  // build does the same. Only script errors count here.
  const all = ERRS.slice(e0), pe = all.filter(m => !NETERR.test(m));
  check(label + ': no page errors offline', !pe.length, pe.length ? pe.slice(0, 3) : 'none' + (all.length ? ' (network failures reported by the engine: ' + all.length + ')' : ''));
}
// P2 prune fixture: a copy of NEW that drops one photo and changes another, with its manifest re-stamped and CACHE + 1
function pruneVariant(src) {
  const out = fs.mkdtempSync(path.join(WORK, 'tbx-prune-'));
  for (const f of fs.readdirSync(src)) {
    if (['.git', 'tools', 'node_modules', 'data.js', 'gtin.js', 'whatsnew.js'].includes(f)) continue;
    const s = path.join(src, f), d = path.join(out, f);
    if (fs.statSync(s).isDirectory()) execFileSync('cp', ['-al', s, d]); else fs.copyFileSync(s, d);
  }
  const removed = 'img/knot-pusher.jpg', changed = 'img/suture-colors.jpg';
  fs.unlinkSync(path.join(out, removed));
  const nb = Buffer.concat([fs.readFileSync(path.join(src, changed)), Buffer.from([0xff, 0xd9])]);   // still a JPEG, other bytes
  fs.unlinkSync(path.join(out, changed)); fs.writeFileSync(path.join(out, changed), nb);             // break the hard link first
  const swp = path.join(out, 'sw.js');
  fs.writeFileSync(swp, fs.readFileSync(swp, 'utf8').replace(/var CACHE = 'tbx-v(\d+)-(\d+)[^']*';/, (m, n, d) => "var CACHE = 'tbx-v" + (+n + 1) + '-' + d + "';"));
  execFileSync('node', [path.join(REPO, 'tools/img-manifest.mjs'), out], { stdio: 'pipe' });
  return { dir: out, removed, changed, changedHash: crypto.createHash('sha256').update(nb).digest('hex').slice(0, 16), changedBytes: nb.length };
}

(async () => {
  let OLD = OLDDIR || NEWDIR, NEW = NEWDIR, PV = null;
  if (SC === 'prune') { PV = pruneVariant(NEWDIR); OLD = NEWDIR; NEW = PV.dir; R.new = path.basename(NEW); }
  if (['resume', 'busy', 'emergency'].includes(SC)) OLD = NEWDIR;
  const bump = SC === 'busy' || cacheOf(OLD) === cacheOf(NEW);
  const env = { ...process.env, ROOT_OLD: OLD, ROOT_NEW: NEW, PORT: String(PORT), BUMP_NEW: bump ? '1' : '', SW_ALT: path.join(NEWDIR, 'tools/emergency/sw-emergency.js') };
  if (SC === 'emergency' && !fs.existsSync(env.SW_ALT)) env.SW_ALT = path.join(REPO, 'tools/emergency/sw-emergency.js');
  const srv = spawn('node', [path.join(__dirname, 'tserver.js')], { env, stdio: 'ignore' });
  await sleep(700);
  const b = await pw[ENGINE].launch();
  const newCore = coreOf(NEW), newList = photoList(NEW);
  try {
    if (SC === 'update' || SC === 'prune' || SC === 'photofail') {
      const oldList = photoList(OLD), fail = SC === 'photofail';
      // ---- a rep who has used the old version: every photo saved (photofail: none could be) ----
      await ctl('root=old&rate=0&rtt=0&offline=0&swalt=0&reset=1&failimg=' + (fail ? 1 : 0));
      const ctx = await newCtx(b); let p = await page(ctx);
      await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p); await controlled(p);
      if (!fail) {
        await fillAll(p);                                 // P2 builds fill from the page; older ones precache on install
        let t = await waitFor(async () => maxImg(await cacheStat(p)) >= oldList.length, 90000, 1000);
        if (t < 0) {                                      // an old worker killed mid-precache: open the photos, as a rep would
          await p.evaluate(async (list) => { for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(u => fetch(u).then(r => r.blob()).catch(() => 0))); }, oldList);
          t = await waitFor(async () => maxImg(await cacheStat(p)) >= oldList.length, 60000, 1000);
        }
        R.oldInstalled = await cacheStat(p);
        check('the old version saved every photo first', t >= 0, R.oldInstalled);
      }
      await p.close();
      p = await page(ctx); await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p); await controlled(p);
      // ---- release ----
      await ctl('root=new&reset=1&rate=' + RATE + '&rtt=' + RTT);
      const T0 = Date.now();
      await update(p);
      const shown = await p.waitForFunction(() => { const b = document.getElementById('updbanner'); return b && !b.hidden; }, null, { timeout: 600000, polling: 250 }).then(() => true, () => false);
      R.bannerMs = Date.now() - T0; R.wireAtBanner = (await ctl('')).stats;
      check('the new version installs and offers "Update ready"', shown, R.bannerMs + ' ms, ' + mb(R.wireAtBanner.bytes) + ' on the wire (photos ' + mb(R.wireAtBanner.byClass.img || 0) + ')');
      let nav = -1; p.on('domcontentloaded', () => { if (nav < 0) nav = Date.now() - T0; });
      const tTap = Date.now() - T0;
      await p.click('#updbanner');
      for (let i = 0; i < 80 && nav < 0; i++) await sleep(250);
      check('tapping "Update ready" reloads into the new version (P8)', nav >= 0, nav >= 0 ? (nav - tTap) + ' ms after the tap' : 'no reload within 20 s');
      if (nav >= 0) { await p.waitForLoadState('domcontentloaded').catch(() => {}); await unlock(p).catch(() => {}); }
      const newCache = await p.evaluate(() => caches.keys());
      check('old app-shell cache deleted, photo cache kept', newCache.includes(IMG) && newCache.filter(k => /^tbx-v\d+-/.test(k)).length === 1, newCache);
      if (fail) {
        await waitFor(async () => { const s = await phStatus(p); return s && !s.busy && s.state !== 'idle'; }, 30000);
        const st = await phStatus(p); R.fillAfterUpdate = st;
        check('the photo fill stopped quietly at the first failure', st && !st.busy && st.have === 0 && st.state === 'offline', st);
      } else await sleep(Math.max(0, OFF_AFTER - 2000));
      R.wireBeforeOffline = (await ctl('')).stats;
      R.cachesBeforeOffline = await cacheStat(p);
      await ctl('offline=1'); NET_OFF = true;
      // ---- offline ----
      const audit = await photoAudit(p, newList); R.offlinePhotos = audit;
      const cards = await cardAudit(p); R.cards = cards;
      if (fail) {
        check('unsaved photos get the placeholder offline, never a broken image', audit.placeholder === newList.length && cards.placeholder === 11 && !cards.broken && !cards.panel, { photos: audit, cards });
      } else {
        check('every photo opens offline ' + OFF_AFTER / 1000 + ' s after the update', audit.ok === newList.length, audit.ok + '/' + newList.length + (audit.placeholder ? ' (+' + audit.placeholder + ' placeholders)' : '') + (audit.failed.length ? ' e.g. ' + audit.failed.join(', ') : ''));
        const guides = Object.keys(manifestOf(NEW) || {}).filter(k => k.startsWith('guide/')), g = await photoAudit(p, guides);
        check('the cycle-count guide pages open offline too', guides.length && g.ok === guides.length, g.ok + '/' + guides.length);
        check('8 common cards show real photos offline', cards.real === 11 && !cards.placeholder && !cards.broken && !cards.panel, cards.real + '/11 ' + JSON.stringify(cards));
      }
      const imgBytes = R.wireBeforeOffline.byClass.img || 0;
      if (SC === 'update') {
        const oldM = manifestOf(OLD), newM = manifestOf(NEW); let allowed = 0;
        for (const k of Object.keys(newM)) {
          const f = path.join(OLD, k);
          const same = oldM ? oldM[k] && oldM[k][0] === newM[k][0] : fs.existsSync(f) && crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16) === newM[k][0];
          if (!same) allowed += newM[k][1];
        }
        check('the update downloaded no unchanged photo', imgBytes <= allowed + 2048, 'photo bytes on the wire ' + imgBytes + ' (changed/new photos: ' + allowed + '); all update bytes ' + R.wireBeforeOffline.bytes + ' in ' + R.wireBeforeOffline.reqs + ' requests');
      }
      if (SC === 'prune') {
        const keys = await p.evaluate(async (c) => (await (await caches.open(c)).keys()).map(r => r.url.replace(location.origin + '/', '')), IMG);
        check('removed photo pruned from the photo cache', !keys.some(k => k.startsWith(PV.removed + '?')), PV.removed + ' (' + keys.length + ' files kept)');
        check('changed photo downloaded, nothing else', imgBytes >= PV.changedBytes && imgBytes <= PV.changedBytes + 4096, 'photo bytes ' + imgBytes + ' vs changed file ' + PV.changedBytes);
        check('changed photo stored under its new hash, the old version dropped', keys.includes(PV.changed + '?h=' + PV.changedHash) && keys.filter(k => k.startsWith(PV.changed + '?')).length === 1, keys.filter(k => k.startsWith(PV.changed + '?')));
      }
      await offlineChecks(ctx, fail ? 'with no photos saved' : 'after the update', newCore);
      if (fail) {
        // back online: the card on screen swaps its placeholders for the real photos, and the fill completes
        p = await page(ctx); await p.goto(BASE + '#/pn/' + SKUS[1], { waitUntil: 'domcontentloaded' }); await unlock(p);
        await openCard(p, SKUS[1]);
        const before = await cardImgs(p);
        await ctl('offline=0&failimg=0&rate=0&rtt=0'); NET_OFF = false;
        await p.evaluate(() => window.dispatchEvent(new Event('online')));
        const tDone = await waitFor(async () => { const s = await phStatus(p); return s && s.state === 'done'; }, 180000);
        await sleep(800);
        const after = await cardImgs(p);
        check('back online, the card on screen loads its real photos', before.every(x => x.ph) && after.length && after.every(x => x.loaded && !x.ph && x.again && !x.panel), { before, after });
        check('back online, the fill completes', tDone >= 0, tDone >= 0 ? tDone + ' ms for ' + newList.length + ' photos' : await phStatus(p));
        // a real failure (HTTP 500): the in-card panel, and a tap loads the photo
        await ctl('failimg=500');
        const ctx2 = await newCtx(b); const p2 = await page(ctx2);
        await p2.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p2); await controlled(p2);
        await openCard(p2, SKUS[1]);
        const panel = await p2.evaluate(() => [...document.querySelectorAll('#content .ph-miss')].map(e => e.innerText.replace(/\s+/g, ' ').trim()));
        await ctl('failimg=0');
        if (panel.length) { await p2.click('#content .ph-miss'); await sleep(1500); }
        const tapped = await cardImgs(p2);
        check('a real photo error shows "Photo not saved offline yet · Tap to try again"; a tap loads it', panel.length > 0 && panel.every(t => /Photo not saved offline yet/.test(t) && /Tap to try again/.test(t)) && tapped[0] && tapped[0].loaded && !tapped[0].ph && !tapped[0].panel, { panel, afterTap: tapped[0] });
        await ctx2.close();
      }
      await ctx.close();
    } else if (SC === 'resume') {
      await ctl('root=new&offline=0&reset=1&rate=' + RATE + '&rtt=' + RTT);
      const ctx = await newCtx(b); let p = await page(ctx);
      const T0 = Date.now();
      await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p);
      R.firstUnlockMs = Date.now() - T0;
      await controlled(p); R.controlledMs = Date.now() - T0;
      await sleep(25000);
      const n1 = ((await cacheStat(p))[IMG] || { img: 0 }).img;
      await p.close();                                    // the rep closes the app
      await sleep(3000);
      const peek = await page(ctx); await peek.goto(BASE + '__ctl?peek=1'); const n2 = ((await cacheStat(peek))[IMG] || { img: 0 }).img; await peek.close();
      check('photos saved before the app closed stay saved', n1 > 0 && n2 >= n1, n1 + ' → ' + n2 + ' (of ' + newList.length + ')');
      await ctl('reset=1');
      p = await page(ctx); await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p);
      await sleep(20000);
      const n3 = ((await cacheStat(p))[IMG] || { img: 0 }).img, w3 = (await ctl('')).stats;
      check('the next launch resumes the fill', n3 > n2, n2 + ' → ' + n3 + ' in 20 s (' + w3.imgReqs + ' photo requests)');
      check('the resume never re-downloads a saved photo', w3.imgReqs <= (n3 - n2) + 8, 'photo requests ' + w3.imgReqs + ' for ' + (n3 - n2) + ' new photos');
      R.photosPerMin = Math.round((n3 - n2) * 3);
      await ctl('rate=0&rtt=0');
      const tAll = await waitFor(async () => { const s = await phStatus(p); return s && s.state === 'done'; }, 300000);
      check('the fill completes (unthrottled after the resume check)', tAll >= 0, tAll >= 0 ? tAll + ' ms' : await phStatus(p));
      await p.evaluate(() => { location.hash = '#/about'; }); await sleep(1500);
      const about = await p.evaluate(() => { const e = document.getElementById('ab-photos'); return e && !e.hidden ? e.textContent : ''; });
      check('About says every photo is saved', /^Offline photos: all \d+ saved/.test(about), about);
      await ctl('offline=1'); NET_OFF = true;
      const audit = await photoAudit(p, newList); R.offlinePhotos = audit;
      check('every photo opens offline after the fill', audit.ok === newList.length, audit.ok + '/' + newList.length);
      await ctx.close();
    } else if (SC === 'busy') {
      await ctl('root=old&offline=0&reset=1&rate=' + RATE + '&rtt=' + RTT);
      const ctx = await newCtx(b); let p = await page(ctx);
      await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p); await controlled(p);
      await waitFor(async () => { const s = await phStatus(p); return s && s.busy && s.have >= 5; }, 120000);
      await ctl('root=new');                              // the same build, re-released (CACHE + "-bump")
      const T0 = Date.now();
      await update(p);
      const shown = await p.waitForFunction(() => { const b = document.getElementById('updbanner'); return b && !b.hidden; }, null, { timeout: 600000, polling: 250 }).then(() => true, () => false);
      const st0 = await phStatus(p);
      check('an update installs while the fill is running', shown && st0 && st0.busy, { bannerMs: Date.now() - T0, fill: st0 });
      let nav = -1; const tTap = Date.now(); p.on('domcontentloaded', () => { if (nav < 0) nav = Date.now() - tTap; });
      await p.click('#updbanner');
      for (let i = 0; i < 120 && nav < 0; i++) await sleep(250);
      check('tapping "Update ready" reloads promptly although the fill was running', nav >= 0 && nav < 12000, nav >= 0 ? nav + ' ms after the tap' : 'no reload within 30 s');
      if (nav >= 0) { await p.waitForLoadState('domcontentloaded').catch(() => {}); await unlock(p).catch(() => {}); }
      const n1 = ((await cacheStat(p))[IMG] || { img: 0 }).img;
      const more = await waitFor(async () => ((await cacheStat(p))[IMG] || { img: 0 }).img > n1, 60000);
      const cs = await p.evaluate(() => caches.keys());
      check('the fill resumes under the new worker', more >= 0 && cs.includes(IMG) && cs.filter(k => /^tbx-v\d+-/.test(k)).length === 1, { savedAtReload: n1, savedNow: ((await cacheStat(p))[IMG] || {}).img, caches: cs });
      await ctx.close();
    } else if (SC === 'emergency') {
      await ctl('root=new&offline=0&swalt=0&reset=1&rate=0&rtt=0');
      const ctx = await newCtx(b); let p = await page(ctx);
      await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await unlock(p); await controlled(p);
      await fillAll(p);
      const t = await waitFor(async () => { const s = await phStatus(p); return s && s.state === 'done'; }, 180000);
      const before = await cacheStat(p);
      check('the P2 build saved every photo first', t >= 0, before);
      let swapped = false;
      await p.evaluate(() => { window.__cc = 0; navigator.serviceWorker.addEventListener('controllerchange', () => { window.__cc++; }); });
      await ctl('swalt=1');
      await update(p);
      swapped = await waitFor(() => p.evaluate(() => window.__cc > 0), 20000) >= 0;
      const fillAnswer = await p.evaluate(async () => { const r = await fetch('img/knot-pusher.jpg?fill=1'); return { status: r.status, stored: r.headers.get('x-tbx-stored') }; });
      check('the emergency worker takes over without a tap', swapped && fillAnswer.stored === null, { controllerchange: swapped, fillAnswer });
      await ctl('offline=1'); NET_OFF = true;
      const e0 = ERRS.length, q = await page(ctx);
      await q.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
      const home = await q.waitForFunction(() => document.documentElement.classList.contains('authed') && document.getElementById('content').innerHTML.length > 100, null, { timeout: 30000 }).then(() => true, () => false);
      check('offline launch opens Home under the emergency worker', home && !ERRS.slice(e0).filter(m => !NETERR.test(m)).length, ERRS.slice(e0));
      const audit = await photoAudit(q, newList);
      check('every photo still opens offline', audit.ok === newList.length, audit.ok + '/' + newList.length);
      const after = await q.evaluate(() => caches.keys());
      check('every cache kept', Object.keys(before).every(k => after.includes(k)), after);
      await ctx.close();
    }
  } catch (e) { check('harness ran', false, String(e && e.stack || e).slice(0, 500)); }
  R.pass = R.checks.length > 0 && R.checks.every(c => c.ok);
  console.log((R.pass ? 'ALL PASS' : 'FAILED') + ' — ' + SC + ' ' + (R.old ? R.old + ' → ' : '') + R.new + ' (' + ENGINE + ')');
  const out = arg('json', ''); if (out) fs.writeFileSync(out, JSON.stringify(R, null, 1));
  await b.close(); srv.kill();
  if (PV) fs.rmSync(PV.dir, { recursive: true, force: true });
  process.exit(R.pass ? 0 : 1);
})();
