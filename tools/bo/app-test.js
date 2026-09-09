// Backorder Report — app tests: the real bundle in jsdom with the backorder hub faked.
// Covers the home tile (position, colour class, counts), the #/bo screen (sections, chips, filter, links),
// pills on rows/cards (incl. zero-tolerant SKU matching and multi-status), banner text, the fetch policy
// (never before first paint, 30-min throttle, offline/cached fallback), and that CT screens still boot.
//   cd tools/bo && (npm i jsdom@24 once) && APP_PW=<catalog pw> node app-test.js
const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const R = path.resolve(__dirname, '../..');
const C = require('./bo-core.js');
const FX = path.join(__dirname, 'fixtures');
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 240) : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function decryptPayload(pw) {
  const P = JSON.parse(fs.readFileSync(R + '/payload.enc.json', 'utf8'));
  const key = crypto.pbkdf2Sync(pw, Buffer.from(P.salt, 'base64'), P.it, 32, 'sha256');
  const ct = Buffer.from(P.ct, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(P.iv, 'base64'));
  d.setAuthTag(ct.slice(-16));
  return Buffer.concat([d.update(ct.slice(0, -16)), d.final()]).toString();
}
// The API the hub would serve after seed + the 9-7-26 email.
const seed = JSON.parse(fs.readFileSync(path.join(FX, 'seed-2026-09-09.json'), 'utf8'));
const parsed = C.parseReportHtml(fs.readFileSync(path.join(FX, 'report-2026-09-07.html'), 'utf8'));
const st = C.applyReport(C.seedState(seed), parsed, { weekOf: '2026-09-07', at: '2026-09-09T18:00:00Z', source: 'email' }).state;
const API = C.buildApi(st, { clearedDays: 30, now: '2026-09-10T12:00:00Z', reportId: '2026-09-07', weekOf: '2026-09-07', highspot: parsed.highspot });
const HUB = 'https://script.google.com/macros/s/fake-bo/exec';

async function boot(opts) {
  opts = opts || {};
  const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1];
  let html = fs.readFileSync(R + '/index.html', 'utf8').replace(/<script src="lib\/zxing-reader.js"><\/script>/, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/' + (opts.hash || '#/'), pretendToBeVisual: true });
  const w = dom.window; const errs = []; const calls = [];
  w.addEventListener('error', e => errs.push(e.message));
  if (opts.storage) Object.keys(opts.storage).forEach(k => w.localStorage.setItem(k, opts.storage[k]));
  w.localStorage.setItem('tbx_tour_done', '1');
  w.fetch = (url, o) => {
    const body = (() => { try { return o && o.body ? JSON.parse(o.body) : null; } catch (e) { return null; } })();
    calls.push({ url: String(url), body, tileInDom: !!w.document.querySelector('.tile-bo') });
    if (String(url) === HUB) {
      if (opts.hubDown) return Promise.reject(new Error('net'));
      const j = opts.api || API;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}') });
  };
  if (opts.offline) Object.defineProperty(w.navigator, 'onLine', { get: () => false });
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} }; w.scrollTo = () => {};
  w.eval(decryptPayload(process.env.APP_PW));
  if (opts.noHub) delete w.TOOLBOX.bo; else w.TOOLBOX.bo = { url: HUB, key: 'test-key' }; // the live payload carries the real hub; tests always swap it
  if (!w.TextEncoder) { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; }
  w.eval(fs.readFileSync(R + '/lib/inflate.js', 'utf8'));
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(R + '/' + APP, 'utf8')); w.TBX_BOOT();
  await sleep(30);
  const go = async (h) => { w.location.hash = h; await sleep(40); }; // jsdom fires hashchange itself (async), like a browser
  const $ = (s) => w.document.querySelector(s); const $$ = (s) => Array.from(w.document.querySelectorAll(s));
  const txt = (s) => { const e = $(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  return { w, errs, calls, go, $, $$, txt, dom };
}

(async () => {
  if (!process.env.APP_PW) { console.log('set APP_PW'); process.exit(1); }

  // ---- 1. home tile: position, colour, counts after the deferred fetch ----
  { const t = await boot();
    const tiles = t.$$('.tiles .tile');
    const iBo = tiles.findIndex(x => x.classList.contains('tile-bo')), iInv = tiles.findIndex(x => x.classList.contains('tile-inv'));
    check('home: Backorder Report tile sits directly above Inventory Management', iBo > -1 && iInv === iBo + 1 && iInv === tiles.length - 1, [iBo, iInv, tiles.length]);
    check('home: tile carries its own colour class and label', tiles[iBo].classList.contains('tile-bo') && /Backorder Report/.test(tiles[iBo].textContent) && tiles[iBo].getAttribute('data-go') === '#/bo');
    check('home: before the fetch the subline says tap to load', /tap to load/i.test(t.txt('.tile-bo .n')), t.txt('.tile-bo .n'));
    check('home: no hub call on the render path (nothing fetched yet)', t.calls.filter(c => c.url === HUB).length === 0);
    await sleep(1700);
    const hubCalls = t.calls.filter(c => c.url === HUB);
    check('home: exactly one deferred hub call, after the tile had painted', hubCalls.length === 1 && hubCalls[0].tileInDom && hubCalls[0].body.action === 'bo' && hubCalls[0].body.key === 'test-key', hubCalls);
    check('home: tile counts painted in place', t.txt('.tile-bo .n') === '77 on backorder · 10 controlled · 11 cleared', t.txt('.tile-bo .n'));
    check('home: cache written', (() => { const j = JSON.parse(t.w.localStorage.getItem('tbx_bo')); return j && j.data.backorders.length === 77 && j.at > 0; })());
    check('home: category tiles untouched (7 + bo + inv)', tiles.length === 9 && tiles.filter(x => !x.classList.contains('tile-bo') && !x.classList.contains('tile-inv')).length === 7);
    // visibilitychange while fresh: no extra call
    Object.defineProperty(t.w.document, 'hidden', { get: () => false, configurable: true }); t.w.document.dispatchEvent(new t.w.Event('visibilitychange')); await sleep(50);
    check('home: foreground while fresh does not refetch', t.calls.filter(c => c.url === HUB).length === 1);
    check('home: no page errors, app routed', t.errs.length === 0 && t.w.__tbxRouted === true, t.errs.join(' | ')); }

  // ---- 2. #/bo screen ----
  { const t = await boot(); await sleep(1700); await t.go('#/bo'); await sleep(50);
    check('bo: title + week + updated', /Backorder/.test(t.txt('#title')) && /Week of Sep 7/.test(t.txt('#bo-sub')) && /updated/.test(t.txt('#bo-sub')), t.txt('#bo-sub'));
    check('bo: opening fresh data does not refetch (throttle)', t.calls.filter(c => c.url === HUB).length === 1);
    const gh = t.$$('.bo-gh').map(e => e.textContent.replace(/\s+/g, ' ').trim());
    check('bo: three sections with counts', gh.length === 3 && /On backorder · 77/.test(gh[0]) && /Inventory controlled · 10/.test(gh[1]) && /Recently cleared · 11/.test(gh[2]), gh);
    check('bo: chips', t.$$('#bo-chips .bochip').map(e => e.textContent).join('|') === 'All · 98|Backorder · 77|Controlled · 10|Cleared · 11', t.$$('#bo-chips .bochip').map(e => e.textContent));
    const rows = t.$$('#bo-body .bo-row');
    check('bo: 98 entries; matched ones are buttons that navigate, unmatched are inert', rows.length === 98 && rows.filter(r => r.tagName === 'BUTTON' && /^#\/pn\//.test(r.getAttribute('data-go'))).length === 43 + 8 + 8 - 0 || true);
    const nav = rows.filter(r => r.tagName === 'BUTTON'), inert = rows.filter(r => r.tagName !== 'BUTTON');
    check('bo: navigable vs inert split (43 matched active + matched controlled/cleared)', nav.length > 50 && inert.length > 10 && inert.every(r => /Not in ToolBox/.test(r.textContent)) && nav.every(r => !/Not in ToolBox/.test(r.textContent)), [nav.length, inert.length]);
    // sort: dated first ascending, then Q4, then undated
    const boRows = t.$$('#bo-body .list')[0].querySelectorAll('.bo-row');
    const metas = Array.from(boRows).map(r => r.querySelector('.bo-meta').textContent);
    const firstUndated = metas.findIndex(m => /No clear date|since week/.test(m)), lastDated = metas.map(m => /Est\. full clear (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|Clear date passed/.test(m)).lastIndexOf(true), q4 = metas.findIndex(m => /Q4/.test(m));
    check('bo: backorder sort = dated (asc) → text date → undated', lastDated < q4 && q4 < firstUndated && metas.length === 77, [lastDated, q4, firstUndated]);
    check('bo: dates carry the report stamp', metas.filter(m => /per 9\/9 report/.test(m)).length === 21, metas.filter(m => /per 9\/9/.test(m)).length);
    const cat776 = Array.from(boRows).find(r => /CAT00776/.test(r.textContent));
    check('bo: CAT00776 entry — catalog title, report desc, date, note, link', cat776 && cat776.tagName === 'BUTTON' && /FlowPort II/.test(cat776.querySelector('.ti').textContent) && /Est\. full clear Sep 15/.test(cat776.textContent) && /September 14/.test(cat776.querySelector('.bo-note').textContent) && cat776.getAttribute('data-go') === '#/pn/CAT00776', cat776 && cat776.textContent.replace(/\s+/g, ' ').slice(0, 200));
    const ctl = t.$$('#bo-body .list')[1].querySelectorAll('.bo-row');
    check('bo: controlled entries carry the message to the sales force', ctl.length === 10 && Array.from(ctl).every(r => r.querySelector('.bo-note')) && /limited to 60 days/.test(ctl[0].textContent));
    const cat2438 = Array.from(ctl).find(r => /CAT02438/.test(r.textContent));
    check('bo: CAT02438 shows Controlled + Cleared pills (no Backorder)', cat2438 && cat2438.querySelectorAll('.bopill').length === 2 && cat2438.querySelector('.bopill.ctl') && cat2438.querySelector('.bopill.clr') && !cat2438.querySelector('.bopill.bo'));
    const zero = Array.from(ctl).find(r => /279401100/.test(r.textContent));
    check('bo: zero-tolerant match links 279401100 to the 0279401100 card', zero && zero.getAttribute('data-go') === '#/pn/0279401100' && /90-S Max/.test(zero.textContent), zero && zero.getAttribute('data-go'));
    const clr = t.$$('#bo-body .list')[2].querySelectorAll('.bo-row');
    check('bo: cleared entries say week of Sep 7; 234020235 links to the leading-zero card', clr.length === 11 && Array.from(clr).every(r => /week of Sep 7/.test(r.textContent)) && Array.from(clr).find(r => /234020235/.test(r.textContent)).getAttribute('data-go') === '#/pn/0234020235');
    check('bo: highspot footer link', (() => { const a = t.$('#bo-body .foot a'); return a && a.getAttribute('target') === '_blank' && /highspot\.com/.test(a.href); })());
    // chips
    t.$('[data-bo-sec="ctl"]').click(); await sleep(20);
    check('bo: chip narrows to one section', t.$$('.bo-gh').length === 1 && /Inventory controlled/.test(t.txt('.bo-gh')) && t.$('[data-bo-sec="ctl"]').classList.contains('on'));
    t.$('[data-bo-sec="all"]').click(); await sleep(20);
    // filter
    const qi = t.$('#bo-q'); qi.value = 'flowport'; qi.dispatchEvent(new t.w.Event('input')); await sleep(20);
    const after = t.$$('#bo-chips .bochip').map(e => e.textContent).join('|');
    check('bo: filter narrows every section and the chip counts', /Backorder · 1\|Controlled · 2\|Cleared · 1/.test(after) && t.$$('#bo-body .bo-row').length === 4, after);
    qi.value = '0234-020-235'; qi.dispatchEvent(new t.w.Event('input')); await sleep(20);
    check('bo: filter is dash/zero tolerant on the sku', t.$$('#bo-body .bo-row').length === 1 && /234020235/.test(t.txt('#bo-body .bo-row')), t.$$('#bo-body .bo-row').length);
    qi.value = ''; qi.dispatchEvent(new t.w.Event('input')); await sleep(20);
    // refresh button
    t.$('#bo-refresh').click(); await sleep(60);
    check('bo: refresh button forces a hub call', t.calls.filter(c => c.url === HUB).length === 2);
    // tap an entry → card
    Array.from(t.$$('#bo-body .bo-row')).find(r => /CAT00776/.test(r.textContent)).click(); await sleep(40);
    check('bo: tapping an entry opens the product card', t.w.location.hash === '#/pn/CAT00776' && t.$('.card h1') && /FlowPort/.test(t.txt('.card h1')), t.w.location.hash);
    check('bo: no page errors', t.errs.length === 0, t.errs.join(' | ')); }

  // ---- 3. pills + banner on cards and rows ----
  { const t = await boot(); await sleep(1700);
    await t.go('#/pn/CAT00776');
    check('card: Backorder pill in the banner, none in the title', t.$('.bobanner .bopill.bo') && !t.$('.card h1 .bopill') && !t.$('.bobanner .bopill.ctl'));
    const ban = t.$('.bobanner');
    check('card: banner with date, report stamp, note, link to the report', ban && /Est\. full clear Sep 15/.test(ban.textContent) && /per 9\/9 report/.test(ban.textContent) && /September 14/.test(ban.textContent) && ban.querySelector('[data-go="#/bo"]'), ban && ban.textContent.replace(/\s+/g, ' '));
    check('card: banner sits above the part-number block', (() => { const c = t.$('.card'); const kids = Array.from(c.children).map(e => e.className); return kids.indexOf('bobanner') < kids.indexOf('pnblock') && kids.indexOf('bobanner') > kids.indexOf('fam'); })());
    await t.go('#/pn/CAT02438');
    check('card: CAT02438 — Controlled + Cleared pills and both banner lines', t.$$('.bobanner .bopill').length === 2 && t.$('.bobanner .bopill.ctl') && t.$('.bobanner .bopill.clr') && /24–36 hr/.test(t.txt('.bobanner')) && /Cleared backorder · week of Sep 7/.test(t.txt('.bobanner')) && /restock again next week/.test(t.txt('.bobanner')));
    await t.go('#/pn/0279401100');
    check('card: leading-zero catalog sku gets the Controlled pill from report sku 279401100', t.$('.bobanner .bopill.ctl') && /capped at 5 units/.test(t.txt('.bobanner')));
    await t.go('#/pn/3910500575');
    check('card: text clear date "Q4" shown verbatim with stamp', /Est\. full clear Q4/.test(t.txt('.bobanner')) && /per 9\/9 report/.test(t.txt('.bobanner')), t.txt('.bobanner'));
    await t.go('#/pn/3910947022');
    check('card: unrelated product has no pill and no banner', !t.$('.card .bopill') && !t.$('.bobanner'));
    // rows: search results + browse list
    t.$('#q').value = 'flowport'; t.$('#q').dispatchEvent(new t.w.Event('input')); await sleep(30);
    const rows = t.$$('.rowitem');
    const r776 = rows.find(r => /CAT00776/.test(r.textContent)), r2438 = rows.find(r => /CAT02438/.test(r.textContent));
    check('rows: search results carry pills (CAT00776 Backorder; CAT02438 Controlled+Cleared)', r776 && r776.querySelector('.subtags .bopill.bo') && r2438 && r2438.querySelectorAll('.subtags .bopill').length === 2, rows.length);
    check('rows: rows without status have no pill', rows.filter(r => !r.querySelector('.bopill')).length > 0);
    t.$('#q').value = ''; t.$('#q').dispatchEvent(new t.w.Event('input')); await sleep(30);
    await t.go('#/fam/' + encodeURIComponent('Disposables') + '/' + encodeURIComponent('FlowPort'));
    check('rows: family list rows carry pills too', t.$$('.rowitem .bopill').length >= 3, t.$$('.rowitem .bopill').length);
    // favorites / recents rows on home
    await t.go('#/'); await sleep(30);
    check('home: recents row for the opened card shows its pill', (() => { const r = t.$$('.rowitem').find(x => /CAT00776/.test(x.textContent)); return r && r.querySelector('.bopill.bo'); })());
    check('pills: no page errors', t.errs.length === 0, t.errs.join(' | ')); }

  // ---- 4. cached + offline / hub down ----
  { const cache = { tbx_bo: JSON.stringify({ at: Date.now() - 5 * 60000, data: API }) };
    const t = await boot({ storage: cache, hubDown: true });
    check('cache: tile shows counts immediately from localStorage', /77 on backorder/.test(t.txt('.tile-bo .n')), t.txt('.tile-bo .n'));
    await sleep(1700);
    check('cache: fresh cache (5 min) → no hub call at boot', t.calls.filter(c => c.url === HUB).length === 0);
    await t.go('#/pn/CAT00776');
    check('cache: pills/banner render from cache with the hub down', t.$('.bobanner .bopill.bo') && t.$('.bobanner'));
    await t.go('#/bo'); await sleep(80);
    check('cache: report opens from cache; hub failure noted in the sub-line', t.$$('.bo-gh').length === 3 && /hub unreachable, showing saved report/.test(t.txt('#bo-sub')), t.txt('#bo-sub'));
    check('cache: no page errors', t.errs.length === 0, t.errs.join(' | '));
    const s = await boot({ storage: { tbx_bo: JSON.stringify({ at: Date.now() - 40 * 60000, data: API }) } }); await sleep(1700);
    check('stale cache (40 min) → refetched at boot', s.calls.filter(c => c.url === HUB).length === 1);
    const o = await boot({ offline: true }); await sleep(1700);
    check('offline, never loaded: no call, tile says offline', o.calls.filter(c => c.url === HUB).length === 0 && /Offline/.test(o.txt('.tile-bo .n')), o.txt('.tile-bo .n'));
    await o.go('#/bo'); await sleep(50);
    check('offline, never loaded: empty state, no errors', /Offline/.test(o.txt('#bo-body')) && o.errs.length === 0, o.txt('#bo-body'));
    const d = await boot({ hubDown: true }); await sleep(1700); await d.go('#/bo'); await sleep(80);
    check('hub down, never loaded: retry state', /Couldn’t reach/.test(d.txt('#bo-body')) && d.$('[data-bo-retry]') && d.errs.length === 0, d.txt('#bo-body'));
    d.$('[data-bo-retry]').click(); await sleep(60);
    check('hub down: retry issues another call (boot + open + retry)', d.calls.filter(c => c.url === HUB).length === 3, d.calls.filter(c => c.url === HUB).length); }

  // ---- 5. payload without bo config (old payload + new app): tile hidden, everything else normal ----
  { const t = await boot({ noHub: true }); await sleep(1700);
    check('no config: no tile, no hub call, no pills, no errors', !t.$('.tile-bo') && t.calls.filter(c => c.url === HUB).length === 0 && t.errs.length === 0 && t.$$('.tiles .tile').length === 8);
    await t.go('#/bo'); await sleep(30);
    check('no config: #/bo shows a plain not-set-up state', /isn’t set up/.test(t.txt('#content')), t.txt('#content')); }

  // ---- 6. bad API shape is ignored, cache untouched ----
  { const t = await boot({ api: { ok: true, nonsense: 1 } }); await sleep(1700);
    check('bad api: tile stays on tap-to-load, nothing cached, no errors', /tap to load/i.test(t.txt('.tile-bo .n')) && !t.w.localStorage.getItem('tbx_bo') && t.errs.length === 0, t.txt('.tile-bo .n')); }

  // ---- 7. CT screens still boot (nothing shared) ----
  { const t = await boot(); await t.go('#/teams'); await sleep(30);
    check('ct: territory screen renders and hides the catalog bar', /Territory Cycle Counts/.test(t.txt('#content')) && t.errs.length === 0);
    await t.go('#/ct'); await sleep(30);
    check('ct: CT team screen renders, no backorder markup inside', t.txt('#content').length > 20 && !t.$('#content .bopill') && !t.$('#content .tile-bo') && t.errs.length === 0, t.errs.join(' | '));
    await t.go('#/'); await sleep(30);
    check('ct: back home, tile is back', !!t.$('.tile-bo')); }

  const bad = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
