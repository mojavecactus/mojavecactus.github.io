// fa2 exploratory bug-hunt: edge cases the regression suite does not cover (small screens, offline, two phones, boundaries, escaping).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { FakeHub } = require('./fakehub');

const PORT = 8099, BASE = 'http://localhost:' + PORT + '/';
const APP_PW = process.env.APP_PW, CT_PW = process.env.CT_PW, FA_PW = process.env.FA_PW;
const results = [];
let fa2CacheBust = false;
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); }
const FIXED = !!process.env.FIXED;
// bug(): in baseline mode passes when the buggy behaviour is observed; in FIXED mode passes when the fixed behaviour is observed
function bug(name, buggy, fixed, detail) { check((FIXED ? 'FIXED? ' : 'BUG ') + name, FIXED ? fixed : buggy, detail); }
function note(name, detail) { results.push({ name, ok: null, detail }); console.log('NOTE ' + name + '  — ' + detail); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(browser, hub, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tbx_ann_cc-launch', 'x'); localStorage.setItem('tbx_tour_done', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => { hub.pageErrors = hub.pageErrors || []; hub.pageErrors.push(String(e)); });
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.route(/script\.google\.com/, async r => {
    const url = r.request().url();
    let body = null; try { body = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
    // The FA hub is the only script.google.com endpoint that gets a JSON POST carrying {action, token}
    if (body && body.action && body.token) {
      if (hub.abortNext) { hub.abortNext = false; return r.abort('failed'); }
      if (hub.abortReads && body.action === 'read') { hub.abortReads--; return r.abort('failed'); }
      if (hub.hangOnce && body.action === 'read') { hub.hangOnce = false; await sleep(14000); try { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hub.handle(body)) }); } catch (e) { return; } }
      const out = hub.handle(body);
      if (out === '__ABORT__') return r.abort('failed');
      if (hub.delayMs) await sleep(hub.delayMs);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    // CT bound script / legacy FA / CC hub metrics: benign stubs
    if (/action=roster/.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: ['Matt', 'Nate', 'Mia', 'Manny', 'Isabella', 'Megan'] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) });
  });
  if (opts.clock) { await page.clock.install({ time: opts.clock }); }
  await page.goto(BASE + '#/');
  await page.fill('#lockpw', APP_PW);
  await page.locator('#lockform').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await page.waitForFunction(() => document.body.innerText.indexOf('Works offline') > -1, null, { timeout: 30000 });
  await sleep(400);
  return { ctx, page };
}
async function ctGate(page, pw, device) {
  await page.evaluate(() => { location.hash = '#/ct'; });
  await page.waitForSelector('#cc-pw', { timeout: 10000 });
  await page.fill('#cc-pw', pw);
  await page.click('#cc-go');
  if (device) {
    await page.waitForSelector('#cc-dev', { timeout: 15000 });
    await page.selectOption('#cc-dev', device);
    await page.click('#cc-devgo');
    await page.waitForSelector('#ct-fa2', { timeout: 10000 });
  }
}
async function go(page, hash, sel) { await page.evaluate(h => { location.hash = h; }, hash); if (sel) await page.waitForSelector(sel, { timeout: 10000 }); }
async function text(page, sel) { return (await page.locator(sel).first().innerText()).trim(); }
async function pickChip(page, wrapId, label) { await page.locator('#' + wrapId + ' .fa2-chip', { hasText: label }).first().click(); }

async function newPageSized(browser, hub, w, hgt, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, timezoneId: 'America/New_York', isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tbx_ann_cc-launch', 'x'); localStorage.setItem('tbx_tour_done', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => { hub.pageErrors = hub.pageErrors || []; hub.pageErrors.push(String(e)); });
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.route(/script\.google\.com/, async r => {
    const url = r.request().url();
    let body = null; try { body = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
    if (body && body.action && body.token) {
      if (hub.offline) return r.abort('internetdisconnected'); // routed requests bypass context.setOffline, so emulate it here
      if (hub.abortNext) { hub.abortNext = false; return r.abort('failed'); }
      const out = hub.handle(body);
      if (out === '__ABORT__') return r.abort('failed');
      if (hub.delayMs) await sleep(hub.delayMs);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    if (/action=roster/.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: ['Matt', 'Nate', 'Mia', 'Manny', 'Isabella', 'Megan'] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) });
  });
  if (opts.clock) { await page.clock.install({ time: opts.clock }); }
  await page.goto(BASE + '#/');
  await page.fill('#lockpw', APP_PW);
  await page.locator('#lockform').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await page.waitForFunction(() => document.body.innerText.indexOf('Works offline') > -1, null, { timeout: 30000 });
  await sleep(400);
  return { ctx, page };
}
async function pickCard(page, name, n) {
  const c = page.locator('#fa2-pick .fa2-pk', { hasText: name }).first();
  await c.locator('.f2sub').click(); await sleep(200);
  for (let i = 1; i < (n || 1); i++) { await c.locator('.pk-p').click(); await sleep(100); }
  await c.locator('.pk-add').click(); await sleep(250);
}
const modalFit = page => page.evaluate(() => {
  const card = document.querySelector('.fa2-mcard'); if (!card) return null;
  const r = card.getBoundingClientRect(); const btns = [].map.call(card.querySelectorAll('button'), b => { const br = b.getBoundingClientRect(); return { id: b.id || b.className, top: Math.round(br.top), bottom: Math.round(br.bottom) }; });
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, vw: innerWidth, left: Math.round(r.left), right: Math.round(r.right), scrollable: card.scrollHeight > card.clientHeight + 1, sh: card.scrollHeight, ch: card.clientHeight, btns };
});
const okFit = f => f && f.top >= 0 && f.bottom <= f.vh + 1 && f.left >= 0 && f.right <= f.vw + 1;
const dstr = days => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: process.env.REPO, stdio: 'ignore' });
  await sleep(800);
  const browser = await chromium.launch({ headless: true });
  const fixedNow = () => new Date();
  const seeds = () => [
    { type: 'Received', ref: '3105000740', desc: 'Test anchor A', lot: 'LOTA', exp: dstr(0).slice(0, 7), qty: 2, dropName: 'Hartford drop', from: 'Matt', receivedBy: 'Katie F' },
    { type: 'Received', ref: '0234102102', desc: 'Test screw B', lot: 'LOTB', exp: dstr(-40), qty: 3, dropName: 'Hartford drop', from: 'Matt', receivedBy: 'Katie F' },
    { type: 'Received', ref: '0130', desc: 'InSpace C', lot: 'LOTC', exp: dstr(300), qty: 5, dropName: 'Norwalk drop', from: 'Nate', receivedBy: 'Jordan P' },
    { type: 'Received', ref: '0131', desc: 'InSpace D', lot: 'LOTD', exp: dstr(75), qty: 4, dropName: 'Norwalk drop', from: 'Nate', receivedBy: 'Jordan P' }
  ];
  try {
    // ================= X1: iPhone SE (375x667) — every modal + sticky bar =================
    {
      const hub = new FakeHub({ now: fixedNow }); global.__hubs = [hub]; hub.seed(seeds());
      const { ctx, page } = await newPageSized(browser, hub, 375, 667);
      await ctGate(page, CT_PW, 'Nate');
      await page.click('#ct-fa2'); await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      const pillBox = await page.evaluate(() => { const p = document.getElementById('fa2-pills').getBoundingClientRect(); return { w: Math.round(p.width), vw: innerWidth, right: Math.round(p.right) }; });
      check('X1a Home pills fit a 375px screen', pillBox.right <= pillBox.vw, JSON.stringify(pillBox));
      // Use: overdraft modal
      await go(page, '#/fa2/use', '#fa2-pick .fa2-pk');
      await page.fill('#u-bo', 'C1'); await page.fill('#u-fac', 'WCOSC'); await page.fill('#u-sur', 'Dr. T');
      await pickCard(page, 'InSpace D', 5); // 4 on hand -> shake, stays 4? pick 5 via stepper capped; use manual instead
      await page.click('#u-man'); await page.fill('#u-mref', '0132'); await page.fill('#u-mlot', 'NL'); await page.fill('#u-mexp', dstr(400)); await page.fill('#u-mqty', '2'); await page.click('#u-addman'); await sleep(200);
      await page.click('#fa2-go'); await page.waitForSelector('#od-chk', { timeout: 5000 });
      let f = await modalFit(page);
      check('X1b Overdraft modal fits (or scrolls) on 375x667', okFit(f), JSON.stringify(f));
      await page.check('#od-chk'); await page.fill('#od-src', 'Nate trunk');
      f = await modalFit(page); const odGo = f.btns.find(b => b.id === 'od-go');
      check('X1c Overdraft primary button reachable after expanding the late-entry fields', odGo && odGo.bottom <= f.vh, JSON.stringify(f));
      await page.click('#od-cancel'); await sleep(200);
      // Add2: item editor
      await go(page, '#/fa2/add', '#fa2-drop'); await page.fill('#fa2-drop', 'SE drop'); await pickChip(page, 'fa2-from', 'Mia'); await pickChip(page, 'fa2-rb', 'Katie F');
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
      await page.click('#a2-man'); await page.fill('#a2-ref', '0130'); await page.fill('#a2-lot', 'SELOT'); await page.fill('#a2-exp', dstr(500)); await page.click('#a2-addman'); await sleep(200);
      const barOverlap = await page.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 200)); const bar = document.querySelector('.k-bar').getBoundingClientRect(); const row = document.querySelector('#a2-tray .k-trow').getBoundingClientRect(); const wrap = document.getElementById('a2-manwrap').getBoundingClientRect(); return { barTop: Math.round(bar.top), rowBottom: Math.round(row.bottom), manBottom: Math.round(wrap.bottom), vh: innerHeight }; });
      check('X1d Scrolled to the bottom, the sticky Save bar covers neither the tray row nor the manual panel', barOverlap.rowBottom <= barOverlap.barTop && barOverlap.manBottom <= barOverlap.barTop, JSON.stringify(barOverlap));
      await page.locator('#a2-tray .k-trow .k-tmain').click(); await page.waitForSelector('#ie-save', { timeout: 5000 });
      f = await modalFit(page);
      check('X1e Item editor modal fits on 375x667', okFit(f) && f.btns.find(b => b.id === 'ie-save').bottom <= f.vh, JSON.stringify(f));
      await page.click('#ie-cancel'); await sleep(200);
      await page.click('#a2-go'); await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 10000 });
      await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      const fl = await page.evaluate(() => { const f = document.getElementById('fa2-flash').getBoundingClientRect(), r = document.getElementById('fa2-rf').getBoundingClientRect(); return { fr: Math.round(f.right), rl: Math.round(r.left), fw: Math.round(f.width) }; });
      check('X1f Saved pill stops short of ↻ at 375px', fl.fr <= fl.rl, JSON.stringify(fl));
      // History: correction + drop fix modals
      await go(page, '#/fa2/history', '#fa2-list .h-ev');
      const seCard = page.locator('#fa2-list .h-ev', { hasText: 'SE drop' }).first(); await seCard.click(); await sleep(200);
      await seCard.locator('.h-fix').first().click(); await page.waitForSelector('#fc-go', { timeout: 5000 });
      f = await modalFit(page);
      check('X1g Correction modal fits on 375x667', okFit(f) && f.btns.find(b => b.id === 'fc-go').bottom <= f.vh, JSON.stringify(f));
      await page.click('#fc-cancel'); await sleep(200);
      await seCard.locator('.h-gfix').click(); await page.waitForSelector('#gf-go', { timeout: 5000 });
      await pickChip(page, 'gf-rb', 'Account');
      f = await modalFit(page); const gfGo = f.btns.find(b => b.id === 'gf-go');
      check('X1h Drop-details modal with Account fields open: primary button reachable (in view or by scrolling the card)', f && f.top >= 0 && (gfGo.bottom <= f.vh || f.scrollable), JSON.stringify(f));
      await page.click('#gf-cancel'); await sleep(200);
      // Admin confirm + Transactions deny confirm
      await go(page, '#/fa2/admin', '#a-pw'); await page.fill('#a-pw', 'SMFA2026!'); await page.click('#a-go'); await page.waitForSelector('.a-del', { timeout: 10000 });
      await page.locator('.a-del').first().click(); await page.waitForSelector('#cf-yes', { timeout: 5000 });
      f = await modalFit(page);
      check('X1i Confirm modal fits on 375x667', okFit(f), JSON.stringify(f));
      await page.click('#cf-no'); await sleep(200);
      check('X1-errors no uncaught page errors (375x667)', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
      await ctx.close();
    }

    // ================= X2: 320px (iPhone SE 1st gen / zoomed text) =================
    {
      const hub = new FakeHub({ now: fixedNow }); hub.seed(seeds());
      const { ctx, page } = await newPageSized(browser, hub, 320, 568);
      await ctGate(page, CT_PW, 'Nate');
      await page.click('#ct-fa2'); await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, pillsRight: Math.round(document.getElementById('fa2-pills').getBoundingClientRect().right) }));
      check('X2a Home has no horizontal overflow at 320px', ov.sw <= ov.vw && ov.pillsRight <= ov.vw, JSON.stringify(ov));
      await go(page, '#/fa2/return', '#fa2-pick .fa2-pk');
      const ov2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth }));
      check('X2b Remove/Return has no horizontal overflow at 320px', ov2.sw <= ov2.vw, JSON.stringify(ov2));
      await pickCard(page, 'InSpace C', 2);
      const ov3 = await page.evaluate(() => { const row = document.querySelector('#fa2-tray .k-trow').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, vw: innerWidth, rowRight: Math.round(row.right) }; });
      check('X2c Tray row fits at 320px', ov3.sw <= ov3.vw && ov3.rowRight <= ov3.vw, JSON.stringify(ov3));
      await go(page, '#/fa2/onhand', '#fa2-list .f2c');
      const ov4 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth }));
      check('X2d On hand has no horizontal overflow at 320px', ov4.sw <= ov4.vw, JSON.stringify(ov4));
      await ctx.close();
    }

    // ================= X3: offline behaviour =================
    {
      const hub = new FakeHub({ now: fixedNow }); hub.seed(seeds());
      const { ctx, page } = await newPageSized(browser, hub, 390, 844);
      await ctGate(page, CT_PW, 'Nate');
      await page.click('#ct-fa2'); await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      hub.offline = true; await ctx.setOffline(true);
      await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(2500);
      const offHome = await page.evaluate(() => ({ pills: document.getElementById('fa2-pills').innerText.replace(/\s+/g, ' '), msg: (document.getElementById('fa2-msg') || {}).innerText || '', body: document.body.innerText.slice(0, 400).replace(/\s+/g, ' ') }));
      check('X3a Offline refresh on Home keeps the last counts visible (no blank / endless spinner)', /on hand/.test(offHome.pills), JSON.stringify(offHome).slice(0, 300));
      await go(page, '#/fa2/return', null); await sleep(2500);
      const offRet = await page.evaluate(() => ({ pick: (document.getElementById('fa2-pick') || {}).innerText || '', cards: document.querySelectorAll('#fa2-pick .fa2-pk').length }));
      check('X3b Offline Remove/Return still lists on hand from cache', offRet.cards > 0, JSON.stringify(offRet).slice(0, 200));
      await pickChip(page, 'fa2-rty', 'Written Off'); await page.fill('#rf-reason', 'offline test');
      await pickCard(page, 'InSpace C', 1);
      await page.click('#fa2-go'); await page.waitForFunction(() => ((document.getElementById('fa2-err') || {}).textContent || '').length > 0, null, { timeout: 15000 });
      const offErr = await page.evaluate(() => ({ err: document.getElementById('fa2-err').textContent, btn: document.getElementById('fa2-go').disabled, label: document.getElementById('fa2-go').textContent }));
      check('X3c Offline submit fails clearly and the button comes back for a retry', /reach|signal|offline|network|answer/i.test(offErr.err) && !offErr.btn, JSON.stringify(offErr));
      hub.offline = false; await ctx.setOffline(false);
      await page.click('#fa2-go'); await page.waitForSelector('.k-ban', { timeout: 15000 });
      check('X3d Back online, the same tap saves exactly once', hub.events('Written Off').length === 1 && hub.master().find(r => r[0] === '0130')[4] === 4, 'wo=' + hub.events('Written Off').length);
      // Add drop while offline -> outbox
      await go(page, '#/fa2/add', '#fa2-drop'); await page.fill('#fa2-drop', 'Offline drop'); await pickChip(page, 'fa2-from', 'Matt'); await pickChip(page, 'fa2-rb', 'Katie F');
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
      await page.click('#a2-man'); await page.fill('#a2-ref', '0130'); await page.fill('#a2-lot', 'OFFLOT'); await page.fill('#a2-exp', dstr(600)); await page.click('#a2-addman'); await sleep(200);
      hub.offline = true; await ctx.setOffline(true);
      await page.click('#a2-go'); await page.waitForFunction(() => /didn/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 20000 });
      const offAdd = await page.evaluate(() => ({ txt: document.getElementById('fa2-flash').innerText.replace(/\s+/g, ' '), pend: !!localStorage.getItem('tbx_fa2_pend') }));
      check('X3e Offline drop save lands on Home as a red pill with Retry, batch kept on the phone', /Retry/.test(offAdd.txt) && offAdd.pend, JSON.stringify(offAdd));
      hub.offline = false; await ctx.setOffline(false);
      await page.click('#fa2-flgo'); await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 20000 });
      check('X3f Retry after reconnecting saves the drop once', hub.events('Received').filter(e => e.lot === 'OFFLOT').length === 1 && !(await page.evaluate(() => localStorage.getItem('tbx_fa2_pend'))));
      check('X3-errors no uncaught page errors (offline)', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
      await ctx.close();
    }

    // ================= X4: two phones on one sheet =================
    {
      const hub = new FakeHub({ now: fixedNow }); hub.seed(seeds());
      const A = await newPage(browser, hub), B = await newPage(browser, hub);
      await ctGate(A.page, CT_PW, 'Nate'); await ctGate(B.page, CT_PW, 'Mia');
      await A.page.click('#ct-fa2'); await A.page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      await B.page.click('#ct-fa2'); await B.page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      await go(B.page, '#/fa2/return', '#fa2-pick .fa2-pk'); // B now holds a warm cache
      await go(A.page, '#/fa2/add', '#fa2-drop'); await A.page.fill('#fa2-drop', 'Phone A drop'); await pickChip(A.page, 'fa2-from', 'Nate'); await pickChip(A.page, 'fa2-rb', 'Katie F');
      await A.page.click('#fa2-go'); await A.page.waitForSelector('#a2-go', { timeout: 10000 });
      await A.page.click('#a2-man'); await A.page.fill('#a2-ref', '0130'); await A.page.fill('#a2-lot', 'NEWLOTA'); await A.page.fill('#a2-exp', dstr(700)); await A.page.fill('#a2-qty', '3'); await A.page.click('#a2-addman'); await sleep(200);
      await A.page.click('#a2-go'); await A.page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      const bStale = await B.page.locator('#fa2-pick .fa2-pk', { hasText: 'NEWLOTA' }).count();
      await B.page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(1200);
      const bFresh = await B.page.locator('#fa2-pick .fa2-pk', { hasText: 'NEWLOTA' }).count();
      check('X4a Phone B sees phone A\u2019s new lot after ↻ (stale before, fresh after)', bStale === 0 && bFresh === 1, 'stale=' + bStale + ' fresh=' + bFresh);
      await pickChip(B.page, 'fa2-rty', 'Written Off'); await B.page.fill('#rf-reason', 'two-phone test');
      await pickCard(B.page, 'NEWLOTA', 2);
      await B.page.click('#fa2-go'); await B.page.waitForSelector('.k-ban', { timeout: 15000 });
      await go(A.page, '#/fa2/onhand', '#fa2-list .f2c'); await A.page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(1200);
      const aSees = await A.page.evaluate(() => { const c = [].find.call(document.querySelectorAll('#fa2-list .f2c'), n => /NEWLOTA/.test(n.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
      check('X4b Phone A\u2019s On hand shows 1 left after phone B removed 2', /\b1\b/.test(aSees) && hub.master().find(r => r[2] === 'NEWLOTA')[4] === 1, aSees);
      // stale-cache overdraft: B removes more than remain (cache says 1 left, A removes it first)
      await go(B.page, '#/fa2/return', '#fa2-pick .fa2-pk');
      await go(A.page, '#/fa2/return', '#fa2-pick .fa2-pk'); await A.page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(800);
      await pickChip(A.page, 'fa2-rty', 'Written Off'); await A.page.fill('#rf-reason', 'A takes the last'); await pickCard(A.page, 'NEWLOTA', 1);
      await A.page.click('#fa2-go'); await A.page.waitForSelector('.k-ban', { timeout: 15000 });
      await pickChip(B.page, 'fa2-rty', 'Written Off'); await B.page.fill('#rf-reason', 'B is stale'); await pickCard(B.page, 'NEWLOTA', 1);
      await B.page.click('#fa2-go'); await sleep(2500);
      const bRes = await B.page.evaluate(() => ({ hash: location.hash, err: (document.getElementById('fa2-err') || {}).textContent || '' }));
      const lotRow = hub.master().find(r => r[2] === 'NEWLOTA');
      note('X4c Stale phone removing a unit that is already gone: result', JSON.stringify({ res: bRes, hubQty: lotRow ? lotRow[4] : 'row gone', wo: hub.events('Written Off').filter(e => e.lot === 'NEWLOTA').map(e => e.qty) }));
      check('X4-errors no uncaught page errors (two phones)', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
      await A.ctx.close(); await B.ctx.close();
    }

    // ================= X5: boundaries, escaping, normalisation =================
    {
      const hub = new FakeHub({ now: fixedNow }); hub.seed(seeds());
      hub.seed([{ type: 'Received', ref: '0130', desc: 'InSpace C', lot: 'TODAY', exp: dstr(0), qty: 1, dropName: 'Edge drop', from: 'Nate', receivedBy: 'Jordan P' },
                { type: 'Received', ref: '0130', desc: 'InSpace C', lot: 'YDAY', exp: dstr(-1), qty: 1, dropName: 'Edge drop', from: 'Nate', receivedBy: 'Jordan P' },
                { type: 'Received', ref: '0130', desc: 'InSpace C', lot: 'LASTMO', exp: dstr(-32).slice(0, 7), qty: 1, dropName: 'Edge drop', from: 'Nate', receivedBy: 'Jordan P' }]);
      const { ctx, page } = await newPage(browser, hub);
      await ctGate(page, CT_PW, 'Nate');
      await page.click('#ct-fa2'); await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      await go(page, '#/fa2/onhand', '#fa2-list .f2c');
      const bands = await page.evaluate(() => { const out = {}; let cur = ''; [].forEach.call(document.querySelectorAll('#fa2-list > *'), n => { if (n.className.indexOf('fa2-eyebrow') > -1) cur = n.innerText; else { const m = n.innerText.match(/Lot (\S+)/); if (m) out[m[1]] = cur; } }); return out; });
      check('X5a Boundaries: expires today = Send back, yesterday = Expired, last month (month-only) = Expired', /send back/i.test(bands.TODAY) && /expired/i.test(bands.YDAY) && /expired/i.test(bands.LASTMO), JSON.stringify(bands));
      // escaping through the whole loop: type it, save it, read it back in History and the tray
      const evil = '<b>x</b>&"\'<img src=x onerror=window.__pwned=1>';
      await go(page, '#/fa2/add', '#fa2-drop'); await page.fill('#fa2-drop', 'Drop ' + evil); await pickChip(page, 'fa2-from', 'Other'); await page.fill('#fa2-fromo', 'From ' + evil); await pickChip(page, 'fa2-rb', 'Katie F'); await page.fill('#fa2-note', 'Note ' + evil);
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
      await page.click('#a2-man'); await page.fill('#a2-ref', ' 0130 '); await page.fill('#a2-lot', 'lot/1 2&<3>'); await page.fill('#a2-exp', dstr(800)); await page.click('#a2-addman'); await sleep(200);
      const trayTxt = await page.evaluate(() => ({ txt: document.querySelector('#a2-tray .k-trow').innerText.replace(/\s+/g, ' '), pwned: !!window.__pwned, desc: document.querySelector('#a2-tray .k-trow').innerText.indexOf('InSpace') > -1 }));
      check('X5b Ref with spaces still autofills the catalog description; odd lot characters survive the tray', trayTxt.desc && /lot\/1 2&<3>/.test(trayTxt.txt), JSON.stringify(trayTxt));
      await page.click('#a2-go'); await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      const ev = hub.events('Received').find(e => e.lot === 'lot/1 2&<3>') || {};
      check('X5c Saved event has the trimmed ref, the raw lot, the raw drop/from/note text', ev.ref === '0130' && ev.dropName === 'Drop ' + evil && ev.from === 'From ' + evil && ev.note === 'Note ' + evil, JSON.stringify({ ref: ev.ref, from: ev.from }));
      await go(page, '#/fa2/history', '#fa2-list .h-ev');
      const hist = await page.evaluate(() => { const c = [].find.call(document.querySelectorAll('#fa2-list .h-ev'), n => /Drop </.test(n.innerText)); if (!c) return null; c.click(); return { txt: c.innerText.replace(/\s+/g, ' ').slice(0, 200), bold: c.querySelectorAll('b').length, imgs: c.querySelectorAll('img').length, pwned: !!window.__pwned }; });
      check('X5d History renders the text literally (no injected markup, no script side effects)', hist && hist.imgs === 0 && !hist.pwned && /<b>x<\/b>/.test(hist.txt), JSON.stringify(hist));
      await go(page, '#/fa2/onhand', '#fa2-list .f2c');
      const oh = await page.evaluate(() => ({ imgs: document.querySelectorAll('#fa2-list img').length, pwned: !!window.__pwned, has: /lot\/1 2&<3>/.test(document.getElementById('fa2-list').innerText) }));
      check('X5e On hand renders the odd lot literally', oh.imgs === 0 && !oh.pwned && oh.has, JSON.stringify(oh));
      // native date picker fires only "change": the value must still be used
      await go(page, '#/fa2/use', '#fa2-pick .fa2-pk');
      await page.fill('#u-bo', 'C9'); await page.fill('#u-fac', 'WCOSC'); await page.fill('#u-sur', 'Dr. T');
      const dosPick = dstr(-3);
      await page.evaluate(v => { const el = document.getElementById('u-dos'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, dosPick);
      await pickCard(page, 'InSpace D', 1);
      await page.click('#fa2-go'); await page.waitForSelector('.k-ban', { timeout: 10000 });
      const usedEv = hub.events('Used in case').slice(-1)[0] || {};
      check('X5f A DOS picked through the native picker (change only, no input event) is saved', usedEv.dos === dosPick, 'dos=' + usedEv.dos + ' want=' + dosPick);
      // double-tap protection on Submit
      await go(page, '#/fa2/return', '#fa2-pick .fa2-pk'); await pickChip(page, 'fa2-rty', 'Written Off'); await page.fill('#rf-reason', 'double tap'); await pickCard(page, 'InSpace C', 1);
      const woBefore = hub.events('Written Off').length;
      hub.delayMs = 600;
      await page.evaluate(() => { const b = document.getElementById('fa2-go'); b.click(); b.click(); b.click(); });
      await page.waitForSelector('.k-ban', { timeout: 15000 }); hub.delayMs = 0; await sleep(800);
      check('X5g Triple-tapping Submit files one removal', hub.events('Written Off').length === woBefore + 1, 'wo=' + (hub.events('Written Off').length - woBefore));
      // send-back tracking whitespace
      await go(page, '#/fa2/send', '#fa2-pick .fa2-pk'); await pickCard(page, 'InSpace C', 1); await page.fill('#fa2-trk', '  1Z 77  ');
      await page.click('#fa2-go'); await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 15000 });
      const sbEv = hub.events('Returned to Stryker').slice(-1)[0] || {};
      check('X5h Tracking number is trimmed', sbEv.tracking === '1Z 77', 'trk=' + JSON.stringify(sbEv.tracking));
      check('X5-errors no uncaught page errors (boundaries)', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
      await ctx.close();
    }

    // ================= X6: draft whose sender is no longer on the roster; step-1 <-> step-2 round trip =================
    {
      const hub = new FakeHub({ now: fixedNow }); hub.seed(seeds());
      const { ctx, page } = await newPage(browser, hub);
      await ctGate(page, CT_PW, 'Nate');
      await page.click('#ct-fa2'); await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      await page.evaluate(() => localStorage.setItem('tbx_fa2_draft', JSON.stringify({ form: { kind: 'add', drop: 'Old draft', date: '2026-08-30', from: 'Grant', fromOther: '', rb: 'Katie F', accName: '', accLoc: '', note: '', items: [] }, a2: { items: { 'k1': { ref: '0130', desc: 'InSpace C', lot: 'GRANTLOT', exp: '2028-01-31', qty: 2, src: 'manual' } }, order: ['k1'] } })));
      await go(page, '#/fa2/add', '#fa2-resume');
      const dr = await page.evaluate(() => ({ chips: [].map.call(document.querySelectorAll('#fa2-from .fa2-chip'), b => b.innerText.trim()), on: (document.querySelector('#fa2-from .fa2-chip.on') || {}).innerText, go: document.getElementById('fa2-go').innerText }));
      check('X6a A draft from someone not on the roster still shows and keeps that sender selected', dr.on === 'Grant' && dr.chips[0] === 'Grant', JSON.stringify(dr));
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
      await page.click('#a2-man'); await page.fill('#a2-ref', '0131'); await page.fill('#a2-lot', 'ROUNDTRIP'); await page.fill('#a2-exp', dstr(900)); await page.click('#a2-addman'); await sleep(200);
      await go(page, '#/fa2/add', '#fa2-drop'); await page.fill('#fa2-drop', 'Old draft renamed'); await sleep(100);
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 }); await sleep(200);
      const rows = await page.evaluate(() => [].map.call(document.querySelectorAll('#a2-tray .k-trow'), n => n.innerText.replace(/\s+/g, ' ')));
      check('X6b Going back to step 1 to fix the drop name keeps both tray rows', rows.length === 2 && /GRANTLOT/.test(rows.join('|')) && /ROUNDTRIP/.test(rows.join('|')), JSON.stringify(rows));
      await page.click('#a2-go'); await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      const saved = hub.events('Received').filter(e => e.dropName === 'Old draft renamed');
      check('X6c Saved under the renamed drop with the off-roster sender', saved.length === 2 && saved.every(e => e.from === 'Grant'), JSON.stringify(saved.map(e => [e.lot, e.from])));
      check('X6-errors no uncaught page errors (draft)', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
      await ctx.close();
    }

    // ================= X7: F&A login edge cases =================
    {
      const hub = new FakeHub({ now: fixedNow }); // empty sheet
      const { ctx, page } = await newPage(browser, hub);
      await ctGate(page, FA_PW, null); await page.waitForSelector('#fa2-send', { timeout: 15000 });
      await go(page, '#/fa2/send', '#fa2-pick'); await sleep(1200);
      const empty = await page.evaluate(() => ({ pick: document.getElementById('fa2-pick').innerText.trim(), go: document.getElementById('fa2-go').disabled, nm: document.querySelectorAll('#fa2-nm .fa2-chip').length }));
      check('X7a F&A send-back with nothing on hand: clear empty state, Complete disabled, name chips still offered', /Nothing on hand/.test(empty.pick) && empty.go && empty.nm === 2, JSON.stringify(empty));
      hub.seed(seeds());
      await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(1200);
      await page.fill('#fa2-q', 'zzzz'); await sleep(200);
      check('X7b Search with no matches says so', /No matches/.test(await text(page, '#fa2-pick')));
      await page.fill('#fa2-q', ''); await sleep(200);
      await pickCard(page, 'Test anchor A', 2); await page.fill('#fa2-trk', '1Z5'); await pickChip(page, 'fa2-nm', 'Katie F');
      await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(1200);
      const afterRf = await page.evaluate(() => ({ tray: document.querySelectorAll('#fa2-tray .k-trow').length, trk: document.getElementById('fa2-trk').value, name: (document.querySelector('#fa2-nm .fa2-chip.on') || {}).innerText, go: document.getElementById('fa2-go').disabled }));
      check('X7c ↻ on Send keeps the tray, tracking and picked name', afterRf.tray === 1 && afterRf.trk === '1Z5' && afterRf.name === 'Katie F' && !afterRf.go, JSON.stringify(afterRf));
      await page.click('#fa2-go'); await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 15000 });
      const sb = hub.events('Returned to Stryker');
      check('X7d F&A send-back saved with the picked name and the full quantity', sb.length === 1 && sb[0].qty === 2 && sb[0].enteredBy === 'Katie F', JSON.stringify(sb.map(e => [e.qty, e.enteredBy])));
      const homeTxt = await text(page, '#fa2-pills');
      check('X7e F&A Home no longer counts the shipped lot', !/send back/.test(homeTxt), homeTxt.replace(/\n/g, ' | '));
      check('X7-errors no uncaught page errors (F&A)', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
      await ctx.close();
    }

    // ================= X8: held lot really times out =================
    {
      const hub = new FakeHub({ now: fixedNow }); hub.seed(seeds());
      const { ctx, page } = await newPage(browser, hub, { clock: new Date() });
      await ctGate(page, CT_PW, 'Nate');
      await page.click('#ct-fa2'); await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
      await go(page, '#/fa2/add', '#fa2-drop'); await page.fill('#fa2-drop', 'Clock drop'); await pickChip(page, 'fa2-from', 'Mia'); await pickChip(page, 'fa2-rb', 'Katie F');
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
      await page.evaluate(() => window.__TBX_ONCODE('(17)280101(10)STALELOT')); await sleep(200);
      const h1 = await page.evaluate(() => !document.getElementById('a2-held').hidden);
      await page.clock.runFor(26000); await sleep(200);
      const h2 = await page.evaluate(() => !document.getElementById('a2-held').hidden);
      await page.evaluate(() => window.__TBX_ONCODE('(01)07613327570463')); await sleep(300);
      const row = await page.evaluate(() => (document.querySelector('#a2-tray .k-trow') || {}).innerText || '');
      check('X8a A held lot is forgotten after 25 s and does not attach to a product scanned later', h1 && !h2 && /No lot/.test(row) && !/STALELOT/.test(row), JSON.stringify({ h1, h2, row: row.replace(/\s+/g, ' ') }));
      await ctx.close();
    }
  } catch (e) {
    console.log('HARNESS ERROR', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
    try { const pg = (browser.contexts()[0] || {}).pages ? browser.contexts()[0].pages()[0] : null; if (pg) console.log('DIAG', JSON.stringify(await pg.evaluate(() => ({ hash: location.hash, txt: document.body.innerText.slice(0, 300).replace(/\s+/g, ' '), err: (document.getElementById('fa2-err') || {}).textContent })))); } catch (e2) {}
  } finally {
    await browser.close(); server.kill();
    const pass = results.filter(r => r.ok === true).length, fail = results.filter(r => r.ok === false).length;
    console.log('\n' + pass + ' pass / ' + fail + ' fail / ' + results.filter(r => r.ok === null).length + ' notes');
  }
})();
async function go(page, hash, sel) { await page.evaluate(h => { location.hash = h; }, hash); if (sel) await page.waitForSelector(sel, { timeout: 10000 }); }
async function text(page, sel) { return (await page.locator(sel).first().innerText()).trim(); }
async function pickChip(page, wrapId, label) { await page.locator('#' + wrapId + ' .fa2-chip', { hasText: label }).first().click(); }
