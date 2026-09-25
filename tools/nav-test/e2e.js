// Navigation end-to-end checks (Playwright, iPhone-sized, touch) — Back keeps your place (P5/P35), the bottom-bar Back
// (P36), favorites (P37/P38), tap targets (P40), the Backorder Report from a card (P46), and the 4.143 fixes they build on.
// READ-ONLY against the site it serves: every script.google.com hub is faked, every other non-localhost request is aborted.
//
//   APP_PW=<catalog pw> [ENGINE=chromium|webkit] [MODE=fixed|baseline] [ROOT=<site>] [PORT=n] node tools/nav-test/e2e.js [jobRegex]
//
// ROOT defaults to the repo root (it logs in through the real lock screen: no decrypted data needed). WebKit is the iPhone
// engine and the one where Back always landed at the top: run both. It needs a Playwright WebKit build
// (PLAYWRIGHT_BROWSERS_PATH=<dir holding it>); never run `playwright install` into system paths for this.
// MODE=baseline asserts the old (buggy) behaviour — a green baseline run on an old build proves each test reproduces its
// bug; MODE=fixed (default) asserts the behaviour the release ships.
const PW_ = require('playwright');
const ENGINE = process.env.ENGINE || 'chromium';
const chromium = PW_[ENGINE];
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.env.ROOT || path.resolve(__dirname, '../..'));
const MODE = process.env.MODE || 'fixed';
const FIXED = MODE === 'fixed';
const PORT = +(process.env.PORT || 8163), BASE = 'http://localhost:' + PORT + '/';
const PW = process.env.APP_PW;
if (!PW) { console.error('set APP_PW (the catalog password) in the environment'); process.exit(2); }
const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); }
// expect(name, buggyObserved, fixedObserved): baseline passes when the bug shows, fixed when the fix shows
function expect(name, buggy, fixed, detail) { check((FIXED ? '[fixed] ' : '[bug]   ') + name, FIXED ? fixed : buggy, detail); }

const { BO_API } = require('./fixtures.js');

let browser;
async function open(o) {
  o = o || {};
  const vp = o.vp || { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: ENGINE === 'chromium', hasTouch: true, timezoneId: 'America/New_York',
    reducedMotion: o.reduced ? 'reduce' : 'no-preference', colorScheme: 'dark',
    userAgent: o.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript((a) => {
    try { if (!a.tour) localStorage.setItem('tbx_tour_done', '1'); if (!a.a2hs) localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99');
      if (a.ls && !sessionStorage.getItem('__seeded')) { Object.keys(a.ls).forEach(k => localStorage.setItem(k, a.ls[k])); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}
    let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) {
      if (v) { v.bo = { url: 'https://script.google.com/macros/s/fake-bo/exec', key: 'k' }; v.usage = null; if (v.fb) v.fb = { url: 'https://script.google.com/macros/s/fake-fb/exec', token: 't', email: 'x@example.com' }; }
      t = v; } });
  }, { ls: o.ls || null, tour: !!o.tour, a2hs: !!o.a2hs });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) { if (/\/sw\.js(\?|$)/.test(u)) return r.fulfill({ status: 404, body: '' }); return r.continue(); }
    if (/script\.google\.com/.test(u)) {
      let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      if (b.action === 'bo' && o.boFail) return r.fulfill({ status: 500, contentType: 'text/plain', body: 'err' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b.action === 'bo' ? BO_API : { ok: true }) });
    }
    return r.abort();
  });
  const p = await ctx.newPage();
  p.__errs = []; p.on('pageerror', e => { if (!/sw\.js load failed/.test(String(e))) p.__errs.push(String(e)); }); // sw.js is 404'd on purpose
  await p.goto(BASE + (o.start || '#/'));
  await p.fill('#lockpw', PW);
  await p.locator('#lockform').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await p.waitForFunction(() => document.documentElement.classList.contains('authed') && window.__tbxRouted && document.getElementById('content').innerHTML.length > 200, null, { timeout: 30000 });
  await sleep(1200);
  return { p, ctx };
}
const hash = p => p.evaluate(() => location.hash);
const scrollY = p => p.evaluate(() => Math.round(window.scrollY));
async function back(p, wait) { await p.evaluate(() => history.back()); await sleep(wait || 700); }
async function tapBack(p, wait) { // the in-app Back (header today; bottom bar after P36)
  const sel = (await p.$('#bb-back:not([hidden])')) ? '#bb-back' : '#back';
  await p.tap(sel); await sleep(wait || 700);
}

const JOBS = [];
const job = (name, fn) => JOBS.push({ name, fn });

// P5 — search → bucket chip → spec filter → card → Back: filters survive
job('p5-search-filters', async () => {
  const { p, ctx } = await open();
  await p.fill('#q', 'iconix'); await sleep(500);
  await p.tap('.schip[data-sf="Implants"]'); await sleep(400);
  const sel = await p.$('select[data-sfk="dia"]');
  const opts = await sel.$$eval('option', os => os.map(o => o.value));
  const pick = opts.find(v => /2\.3/.test(v)) || opts[1];
  await sel.selectOption(pick); await sleep(400);
  const nBefore = await p.$$eval('.list .rowitem', r => r.length);
  // scroll a little so the tapped row is not the first one
  await p.evaluate(() => window.scrollTo(0, 300)); await sleep(200);
  const yBefore = await scrollY(p);
  const row = (await p.$$('.list .rowitem'))[3];
  await row.tap(); await sleep(800);
  const onCard = /#\/pn\//.test(await hash(p));
  await tapBack(p, 900);
  const st = await p.evaluate(() => ({ q: document.getElementById('q').value, h: location.hash,
    chip: (document.querySelector('.schip.on[data-sf]') || {}).textContent || '',
    dia: (document.querySelector('select[data-sfk="dia"]') || {}).value || '', n: document.querySelectorAll('.list .rowitem').length }));
  const y = await scrollY(p);
  check('p5 setup: card opened from a filtered result', onCard, 'rows before=' + nBefore);
  expect('p5 Diameter filter survives Back', st.dia === '', st.dia === pick, JSON.stringify(st));
  expect('p5 Implants chip survives Back', /Implants/.test(st.chip) /* SFILT is kept in memory today */, /Implants/.test(st.chip), st.chip);
  expect('p5 result count identical after Back', st.n !== nBefore, st.n === nBefore, st.n + ' vs ' + nBefore);
  expect('p35 search results: scroll restored', y === 0, Math.abs(y - yBefore) <= 2, 'y=' + y + ' before=' + yBefore);
  check('p5 no page errors', !p.__errs.length, p.__errs.join(' | '));
  await ctx.close();
});

// P5 — family list chips (data-filt) → card → Back
job('p5-family-chips', async () => {
  const { p, ctx } = await open({ start: '#/sub/Iconix/' + encodeURIComponent('Iconix all-suture anchor') + '/Iconix' });
  await sleep(300);
  const chip = await p.$('.fchip[data-filt="TT"]') || (await p.$$('.fchip[data-filt]'))[0];
  const chipName = await chip.getAttribute('data-filt');
  await chip.tap(); await sleep(400);
  const nBefore = await p.$$eval('.list .rowitem', r => r.length);
  await (await p.$$('.list .rowitem'))[0].tap(); await sleep(800);
  await tapBack(p, 900);
  const on = await p.$$eval('.fchip.on', b => b.map(x => x.getAttribute('data-filt')));
  const n = await p.$$eval('.list .rowitem', r => r.length);
  expect('p5 family chip "' + chipName + '" survives Back', on.length === 0, on.indexOf(chipName) > -1, 'on=' + JSON.stringify(on) + ' rows ' + n + '/' + nBefore);
  await ctx.close();
});

// P35 — long lists, two levels deep: category list → 24-row family list → card, Back ×2, Forward ×2
job('p35-scroll-long-list', async () => {
  const { p, ctx } = await open({ start: '#/cat/Instruments' });
  await sleep(300);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.evaluate(() => window.scrollTo(0, 1600)); await sleep(300);
  const yA = await scrollY(p);
  const famGo = '#/fam/Instruments/' + encodeURIComponent('Iconix all-suture anchor'); // 24 flat rows
  await p.evaluate(g => { const r = [...document.querySelectorAll('.rowitem')].find(x => x.getAttribute('data-go') === g); r.scrollIntoView({ block: 'end' }); window.scrollBy(0, 120); }, famGo);
  await sleep(250);
  const yA2 = await scrollY(p);
  await p.tap('.rowitem[data-go="' + famGo + '"]'); await sleep(800);
  await p.evaluate(() => window.scrollTo(0, 900)); await sleep(250); // deep into the 24-row family
  const yB = await scrollY(p);
  const cardGo = await p.evaluate(() => { const r = [...document.querySelectorAll('.list .rowitem')].find(x => { const b = x.getBoundingClientRect(); return b.top > 200 && b.bottom < innerHeight - 140; }); return r && r.getAttribute('data-go'); });
  await p.tap('.rowitem[data-go="' + cardGo + '"]'); await sleep(800);
  await tapBack(p, 1000);
  const y1 = await scrollY(p);
  expect('p35 24-row family list: scroll restored on Back', y1 === 0, Math.abs(y1 - yB) <= 2, 'y=' + y1 + ' saved=' + yB);
  await tapBack(p, 1000);
  const y2 = await scrollY(p);
  expect('p35 category list (2 levels up): scroll restored', y2 === 0, Math.abs(y2 - yA2) <= 2, 'y=' + y2 + ' saved=' + yA2 + ' (first scroll ' + yA + ', docH ' + H + ')');
  await p.evaluate(() => history.forward()); await sleep(900);
  const y3 = await scrollY(p);
  expect('p35 Forward restores the family list too', y3 === 0, Math.abs(y3 - yB) <= 2, 'y=' + y3 + ' saved=' + yB);
  await ctx.close();
});

// P35 — card with late images: Back from a linked card restores deep into the first card
job('p35-card-late-images', async () => {
  // Card A = a card with photos ABOVE the link we follow (86PK2027 Gravity: 3 photos, links at the foot).
  const { p, ctx } = await open({ start: '#/pn/86PK2027' });
  await sleep(1500);
  await p.evaluate(() => { const ls = [...document.querySelectorAll('#content .linkbtn[data-go], #content .refbtn[data-go], #content .rel[data-go]')]; const l = ls[ls.length - 1]; if (l) l.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const y0 = await scrollY(p);
  const link = await p.evaluate(() => { const ls = [...document.querySelectorAll('#content .linkbtn[data-go], #content .refbtn[data-go], #content .rel[data-go]')]; const l = ls[ls.length - 1]; return l ? l.getAttribute('data-go') : null; });
  if (!link || y0 < 300) { check('p35 card: found a link well down the card', false, 'link=' + link + ' y0=' + y0); await ctx.close(); return; }
  await p.tap('[data-go="' + link + '"]'); await sleep(900);
  // Simulate photos that have not arrived yet (offline cache miss / slow signal): they take no space until released.
  await p.addStyleTag({ content: '#content img{display:none !important}' });
  await tapBack(p, 350);
  const yEarly = await scrollY(p);
  await p.evaluate(() => { [...document.querySelectorAll('style')].filter(s => /img\{display:none !important\}/.test(s.textContent)).forEach(s => s.remove()); });
  await sleep(1200);
  const y = await scrollY(p);
  expect('p35 card with late images: scroll restored once the photos land', y === 0, Math.abs(y - y0) <= 4, 'y=' + y + ' early=' + yEarly + ' saved=' + y0 + ' link=' + link);
  // User intent wins: if the user scrolls while the restore is still waiting, it gives up (no jump later).
  await p.tap('[data-go="' + link + '"]'); await sleep(900);
  await p.addStyleTag({ content: '#content img{display:none !important}' });
  await tapBack(p, 300);
  await p.mouse.wheel(0, 120); await sleep(150);
  const yUser = await scrollY(p);
  await p.evaluate(() => { [...document.querySelectorAll('style')].filter(s => /img\{display:none !important\}/.test(s.textContent)).forEach(s => s.remove()); });
  await sleep(1000);
  const y2 = await scrollY(p);
  if (FIXED) check('[fixed] p35 restore gives up when the user scrolls first (no late jump)', Math.abs(y2 - yUser) <= 4, 'user=' + yUser + ' later=' + y2);
  await ctx.close();
});

// P6 — clearing the search box on the Backorder Report
job('p6-bo-clear-search', async () => {
  const { p, ctx } = await open({ start: '#/bo' });
  await sleep(1200);
  const rows0 = await p.$$eval('.bo-row', r => r.length);
  await p.fill('#q', 'iconix'); await sleep(400);
  await p.fill('#q', ''); await sleep(500);
  const rows1 = await p.$$eval('.bo-row', r => r.length);
  const chips = await p.$$eval('.bochip', r => r.length);
  expect('p6 BO report still drawn after clearing the search box', rows1 === 0, rows1 === rows0, rows1 + '/' + rows0 + ' chips=' + chips);
  if (rows1) { // the filter box still works (listeners re-bound)
    await p.fill('#bo-q', 'flowport'); await sleep(400);
    const n = await p.$$eval('.bo-row', r => r.length);
    check('p6 BO filter works after clearing search', n >= 1 && n < rows0, n + ' rows');
  }
  await ctx.close();
});

// P14 — unknown part-number link
job('p14-unknown-pn', async () => {
  const { p, ctx } = await open({ start: '#/about' });
  await p.evaluate(() => { location.hash = '#/pn/NOPE12345'; }); await sleep(800);
  const s = await p.evaluate(() => ({ h: location.hash, title: document.getElementById('title').textContent, txt: document.getElementById('content').innerText.slice(0, 200), home: document.getElementById('content').classList.contains('homeview') }));
  expect('p14 #/pn/NOPE12345 explains instead of showing Home', s.home, !s.home && /NOPE12345/.test(s.txt) && /isn.t in ToolBox/i.test(s.txt), JSON.stringify(s).slice(0, 160));
  await ctx.close();
});

// P15 — hub fails with nothing saved
job('p15-bo-fail', async () => {
  const { p, ctx } = await open({ boFail: true, start: '#/bo' });
  await sleep(2500);
  const s = await p.evaluate(() => ({ sub: (document.getElementById('bo-sub') || {}).textContent, filterShown: !!document.getElementById('bo-q') && !document.getElementById('bo-q').hidden && getComputedStyle(document.getElementById('bo-q')).display !== 'none' }));
  expect('p15 sub line does not say Loading… after the hub failed', s.sub === 'Loading…', s.sub !== 'Loading…' && !s.filterShown, JSON.stringify(s));
  await ctx.close();
});

// P46 — card banner opens the report filtered to that part; filter + section survive Back
job('p46-bo-from-card', async () => {
  const { p, ctx } = await open();
  await sleep(2200); // the report loads 1.5 s after start; cards drawn before that carry no banner
  await p.evaluate(() => { location.hash = '#/pn/3910500580'; }); await sleep(900);
  if (await p.$('.bobanner .st-l')) { await p.tap('.bobanner .st-l'); await sleep(400); } // R6 card: the report link sits in the status line's details
  const go = await p.$eval('.bobanner .bo-more', b => b.getAttribute('data-go'));
  await p.tap('.bobanner .bo-more'); await sleep(1200);
  const s = await p.evaluate(() => ({ h: location.hash, q: (document.getElementById('bo-q') || {}).value, rows: document.querySelectorAll('.bo-row').length }));
  expect('p46 banner link carries the part number', go === '#/bo', /^#\/bo\?.*3910500580/.test(go), go);
  expect('p46 report opens filtered to the part', s.q === '', s.q === '3910500580' && s.rows === 1, JSON.stringify(s));
  // words in any order
  await p.fill('#bo-q', 'guide iconix'); await sleep(400);
  const n = await p.$$eval('.bo-row', r => r.length);
  expect('p46 filter accepts words in any order ("guide iconix")', n === 0, n >= 1, n + ' rows');
  // section chip + Back
  await p.fill('#bo-q', ''); await sleep(300);
  await p.tap('.bochip[data-bo-sec="bo"]'); await sleep(300);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(250);
  const y0 = await scrollY(p);
  const row = await p.evaluate(() => { const r = [...document.querySelectorAll('button.bo-row')].find(x => { const b = x.getBoundingClientRect(); return b.top > 150 && b.bottom < innerHeight - 140; }); return r && r.getAttribute('data-go'); });
  if (!row) { check('p46 found a report row in view', false, 'none at y=' + y0); await ctx.close(); return; }
  await p.tap('button.bo-row[data-go="' + row + '"]'); await sleep(900);
  await tapBack(p, 1200);
  const s2 = await p.evaluate(() => ({ sec: (document.querySelector('.bochip.on') || {}).getAttribute ? document.querySelector('.bochip.on').getAttribute('data-bo-sec') : '', y: Math.round(scrollY) }));
  expect('p46 section chip survives Back', s2.sec === 'all', s2.sec === 'bo', JSON.stringify(s2));
  expect('p35 BO report scroll restored', s2.y === 0, Math.abs(s2.y - y0) <= 4, 'y=' + s2.y + ' saved=' + y0);
  await ctx.close();
});

// P11 — scan button on screen at 320 px
job('p11-scanbtn-320', async () => {
  const { p, ctx } = await open({ vp: { width: 320, height: 568 } });
  const r = await p.evaluate(() => { const b = document.getElementById('scanbtn').getBoundingClientRect(); return { right: Math.round(b.right), vw: document.documentElement.clientWidth, docW: document.documentElement.scrollWidth }; });
  expect('p11 scan button fully on screen at 320px', r.right > r.vw, r.right <= r.vw - 8 && r.docW <= r.vw, JSON.stringify(r));
  await ctx.close();
});

// P10 — size chip inline, pills keep their colours
job('p10-row-css', async () => {
  const { p, ctx } = await open();
  await p.fill('#q', 'iconix'); await sleep(500);
  const r = await p.evaluate(() => { const sz = document.querySelector('.rowitem .rl .sz'); const cs = getComputedStyle(sz); return { display: cs.display, color: cs.color }; });
  expect('p10 size stays inline and cyan', r.display === 'block', r.display === 'inline' && r.color === 'rgb(124, 207, 232)', JSON.stringify(r));
  await ctx.close();
  const b = await open({ start: '#/bo' }); await sleep(1500);
  const pill = await b.p.evaluate(() => { const x = document.querySelector('.bo-row .bopill.bo'), k = document.querySelector('.bo-row .bo-sku'); return { color: getComputedStyle(x).color, sku: getComputedStyle(k).color }; });
  expect('p10 report pills and SKUs keep their colours', pill.color !== 'rgb(255, 179, 174)', pill.color === 'rgb(255, 179, 174)' && pill.sku === 'rgb(253, 181, 21)', JSON.stringify(pill));
  await b.ctx.close();
});

// P18 — glossary panel swallows the next tap
job('p18-gloss-swallow', async () => {
  const { p, ctx } = await open({ start: '#/pn/3910500522' });
  await sleep(600);
  await p.evaluate(() => document.querySelector('.gterm').scrollIntoView({ block: 'center' })); await sleep(200);
  await p.tap('.gterm'); await sleep(300);
  const open1 = await p.evaluate(() => !document.getElementById('glosspanel').hidden);
  await p.evaluate(() => document.querySelector('.chip.link').scrollIntoView({ block: 'center' })); await sleep(200);
  const h0 = await hash(p);
  await p.tap('.chip.link'); await sleep(700);
  const h1 = await hash(p);
  check('p18 setup: glossary panel opened', open1);
  expect('p18 a tap while the glossary is open still acts', h1 === h0, h1 !== h0, h0 + ' -> ' + h1);
  await ctx.close();
});

// P17 — What's New: newest item visible first; tapping an item marks it seen
job('p17-whatsnew', async () => {
  const { p, ctx } = await open({ ls: { tbx_wn_seen: '1' } });
  await sleep(400);
  // the expected newest item and version come from the payload (What's New is data): v7 = "Sep 9" (Backorder Report),
  // v8 = "Sep 25" (ACL case lab, whose item opens the lab)
  const wn = await p.evaluate(() => { const w = window.TBX_WN || { items: [] }, last = w.items[w.items.length - 1] || {}; return { v: String(w.v), d: last.d || '', oldest: (w.items[0] || {}).d || '' }; });
  const first = await p.evaluate(() => { const el = [...document.querySelectorAll('#wncard .wn-i')].find(x => getComputedStyle(x).display !== 'none'); return el ? el.textContent.slice(0, 12) : ''; });
  expect('p17 newest What\'s New item shown first', wn.oldest !== wn.d && first.startsWith(wn.oldest), first.startsWith(wn.d), first + ' (newest ' + wn.d + ')');
  // read it before a lab item's hand-over leaves the page (the harness re-seeds tbx_wn_seen on every page load)
  await p.tap('#wncard .wn-i[data-go], #wncard .wn-i[data-lab-go]'); await sleep(120);
  const seen = await p.evaluate(() => localStorage.getItem('tbx_wn_seen')).catch(() => 'navigated');
  expect('p17 tapping an item marks What\'s New seen', seen === '1', seen === wn.v, 'tbx_wn_seen=' + seen + ' (v' + wn.v + ')');
  await ctx.close();
  // first launch: the tour, never What's New on top of it; finishing the tour marks What's New seen
  const f = await open({ tour: true, ls: { tbx_wn_seen: '1' } });
  await sleep(900);
  const both = await f.p.evaluate(() => ({ tour: !!document.getElementById('tour'), wn: !!document.getElementById('wncard') }));
  expect('p17 first launch: tour without What\'s New underneath', both.tour && both.wn, both.tour && !both.wn, JSON.stringify(both));
  for (let i = 0; i < 3; i++) { await f.p.tap('.tr-next').catch(() => {}); await sleep(250); }
  const seen2 = await f.p.evaluate(() => localStorage.getItem('tbx_wn_seen'));
  expect('p17 finishing the tour marks What\'s New seen', seen2 === '1', seen2 === wn.v, 'tbx_wn_seen=' + seen2);
  await f.ctx.close();
});

// P36 — Back in the bottom bar: only on sub-screens, same history step as the header Back
job('p36-bottom-back', async () => {
  const { p, ctx } = await open();
  const home = await p.evaluate(() => { const b = document.getElementById('bb-back'); return b ? getComputedStyle(b).display : 'absent'; });
  await p.tap('.tile[data-go="#/top/implants"]'); await sleep(700);
  await p.tap('.rowitem[data-go^="#/cat/"], .tile[data-go^="#/cat/"]'); await sleep(700);
  const h1 = await hash(p);
  const vis = await p.evaluate(() => { const b = document.getElementById('bb-back'); if (!b) return null; const r = b.getBoundingClientRect(); return { d: getComputedStyle(b).display, x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; });
  expect('p36 bottom Back hidden on Home, shown on sub-screens', !vis, home === 'none' && vis && vis.d !== 'none' && vis.w >= 44 && vis.h >= 44, 'home=' + home + ' sub=' + JSON.stringify(vis));
  if (vis) { await p.tap('#bb-back'); await sleep(700); const h2 = await hash(p); check('[fixed] p36 bottom Back goes back one step', h2 === '#/top/implants', h1 + ' -> ' + h2); }
  await p.evaluate(() => { location.hash = '#/cc'; }); await sleep(800);
  const cc = await p.evaluate(() => getComputedStyle(document.getElementById('bottombar')).display);
  check('p36 bottom bar stays hidden on cycle count', cc === 'none', cc);
  await ctx.close();
});

// P37 — Home shows 8 favorites + Show all; the expanded list survives a card round trip
job('p37-favs', async () => {
  const skus = ['3910500522', 'CAT02438', '3910500580', '86PK2027', '3910847022', '3911514610', '3910200080', '3910500512', '3910500312', '242200025', '3910500392', '3910500471'];
  const favs = skus.map(s => ({ route: '#/pn/' + s, it: { t: 'Saved ' + s, sku: s } }));
  const { p, ctx } = await open({ ls: { tbx_favs: JSON.stringify(favs) } });
  const n0 = await p.$$eval('.rowwrap [data-unfav-route]', r => r.length);
  expect('p37 Home lists 8 favorites of 12', n0 === 12, n0 === 8 && !!(await p.$('[data-favall]')), 'rows=' + n0);
  const title = await p.$eval('.rowwrap .rowitem .ti', e => e.textContent);
  expect('p38 favorite rows show the current card title', /^Saved /.test(title), !/^Saved /.test(title), title);
  if (FIXED) {
    await sleep(1500); // let the backorder report land first, so every Home render carries the same pills
    await p.tap('[data-favall="1"]'); await sleep(300);
    const n1 = await p.$$eval('.rowwrap [data-unfav-route]', r => r.length);
    await p.evaluate(() => { const r = [...document.querySelectorAll('.rowwrap .rowitem')][10]; r.scrollIntoView({ block: 'center' }); }); await sleep(200);
    const rowTop = () => p.evaluate(() => Math.round([...document.querySelectorAll('.rowwrap .rowitem')][10].getBoundingClientRect().top));
    const t0 = await rowTop();
    await (await p.$$('.rowwrap .rowitem'))[10].tap(); await sleep(800);
    await tapBack(p, 1000);
    const n2 = await p.$$eval('.rowwrap [data-unfav-route]', r => r.length), t1 = await rowTop();
    // the same row sits where it was (pills that arrived meanwhile may have moved everything above it)
    check('[fixed] p37 Show all expands to 12 and stays expanded after a card + Back', n1 === 12 && n2 === 12 && Math.abs(t1 - t0) <= 4, 'n1=' + n1 + ' n2=' + n2 + ' row top ' + t1 + '/' + t0);
  }
  await ctx.close();
});

// P12 — the feedback bubble fades while the page moves, returns after it has been still
job('p12-bubble', async () => {
  const { p, ctx } = await open({ start: '#/cat/Instruments' });
  const st = () => p.evaluate(() => { const f = document.getElementById('fb-fab'); return { away: f.classList.contains('fb-away'), op: getComputedStyle(f).opacity, pe: getComputedStyle(f).pointerEvents }; });
  const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(p) : null;
  if (!cdp) { check('p12 (touch drag needs CDP; Chromium only)', true); await ctx.close(); return; }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 600 - i * 40 }] }); await sleep(16); }
  await sleep(200); const moving = await st();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1100); const still = await st();
  expect('p12 bubble fades out while the finger moves the page', !moving.away, moving.away && moving.pe === 'none' && +moving.op < 0.05, JSON.stringify(moving));
  expect('p12 bubble is back ~600 ms after the page stops', !still.away, !still.away && +still.op > 0.95 && still.pe !== 'none', JSON.stringify(still));
  // a tap (no drag) followed by a programmatic scroll — what every row tap + route() does — must not blink it
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.evaluate(() => window.scrollTo(0, 500)); await sleep(60);
  const prog = await st();
  check('p12 programmatic scroll leaves the bubble alone', !prog.away, JSON.stringify(prog));
  await ctx.close();
});

// P18 — "(" stays with its glossary term
job('p18-gterm', async () => {
  const { p, ctx } = await open({ start: '#/pn/3910500522' });
  const r = await p.evaluate(() => {
    const g = [...document.querySelectorAll('.gterm')].find(x => /UHMWPE/.test(x.textContent)); if (!g) return null;
    const prev = g.previousSibling ? g.previousSibling.textContent : '', wrap = g.parentElement;
    const range = document.createRange(); range.setStart(wrap.firstChild, 0); range.setEnd(g.firstChild, 1);
    const rects = [...range.getClientRects()].filter(x => x.width > 0); const tops = new Set(rects.map(x => Math.round(x.top)));
    return { wrapped: wrap.className, lines: tops.size, prev: prev.slice(-3) };
  });
  expect('p18 "(" and the glossary term share a line', r && r.wrapped !== 'gnb', r && r.wrapped === 'gnb' && r.lines === 1, JSON.stringify(r));
  await ctx.close();
});

// P40 — hit areas: a tap 20 pt above/below the visual centre still lands on the control
job('p40-targets', async () => {
  const favs = [{ route: '#/pn/3910500522', it: { t: 'x', sku: '3910500522' } }, { route: '#/pn/CAT02438', it: { t: 'y', sku: 'CAT02438' } }];
  const { p, ctx } = await open({ ls: { tbx_favs: JSON.stringify(favs), tbx_recents: JSON.stringify([{ sku: 'CAT02438', label: 'y' }]) } });
  const probe = (sels) => p.evaluate((sels) => sels.map(s => {
    const e = document.querySelector(s); if (!e) return [s, 'absent'];
    e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = Math.round(b.top + b.height / 2);
    const hit = (y) => { const t = document.elementFromPoint(cx, y); return !!(t && (t === e || e.contains(t))); };
    let up = 0, dn = 0; while (up < 40 && hit(cy - up - 1)) up++; while (dn < 40 && hit(cy + dn + 1)) dn++; // tappable height through the centre
    return [s, Math.round(b.width) + 'x' + Math.round(b.height) + ', hit ' + (up + dn + 1), up + dn + 1 >= 44 ? 'ok' : 'small'];
  }), sels);
  const home = await probe(['.clearrec', '.rwact', '.footlink']);
  await sleep(1200); // the report arrives 1.5 s after start; the banner needs it
  await p.evaluate(() => { location.hash = '#/pn/3910500522'; }); await sleep(900);
  await p.evaluate(() => { const t = document.querySelector('.bobanner .st-l'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); }); await sleep(400); // R6: open the status details
  const card = await probe(['.chip.link', '.bobanner .bo-more']);
  await p.evaluate(() => { location.hash = '#/bo'; }); await sleep(1200);
  const bo = await probe(['#bo-refresh', '.bochip']);
  const all = home.concat(card, bo);
  all.forEach(([s, sz, ok]) => expect('p40 ' + s + ' hit area ≥ 44 pt (' + sz + ')', ok !== 'ok', ok === 'ok', ok));
  await ctx.close();
});

// P52 — Add to Home Screen steps per Safari version
job('p52-a2hs', async () => {
  const cases = [['iOS 26 Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', /next to the address bar/],
    ['iOS 18 Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', /in the toolbar/],
    ['Chrome on iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1', /sportsmedtoolbox\.com<\/b> in <b>Safari|sportsmedtoolbox\.com in Safari/]];
  for (const [name, ua, re] of cases) {
    const { p, ctx } = await open({ ua, a2hs: true });
    const card = await p.$('[data-act="a2hs"]');
    if (!card) { check('p52 ' + name + ': install card shown', false); await ctx.close(); continue; }
    await card.tap(); await sleep(400);
    const txt = await p.$eval('#a2hs-sheet ol', e => e.textContent);
    expect('p52 ' + name + ' steps', !re.test(txt), re.test(txt), txt.slice(0, 110));
    await ctx.close();
  }
});

// P36 — the catalog header is 9 pt shorter with the title where it was; cycle count keeps its header; the bar fits at 320
job('p36-header-bar', async () => {
  const hdr = p => p.evaluate(() => { const b = document.getElementById('bar').getBoundingClientRect(), t = document.getElementById('title').getBoundingClientRect(), k = document.getElementById('back').getBoundingClientRect();
    return { bottom: Math.round(b.bottom), titleMid: Math.round(t.top + t.height / 2), back: Math.round(k.width) + 'x' + Math.round(k.height) }; });
  const { p, ctx } = await open({ start: '#/cat/Suture' });
  const cat = await hdr(p);
  await p.evaluate(() => { location.hash = '#/cc'; }); await sleep(700);
  const cc = await hdr(p);
  expect('p36 catalog header 9 pt shorter than cycle count\'s, title centre unchanged', cat.bottom === cc.bottom, cc.bottom - cat.bottom === 9 && Math.abs(cat.titleMid - cc.titleMid) <= 1 && cat.back === '44x44' && cc.back === '52x52', JSON.stringify({ cat, cc }));
  await ctx.close();
  const n = await open({ vp: { width: 320, height: 568 }, start: '#/cat/Suture' });
  const r = await n.p.evaluate(() => { const g = id => document.getElementById(id).getBoundingClientRect(), q = document.getElementById('q');
    return { back: Math.round(g('bb-back').left) + '/' + Math.round(g('bb-back').width), scanRight: Math.round(g('scanbtn').right), vw: document.documentElement.clientWidth, docW: document.documentElement.scrollWidth, ph: q.placeholder, qw: Math.round(q.getBoundingClientRect().width) }; });
  check('[fixed] p36 320 pt sub-screen: Back + search + scan fit, no sideways scroll', r.scanRight <= r.vw - 8 && r.docW <= r.vw && /^12\/44$/.test(r.back) && r.qw >= 100, JSON.stringify(r));
  await n.ctx.close();
  const l = await open({ vp: { width: 844, height: 390 }, start: '#/pn/3910500522' });
  const lr = await l.p.evaluate(() => { const b = document.getElementById('bb-back').getBoundingClientRect(), s = document.getElementById('scanbtn').getBoundingClientRect(); return { back: Math.round(b.height), scan: Math.round(s.height), hdr: Math.round(document.getElementById('bar').getBoundingClientRect().bottom) }; });
  check('[fixed] p36 landscape: compact 44 pt bar with the Back', lr.back === 44 && lr.scan === 44, JSON.stringify(lr));
  await l.ctx.close();
});

// P21 — the spec filters are one scrolling row of 44 pt pills, "Clear · N" leads it, the count sits in the bucket chip
job('p21-filter-row', async () => {
  const { p, ctx } = await open({ vp: { width: 320, height: 568 } });
  await p.fill('#q', 'anchor'); await sleep(500);
  await p.tap('.schip[data-sf="Implants"]'); await sleep(400);
  const r = await p.evaluate(() => { const row = document.querySelector('.sfrow'), pills = [...row.querySelectorAll('.sfsel')];
    return { n: pills.length, tops: [...new Set(pills.map(x => Math.round(x.getBoundingClientRect().top)))].length, minH: Math.min.apply(null, pills.map(x => Math.round(x.getBoundingClientRect().height))),
      scrolls: row.scrollWidth > row.clientWidth, docW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, rowH: Math.round(row.getBoundingClientRect().height) }; });
  check('[fixed] p21 filters are one row of ≥44 pt pills that scrolls sideways at 320', r.n >= 4 && r.tops === 1 && r.minH >= 44 && r.scrolls && r.docW <= r.vw, JSON.stringify(r));
  await p.selectOption('select[data-sfk="strands"]', 'n2'); await sleep(400);
  const s2 = await p.evaluate(() => ({ chip: document.querySelector('.schip.on[data-sf]').textContent, sfx: (document.querySelector('.sfrow .sfx') || {}).textContent, h: location.hash,
    sfxH: Math.round(document.querySelector('.sfrow .sfx').getBoundingClientRect().height), first: document.querySelector('.sfrow').firstElementChild.className, v: document.querySelector('select[data-sfk="strands"]').closest('.sfsel').querySelector('.sfv').textContent }));
  check('[fixed] p21 a pick shows on its pill, "Clear · 1" leads the row, the count moves into the chip, the URL carries it', /Implants · \d+ of \d+/.test(s2.chip) && /Clear · 1/.test(s2.sfx) && s2.first === 'sfx' && s2.sfxH >= 44 && s2.v === '2 strands' && /c=Implants&strands=2$/.test(s2.h), JSON.stringify(s2));
  await ctx.close();
});

// P5/P21 — the filter row comes back scrolled where it was, with the picked pill in view
job('p5-filter-row-scroll', async () => {
  const { p, ctx } = await open({ vp: { width: 320, height: 568 } });
  await p.fill('#q', 'anchor'); await sleep(500);
  await p.tap('.schip[data-sf="Implants"]'); await sleep(400);
  await p.evaluate(() => { const r = document.querySelector('.sfrow'); r.scrollLeft = r.scrollWidth; }); await sleep(200);
  await p.selectOption('select[data-sfk="strands"]', 'n2'); await sleep(400);
  const x0 = await p.evaluate(() => Math.round(document.querySelector('.sfrow').scrollLeft));
  await (await p.$$('#content .list .rowitem'))[0].tap(); await sleep(800);
  await tapBack(p, 1000);
  const r = await p.evaluate(() => { const row = document.querySelector('.sfrow'), on = row && row.querySelector('.sfsel.on'), rb = row.getBoundingClientRect(), ob = on && on.getBoundingClientRect();
    return { x: Math.round(row.scrollLeft), onVisible: !!(ob && ob.left >= rb.left - 1 && ob.right <= rb.right + 1), v: on && on.querySelector('.sfv').textContent }; });
  expect('p5 the filter row is scrolled back to the picked pill', r.x === 0, x0 > 0 && Math.abs(r.x - x0) <= 2 && r.onVisible && r.v === '2 strands', 'x0=' + x0 + ' ' + JSON.stringify(r));
  await ctx.close();
});

// P20 — recent searches sit on top of the bar while the empty box is focused; a chip runs the search
job('p20-recent-strip', async () => {
  const { p, ctx } = await open({ ls: { tbx_qrecent: JSON.stringify(['iconix', 'omega 4.75', 'flowport']) } });
  await p.tap('#q'); await sleep(300);
  const r = await p.evaluate(() => { const s = document.getElementById('qrecent'), b = document.getElementById('bottombar').getBoundingClientRect(), sb = s.getBoundingClientRect(), c = [...s.querySelectorAll('.qrc')];
    return { shown: !s.hidden, chips: c.map(x => x.textContent), onBar: Math.abs(sb.bottom - b.top) <= 1, minH: Math.min.apply(null, c.map(x => Math.round(x.getBoundingClientRect().height))), fab: (f => f ? getComputedStyle(f).visibility : 'hidden')(document.getElementById('fb-fab')) }; });
  check('[fixed] p20 focusing the empty box shows the last searches on top of the bar', r.shown && r.chips.join('|') === 'iconix|omega 4.75|flowport' && r.onBar && r.minH >= 44 && r.fab === 'hidden', JSON.stringify(r));
  await p.tap('#qrecent .qrc'); await sleep(500);
  const s2 = await p.evaluate(() => ({ q: document.getElementById('q').value, rows: document.querySelectorAll('#content .list .rowitem').length, strip: document.getElementById('qrecent').hidden, focus: document.activeElement === document.getElementById('q') }));
  check('[fixed] p20 a chip runs the search, hides the strip and drops the keyboard', s2.q === 'iconix' && s2.rows > 0 && s2.strip && !s2.focus, JSON.stringify(s2));
  await ctx.close();
});

// P39 — list rows: text only (no photos), pills under the title, two description lines; P41 plain titles, drill rows
job('p39-rows-p41-titles', async () => {
  const favs = [{ route: '#/pn/3910500522', it: { t: 'x', sku: '3910500522' } }];
  const { p, ctx } = await open({ ls: { tbx_favs: JSON.stringify(favs) } });
  await sleep(1500); // the report lands first, so rows carry their status pills
  const rowImgs = async () => p.evaluate(() => document.querySelectorAll('#content .rowitem img, #content .rowitem picture').length);
  let imgs = await rowImgs();
  await p.fill('#q', 'iconix'); await sleep(500);
  imgs += await rowImgs();
  const r = await p.evaluate(() => { const rows = [...document.querySelectorAll('#content .list .rowitem')];
    const withTags = rows.find(x => x.querySelector('.rtags .subtag, .rtags .bopill')), ld = rows.map(x => x.querySelector('.rl > .ld')).find(Boolean), cs = ld && getComputedStyle(ld);
    return { rows: rows.length, subtags: document.querySelectorAll('#content .subtags').length, pillsUnder: withTags ? withTags.querySelector('.rtags').getBoundingClientRect().top > withTags.querySelector('.ti').getBoundingClientRect().top : null,
      clamp: cs ? (cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp')) : null, ws: cs ? cs.whiteSpace : null }; });
  await p.fill('#q', ''); await sleep(300);
  await p.evaluate(() => { location.hash = '#/fam/' + encodeURIComponent('Corkscrew Anchors') + '/' + encodeURIComponent('Gravity anchor'); }); await sleep(800);
  imgs += await rowImgs();
  await p.evaluate(() => { location.hash = '#/cat/' + encodeURIComponent('Corkscrew Anchors'); }); await sleep(700);
  const t1 = await p.evaluate(() => ({ title: document.getElementById('title').innerHTML, drill: document.querySelectorAll('#content .rowitem.drill').length }));
  await p.evaluate(() => { location.hash = '#/top/implants'; }); await sleep(700);
  const t2 = await p.evaluate(() => ({ tiles: document.querySelectorAll('#content .tile').length, drill: document.querySelectorAll('#content .rowitem.drill').length, one: /\b1 items\b/.test(document.getElementById('content').textContent) }));
  await p.evaluate(() => { location.hash = '#/'; }); await sleep(700);
  const home = await p.evaluate(() => document.getElementById('title').innerHTML);
  check('[fixed] p39 list rows are text only: no product photos', imgs === 0, 'imgs=' + imgs);
  check('[fixed] p39 pills under the title, two description lines', r.rows > 5 && r.subtags === 0 && r.pillsUnder === true && String(r.clamp) === '2' && r.ws === 'normal', JSON.stringify(r));
  check('[fixed] p41 plain screen titles and one drill-down row style (Home keeps its wordmark)', t1.title === 'Corkscrew Anchors' && t1.drill > 1 && t2.tiles === 0 && t2.drill > 3 && !t2.one && /<em>Med Toolbox<\/em>/.test(home), JSON.stringify({ t1, t2, home }));
  await ctx.close();
});

// P47 — report header: Highspot in the status line, one scrolling row of chips, amber active chip, passed dates in red
job('p47-report-header', async () => {
  const { p, ctx } = await open({ vp: { width: 320, height: 568 }, start: '#/bo' });
  await sleep(1500);
  const r = await p.evaluate(() => { const chips = [...document.querySelectorAll('#bo-chips .bochip')], on = document.querySelector('.bochip.on'), late = document.querySelector('.bo-row .bo-late');
    return { hs: !!document.querySelector('#bo-sub a.bo-hs'), srcBelow: document.getElementById('bo-src').getBoundingClientRect().top > document.getElementById('bo-body').getBoundingClientRect().bottom - 1,
      oneRow: new Set(chips.map(x => Math.round(x.getBoundingClientRect().top))).size === 1, onBg: on && getComputedStyle(on).backgroundColor,
      late: late && late.textContent, lateColor: late && getComputedStyle(late).color, firstRow: Math.round(document.querySelector('.bo-row').getBoundingClientRect().top), docW: document.documentElement.scrollWidth }; });
  check('[fixed] p47 Highspot in the status line, note in the footer, one chip row, amber active chip, red "Clear date passed"',
    r.hs && r.srcBelow && r.oneRow && r.onBg === 'rgb(253, 181, 21)' && r.late === 'Clear date passed' && r.lateColor === 'rgb(242, 139, 139)' && r.docW <= 320, JSON.stringify(r));
  await ctx.close();
});

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(900);
  browser = await chromium.launch({ headless: true });
  for (const j of JOBS) {
    if (ONLY && !ONLY.test(j.name)) continue;
    try { await j.fn(); } catch (e) { check('JOB ' + j.name + ' ran', false, (e && e.message || String(e)).slice(0, 300)); }
  }
  await browser.close(); server.kill();
  const ok = results.filter(r => r.ok).length;
  console.log('\n' + ok + '/' + results.length + ' passed (MODE=' + MODE + ', ENGINE=' + ENGINE + ', ROOT=' + ROOT + ')');
  process.exit(ok === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
