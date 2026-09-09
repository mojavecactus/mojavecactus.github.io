// Visual check: real app in headless Chromium at phone width, backorder hub faked, screenshots to tools/bo/shots/.
//   APP_PW=<catalog pw> node tools/bo/shots.js
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const C = require('./bo-core.js');
const R = path.resolve(__dirname, '../..'); const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 8123, BASE = 'http://localhost:' + PORT + '/';
const HUB = 'https://script.google.com/macros/s/fake-bo/exec';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/seed-2026-09-09.json'), 'utf8'));
const parsed = C.parseReportHtml(fs.readFileSync(path.join(__dirname, 'fixtures/report-2026-09-07.html'), 'utf8'));
const st = C.applyReport(C.seedState(seed), parsed, { weekOf: '2026-09-07', at: '2026-09-09T18:00:00Z', source: 'email' }).state;
const API = C.buildApi(st, { clearedDays: 30, reportId: '2026-09-07', weekOf: '2026-09-07', highspot: parsed.highspot });

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: R, stdio: 'ignore' });
  await sleep(800);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  await ctx.addInitScript((hub) => {
    try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); } catch (e) {}
    // the payload has no bo config yet: attach it as the decrypted data lands
    let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v && !v.bo) v.bo = { url: hub, key: 'k' }; t = v; } });
  }, HUB);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.route(/script\.google\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(API) }));
  await page.goto(BASE + '#/');
  await page.fill('#lockpw', process.env.APP_PW);
  await page.locator('#lockform').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await page.waitForFunction(() => document.body.innerText.indexOf('Works offline') > -1, null, { timeout: 30000 });
  await sleep(2200);
  const shot = async (name, full) => { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full }); console.log('shot', name); };
  await shot('home');
  await page.evaluate(() => { location.hash = '#/bo'; }); await sleep(500);
  await shot('bo-top');
  await page.evaluate(() => window.scrollTo(0, 900)); await sleep(200); await shot('bo-mid');
  await page.evaluate(() => { document.querySelector('[data-bo-sec="ctl"]').click(); window.scrollTo(0, 0); }); await sleep(300); await shot('bo-ctl');
  await page.evaluate(() => { document.querySelector('[data-bo-sec="clr"]').click(); window.scrollTo(0, 0); }); await sleep(300); await shot('bo-clr');
  await page.evaluate(() => { location.hash = '#/pn/CAT00776'; }); await sleep(500); await shot('card-cat00776');
  await page.evaluate(() => { location.hash = '#/pn/CAT02438'; }); await sleep(500); await shot('card-cat02438');
  await page.evaluate(() => { location.hash = '#/pn/3910500575'; }); await sleep(500); await shot('card-q4');
  await page.evaluate(() => { location.hash = '#/'; }); await sleep(400);
  await page.fill('#q', 'flowport'); await sleep(400); await shot('search-flowport');
  await page.fill('#q', ''); await sleep(200);
  await page.evaluate(() => { location.hash = '#/fam/' + encodeURIComponent('Disposables') + '/' + encodeURIComponent('FlowPort'); }); await sleep(500); await shot('fam-flowport');
  console.log('page errors:', errs.length ? errs : 'none');
  await browser.close(); server.kill();
})().catch(e => { console.error(e); process.exit(1); });
