// Product-card screenshots, layout measurements and interactions (Playwright; hubs faked, no external network,
// service worker blocked). Serves the site with tools/platform-test/tserver.js.
//   APP_PW=<catalog pw> node tools/cards-test/card-shots.cjs --out <dir> [--site <dir>] [--port 84xx] [--engine chromium|webkit]
//        [--widths 320,390,430] [--cards sku:name,…] [--no-interact]          screenshots + <out>/measure.json
//   APP_PW=<catalog pw> node tools/cards-test/card-shots.cjs --sweep --out <dir> [--site <dir>] [--port 84xx]
//        every card at 390×844: height and the y of the key blocks → <out>/heights.json + a summary line
// --site defaults to the repo root. WebKit needs PLAYWRIGHT_BROWSERS_PATH pointing at a Playwright WebKit build.
const pw = require('playwright');
const { spawn } = require('child_process'); const fs = require('fs'), path = require('path');
const A = process.argv.slice(2), arg = (k, d) => { const i = A.indexOf('--' + k); return i > -1 ? A[i + 1] : d; }, has = k => A.includes('--' + k);
const SITE = path.resolve(arg('site', path.join(__dirname, '../..'))), OUT = path.resolve(arg('out', '')), ENGINE = arg('engine', 'chromium');
const PORT = +arg('port', 8420), BASE = 'http://localhost:' + PORT + '/', PWD = process.env.APP_PW;
const WIDTHS = arg('widths', '320,390,430').split(',').map(Number);
if (!PWD || !arg('out')) { console.error('need APP_PW and --out <dir>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BO_API = { ok: true, ver: 1, asOf: '2026-09-21T18:00:00Z', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: 'https://example.invalid/highspot',
  backorders: [
    { sku: '3911514610', desc: 'ICONIX 1 1.4MM', since: '2026-08-24', clearDate: '2026-10-15', clearText: '', note: 'Allocation in place. Substitute 3910500512 (same anchor, standard inserter) where possible.', asOf: '2026-09-21' },
    { sku: '3910200080', desc: 'BIOSTEON INTRALINE 4.5MM', since: '2026-07-27', clearDate: '2026-09-12', clearText: '', note: '', asOf: '2026-09-21' },
    { sku: 'CAT02438', desc: 'FLOWPORT II 165MM STRYKER', since: '2026-09-14', clearDate: '2026-10-03', clearText: '', note: '', asOf: '2026-09-21' },
    { sku: '3910500575', desc: 'MULTI-SYSTEM TRAY', since: '2026-09-07', clearDate: '', clearText: 'Q4', note: 'We are expecting a restock shipment mid-September, but will not fully recover until Q4.', asOf: '2026-09-09' }],
  controlled: [{ sku: '3910500522', desc: 'ICONIX 2 2.3MM ANCHOR', msg: 'Orders limited to 2 boxes per account per week.', since: '2026-09-07' }],
  cleared: [{ sku: '3910500312', desc: 'ICONIX 1 TT', clearedOn: '2026-09-14', since: '2026-08-10' }] };
// Iconix 2, FlowPort, the 2.3 DC guide (instrument), Biosteon (4 photos), a "Specs coming" card, CrossFlow (guides), Iconix 1 (backorder)
const CARDS = arg('cards', '') ? arg('cards').split(',').map(c => c.split(':')) : [['3910500522', 'iconix2'], ['CAT02438', 'flowport'], ['3910500582', 'dcguide'],
  ['3910200080', 'biosteon'], ['3910500575', 'specs-coming'], ['0450000000', 'crossflow'], ['3911514610', 'iconix1-bo']];
let browser;
async function open(vp, o) {
  o = o || {};
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    reducedMotion: o.reduced ? 'reduce' : 'no-preference', colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript((a) => {
    try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); if (a.admin) localStorage.setItem('tbx_uadm', 'admin-key'); } catch (e) {}
    let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) {
      if (v) { v.bo = a.bo ? { url: 'https://script.google.com/macros/s/fake-bo/exec', key: 'k' } : null; v.usage = null; v.fb = null; if (a.sweep) v.hub = null; }
      t = v; } });
  }, { admin: !!o.admin, bo: !o.sweep, sweep: !!o.sweep });
  const ins = vp.width === 320 ? { t: 20, b: 0 } : vp.width >= 430 ? { t: 59, b: 34 } : { t: 47, b: 34 };
  await ctx.addInitScript((ins) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style');
    s.textContent = ':root{--sat:' + ins.t + 'px !important; --sab:' + ins.b + 'px !important;}'; document.head.appendChild(s); }); }, ins);
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (/script\.google\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BO_API) });
    return r.abort();
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => { const s = String(e); if (!/reading 'waiting'/.test(s)) errs.push(s); }); // SW blocked → register() resolves undefined (test-only)
  await p.goto(BASE + '#/');
  await p.fill('#lockpw', PWD);
  await p.locator('#lockform').evaluate(f => f.requestSubmit());
  await p.waitForFunction(() => document.documentElement.classList.contains('authed') && window.__tbxRouted && document.getElementById('content').innerHTML.length > 200, null, { timeout: 60000 });
  await sleep(1900);
  return { p, ctx, errs };
}
async function settle(p) { // wait for the card's photos (they set the heights)
  await p.evaluate(() => Promise.race([Promise.all([...document.querySelectorAll('#content .card img')].map(i => i.complete ? 0 : new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); }))), new Promise(r => setTimeout(r, 2500))]));
}
async function go(p, h, wait) { await p.evaluate(x => { location.hash = x; }, h); await sleep(wait || 500); await settle(p); await p.evaluate(() => window.scrollTo(0, 0)); await sleep(150); }
async function shot(p, name, full) {
  if (full) await p.evaluate(() => { const s = document.createElement('style'); s.id = 'sim-full'; s.textContent = '#bottombar,#fb-fab{display:none!important}'; document.head.appendChild(s); });
  await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });
  if (full) await p.evaluate(() => { const s = document.getElementById('sim-full'); if (s) s.remove(); });
}
function measureFn() {
  const q = s => document.querySelector(s), top = e => e ? Math.round(e.getBoundingClientRect().top + scrollY) : null;
  const card = q('#content .card'), vw = document.documentElement.clientWidth;
  const instr = [...document.querySelectorAll('#content .card button')].find(b => /^Instrumentation/.test(b.textContent.trim()));
  const small = [...card.querySelectorAll('button, a[href]')].filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height && (r.height < 43.5 || r.width < 43.5) && getComputedStyle(b).visibility !== 'hidden' && !b.closest('.coll:not(.open)') && !b.classList.contains('gterm'); })
    .map(b => (b.className || b.tagName).split(' ')[0] + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height));
  const cr = card.getBoundingClientRect(), padR = parseFloat(getComputedStyle(card).paddingRight) + parseFloat(getComputedStyle(card).borderRightWidth);
  const over = [...card.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > cr.right - padR + 0.5 && getComputedStyle(e).position !== 'absolute' && !e.closest('.pnblock') && !e.closest('.pgal-t') && !e.closest('.cd-jump'); })
    .map(e => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right)).slice(0, 5);
  const firstVal = q('.kf .kf-v') || q('.ledger .lv');
  const bb = q('#bottombar').getBoundingClientRect().top;
  return { vw, docW: document.documentElement.scrollWidth, usableBottom: Math.round(bb), cardH: card ? Math.round(cr.height) : 0,
    title: top(q('.card h1')), status: top(q('.bobanner')), keyFacts: top(q('.kf')), pn: top(q('.pnblock')), instrLink: top(instr), jump: top(q('.cd-jump')),
    firstSpecValue: top(firstVal), table: top(q('.ledger')), photos: top(q('.cd-photos') || q('#content img.photo')),
    small: [...new Set(small)].slice(0, 12), overflowPastContent: over };
}
async function sweep() {
  const { p, ctx, errs } = await open({ width: 390, height: 844 }, { sweep: true });
  const skus = await p.evaluate(() => [...TOOLBOX.items.filter(i => !i.hidden), ...TOOLBOX.probes, ...TOOLBOX.shavers].map(i => i.sku));
  const out = [];
  for (const s of skus) {
    out.push(await p.evaluate(async (s) => {
      location.hash = '#/pn/' + encodeURIComponent(s);
      await new Promise(res => setTimeout(res, 30));
      const imgs = [...document.querySelectorAll('#content .card img')];
      await Promise.race([Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r2 => { i.onload = i.onerror = r2; }))), new Promise(r3 => setTimeout(r3, 1500))]);
      const c = document.querySelector('#content .card'), y = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
      const instr = [...document.querySelectorAll('#content .card button')].find(b => /^Instrumentation/.test(b.textContent.trim()));
      return { s, h: c ? Math.round(c.getBoundingClientRect().height) : 0, v2: !!document.querySelector('#pcard'), firstSpec: y('.kf .kf-v') || y('.ledger .lv'),
        table: y('.ledger'), photos: y('.cd-photos') || y('#content img.photo'), instr: instr ? Math.round(instr.getBoundingClientRect().top + scrollY) : null, jump: !!document.querySelector('.cd-jump'), kf: !!document.querySelector('.kf') };
    }, s));
  }
  fs.writeFileSync(path.join(OUT, 'heights.json'), JSON.stringify(out));
  const hs = out.map(o => o.h).sort((a, c) => a - c), qh = (x) => hs[Math.floor(x * (hs.length - 1))];
  const fs1 = out.filter(o => o.firstSpec).map(o => o.firstSpec).sort((a, c) => a - c), qf = x => fs1[Math.floor(x * (fs1.length - 1))];
  console.log(JSON.stringify({ cards: out.length, newCard: out.filter(o => o.v2).length, heightP50: qh(0.5), heightP90: qh(0.9), heightMax: hs[hs.length - 1],
    over2Screens: out.filter(o => o.h > 1470).length, firstSpecP50: qf(0.5), firstSpecP90: qf(0.9), firstSpecBelowFold: out.filter(o => o.firstSpec > 735).length,
    keyFacts: out.filter(o => o.kf).length, jumpChips: out.filter(o => o.jump).length, pageErrors: errs.length }));
  if (errs.length) console.log(errs.slice(0, 5).join('\n'));
  await ctx.close();
}
(async () => {
  const server = spawn('node', [path.join(__dirname, '../platform-test/tserver.js')], { env: { ...process.env, ROOT_OLD: SITE, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(700);
  browser = await pw[ENGINE].launch({ headless: true });
  const M = { site: SITE, engine: ENGINE };
  try {
    if (has('sweep')) { await sweep(); return; }
    for (const w of WIDTHS) {
      const vp = { width: w, height: w === 320 ? 568 : w === 390 ? 844 : 932 };
      const { p, ctx, errs } = await open(vp);
      for (const [sku, n] of CARDS) {
        await go(p, '#/pn/' + sku);
        M[w + ' ' + n] = await p.evaluate(measureFn);
        await shot(p, w + '-' + n, false);
        if (w === 390) await shot(p, w + '-' + n + '-full', true);
      }
      if (errs.length) M[w + ' errors'] = errs;
      await ctx.close();
    }
    if (has('no-interact')) return;
    const X = {};
    const { p, ctx, errs } = await open({ width: 390, height: 844 });
    await go(p, '#/pn/3911514610');
    if (await p.$('.st-l')) { await p.click('.st-l'); await sleep(450); await shot(p, 'i-status-open'); X.statusOpen = await p.evaluate(() => ({ h: Math.round(document.querySelector('.bobanner').getBoundingClientRect().height), expanded: document.querySelector('.st-l').getAttribute('aria-expanded') })); }
    await go(p, '#/pn/3910500522');
    await p.evaluate(() => window.scrollTo(0, 700)); await sleep(350);
    X.stickyPn = await p.evaluate(() => { const b = document.querySelector('.pnblock'); return b ? { top: Math.round(b.getBoundingClientRect().top), headerBottom: Math.round(document.getElementById('bar').getBoundingClientRect().bottom), style: getComputedStyle(b).position } : null; });
    await shot(p, 'i-sticky-pn');
    await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
    if (await p.$('.cd-jump [data-jump="cd-photos"]')) {
      await p.click('.cd-jump [data-jump="cd-photos"]'); await sleep(900);
      X.jumpPhotos = await p.evaluate(() => { const s = document.getElementById('cd-photos').getBoundingClientRect().top, b = document.querySelector('.pnblock').getBoundingClientRect().bottom; return { sectionTop: Math.round(s), bandBottom: Math.round(b) }; });
      await shot(p, 'i-jump-diagrams');
    }
    await go(p, '#/pn/3910200080');
    if (await p.$('.pgal-t')) {
      await p.evaluate(() => document.querySelector('.pgal-t').scrollIntoView({ block: 'center' })); await sleep(250);
      await p.evaluate(() => { const t = document.querySelector('.pgal-t'); t.scrollTo({ left: t.children[1].offsetLeft, behavior: 'instant' }); }); await sleep(450);
      X.counterAfterSwipe = await p.evaluate(() => document.querySelector('.pgal-n').textContent);
      await shot(p, 'i-strip');
      await p.click('.pgal-s[data-i="1"]'); await sleep(500);
      X.viewer = await p.evaluate(() => ({ open: !document.getElementById('lb').hidden, n: document.getElementById('lb-n').textContent, closeTop: Math.round(document.getElementById('lb-close').getBoundingClientRect().top), vh: innerHeight }));
      await shot(p, 'i-viewer');
      const b = await p.evaluate(() => { const r = document.getElementById('lb').getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 }; });
      await p.mouse.move(b.x + 120, b.y); await p.mouse.down(); for (let i = 1; i <= 8; i++) { await p.mouse.move(b.x + 120 - i * 30, b.y); await sleep(12); } await p.mouse.up(); await sleep(450);
      X.afterSwipe = await p.evaluate(() => document.getElementById('lb-n').textContent);
      await shot(p, 'i-viewer-swiped');
      await p.mouse.dblclick(b.x, b.y); await sleep(300);
      X.afterDoubleTap = await p.evaluate(() => window.TBX_DEV.card.viewer.state().scale);
      await p.evaluate(() => history.back()); await sleep(700);
      X.afterBack = await p.evaluate(() => ({ lbHidden: document.getElementById('lb').hidden, bodyOverflow: document.body.style.overflow, hash: location.hash }));
    }
    await go(p, '#/pn/3910500522');
    await p.click('.cd-ico[data-share]');
    await p.waitForFunction(() => { const s = document.getElementById('share-sheet'); return s && !s.hidden; });
    X.sharePrep = await p.evaluate(() => { const it = window.TOOLBOX.items.find(i => i.sku === '3910500522'); const t0 = performance.now(); return window.TBX_DEV.card.shPrep(it).p.then(v => ({ ok: !!(v && v.blob), bytes: v && v.blob.size, ms: Math.round(performance.now() - t0) })); });
    await shot(p, 'i-share-sheet');
    await p.evaluate(() => history.back()); await sleep(600);
    X.shareAfterBack = await p.evaluate(() => document.getElementById('share-sheet').hidden);
    X.errors = errs;
    await ctx.close();
    const o3 = await open({ width: 390, height: 844 }, { admin: true });
    await go(o3.p, '#/pn/3910500575'); await shot(o3.p, 'i-specs-coming-admin');
    X.adminFlag = await o3.p.evaluate(() => !!document.querySelector('.cd-todo'));
    X.errors = X.errors.concat(o3.errs);
    await o3.ctx.close();
    M.interactions = X;
  } finally {
    await browser.close(); server.kill();
    if (!has('sweep')) fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(M, null, 1));
  }
  if (M.interactions) console.log(JSON.stringify(M.interactions, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
