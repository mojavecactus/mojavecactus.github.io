// Usage tracking + dashboard — the real bundle in jsdom with the usage hub faked.
// Covers: completely inert without TOOLBOX.usage; what each screen/card/search/scan/favorite/share/error records
// (and what it must not: CT/F&A screens by name only, nothing typed into forms); batching, the batch id resend
// after a lost reply, offline, app-hidden keepalive + saved queue, restore on the next launch; admin flag; the
// #/usage gate and dashboard rendered from real UCORE output; the 5-tap entry; no page errors.
//   cd tools/bo && npm i jsdom@24 (once; this suite borrows it) && APP_PW=<catalog pw> node ../usage/app-test.js
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [path.join(__dirname, '../bo/node_modules'), path.join(__dirname, '../cc-test/node_modules'), __dirname] }));
const fs = require('fs'); const crypto = require('crypto');
const U = require('./usage-core.js');
const R = path.resolve(__dirname, '../..');
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined && !ok ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HUB = 'https://script.google.com/macros/s/fake-usage/exec';
const BOURL = 'https://script.google.com/macros/s/fake-bo/exec';
const BOAPI = { ok: true, ver: 1, asOf: '2026-09-21', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: '',
  controlled: [{ sku: 'CAT02438', desc: 'FLOWPORT II CANNULA', seg: 'Hip Surgical Implants', line: 'FlowPort', msg: 'Limited to 60 days in inventory.', since: '2026-09-07' }],
  backorders: [{ sku: '3910500580', desc: 'DC GUIDE 1.4', seg: 'Shoulder Surgical Implants', line: 'ICONIX Instruments', since: '2026-09-21', clearDate: '2026-10-01', clearText: '', note: '' }],
  cleared: [] };

function decryptPayload(pw) {
  const P = JSON.parse(fs.readFileSync(R + '/payload.enc.json', 'utf8'));
  const key = crypto.pbkdf2Sync(pw, Buffer.from(P.salt, 'base64'), P.it, 32, 'sha256');
  const ct = Buffer.from(P.ct, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(P.iv, 'base64'));
  d.setAuthTag(ct.slice(-16));
  return Buffer.concat([d.update(ct.slice(0, -16)), d.final()]).toString();
}
const PAYLOAD = decryptPayload(process.env.APP_PW || '');

// A believable hub: stores every u_ev row through the real core, answers u_live / u_stats with the real core.
function Hub(opts) {
  opts = opts || {};
  const hub = { rows: [], batches: [], seen: {}, down: false, admin: {}, calls: [], akey: 'admin-key-123' };
  hub.handle = (b, now) => {
    if (b.action === 'u_ev') {
      if (b.key !== 'write-key') return { ok: false, err: 'key' };
      hub.batches.push(b);
      if (hub.seen[b.b]) return { ok: true, n: 0, dup: true };
      hub.seen[b.b] = 1;
      const r = U.rowsFromBatch(b, now); if (!r.ok) return r;
      hub.rows.push(...r.rows); if (+b.a === 1) hub.admin[b.d] = 1;
      return { ok: true, n: r.rows.length };
    }
    if (b.action === 'u_live' || b.action === 'u_stats') {
      if (b.key !== hub.akey) return { ok: false, err: 'key' };
      const excl = +b.incl === 1 ? {} : hub.admin, rows = hub.rows.concat(hub.extra || []);
      return b.action === 'u_live' ? U.live(rows, { now, excl }) : U.stats(rows, { now, days: +b.days || 7, excl });
    }
    return { ok: false, err: 'action' };
  };
  return hub;
}

async function boot(opts) {
  opts = opts || {};
  const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1];
  const html = fs.readFileSync(R + '/index.html', 'utf8').replace(/<script src="lib\/zxing-reader.js"><\/script>/, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/' + (opts.hash || '#/'), pretendToBeVisual: true });
  const w = dom.window; const errs = []; const calls = []; const hub = opts.hub || Hub();
  const UA = opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  Object.defineProperty(w.navigator, 'userAgent', { get: () => UA, configurable: true });
  const t0 = Date.now();
  w.addEventListener('error', e => errs.push(e.message));
  if (opts.storage) Object.keys(opts.storage).forEach(k => w.localStorage.setItem(k, opts.storage[k]));
  w.localStorage.setItem('tbx_tour_done', '1');
  let online = true;
  Object.defineProperty(w.navigator, 'onLine', { get: () => online, configurable: true });
  w.fetch = (url, o) => {
    const body = (() => { try { return o && o.body ? JSON.parse(o.body) : null; } catch (e) { return null; } })();
    calls.push({ url: String(url), body, t: Date.now() - t0, keepalive: !!(o && o.keepalive), hash: w.location.hash });
    if (String(url) === BOURL) return Promise.resolve({ ok: true, json: () => Promise.resolve(BOAPI), text: () => Promise.resolve(JSON.stringify(BOAPI)) });
    if (String(url) === HUB) {
      if (hub.down) return Promise.reject(new Error('net'));
      const out = hub.handle(body, Date.now());
      return Promise.resolve({ ok: true, json: () => Promise.resolve(out), text: () => Promise.resolve(JSON.stringify(out)) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}') });
  };
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} }; w.scrollTo = () => {};
  w.eval(PAYLOAD);
  if (opts.bo) w.TOOLBOX.bo = { url: BOURL, key: 'bo-key' }; else delete w.TOOLBOX.bo; // backorder hub only where a test asks for it
  if (!opts.noUsage) w.TOOLBOX.usage = { url: HUB, key: 'write-key' };
  if (!w.TextEncoder) { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; }
  w.eval(fs.readFileSync(R + '/lib/inflate.js', 'utf8'));
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(R + '/' + APP, 'utf8')); w.TBX_BOOT();
  await sleep(30);
  const go = async (h) => { w.location.hash = h; await sleep(40); };
  const $ = (s) => w.document.querySelector(s); const $$ = (s) => Array.from(w.document.querySelectorAll(s));
  const txt = (s) => { const e = $(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  const events = () => hub.batches.filter((b, i, a) => a.findIndex(x => x.b === b.b) === i).reduce((a, b) => a.concat(b.e), []);
  const setOnline = (v) => { online = v; };
  const setHidden = (v) => { Object.defineProperty(w.document, 'hidden', { get: () => v, configurable: true }); w.document.dispatchEvent(new w.Event('visibilitychange')); };
  const flush = async () => { w.TBX_DEV.usage.flush(false); await sleep(30); };
  return { w, errs, calls, hub, go, $, $$, txt, events, setOnline, setHidden, flush, dom };
}
const usageCalls = (t) => t.calls.filter(c => c.url === HUB);
const typeQ = async (t, v) => { const q = t.$('#q'); q.value = v; q.dispatchEvent(new t.w.Event('input')); await sleep(20); };

(async () => {
  if (!process.env.APP_PW) { console.log('set APP_PW'); process.exit(1); }

  // ---- 1. no config: nothing at all ----
  { const t = await boot({ noUsage: true });
    await t.go('#/pn/3910500580'); await typeQ(t, 'iconix'); await sleep(2200); t.w.TBX_DEV.usage.scan('3910500580'); await sleep(60);
    t.setHidden(true); await sleep(30); t.setHidden(false);
    const keys = Object.keys(t.w.localStorage).filter(k => /^tbx_u/.test(k));
    check('off: no usage config → no hub calls, nothing stored', usageCalls(t).length === 0 && keys.length === 0, { calls: usageCalls(t).length, keys });
    await t.go('#/usage');
    check('off: #/usage says it is not set up', /isn.t set up/.test(t.txt('#content')), t.txt('#content'));
    check('off: home footer has no Usage link', (await t.go('#/'), !t.$('.foot [data-go="#/usage"]')));
    check('off: no page errors', t.errs.length === 0, t.errs); }

  // ---- 2. boot, screens, cards ----
  { const t = await boot();
    check('boot: nothing sent on the render path', usageCalls(t).length === 0);
    await sleep(2700);
    const c1 = usageCalls(t);
    check('boot: first batch ~2.5 s after boot', c1.length === 1 && c1[0].t >= 2400, c1.map(c => c.t));
    const b = c1[0].body;
    check('boot: batch shape (action, key, 10-char device, 12-char batch id, admin 0)', b.action === 'u_ev' && b.key === 'write-key' && /^[a-z0-9]{10}$/.test(b.d) && /^[a-z0-9]{12}$/.test(b.b) && b.a === 0, b);
    check('boot: open event carries platform|mode|version', b.e[0][1] === 'open' && b.e[0][2] === 'boot' && b.e[0][3] === 'iPhone|web|4.142', b.e[0]);
    check('boot: home view recorded', b.e.some(e => e[1] === 'view' && e[2] === 'home'));
    check('boot: device id + session persisted', t.w.localStorage.getItem('tbx_uid') === b.d && JSON.parse(t.w.localStorage.getItem('tbx_usess')).id === b.e[0][4]);
    await t.go('#/pn/3910500580');
    await t.go('#/pn/279401100');        // leading zero optional → the card's own number
    await t.go('#/pn/CAT00227');         // retired number → redirected; only the current card counts
    await sleep(60);
    await t.go('#/pn/NOTAPART99');
    await t.go('#/cat/' + encodeURIComponent('Disposables'));
    await t.go('#/cc'); await t.go('#/team/buf/cc'); await t.go('#/fa2/use'); await t.go('#/bo'); await t.go('#/about');
    await sleep(40); await t.flush();
    const ev = t.events().filter(e => e[1] !== 'open');
    const cards = ev.filter(e => e[1] === 'card').map(e => e[2] + (e[3] ? ':' + e[3] : ''));
    check('cards: canonical numbers, retired number not double-counted, unknown flagged', JSON.stringify(cards) === JSON.stringify(['3910500580', '0279401100', 'CAT00229', 'NOTAPART99:missing']), cards);
    const views = ev.filter(e => e[1] === 'view').map(e => e[2]);
    check('views: category + CT/F&A by screen name only', ['home', 'cat/Disposables', 'cc', 'team/buf/cc', 'fa2/use', 'bo', 'about'].every(v => views.indexOf(v) > -1), views);
    check('views: every event carries the same session id', new Set(t.events().map(e => e[4])).size === 1);
    // variant chips swap the card in place (replaceState + route) — still a card view
    await t.go('#/pn/3911514610'); await sleep(30);
    const chip = t.$('.chip.link[data-go^="#/pn/"]');
    if (chip) {
      const want = decodeURIComponent(chip.getAttribute('data-go').replace('#/pn/', ''));
      chip.click(); await sleep(40); await t.flush();
      check('cards: in-place variant chip counts as a card view', t.events().some(e => e[1] === 'card' && e[2] === want), want);
    } else check('cards: (no variant chip on the sample card — skipped)', true);
    // re-render of the same route inside 1.5 s is not a second visit
    await t.flush(); const n0 = t.events().filter(e => e[1] === 'card').length;
    t.w.TBX_DEV.usage.route(); t.w.TBX_DEV.usage.route(); await t.flush();
    check('cards: immediate re-render not double-counted', t.events().filter(e => e[1] === 'card').length === n0);
    check('no page errors', t.errs.length === 0, t.errs); }

  // ---- 3. search, scan, favorite, share, error ----
  { const t = await boot(); await sleep(2700);
    await typeQ(t, 'n'); await typeQ(t, 'na'); await typeQ(t, 'nanotack'); await sleep(2200);
    await typeQ(t, 'zzqxvk'); await sleep(2200);
    await typeQ(t, 'iconix knot'); // then taps a result before the pause → committed on navigation
    const row = t.$('#content .rowitem[data-go^="#/pn/"]'); row.click(); await sleep(60);
    await typeQ(t, 'nanotack'); await sleep(2200);  // same term within a minute → not repeated
    await typeQ(t, 'x'); await sleep(2200);          // one character → ignored
    await t.flush();
    const s = t.events().filter(e => e[1] === 'search');
    check('search: only settled terms, with result counts', s.length === 3 && s[0][2] === 'nanotack' && +s[0][3] > 0 && s[1][2] === 'zzqxvk' && s[1][3] === '0' && s[2][2] === 'iconix knot' && +s[2][3] > 0, s);
    check('search: the tapped result follows as a card view', (() => { const i = t.events().findIndex(e => e[1] === 'search' && e[2] === 'iconix knot'); return i > -1 && t.events()[i + 1] && t.events()[i + 1][1] === 'card'; })());
    await t.go('#/');
    t.w.TBX_DEV.usage.scan('3910500580'); await sleep(80);
    check('scan: part-number barcode opens the card', t.w.location.hash === '#/pn/3910500580');
    t.w.TBX_DEV.usage.scan('CAT00227'); await sleep(80);
    t.w.TBX_DEV.usage.scanRecord({ sku: 'OLDPART77', p: {} }, 'OLDPART77');
    t.w.TBX_DEV.usage.scan('(01)00887868999990(17)270101(10)LOTX1'.replace(/[()]/g, '')); await sleep(60);
    t.w.TBX_DEV.usage.scan('ab'); await sleep(30);
    await t.flush();
    const sc = t.events().filter(e => e[1] === 'scan').map(e => e[2] + ':' + e[3]);
    check('scan: outcomes card / moved / nocard / unknown (junk ignored)', JSON.stringify(sc) === JSON.stringify(['3910500580:card', 'CAT00227:moved', 'OLDPART77:nocard', '00887868999990:unknown']), sc);
    await t.go('#/pn/3910500569'); await sleep(30);
    const fav = t.$('[data-fav]'); fav.click(); await sleep(20); fav.click(); await sleep(20);
    const shareBtn = t.$('[data-share]'); if (shareBtn) { shareBtn.click(); await sleep(20); const o = t.$('#share-sheet .shopt[data-sh="copy"]'); if (o) o.click(); await sleep(30); }
    t.w.dispatchEvent(new t.w.ErrorEvent('error', { message: 'Test boom', filename: 'https://sportsmedtoolbox.com/app-4.142.js?v=1', lineno: 42 }));
    t.w.dispatchEvent(new t.w.ErrorEvent('error', { message: 'Test boom', filename: 'x', lineno: 1 })); // same message: once
    await t.flush();
    const f = t.events().filter(e => e[1] === 'fav').map(e => e[2] + ':' + e[3]);
    check('favorite: on then off', JSON.stringify(f) === JSON.stringify(['3910500569:on', '3910500569:off']), f);
    const sh = t.events().filter(e => e[1] === 'share').map(e => e[2] + ':' + e[3]);
    check('share: card + method', JSON.stringify(sh) === JSON.stringify(['3910500569:copy']), sh);
    const er = t.events().filter(e => e[1] === 'error');
    check('error: message + file:line, repeats collapsed', er.length === 1 && er[0][2] === 'Test boom' && er[0][3] === 'app-4.142.js:42', er);
    check('no page errors besides the test ones', t.errs.filter(m => m !== 'Test boom').length === 0, t.errs); }

  // ---- 4. delivery: lost reply, offline, hidden, restore ----
  { const t = await boot(); await sleep(2700);
    t.hub.down = true; await t.go('#/pn/3910500580'); await t.flush();
    const lost = usageCalls(t).slice(-1)[0].body.b;
    check('delivery: failed send keeps the batch (nothing lost)', t.w.TBX_DEV.usage.UG.fly && t.w.TBX_DEV.usage.UG.fly.b === lost);
    t.hub.down = false; await t.go('#/about'); await t.flush();
    const after = usageCalls(t).slice(-1)[0].body;
    check('delivery: retry resends the SAME batch id first', after.b === lost && after.e.some(e => e[2] === '3910500580'), after.b + ' vs ' + lost);
    await t.flush();
    check('delivery: newer events follow in the next batch', t.events().some(e => e[2] === 'about') && !t.w.TBX_DEV.usage.UG.fly);
    const nBefore = usageCalls(t).length;
    t.setOnline(false); await t.go('#/bo'); await t.flush();
    check('delivery: offline → no request', usageCalls(t).length === nBefore);
    t.setOnline(true); t.w.dispatchEvent(new t.w.Event('online')); await sleep(1700);
    check('delivery: back online → sent', t.events().some(e => e[2] === 'bo'));
    await t.go('#/cat/Suture');
    t.setHidden(true); await sleep(40);
    const ka = usageCalls(t).slice(-1)[0];
    check('delivery: app hidden → keepalive send', ka.keepalive && ka.body.e.some(e => e[2] === 'cat/Suture'), ka.keepalive);
    check('delivery: app hidden → queue saved (until confirmed)', t.w.localStorage.getItem('tbx_uq') !== null);
    t.setHidden(false); await sleep(20);
    check('delivery: back in front → saved copy dropped (memory is the truth)', t.w.localStorage.getItem('tbx_uq') === null);
    check('no page errors', t.errs.length === 0, t.errs); }
  { // a batch saved at close is resent with its id on the next launch
    const hub = Hub();
    const saved = JSON.stringify({ q: [[Date.now() - 5000, 'view', 'bo', '', 'abcd1234']], fly: { b: 'savedbatch01', e: [[Date.now() - 6000, 'card', '3910500580', '', 'abcd1234']] } });
    const t = await boot({ hub, storage: { tbx_uq: saved, tbx_uid: 'devicex001' } }); await sleep(2700); await t.flush(); await t.flush();
    const bs = usageCalls(t).map(c => c.body);
    check('restore: saved in-flight batch resent first with its id', bs[0].b === 'savedbatch01' && bs[0].d === 'devicex001', bs[0]);
    check('restore: saved queue + new events follow', t.events().some(e => e[2] === 'bo') && t.events().some(e => e[1] === 'open'));
    check('restore: saved copy removed at boot', t.w.localStorage.getItem('tbx_uq') === null); }
  { // session rolls over after 30 idle minutes; admin devices are flagged
    const t = await boot({ storage: { tbx_usess: JSON.stringify({ id: 'oldsess1', at: Date.now() - 31 * 60000 }), tbx_uadm: 'admin-key-123' } }); await sleep(2700);
    const b = usageCalls(t)[0].body;
    check('session: stale session replaced', b.e[0][4] !== 'oldsess1' && /^[a-z0-9]{8}$/.test(b.e[0][4]));
    check('admin: device with the key is flagged a=1', b.a === 1);
    check('admin: home footer shows the Usage link', !!t.$('.foot [data-go="#/usage"]')); }

  // ---- 5. dashboard ----
  { const hub = Hub(); const now = Date.now(), t0 = U.etDayStart(now), iso = (ms) => new Date(Math.min(ms, now)).toISOString();
    const early = Math.max(t0 + 60000, now - 3 * 3600000);
    hub.extra = [
      [iso(early), 'aaaaaaaaaa', 'sa', 'open', 'boot', 'iPhone|app|4.142'], [iso(early + 1000), 'aaaaaaaaaa', 'sa', 'card', '3910500580', ''],
      [iso(early + 2000), 'aaaaaaaaaa', 'sa', 'search', 'zzkx', '0'], [iso(early + 3000), 'aaaaaaaaaa', 'sa', 'scan', '234020123', 'nocard'],
      [iso(now - 120000), 'bbbbbbbbbb', 'sb', 'open', 'boot', 'Android|web|4.141'], [iso(now - 60000), 'bbbbbbbbbb', 'sb', 'card', '3910500569', ''],
      [iso(now - 30000), 'bbbbbbbbbb', 'sb', 'search', 'nanotack', '12']
    ];
    const t = await boot({ hub }); await sleep(2700);
    await t.go('#/'); const v = t.$('.foot [data-ugtap]');
    check('entry: version number is tappable, no Usage link without the key', !!v && !t.$('.foot [data-go="#/usage"]'));
    for (let i = 0; i < 5; i++) v.click();
    await sleep(60);
    check('entry: five taps open #/usage', t.w.location.hash === '#/usage');
    check('gate: asks for the admin key', !!t.$('#ug-key') && /admin key/i.test(t.txt('#content')));
    t.$('#ug-key').value = 'wrong'; t.$('#ug-go').click(); await sleep(60);
    check('gate: wrong key refused, nothing saved', /didn.t work/.test(t.txt('#ug-gmsg')) && !t.w.localStorage.getItem('tbx_uadm'));
    t.$('#ug-key').value = 'admin-key-123'; t.$('#ug-go').click(); await sleep(200);
    check('gate: right key saved on the device', t.w.localStorage.getItem('tbx_uadm') === 'admin-key-123');
    const hero = t.txt('.ug-hero');
    check('dashboard: hero = people using it now', /^\d+\s*(person|people) using it right now/.test(hero), hero);
    check('dashboard: today tiles', t.$$('#ug-livebody .ug-tile').length === 6 && /People\s*\d/.test(t.txt('#ug-livebody .ug-tiles')), t.txt('#ug-livebody .ug-tiles'));
    check('dashboard: 24 hour columns, future hours empty, current hour highlighted', t.$$('#ug-livebody .ug-col').length === 24 && t.$$('#ug-livebody .ug-col.hi').length === 1 && t.$$('#ug-livebody .ug-col.none').length === 23 - U.etHour(now));
    check('dashboard: hour table view present', t.$$('#ug-livebody .ug-tbl tbody tr').length === U.etHour(now) + 1);
    const feed = t.$$('#ug-feed .ug-ev');
    check('dashboard: feed newest first with card titles + tap-through', feed.length >= 7 && /searched “nanotack”/.test(feed.filter(e => !/This device/.test(e.textContent))[0].textContent) && t.$$('#ug-feed button.ug-ev[data-go="#/pn/3910500569"]').length === 1 && /Iconix 2\.3mm disposable drill/.test(t.txt('#ug-feed')), feed.slice(0, 3).map(e => e.textContent));
    check('dashboard: zero-result search flagged in the feed', /no results/i.test(t.txt('#ug-feed')));
    check('dashboard: period report (7 days) with lists', /Most opened cards/.test(t.txt('#ug-period')) && /Searches that found nothing/.test(t.txt('#ug-period')) && /“zzkx”/.test(t.txt('#ug-period')), t.txt('#ug-period').slice(0, 300));
    check('dashboard: 7 daily columns + table', t.$$('#ug-period .ug-col').length === 7 && t.$$('#ug-period .ug-tbl tbody tr').length === 7);
    check('dashboard: scans breakdown lists the no-card part', /234020123/.test(t.txt('#ug-period')) && /Part number with no card\s*1/.test(t.txt('#ug-period')));
    check('dashboard: phones & versions', /iPhone app/.test(t.txt('#ug-period')) && /Android browser/.test(t.txt('#ug-period')) && /App v4\.142\s*current/i.test(t.txt('#ug-period')));
    t.$('[data-ug-days="30"]').click(); await sleep(120);
    const last = usageCalls(t).filter(c => c.body.action === 'u_stats').slice(-1)[0];
    check('filters: 30 days asks the hub for 30 and redraws', last && last.body.days === 30 && t.$$('#ug-period .ug-col').length === 30 && t.$('[data-ug-days="30"]').classList.contains('on'));
    t.$('[data-ug-days="1"]').click(); await sleep(120);
    check('filters: Today has no one-bar daily chart', t.$$('#ug-period .ug-col').length === 0 && /Today/.test(t.txt('#ug-period .ug-sub')));
    const inc = t.$('#ug-incl'); inc.checked = true; inc.dispatchEvent(new t.w.Event('change', { bubbles: true })); await sleep(150);
    const incl = usageCalls(t).filter(c => c.body.action && c.body.action.indexOf('u_') === 0 && c.body.action !== 'u_ev').slice(-2);
    check('filters: include my devices → incl=1 on live + stats', incl.length === 2 && incl.every(c => c.body.incl === 1), incl.map(c => c.body));
    check('filters: with my devices included, this phone shows as "This device"', /This device/.test(t.txt('#ug-feed')), (t.txt('#ug-feed') || '').slice(0, 200));
    const col = t.$('#ug-livebody .ug-col.hi'); col.click(); await sleep(20);
    check('chart: tap shows the exact value', !t.$('#ug-livebody .ug-tip').hidden && /people|person/.test(t.txt('#ug-livebody .ug-tip')), t.txt('#ug-livebody .ug-tip'));
    const feedBtn = t.$('#ug-feed button.ug-ev[data-go]'); feedBtn.click(); await sleep(60);
    check('feed: tapping a card row opens the card', /^#\/pn\//.test(t.w.location.hash));
    await t.go('#/usage'); await sleep(60);
    check('dashboard: reopens straight into the dashboard (key remembered)', !!t.$('.ug-hero'));
    t.$('#ug-forget').click(); await sleep(30);
    check('forget: key removed, gate back', !t.w.localStorage.getItem('tbx_uadm') && !!t.$('#ug-key'));
    const uev = t.events();
    check('dashboard: the admin screen itself is never recorded', !uev.some(e => e[2] === 'usage'));
    check('no page errors', t.errs.length === 0, t.errs); }

  // ---- 6. coexistence with the Backorder Report (same hub URL family, both on) ----
  { const t = await boot({ bo: true }); await sleep(2800);
    check('coexist: backorder tile + counts still paint', !!t.$('.tile-bo') && /1 on backorder/.test(t.txt('.tile-bo .n')), t.txt('.tile-bo .n'));
    await t.go('#/bo'); await sleep(40);
    check('coexist: #/bo still renders its sections', t.$$('.bo-gh').length === 3, t.$$('.bo-gh').length);
    await t.go('#/pn/3910500580'); await sleep(30); await t.flush();
    check('coexist: backorder banner on the card', /backorder/i.test(t.txt('#content')));
    check('coexist: usage records the report screen and the card', t.events().some(e => e[1] === 'view' && e[2] === 'bo') && t.events().some(e => e[1] === 'card' && e[2] === '3910500580'));
    check('coexist: backorder fetch went to its own hub, usage to its own', t.calls.some(c => c.url === BOURL && c.body.action === 'bo') && usageCalls(t).every(c => c.body.action === 'u_ev'));
    check('no page errors', t.errs.length === 0, t.errs); }

  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
