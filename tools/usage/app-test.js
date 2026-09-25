// Usage tracking + dashboard — the real bundle in jsdom with the usage hub faked.
// Covers: completely inert without TOOLBOX.usage; what each screen/card/search/scan/favorite/share/error records
// (and what it must not: CT/F&A screens by name only, nothing typed into forms); batching, the batch id resend
// after a lost reply, offline, app-hidden keepalive + saved queue, restore on the next launch; admin flag; the
// #/usage gate and dashboard rendered from real UCORE output; the 5-tap entry; no page errors; real people only
// (automated / test browsers, "Don't count this device", machine-speed navigation record nothing).
//   cd tools/bo && npm i jsdom@24 (once; this suite borrows it) && APP_PW=<catalog pw> node ../usage/app-test.js
const path = require('path');
const { JSDOM, VirtualConsole } = require(require.resolve('jsdom', { paths: [path.join(__dirname, '../bo/node_modules'), path.join(__dirname, '../cc-test/node_modules'), __dirname] }));
const fs = require('fs');
const U = require('./usage-core.js');
const R = path.resolve(__dirname, '../..');
// the bundle version under test (app-<ver>.js in index.html), so a version bump doesn't need test edits
const VER = /app-([\d.]+)\.js/.exec(/<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1])[1];
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined && !ok ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HUB = 'https://script.google.com/macros/s/fake-usage/exec';
const BOURL = 'https://script.google.com/macros/s/fake-bo/exec';
const BOAPI = { ok: true, ver: 1, asOf: '2026-09-21', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: '',
  controlled: [{ sku: 'CAT02438', desc: 'FLOWPORT II CANNULA', seg: 'Hip Surgical Implants', line: 'FlowPort', msg: 'Limited to 60 days in inventory.', since: '2026-09-07' }],
  backorders: [{ sku: '3910500580', desc: 'DC GUIDE 1.4', seg: 'Shoulder Surgical Implants', line: 'ICONIX Instruments', since: '2026-09-21', clearDate: '2026-10-01', clearText: '', note: '' }],
  cleared: [] };

// the catalog payload as a script for w.eval — either envelope format (tools/payload-lib.cjs)
const PAYLOAD = require(R + '/tools/payload-lib.cjs').payloadScript(R, process.env.APP_PW || '');

// A believable hub: stores every u_ev row through the real core, answers u_live / u_stats with the real core.
// v2 (N9) also answers u_queue / u_mark like Usage.gs does (review statuses merged per request). The default is the
// hub that is live today (no u_queue → err 'action'); UHUB=new runs sections 1–6 against the new one instead.
function Hub(opts) {
  opts = opts || {};
  const v2 = opts.v2 !== undefined ? !!opts.v2 : process.env.UHUB === 'new';
  const hub = { rows: [], batches: [], seen: {}, down: false, admin: {}, calls: [], akey: 'admin-key-123', v2, review: {}, marks: [] };
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
    if (hub.v2 && b.action === 'u_queue') {
      if (b.key !== hub.akey) return { ok: false, err: 'key' };
      if (hub.qdown) return { ok: false, err: 'server' };
      const excl = +b.incl === 1 ? {} : hub.admin;
      return U.mergeReview(U.queue(hub.rows.concat(hub.extra || []), { now, days: +b.days || 30, excl }), JSON.parse(JSON.stringify(hub.review)));
    }
    if (hub.v2 && b.action === 'u_mark') {
      if (b.key !== hub.akey) return { ok: false, err: 'key' };
      if (hub.markDown) return { ok: false, err: 'busy' };
      if (!U.QTYPES.hasOwnProperty(b.t)) return { ok: false, err: 'type' };
      if (!U.QST.hasOwnProperty(b.st)) return { ok: false, err: 'status' };
      const k = U.qKey(b.t, b.k); if (!k) return { ok: false, err: 'bad' };
      const prev = hub.review[b.t + '\t' + k], at = new Date(now).toISOString();
      const note = b.note == null ? (prev ? prev.note : '') : U.clean(b.note, 140);
      hub.review[b.t + '\t' + k] = { st: b.st, note, at }; hub.marks.push({ t: b.t, k, st: b.st, note, sent: b.note });
      return { ok: true, t: b.t, k, st: b.st, note, at };
    }
    return { ok: false, err: 'action' };
  };
  return hub;
}
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; };

async function boot(opts) {
  opts = opts || {};
  const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1];
  const html = fs.readFileSync(R + '/index.html', 'utf8').replace(/<script src="lib\/zxing-reader.js"><\/script>/, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true }); // a mailto: hand-off (P45 email fallback) is not an error here
  vc.on('jsdomError', (e) => { if (!/Not implemented: navigation/.test(e.message)) console.error(e); });
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/' + (opts.hash || '#/'), pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window; const errs = []; const calls = []; const hub = opts.hub || Hub();
  const UA = opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  Object.defineProperty(w.navigator, 'userAgent', { get: () => UA, configurable: true });
  if (opts.webdriver !== undefined) Object.defineProperty(w.navigator, 'webdriver', { get: () => opts.webdriver, configurable: true });
  if (opts.platform !== undefined) Object.defineProperty(w.navigator, 'platform', { get: () => opts.platform, configurable: true });
  if (opts.globals) Object.keys(opts.globals).forEach(k => { w[k] = opts.globals[k]; });
  const t0 = Date.now();
  w.addEventListener('error', e => errs.push(e.message));
  if (opts.storage) Object.keys(opts.storage).forEach(k => w.localStorage.setItem(k, opts.storage[k]));
  w.localStorage.setItem('tbx_tour_done', '1');
  let online = true;
  Object.defineProperty(w.navigator, 'onLine', { get: () => online, configurable: true });
  w.fetch = (url, o) => {
    const body = (() => { try { return o && o.body ? JSON.parse(o.body) : null; } catch (e) { return null; } })();
    calls.push({ url: String(url), body, t: Date.now() - t0, keepalive: !!(o && o.keepalive), hash: w.location.hash });
    if (opts.relay && body && body.token !== undefined && body.note !== undefined) { // the feedback relay (P45)
      const r = opts.relay(body);
      if (r === 'down') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(r), json: () => Promise.resolve({}) });
    }
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
  if (opts.noUsage) delete w.TOOLBOX.usage; else w.TOOLBOX.usage = { url: HUB, key: 'write-key' }; // the live payload carries the real hub
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
    check('boot: open event carries platform|mode|version', b.e[0][1] === 'open' && b.e[0][2] === 'boot' && b.e[0][3] === 'iPhone|web|' + VER, b.e[0]);
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
      [iso(early), 'aaaaaaaaaa', 'sa', 'open', 'boot', 'iPhone|app|' + VER], [iso(early + 1000), 'aaaaaaaaaa', 'sa', 'card', '3910500580', ''],
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
    check('dashboard: phones & versions', /iPhone app/.test(t.txt('#ug-period')) && /Android browser/.test(t.txt('#ug-period')) && new RegExp('App v' + VER.replace(/\./g, '\\.') + '\\s*current', 'i').test(t.txt('#ug-period')));
    await until(() => /To review/.test(t.txt('#ug-rq') || '') && !/Loading/.test(t.txt('#ug-rq')), 3000);
    if (!hub.v2) check('review queue (hub without u_queue): one quiet line, the rest of the dashboard works', /^To review\s*The review list needs the usage-hub update\.$/.test(t.txt('#ug-rq')) && !t.$('#ug-rq .ug-rqr, #ug-rq [data-rq-tab]') && !!t.$('.ug-hero') && t.$$('#ug-period .ug-col').length === 7, t.txt('#ug-rq'));
    else check('review queue (new hub): "To review" lists the no-result search and the no-card part', t.$$('#ug-rq [data-rq-tab]').length === 3 && /“zzkx”/.test(t.txt('#ug-rq')) && /Missing cards\s*1/.test(t.txt('#ug-rq')), t.txt('#ug-rq'));
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
    // P6: a catalog search typed over the dashboard and then cleared redraws it for real (it came back as an empty shell)
    await typeQ(t, 'iconix'); await typeQ(t, ''); await sleep(200);
    const nLive = usageCalls(t).filter(c => c.body.action === 'u_live').length; t.$('#ug-rf').click(); await sleep(200);
    check('dashboard: clearing the search box redraws it and ↻ still works (P6)', !!t.$('.ug-hero') && t.$$('#ug-livebody .ug-tile').length === 6 && usageCalls(t).filter(c => c.body.action === 'u_live').length > nLive, t.txt('#content').slice(0, 160));
    t.$('#ug-forget').click(); await sleep(30);
    check('forget: key removed, gate back', !t.w.localStorage.getItem('tbx_uadm') && !!t.$('#ug-key'));
    const uev = t.events();
    check('dashboard: the admin screen itself is never recorded', !uev.some(e => e[2] === 'usage'));
    check('no page errors', t.errs.length === 0, t.errs); }

  // ---- 6. coexistence with the Backorder Report (same hub URL family, both on) ----
  { const t = await boot({ bo: true }); await sleep(2800);
    check('coexist: backorder tile + counts still paint', !!t.$('.tile-bo') && t.txt('.tile-bo .n') === '1 product', t.txt('.tile-bo .n'));
    await t.go('#/bo'); await sleep(40);
    check('coexist: #/bo still renders its sections', t.$$('.bo-gh').length === 3, t.$$('.bo-gh').length);
    await t.go('#/pn/3910500580'); await sleep(30); await t.flush();
    check('coexist: backorder banner on the card', /backorder/i.test(t.txt('#content')));
    check('coexist: usage records the report screen and the card', t.events().some(e => e[1] === 'view' && e[2] === 'bo') && t.events().some(e => e[1] === 'card' && e[2] === '3910500580'));
    check('coexist: backorder fetch went to its own hub, usage to its own', t.calls.some(c => c.url === BOURL && c.body.action === 'bo') && usageCalls(t).every(c => c.body.action === 'u_ev'));
    check('no page errors', t.errs.length === 0, t.errs); }

  // ---- 7. N9 "To review" against the new hub (u_queue / u_mark answered by the real core) ----
  { const hub = Hub({ v2: true }); const now = Date.now(), H = 3600000, iso = (ms) => new Date(Math.min(ms, now)).toISOString();
    const XSS = '<img src=x onerror=alert(1)>"\'';
    hub.extra = [
      [iso(now - 5 * H), 'aaaaaaaaaa', 'sa', 'search', 'tightrope', '0'], [iso(now - 4 * H), 'bbbbbbbbbb', 'sb', 'search', 'tightrope', '0'],
      [iso(now - 3 * H), 'bbbbbbbbbb', 'sb', 'search', 'TightRope', '0'],                     // case variant: the same term
      [iso(now - 2 * H), 'aaaaaaaaaa', 'sa', 'search', 'zzkx', '0'], [iso(now - 2 * H + 1000), 'aaaaaaaaaa', 'sa', 'search', XSS, '0'],
      [iso(now - 100 * 60000), 'dddddddddd', 'sd', 'search', 'alphavent', '0'],               // an older phone missed it; this catalog finds it
      [iso(now - 90 * 60000), 'dddddddddd', 'sd', 'search', 'nanotack', '0'],                 // done earlier, asked again, but found now
      [iso(now - 80 * 60000), 'aaaaaaaaaa', 'sa', 'scan', '00887868123456', 'unknown'],
      [iso(now - 70 * 60000), 'aaaaaaaaaa', 'sa', 'scan', '0234020123', 'nocard'], [iso(now - 60 * 60000), 'bbbbbbbbbb', 'sb', 'card', '234-020-123', 'missing'],
      [iso(now - 50 * 60000), 'bbbbbbbbbb', 'sb', 'card', 'NOTAPART99', 'missing']
    ];
    hub.review = { 'search\tzzkx': { st: 'done', note: 'alias added', at: iso(now - 3 * H) }, 'search\tnanotack': { st: 'done', note: '', at: iso(now - 3 * H) } };
    const t = await boot({ hub, storage: { tbx_uadm: 'admin-key-123' } }); await sleep(2700);
    const clip = []; Object.defineProperty(t.w.navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { clip.push(s); return Promise.resolve(); } } });
    await t.go('#/usage');
    await until(() => /Now finds/i.test(t.txt('#ug-rq') || ''), 6000);
    const rq = t.$('#ug-rq'), rows = () => t.$$('#ug-rq .ug-rqr'), row = (re) => rows().find(r => re.test(r.querySelector('.ug-rqm').textContent));
    const chip = (k) => (t.$('#ug-rq [data-rq-tab="' + k + '"]') || { textContent: '' }).textContent.replace(/\s+/g, '');
    const qc = usageCalls(t).filter(c => c.body.action === 'u_queue'), sc = usageCalls(t).filter(c => c.body.action === 'u_stats');
    check('N9: "To review" sits right under the Live card, before Latest activity', rq && rq.previousElementSibling.classList.contains('ug-live') && /Latest activity/.test(rq.nextElementSibling.textContent));
    check('N9: u_queue asks for 30 days with the "Include my devices" flag, after the period report', qc.length >= 1 && qc[0].body.days === 30 && qc[0].body.incl === 0 && sc.length && sc[0].t <= qc[0].t, qc.map(c => c.body));
    check('N9: three lists with open counts — Searches 4 · Barcodes 1 · Missing cards 2', chip('search') === 'Searches4' && chip('barcode') === 'Barcodes1' && chip('part') === 'Missingcards2', [chip('search'), chip('barcode'), chip('part')]);
    const r0 = rows()[0];
    check('N9: most people first; the row says who, how often, how recently', /“tightrope”/.test(r0.textContent) && /2 people · 3 tries · last 3h ago/.test(r0.textContent), r0.textContent);
    const xr = row(/onerror/);
    check('N9: hub text is escaped — no <img> in the card, the literal text shows, Copy carries the raw string', !t.$('#ug-rq img') && xr && xr.textContent.indexOf(XSS) > -1 && xr.querySelector('[data-copy]').getAttribute('data-copy') === XSS);
    const av = row(/alphavent/);
    check('N9: an open term this catalog answers now shows NOW FINDS n', av && /Now finds \d+/.test(av.querySelector('.ug-pill.ok').textContent), av && av.textContent);
    const zz = row(/zzkx/);
    check('N9: done, then asked again → BACK, "done … — asked again since" and the note', zz && /Back/.test(zz.querySelector('.ug-pill.warn').textContent) && /asked again since/.test(zz.textContent) && /“alias added”/.test(zz.textContent), zz && zz.textContent);
    check('N9: done + back but this catalog answers it now → stays closed', !row(/nanotack/));
    check('N9: Search it / Copy / Done / Ignore / Note on a search row', ['go', 'done', 'ignore', 'note'].every(a => r0.querySelector('[data-rq-act="' + a + '"]')) && !!r0.querySelector('[data-copy]'));
    await t.flush(); const evN = t.events().length;
    r0.querySelector('[data-rq-act="go"]').click(); await sleep(250);
    check('N9: Search it runs the term in the catalog search', t.w.location.hash === '#/?q=tightrope' && /No matches for “tightrope”/.test(t.txt('#content')), t.w.location.hash + ' ' + t.txt('#content').slice(0, 100));
    t.w.history.back(); await sleep(400);
    if (t.w.location.hash !== '#/usage') { await t.go('#/usage'); await sleep(200); }
    check('N9: Back returns to a working dashboard with the list', t.w.location.hash === '#/usage' && rows().length === 4 && !!t.$('.ug-hero'), t.w.location.hash);
    await t.flush(); const after = t.events().slice(evN);
    check('N9: Search it logs nothing (no search event, no screen view)', !after.some(e => e[1] === 'search' || (e[1] === 'view' && e[2] === 'home')), after);
    rows()[0].querySelector('[data-copy]').click(); await sleep(60);
    check('N9: Copy puts the exact term on the clipboard', clip[clip.length - 1] === 'tightrope', clip);
    const m0 = hub.marks.length;
    row(/tightrope/).querySelector('[data-rq-act="done"]').click(); await sleep(200);
    check('N9: Done → u_mark {search, tightrope, done}; the row leaves and the chip drops to 3', hub.marks.length === m0 + 1 && hub.marks[m0].t === 'search' && hub.marks[m0].k === 'tightrope' && hub.marks[m0].st === 'done' && !row(/tightrope/) && chip('search') === 'Searches3', [hub.marks.slice(m0), chip('search')]);
    await until(() => /Marked done/.test(t.txt('#toast')) && t.$('#toast button'), 4000);
    check('N9: toast "Marked done" with Undo', /Marked done/.test(t.txt('#toast')) && /Undo/.test((t.$('#toast button') || {}).textContent || ''), t.txt('#toast'));
    t.$('#toast button').click(); await sleep(200);
    check('N9: Undo → u_mark todo and the row is back', hub.marks.length === m0 + 2 && hub.marks[m0 + 1].st === 'todo' && hub.marks[m0 + 1].k === 'tightrope' && !!row(/tightrope/) && chip('search') === 'Searches4', hub.marks.slice(m0));
    row(/zzkx/).querySelector('[data-rq-act="ignore"]').click(); await sleep(200);
    check('N9: Ignore hides the row (u_mark ignore)', !row(/zzkx/) && hub.review['search\tzzkx'].st === 'ignore' && chip('search') === 'Searches3');
    const tg = t.$('#ug-rqall'); tg.checked = true; tg.dispatchEvent(new t.w.Event('change', { bubbles: true })); await sleep(120);
    const zi = row(/zzkx/), ni = row(/nanotack/);
    check('N9: "Show done & ignored" lists them dimmed: IGNORED + Reopen, and the answered one with NOW FINDS', /Show done & ignored \(2\)/.test(t.txt('#ug-rq')) && zi && zi.classList.contains('closed') && /Ignored/.test(zi.textContent) && !!zi.querySelector('[data-rq-act="reopen"]') && ni && /Now finds \d+/.test(ni.textContent) && /Done/.test(ni.querySelector('.ug-pill:not(.ok)').textContent), t.txt('#ug-rq').slice(0, 300));
    zi.querySelector('[data-rq-act="reopen"]').click(); await sleep(200);
    check('N9: Reopen → u_mark todo, the row is open again', hub.marks.slice(-1)[0].st === 'todo' && hub.marks.slice(-1)[0].k === 'zzkx' && row(/zzkx/) && !row(/zzkx/).classList.contains('closed'));
    const tg2 = t.$('#ug-rqall'); if (tg2) { tg2.checked = false; tg2.dispatchEvent(new t.w.Event('change', { bubbles: true })); await sleep(80); }
    row(/tightrope/).querySelector('[data-rq-act="note"]').click(); await sleep(60);
    const inp = t.$('#ug-rqnote');
    check('N9: Note opens an inline field (≤140 chars) with the keyboard focus', inp && inp.maxLength === 140 && t.w.document.activeElement === inp);
    const NOTE = '<b>alias</b> "tr" in 4.144';
    inp.value = NOTE; row(/tightrope/).querySelector('[data-rq-act="save"]').click(); await sleep(200);
    const lm = hub.marks.slice(-1)[0], tr = row(/tightrope/);
    check('N9: Save → u_mark with the note (the row stays open) and the note shows escaped', lm.k === 'tightrope' && lm.sent === NOTE && lm.st === 'todo' && tr && tr.textContent.indexOf('“' + NOTE + '”') > -1 && !tr.querySelector('.ug-rqs b') && /Edit note/.test(tr.textContent), [lm, tr && tr.textContent]);
    row(/tightrope/).querySelector('[data-rq-act="note"]').click(); await sleep(40);
    row(/alphavent/).querySelector('[data-rq-act="ignore"]').click(); await sleep(200);
    check('N9: another tap closes an open note field (and still does its job)', !t.$('#ug-rqnote') && hub.marks.slice(-1)[0].k === 'alphavent' && hub.marks.slice(-1)[0].st === 'ignore' && !row(/alphavent/), hub.marks.slice(-1));
    t.$('#ug-rq [data-rq-tab="barcode"]').click(); await sleep(80);
    const br = rows();
    check('N9: Barcodes: the unknown GTIN, 1 scan; Copy/Done/Ignore/Note — no Search it, no teach', br.length === 1 && /00887868123456/.test(br[0].textContent) && /1 person · 1 scan/.test(br[0].textContent) && !br[0].querySelector('[data-rq-act="go"]') && !/teach/i.test(t.txt('#ug-rq')));
    t.$('#ug-rq [data-rq-act="gtins"]').click(); await sleep(60);
    check('N9: "Copy GTINs for the FDA lookup" copies ["00887868123456"]', clip[clip.length - 1] === '["00887868123456"]', clip.slice(-1));
    t.$('#ug-rq [data-rq-tab="part"]').click(); await sleep(80);
    const pr = rows(), p0 = row(/234-020-123/);
    check('N9: Missing cards merges a no-card scan and a missing-card link', pr.length === 2 && p0 && /2 people · scanned 1 · from a link 1/.test(p0.textContent) && !!row(/NOTAPART99/), pr.map(r => r.textContent));
    p0.querySelector('[data-rq-act="go"]').click(); await sleep(250);
    check('N9: Search it on a part number', t.w.location.hash === '#/?q=' + encodeURIComponent('234-020-123'), t.w.location.hash);
    await t.go('#/usage'); await sleep(150);
    check('N9: the chosen list is kept when coming back', /Missingcards/.test(t.$('#ug-rq .ug-chip.on').textContent.replace(/\s+/g, '')));
    t.$('#ug-rq [data-rq-tab="search"]').click(); await sleep(60);
    hub.markDown = true;
    const ft = rows()[0].querySelector('.ug-rqm').textContent;
    rows()[0].querySelector('[data-rq-act="done"]').click(); await sleep(120);
    const gone = !rows().some(r => r.querySelector('.ug-rqm').textContent === ft);
    await until(() => /Couldn’t save/.test(t.txt('#toast')), 5000);
    check('N9: a mark the hub can\'t take (busy, then busy again) puts the row back and says so', gone && rows().some(r => r.querySelector('.ug-rqm').textContent === ft) && /Couldn’t save — check your signal/.test(t.txt('#toast')), [gone, t.txt('#toast')]);
    hub.markDown = false;
    const inc = t.$('#ug-incl'); inc.checked = true; inc.dispatchEvent(new t.w.Event('change', { bubbles: true }));
    await until(() => usageCalls(t).filter(c => c.body.action === 'u_queue').slice(-1)[0].body.incl === 1, 3000);
    check('N9: the list follows "Include my devices" (u_queue incl=1)', usageCalls(t).filter(c => c.body.action === 'u_queue').slice(-1)[0].body.incl === 1);
    await sleep(300); const nq = usageCalls(t).filter(c => c.body.action === 'u_queue').length;
    t.$('#ug-rf').click(); await until(() => usageCalls(t).filter(c => c.body.action === 'u_queue').length > nq, 3000);
    const fq = usageCalls(t).filter(c => c.body.action === 'u_queue').slice(-1)[0], fs1 = usageCalls(t).filter(c => c.body.action === 'u_stats').slice(-1)[0];
    check('N9: ↻ asks for a fresh list once the report is back (fresh=1)', fq.body.fresh === 1 && fs1.body.fresh === 1 && fs1.t <= fq.t, [fq.body, fs1.body]);
    await t.go('#/usage?q=zz'); await sleep(200);
    check('N9 (#34): #/usage?q=… shows the search instead of crashing', t.errs.length === 0 && t.txt('#title') === 'Search', [t.errs, t.txt('#title')]);
    await typeQ(t, ''); await until(() => rows().length > 0, 3000);
    check('N9 (#34): clearing the search brings the dashboard and the list back', !!t.$('.ug-hero') && rows().length > 0);
    t.$('#ug-forget').click(); await sleep(50);
    check('N9: Forget the key clears the list too', t.w.TBX_DEV.usage.UGD.q === null && !!t.$('#ug-key'));
    await t.flush();
    check('N9: the admin screen itself is never recorded', !t.events().some(e => e[2] === 'usage'));
    check('no page errors', t.errs.length === 0, t.errs); }
  { // the queue can't be read: one line with Try again, the rest of the dashboard is untouched
    const hub = Hub({ v2: true }); hub.qdown = true;
    const t = await boot({ hub, storage: { tbx_uadm: 'admin-key-123' } }); await sleep(2700);
    await t.go('#/usage'); await until(() => /Couldn’t load the review list/.test(t.txt('#ug-rq') || ''), 3000);
    check('N9: queue down → "Couldn’t load the review list. Try again", the dashboard is intact', /Couldn’t load the review list\. Try again/.test(t.txt('#ug-rq')) && !!t.$('.ug-hero') && t.$$('#ug-period .ug-col').length === 7, t.txt('#ug-rq'));
    hub.qdown = false; t.$('#ug-rq [data-rq-act="retry"]').click(); await until(() => t.$$('#ug-rq [data-rq-tab]').length === 3, 3000);
    check('N9: Try again loads it (empty lists say so)', t.$$('#ug-rq [data-rq-tab]').length === 3 && /Every search in the last 30 days found something/.test(t.txt('#ug-rq')), t.txt('#ug-rq'));
    check('no page errors', t.errs.length === 0, t.errs); }

  // ---- 8. P45 feedback: remembered name, focus, kept offline and sent once when back, refusals, About ----
  { let mode = 'ok'; const got = [];
    const t = await boot({ relay: (b) => { got.push(b); return mode === 'down' ? 'down' : mode === 'refuse' ? 'error: bad token' : 'ok'; } });
    await sleep(300);
    const fb = () => t.$('#fb-ov'), send = async () => { t.$('#fb-send').click(); await sleep(80); };
    check('P45: the feedback bubble is there (relay configured)', !!t.$('#fb-fab'));
    t.$('#fb-fab').click(); await sleep(30);
    check('P45: first time: the name field has the focus (inside the tap)', !fb().hidden && t.w.document.activeElement === t.$('#fb-name'));
    t.$('#fb-name').value = 'Nate R'; t.$('#fb-note').value = 'first note'; await send(); await sleep(100);
    check('P45: online send → one POST with the note, the name and an id; name remembered', got.length === 1 && got[0].note === 'first note' && got[0].name === 'Nate R' && /^[a-z0-9]{8,}$/.test(got[0].id) && t.w.localStorage.getItem('tbx_fb_name') === 'Nate R', got.map(b => b.note));
    await sleep(900);
    t.$('#fb-name').value = ''; t.$('#fb-fab').click(); await sleep(30);
    check('P45: next time the name is filled in and the note has the focus', t.$('#fb-name').value === 'Nate R' && t.w.document.activeElement === t.$('#fb-note'));
    t.setOnline(false);
    t.$('#fb-note').value = 'offline note'; await send();
    const q1 = JSON.parse(t.w.localStorage.getItem('tbx_fbq') || '[]');
    check('P45: offline → kept: "Saved ✓", the offline hint, nothing sent', got.length === 1 && t.$('#fb-send').textContent === 'Saved ✓' && /offline — it’ll send automatically/.test(t.txt('#fb-hint')), [t.$('#fb-send').textContent, t.txt('#fb-hint')]);
    check('P45: the note waits in tbx_fbq — words only, no picture in localStorage, small', q1.length === 1 && q1[0].note === 'offline note' && q1[0].name === 'Nate R' && !('image' in q1[0]) && JSON.stringify(q1[0]).length < 4096 && !/data:image/.test(JSON.stringify(t.w.localStorage)), q1);
    await sleep(1900);
    check('P45: the form closes after "Saved"', fb().hidden && t.$('#fb-note').value === '');
    await t.go('#/about'); await sleep(60);
    check('P45: About says it is waiting for signal', /1 feedback note is waiting for signal/.test(t.txt('#fbq-note')), t.txt('#fbq-note'));
    t.setOnline(true); t.w.dispatchEvent(new t.w.Event('online')); await until(() => got.length === 2, 4000); await sleep(100);
    check('P45: back online → sent once, with its id; the queue is empty', got.length === 2 && got[1].note === 'offline note' && got[1].id === q1[0].id && t.w.localStorage.getItem('tbx_fbq') === null && !t.txt('#fbq-note'), got.map(b => b.note));
    t.w.dispatchEvent(new t.w.Event('online')); t.w.document.dispatchEvent(new t.w.Event('visibilitychange')); t.w.TBX_FBQ.flush(); await sleep(2600);
    check('P45: no second copy (online again, foreground, flush)', got.length === 2);
    mode = 'down'; t.$('#fb-fab').click(); await sleep(30); t.$('#fb-note').value = 'no answer note'; await send(); await sleep(50);
    check('P45: a send with no answer is kept too (not the email fallback)', got.length === 3 && t.$('#fb-send').textContent === 'Saved ✓' && JSON.parse(t.w.localStorage.getItem('tbx_fbq')).length === 1);
    mode = 'ok'; await sleep(1900); t.w.TBX_FBQ.flush(); await until(() => got.length === 4, 3000); await sleep(50);
    check('P45: …and goes out on the next try', got.length === 4 && got[3].note === 'no answer note' && t.w.localStorage.getItem('tbx_fbq') === null);
    mode = 'refuse'; t.$('#fb-fab').click(); await sleep(30); t.$('#fb-note').value = 'refused note'; await send(); await sleep(1900);
    for (let i = 0; i < 2; i++) { const n = got.length; t.w.TBX_FBQ.flush(); await until(() => got.length > n, 3000); await sleep(60); }
    const q3 = JSON.parse(t.w.localStorage.getItem('tbx_fbq') || '[]');
    check('P45: three refusals → it stops retrying', got.length === 7 && q3.length === 1 && q3[0].tries === 3 && q3[0].err === 'error: bad token', [got.length, q3]);
    t.w.TBX_FBQ.flush(); await sleep(300);
    check('P45: …no fourth try', got.length === 7);
    await t.go('#/'); await t.go('#/about'); await sleep(60);
    check('P45: About: "1 feedback note couldn’t send" — Email it · Discard', /1 feedback note couldn’t send/.test(t.txt('#fbq-note')) && /“refused note”/.test(t.txt('#fbq-note')) && !!t.$('#fbq-note [data-fbq="mail"]') && !!t.$('#fbq-note [data-fbq="drop"]'), t.txt('#fbq-note'));
    t.$('#fbq-note [data-fbq="drop"]').click(); await sleep(60);
    check('P45: Discard removes it', t.w.localStorage.getItem('tbx_fbq') === null && !t.txt('#fbq-note'));
    const full = Array.from({ length: 20 }, (_, i) => ({ id: 'seed' + String(i).padStart(4, '0'), t: Date.now() - 1000 * (30 - i), name: '', note: 'seed ' + i, screen: 'Home', route: '#/', ua: 'x', tries: 0, err: '', shot: 0 }));
    t.setOnline(false); t.w.localStorage.setItem('tbx_fbq', JSON.stringify(full));
    t.$('#fb-fab').click(); await sleep(30); t.$('#fb-note').value = 'the 21st'; await send();
    check('P45: 20 notes already waiting → not kept; today\'s email fallback instead', JSON.parse(t.w.localStorage.getItem('tbx_fbq')).length === 20 && /opening your email app/.test(t.txt('#fb-hint')), t.txt('#fb-hint'));
    await sleep(700); // the mailto hand-off (jsdom can't open it)
    t.w.localStorage.removeItem('tbx_fbq'); t.setOnline(true);
    await t.go('#/'); await typeQ(t, 'zzqxvk'); await sleep(60);
    const ask = t.$('#content [data-act="asknate"]'); if (ask) ask.click(); await sleep(40);
    check('P45 + P23: "Ask Nate to add …" opens prefilled, the name kept and the note focused at its end', ask && /^Please add “zzqxvk”/.test(t.$('#fb-note').value) && t.$('#fb-name').value === 'Nate R' && t.w.document.activeElement === t.$('#fb-note') && t.$('#fb-note').selectionStart === t.$('#fb-note').value.length);
    await sleep(700);
    check('no page errors', t.errs.length === 0, t.errs); }

  // ---- 9. real people only: automated / test browsers, "Don't count this device", machine-speed navigation ----
  { const evCalls = (t) => usageCalls(t).filter(c => c.body && c.body.action === 'u_ev');
    const browse = async (t) => { // a short visit at a person's pace: a card, home, a search, the app to the background and back
      await t.go('#/pn/3910500580'); await sleep(300); await t.go('#/'); await typeQ(t, 'iconix'); await sleep(2300);
      t.setHidden(true); await sleep(30); t.setHidden(false); await sleep(2700); await t.flush();
    };
    const stored = (t) => Object.keys(t.w.localStorage).filter(k => /^tbx_u(id|sess|q)$/.test(k));
    const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
    const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
    const bots = [
      ['WebDriver (Playwright, Puppeteer, Selenium)', { webdriver: true }],
      ['headless Chrome', { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36', platform: 'Linux x86_64' }],
      ['Playwright WebKit on Linux (a Mac user agent)', { ua: MAC, platform: 'Linux x86_64' }],
      ['iPhone emulation on a Linux machine', { ua: IPH, platform: 'Linux x86_64' }],
      ['iPhone emulation on Windows', { ua: IPH, platform: 'Win32' }],
      ['jsdom', { ua: 'Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/24.1.3' }],
      ['an Electron app\'s browser', { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.3.0 Chrome/138.0.0.0 Electron/37.2.0 Safari/537.36', platform: 'MacIntel' }],
      ['a Playwright binding on the page', { globals: { __playwright__binding__: function () {} } }]
    ];
    for (const [label, o] of bots) {
      const t = await boot(o); await browse(t);
      check('bots: ' + label + ' → nothing sent, nothing stored', evCalls(t).length === 0 && stored(t).length === 0 && t.w.TBX_DEV.usage.off() === 'auto' && t.errs.length === 0,
        { sent: evCalls(t).length, stored: stored(t), off: t.w.TBX_DEV.usage.off(), errs: t.errs });
    }
    { const t = await boot({ webdriver: true, storage: { tbx_uadm: 'admin-key-123' } });
      await t.go('#/usage'); await until(() => usageCalls(t).some(c => c.body && c.body.action === 'u_live') && t.$('#ug-self'), 3000);
      check('bots: the dashboard still works in an automated browser, and says it isn’t counted', /This browser isn’t counted: it’s automated/.test(t.txt('#ug-self') || '') && !t.$('#ug-self-off') && !!t.$('#ug-livebody'), t.txt('#ug-self'));
      check('bots: dashboard foot says test and automated browsers are never counted', /Test and automated browsers are never counted/.test(t.txt('.ug-foot') || ''), t.txt('.ug-foot')); }
    for (const [label, o] of [['an iPhone', { ua: IPH, platform: 'iPhone', webdriver: false }], ['Safari on a Mac', { ua: MAC, platform: 'MacIntel' }],
      ['an iPad (desktop user agent)', { ua: MAC, platform: 'MacIntel' }],
      ['Android (a Linux platform)', { ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', platform: 'Linux aarch64' }],
      ['Chrome on Windows', { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', platform: 'Win32' }]]) {
      const t = await boot(o); await browse(t);
      const ev = t.events();
      check('people: ' + label + ' is still counted', t.w.TBX_DEV.usage.off() === '' && ev.some(e => e[1] === 'open') && ev.some(e => e[1] === 'card' && e[2] === '3910500580') && ev.some(e => e[1] === 'search' && e[2] === 'iconix'),
        { off: t.w.TBX_DEV.usage.off(), ev: ev.map(e => e[1] + ':' + e[2]) });
    }
    // "Don't count this device" on the dashboard (owner only), remembered, and back
    { const t = await boot({ storage: { tbx_uadm: 'admin-key-123' } });
      await sleep(2700); await t.flush(); const n0 = evCalls(t).length;
      await t.go('#/pn/3910500582'); await sleep(40); // queued, not sent yet
      await t.go('#/usage'); await until(() => t.$('#ug-self-off'), 3000);
      check('switch: dashboard offers “Don’t count this device”', /Don’t count this device/.test(t.txt('#ug-self') || ''), t.txt('#ug-self'));
      t.$('#ug-self-off').click(); await sleep(40);
      check('switch: tapped → saved on the device, the unsent card dropped, the foot says so', t.w.localStorage.getItem('tbx_unotrack') === '1' && t.w.TBX_DEV.usage.UG.q.length === 0 && t.w.TBX_DEV.usage.off() === 'flag' &&
        /This device isn’t counted/.test(t.txt('#ug-self')) && !!t.$('#ug-self-on'), { q: t.w.TBX_DEV.usage.UG.q.length, self: t.txt('#ug-self') });
      await t.go('#/pn/3910500580'); await t.go('#/'); await typeQ(t, 'nanotack'); await sleep(2300); t.setHidden(true); await sleep(30); t.setHidden(false); await sleep(2700); await t.flush();
      check('switch: nothing more leaves this device (no card, search, keepalive or saved queue)', evCalls(t).length === n0 && !t.events().some(e => e[2] === '3910500582' || e[2] === 'nanotack') && !t.w.localStorage.getItem('tbx_uq'), { before: n0, after: evCalls(t).length });
      const t2 = await boot({ storage: { tbx_unotrack: '1', tbx_uadm: 'admin-key-123' } }); await browse(t2);
      check('switch: remembered on the next launch', evCalls(t2).length === 0 && t2.w.TBX_DEV.usage.off() === 'flag');
      await t2.go('#/usage'); await until(() => t2.$('#ug-self-on'), 3000);
      t2.$('#ug-self-on').click(); await sleep(40);
      check('switch: “Count it again” → flag gone, the offer is back', t2.w.localStorage.getItem('tbx_unotrack') === null && !!t2.$('#ug-self-off') && t2.w.TBX_DEV.usage.off() === '');
      await t2.go('#/pn/3910500580'); await sleep(2700); await t2.flush();
      check('switch: counted again from the next screen', t2.events().some(e => e[1] === 'card' && e[2] === '3910500580'), t2.events().map(e => e[1] + ':' + e[2]));
      check('switch: no page errors', t.errs.length === 0 && t2.errs.length === 0, t.errs.concat(t2.errs)); }
    // machine-speed navigation: a script flipping through cards
    { const t = await boot();
      await sleep(2700); await t.flush(); const n0 = t.events().length;
      const skus = ['3910500580', '3910500582', '3910500569', '3910500568', 'CAT02644', '3911714571', '0234101015', '3910080040'];
      for (let i = 0; i < 20; i++) { t.w.location.hash = i % 2 ? '#/' : '#/pn/' + skus[(i / 2) % skus.length]; await sleep(60); }
      await sleep(2700); await t.flush(); t.setHidden(true); await sleep(30); t.setHidden(false); await sleep(100); await t.flush();
      check('fast: 15 screens inside 5 s → none of it is sent, and nothing more this launch', t.w.TBX_DEV.usage.off() === 'fast' && t.events().length === n0 && !t.w.localStorage.getItem('tbx_uq'),
        { off: t.w.TBX_DEV.usage.off(), sent: t.events().length - n0 });
      await t.go('#/pn/3910500580'); await sleep(2700); await t.flush();
      check('fast: still nothing after the burst', t.events().length === n0);
      const h = await boot(); await sleep(2700); await h.flush();
      for (let i = 0; i < 20; i++) { h.w.location.hash = i % 2 ? '#/' : '#/pn/' + skus[(i / 2) % skus.length]; await sleep(450); }
      await sleep(2700); await h.flush();
      check('fast: the same 20 screens at a person’s pace (0.45 s each) are all counted', h.w.TBX_DEV.usage.off() === '' && h.events().filter(e => e[1] === 'card' || e[1] === 'view').length >= 20,
        { off: h.w.TBX_DEV.usage.off(), n: h.events().filter(e => e[1] === 'card' || e[1] === 'view').length });
      check('fast: no page errors', t.errs.length === 0 && h.errs.length === 0, t.errs.concat(h.errs)); }
  }

  const failed = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
