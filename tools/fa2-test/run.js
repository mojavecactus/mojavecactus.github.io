// fa2 bug-test harness: real app (repo checkout) in headless Chromium, hub swapped for FakeHub.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { FakeHub } = require('./fakehub');

const PORT = 8099, BASE = 'http://localhost:' + PORT + '/';
const APP_PW = process.env.APP_PW, CT_PW = process.env.CT_PW, FA_PW = process.env.FA_PW;
const results = [];
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

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: process.env.REPO, stdio: 'ignore' });
  await sleep(800);
  const browser = await chromium.launch({ headless: true });
  const fixedNow = () => new Date();
  try {
    // ---------------- S0: gate, tile, home ----------------
    let hub = new FakeHub({ now: fixedNow }); global.__hubs = [hub];
    hub.seed([
      { type: 'Received', ref: '3105000740', desc: 'Test anchor A', lot: 'LOTA', exp: '2026-08', qty: 2, dropName: 'Hartford drop', from: 'Matt', receivedBy: 'Katie F', eventDate: '2026-08-20' },
      { type: 'Received', ref: '0234102102', desc: 'Test screw B', lot: 'LOTB', exp: '2026-07-31', qty: 3, dropName: 'Hartford drop', from: 'Matt', receivedBy: 'Katie F', eventDate: '2026-08-20' },
      { type: 'Received', ref: '0130', desc: 'InSpace C', lot: 'LOTC', exp: '2027-06-15', qty: 5, dropName: 'Norwalk drop', from: 'Nate', receivedBy: 'Jordan P', eventDate: '2026-08-21' },
      { type: 'Received', ref: '0131', desc: 'InSpace D', lot: 'LOTD', exp: '2026-10-05', qty: 4, dropName: 'Norwalk drop', from: 'Nate', receivedBy: 'Jordan P', eventDate: '2026-08-21' }
    ]);
    let { ctx, page } = await newPage(browser, hub);
    await ctGate(page, CT_PW, 'Nate');
    const creds = await page.evaluate(() => JSON.parse(localStorage.getItem('tbx_fa2') || 'null'));
    check('S0 CT gate also unlocks fa2 (sports creds stored)', creds && creds.scope === 'sports');
    await page.click('#ct-fa2');
    await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
    const pills = await text(page, '#fa2-pills');
    check('S0 Home pills render from master', /14 on hand/.test(pills), pills.replace(/\n/g, ' | '));
    // Server statuses: A(2026-08 → Aug 31) = SEND BACK ≤2 MO, B = EXPIRED, D(2026-10-05) = SEND BACK ≤2 MO, C = OK
    note('S0 server statuses', JSON.stringify(hub.master().map(r => r[0] + ':' + r[5])));
    check('S1a Home "expired" pill counts only server-EXPIRED (B=3)', /3 expired/.test(pills), pills.replace(/\n/g, ' | '));
    check('S1b Home "≤3 mo" pill lumps SEND BACK rows in (A2+D4=6)', /6 ≤3 mo/.test(pills), pills.replace(/\n/g, ' | '));

    // ---------------- S1: On hand banding vs server status ----------------
    await go(page, '#/fa2/onhand', '#fa2-list .f2c');
    const onhand = await page.evaluate(() => [].map.call(document.querySelectorAll('#fa2-list > *'), n => n.className.indexOf('fa2-eyebrow') > -1 ? '[' + n.innerText + ']' : n.querySelector('.f2top b').innerText + ':' + n.querySelector('.f2chip').innerText).join(' '));
    note('S1 On hand sections (client banding)', onhand);
    bug('S1c month-only exp 2026-08 banded as Expired on Aug 28 (server: SEND BACK ≤2 MO, valid thru 8/31)', /\[Expired\][^\[]*3105000740:Expired/i.test(onhand), /\[Expiring ≤3 mo\][^\[]*3105000740:≤3 mo/i.test(onhand) && /\[Expired\][^\[]*0234102102:Expired/i.test(onhand), onhand);
    await page.fill('#fa2-q', 'inspace');
    const filtered = await page.locator('#fa2-list .f2c').count();
    check('S1d On hand search filters by description', filtered === 2, 'matches=' + filtered);
    if (FIXED) {
      await page.fill('#fa2-q', '');
      const eb = await page.evaluate(() => { const list = document.getElementById('fa2-list').getBoundingClientRect(); const rows = document.querySelector('#fa2-list .f2c').getBoundingClientRect(); const cs = getComputedStyle(document.querySelector('.fa2-eyebrow.warn')); return { classes: [].map.call(document.querySelectorAll('#fa2-list .fa2-eyebrow'), n => n.className), listW: Math.round(list.width), eyeW: Math.round(document.querySelector('.fa2-eyebrow').getBoundingClientRect().width), contentW: Math.round(document.getElementById('content').getBoundingClientRect().width), rowW: Math.round(rows.width), bg: cs.backgroundColor, display: cs.display }; });
      check('R3 Section labels span the full list width with a coloured band', eb.eyeW === eb.listW && eb.display === 'block' && /rgba\(240, 180, 60/.test(eb.bg) && eb.classes.join(',') === 'fa2-eyebrow bad,fa2-eyebrow warn,fa2-eyebrow ok', JSON.stringify(eb));
      check('R4a On hand rows run edge-to-edge like the catalog (no outer panel inset)', eb.rowW === eb.contentW && eb.contentW === 362, 'row=' + eb.rowW + ' content=' + eb.contentW);
    }

    // ---------------- S2: Add inventory (manual path) ----------------
    await go(page, '#/fa2/add', '#fa2-drop');
    await page.click('#fa2-go');
    check('S2a Add step-1 validation (drop name)', (await text(page, '#fa2-err')) === 'Give the drop a name.');
    const defDate = await page.inputValue('#fa2-date');
    note('S2 default drop date (real clock)', defDate);
    await page.fill('#fa2-drop', 'Bridgeport drop');
    await page.click('#fa2-go');
    check('S2b Add step-1 validation (from)', /came from/.test(await text(page, '#fa2-err')));
    if (FIXED) {
      const box = () => page.evaluate(() => { const e = document.getElementById('fa2-fromo'); const r = e.getBoundingClientRect(); return { vis: r.height > 0, ph: e.placeholder }; });
      check('R7a From detail box is hidden until a chip needs it', !(await box()).vis, JSON.stringify(await box()));
      await pickChip(page, 'fa2-from', 'Territory Transfer');
      const tt = await box();
      check('R7b Territory Transfer shows the box labelled "Territory Received From?"', tt.vis && tt.ph === 'Territory Received From?', JSON.stringify(tt));
      await page.click('#fa2-go');
      check('R7c Territory Transfer requires the territory', /Territory received from is required/.test(await text(page, '#fa2-err')));
      await page.fill('#fa2-fromo', 'Buffalo');
      await page.click('#fa2-go');
      check('R7d With the territory filled, step 1 moves past From', !/Territory received/.test(await text(page, '#fa2-err')));
      await pickChip(page, 'fa2-from', 'Other');
      const oth = await box();
      check('R7e Other shows the same box labelled "Notes" (no "free text")', oth.vis && oth.ph === 'Notes', JSON.stringify(oth));
      await page.fill('#fa2-fromo', '');
      await page.click('#fa2-go');
      check('R7f Other still requires a value', /where it came from/.test(await text(page, '#fa2-err')));
      const dm = await page.evaluate(() => { const d = document.getElementById('fa2-date'), c = document.getElementById('content'); const dr = d.getBoundingClientRect(), cr = c.getBoundingClientRect(); const cs = getComputedStyle(d); return { right: Math.round(dr.right), cRight: Math.round(cr.right), box: cs.boxSizing, appear: cs.webkitAppearance || cs.appearance, maxW: cs.maxWidth, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }; });
      check('R7g Date box is constrained to the content width (no overflow)', dm.right <= dm.cRight && dm.box === 'border-box' && dm.scrollW <= dm.innerW, JSON.stringify(dm));
      await pickChip(page, 'fa2-from', 'Matt');
    } else {
      await pickChip(page, 'fa2-from', 'Matt');
    }
    await page.click('#fa2-go');
    check('S2c Add step-1 validation (received by)', /received it/.test(await text(page, '#fa2-err')));
    const rbChips = await page.locator('#fa2-rb .fa2-chip').allInnerTexts();
    check('S2d Received-by chips include F&A team names from read.teams', rbChips.indexOf('Katie F') > -1, rbChips.join(','));
    await pickChip(page, 'fa2-rb', 'Account');
    await page.click('#fa2-go');
    check('S2e Account requires name + location', /Account name and location/.test(await text(page, '#fa2-err')));
    await pickChip(page, 'fa2-rb', 'Katie F');
    await page.fill('#fa2-note', 'note here');
    await page.click('#fa2-go');
    await page.waitForSelector('#a2-go', { timeout: 10000 });
    check('S2f Step 2 renders, Save disabled with empty tray', await page.locator('#a2-go').isDisabled());
    if (FIXED) {
      const cam = await page.evaluate(() => { const r = document.querySelector('.a2top').getBoundingClientRect(); const c = document.getElementById('content').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cw: Math.round(c.width), vh: window.innerHeight }; });
      check('R4b Scanner box is full content width and sized like the Cycle Count camera (34vh, ≥207px)', cam.w === cam.cw && cam.h >= 207 && Math.abs(cam.h - Math.round(cam.vh * 0.34)) <= 2, JSON.stringify(cam));
    }
    await page.click('#a2-man');
    await page.fill('#a2-ref', '3105000740');
    const autoDesc = await page.inputValue('#a2-desc');
    check('S2g REF autofills description from catalog', autoDesc.length > 0, autoDesc);
    await page.fill('#a2-lot', 'LOTA');
    if (FIXED) {
      const row = await page.evaluate(() => {
        const lab = [].map.call(document.querySelectorAll('#a2-manwrap .a2fl'), n => n.innerText.trim());
        const e = document.getElementById('a2-exp'), q = document.getElementById('a2-qty');
        const er = e.getBoundingClientRect(), qr = q.getBoundingClientRect();
        const d = new Date(); const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        return { labels: lab, exp: e.value, today: today, qty: q.value, sameRow: Math.abs(er.top - qr.top) < 2, expW: Math.round(er.width), qtyW: Math.round(qr.width), warn: document.getElementById('a2-expwarn').hidden === false, warnTxt: document.getElementById('a2-expwarn').innerText };
      });
      check('R9a Manual add: both fields labelled Expiration + QTY, side by side', JSON.stringify(row.labels.map(x => x.toLowerCase())) === '["expiration","qty"]' && row.sameRow && row.expW > 100 && row.qtyW > 100, JSON.stringify(row));
      check('R9b Date pre-fills to today (never blank) and qty defaults to 1', row.exp === row.today && row.qty === '1', 'exp=' + row.exp + ' today=' + row.today + ' qty=' + row.qty);
      check('R9c Default (today) is flagged as expiring at the end of the day', row.warn && /expires at the end of the day/.test(row.warnTxt), row.warnTxt);
      await page.fill('#a2-exp', '2020-01-01');
      const past = await page.evaluate(() => ({ hidden: document.getElementById('a2-expwarn').hidden, txt: document.getElementById('a2-expwarn').innerText }));
      check('R9g A past expiration warns that it will land as EXPIRED', !past.hidden && /already passed/.test(past.txt), JSON.stringify(past));
      await page.fill('#a2-exp', '2027-03-31');
      const cleared = await page.evaluate(() => document.getElementById('a2-expwarn').hidden);
      check('R9d Warning clears once a future date is picked', cleared);
      await page.fill('#a2-exp', '');
    }
    await page.click('#a2-addman');
    check('S2h Manual add requires a full date', /full expiration date/.test(await text(page, '#fa2-err')));
    await page.fill('#a2-exp', '2027-03-31');
    await page.fill('#a2-qty', '2');
    await page.click('#a2-addman');
    const trayRows = await page.locator('#a2-tray .k-trow').count();
    check('S2i Manual item lands in tray', trayRows === 1);
    if (FIXED) {
      const after = await page.evaluate(() => { const d = new Date(); const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return { exp: document.getElementById('a2-exp').value, today: today, qty: document.getElementById('a2-qty').value, ref: document.getElementById('a2-ref').value }; });
      check('R9f After adding, the row resets to today + qty 1 (ref cleared)', after.exp === after.today && after.qty === '1' && after.ref === '', JSON.stringify(after));
    }
    check('S2j Save enabled once tray valid', !(await page.locator('#a2-go').isDisabled()));
    // same ref+lot again merges qty
    await page.fill('#a2-ref', '3105000740'); await page.fill('#a2-lot', 'LOTA'); await page.fill('#a2-exp', '2027-03-31'); await page.fill('#a2-qty', '1'); await page.click('#a2-addman');
    const mergedQty = await text(page, '#a2-tray .k-trow .k-step b');
    check('S2k Same ref+lot merges into one tray row (qty 3)', mergedQty === '3', 'qty=' + mergedQty);
    // failure injection: hub applies then connection dies
    hub.failNext = { action: 'batch', mode: 'abort-after-apply' };
    const recBefore = hub.events('Received').length;
    if (FIXED) {
      hub.delayMs = 1200;
      await page.click('#a2-go');
      await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 3000 });
      const early = await page.evaluate(() => ({ hash: location.hash, flash: (document.getElementById('fa2-flash') || {}).innerText, cls: (document.getElementById('fa2-flash') || {}).className, hidden: (document.getElementById('fa2-flash') || {}).hidden }));
      check('R8a Save leaves the scanner for Home immediately, pill says processing', early.hash === '#/fa2' && !early.hidden && /Inventory add processing/.test(early.flash) && /busy/.test(early.cls), JSON.stringify(early));
      await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      await page.waitForFunction(() => /17 on hand/.test((document.getElementById('fa2-pills') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
      const done = await page.evaluate(() => ({ flash: document.getElementById('fa2-flash').innerText.replace(/\s+/g, ' '), cls: document.getElementById('fa2-flash').className, pills: document.getElementById('fa2-pills').innerText.replace(/\s+/g, ' ') }));
      check('R8b Pill turns to saved (with the line/unit count) and the counts refresh', /Inventory add saved — 1 item · 3 units/.test(done.flash) && /ok/.test(done.cls) && /17 on hand/.test(done.pills), JSON.stringify(done));
      hub.delayMs = 0;
    } else {
      await page.click('#a2-go');
      await page.waitForFunction(() => location.hash === '#/fa2' || /tap again to retry/.test((document.getElementById('fa2-err') || {}).textContent || ''), null, { timeout: 10000 });
      if (!(await page.evaluate(() => location.hash === '#/fa2'))) { await page.click('#a2-go'); await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 10000 }); }
    }
    bug('S2l lost reply after apply: baseline blocks on the scanner screen / fixed reports on Home', !FIXED, FIXED, 'save is now a background hand-off');
    const addB = hub.batches().filter(x => x.events.some(e => e.dropName === 'Bridgeport drop'));
    check('S2m Add never double-applies (one drop, single opId)', hub.events('Received').length === recBefore + 1 && new Set(addB.map(x => x.opId)).size === 1, 'batches=' + addB.length + ' received=' + (hub.events('Received').length - recBefore));
    const rec = hub.events('Received').slice(-1)[0];
    check('S2n Received event carries drop fields', rec.dropName === 'Bridgeport drop' && rec.from === 'Matt' && rec.receivedBy === 'Katie F' && rec.note === 'note here' && rec.qty === 3 && rec.entryMethod === 'manual' && rec.enteredBy === 'Nate', JSON.stringify({ dropName: rec.dropName, from: rec.from, receivedBy: rec.receivedBy, note: rec.note, qty: rec.qty, exp: rec.exp, entryMethod: rec.entryMethod, enteredBy: rec.enteredBy }));
    await page.waitForSelector('#fa2-pills .cc-pill.ok', { timeout: 10000 });
    check('S2o Home pills refresh after add (cache killed): 17 on hand', /17 on hand/.test(await text(page, '#fa2-pills')), await text(page, '#fa2-pills'));
    if (FIXED) {
      // Hard failure: reply lost AND the landed-probe can't reach the hub → pill offers Retry.
      await go(page, '#/fa2/add', '#fa2-drop');
      const chipsAfterSave = await page.locator('#fa2-rb .fa2-chip').allInnerTexts();
      check('R8f Roster chips survive the post-save cache wipe (team list persisted separately)', chipsAfterSave.indexOf('Katie F') > -1, chipsAfterSave.join(','));
      await page.fill('#fa2-drop', 'Failed drop'); await pickChip(page, 'fa2-from', 'Mia'); await pickChip(page, 'fa2-rb', 'Katie F');
      await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
      await page.click('#a2-man'); await page.fill('#a2-ref', '0130'); await page.fill('#a2-lot', 'FAILLOT'); await page.fill('#a2-exp', '2028-01-31'); await page.click('#a2-addman');
      hub.abortNext = true; hub.abortReads = 1;
      await page.click('#a2-go');
      await page.waitForFunction(() => /didn/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      const bad = await page.evaluate(() => ({ hash: location.hash, cls: document.getElementById('fa2-flash').className, txt: document.getElementById('fa2-flash').innerText.replace(/\s+/g, ' '), retry: !!document.getElementById('fa2-flgo') }));
      check('R8c A failed add shows a red pill on Home with a Retry action', bad.hash === '#/fa2' && /bad/.test(bad.cls) && /didn/.test(bad.txt) && bad.retry, JSON.stringify(bad));
      const hit = await page.evaluate(() => { const b = document.getElementById('fa2-flgo'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { onTop: top === b || b.contains(top), over: top && (top.id || top.className) }; });
      check('R8g Retry is tappable — not buried under the ↻ refresh button', hit.onTop, JSON.stringify(hit));
      const failBefore = hub.events('Received').filter(e => e.lot === 'FAILLOT').length;
      await page.click('#fa2-flgo');
      await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
      const failB = hub.batches().filter(x => x.events.some(e => e.lot === 'FAILLOT'));
      check('R8d Retry from the pill saves once (same opId, no duplicate)', hub.events('Received').filter(e => e.lot === 'FAILLOT').length === failBefore + 1 && new Set(failB.map(x => x.opId)).size === 1, 'attempts=' + failB.length + ' events=' + hub.events('Received').filter(e => e.lot === 'FAILLOT').length);
      await page.waitForFunction(() => !document.getElementById('fa2-flash') || document.getElementById('fa2-flash').hidden, null, { timeout: 12000 });
      check('R8e Saved pill clears itself after a few seconds', true);
      // clean up so later on-hand counts stay predictable
      await go(page, '#/fa2/return', '#fa2-pick .fa2-pk');
      await pickChip(page, 'fa2-rty', 'Written Off');
      await page.locator('#fa2-pick .fa2-pk', { hasText: 'FAILLOT' }).click();
      await page.click('#fa2-go'); await page.waitForSelector('.k-ban', { timeout: 10000 });
      await go(page, '#/fa2', '#fa2-pills .cc-pill.ok');
    }

    // ---------------- S4: Remove/Return idempotency ----------------
    await go(page, '#/fa2/return', '#fa2-pick .fa2-pk');
    if (FIXED) {
      const shown = () => page.evaluate(() => ['fa2-trk2', 'fa2-terr', 'fa2-recv'].filter(id => document.getElementById(id).getBoundingClientRect().height > 0));
      check('R7h Remove/Return: no conditional box before a type is picked', (await shown()).length === 0, JSON.stringify(await shown()));
      await pickChip(page, 'fa2-rty', 'External Transfer');
      check('R7i Only the External Transfer box shows', JSON.stringify(await shown()) === '["fa2-terr"]', JSON.stringify(await shown()));
      await pickChip(page, 'fa2-rty', 'Returned to Stryker');
      check('R7j Switching type swaps which box shows', JSON.stringify(await shown()) === '["fa2-trk2"]', JSON.stringify(await shown()));
    }
    await pickChip(page, 'fa2-rty', 'Written Off');
    await page.fill('#fa2-rsn2', 'damaged');
    await page.locator('#fa2-pick .fa2-pk', { hasText: 'InSpace C' }).click();
    await page.locator('#fa2-pick .fa2-pk', { hasText: 'InSpace C' }).click();
    check('S4a Tapping a pick row twice = qty 2 in tray', (await text(page, '#fa2-tray .k-trow .k-step b')) === '2');
    hub.failNext = { action: 'batch', mode: 'abort-after-apply' };
    await page.click('#fa2-go');
    await page.waitForFunction(() => !!document.querySelector('.k-ban') || /tap again to retry/.test((document.getElementById('fa2-err') || {}).textContent || ''), null, { timeout: 10000 });
    if (!(await page.locator('.k-ban').count())) { await page.click('#fa2-go'); await page.waitForSelector('.k-ban', { timeout: 10000 }); }
    const rb = hub.batches().filter(x => x.events.some(e => e.type === 'Written Off' && e.lot === 'LOTC'));
    const woC = hub.events('Written Off').filter(e => e.lot === 'LOTC').length;
    bug('S4b Remove/Return lost reply → double-applied (new opId per tap)', rb.length === 2 && rb[0].opId !== rb[1].opId && woC === 2, woC === 1 && new Set(rb.map(x => x.opId)).size === 1, 'opIds ' + rb.map(x => x.opId.slice(0, 8)).join('/') + ' writtenOff(LOTC)=' + woC + ' (correct=1)');
    if (FIXED) {
      await pickChip(page, 'fa2-rty', 'Written Off');
      await page.locator('#fa2-pick .fa2-pk', { hasText: 'InSpace D' }).click();
      hub.failNext = { action: 'batch', mode: 'abort-after-apply' }; hub.abortReads = 1; // batch reply lost AND the landed-probe fails (offline)
      await page.click('#fa2-go');
      await page.waitForFunction(() => /tap again to retry/.test((document.getElementById('fa2-err') || {}).textContent || ''), null, { timeout: 10000 });
      await page.locator('#fa2-pick .fa2-pk', { hasText: 'Test screw B' }).click(); // edit the tray, then retry
      const woBefore = hub.events('Written Off').length;
      await page.click('#fa2-go');
      await page.waitForFunction(() => /earlier attempt did go through/.test((document.getElementById('fa2-err') || {}).textContent || ''), null, { timeout: 10000 });
      check('S4c FIXED: edited retry after a lost reply → probe finds the earlier op landed, blocks a second apply', hub.events('Written Off').length === woBefore, 'writtenOff=' + hub.events('Written Off').length + ' msg="' + (await text(page, '#fa2-err')) + '"');
    }
    note('S4 on hand for InSpace C after the double-apply', String((hub.master().find(r => r[0] === '0130') || [])[4]) + ' (should be 3)');

    // ---------------- S5: Send back (sports) ----------------
    await go(page, '#/fa2/send', '#fa2-pick .fa2-row');
    check('S5a Complete button disabled until tracking + picks', await page.locator('#fa2-go').isDisabled());
    await page.locator('.fa2-qb[data-d="1"]').first().click();
    await page.fill('#fa2-trk', '1Z999');
    check('S5b Enabled after pick + tracking', !(await page.locator('#fa2-go').isDisabled()));
    hub.failNext = { action: 'batch', mode: 'abort-after-apply' };
    await page.click('#fa2-go');
    await page.waitForFunction(() => location.hash === '#/fa2' || /tap again to retry/.test((document.getElementById('fa2-err') || {}).textContent || ''), null, { timeout: 10000 });
    if (!(await page.evaluate(() => location.hash === '#/fa2'))) { await page.click('#fa2-go'); await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 10000 }); }
    if (FIXED) {
      await go(page, '#/fa2/send', '#fa2-pick .fa2-row');
      await page.locator('.fa2-qb[data-d="1"]').first().click(); await page.fill('#fa2-trk', '1Z2');
      hub.failNext = { action: 'batch', mode: 'reject', err: 'tracking', at: 0 };
      await page.click('#fa2-go');
      await page.waitForFunction(() => ((document.getElementById('fa2-err') || {}).textContent || '').length > 0, null, { timeout: 10000 });
      check('S5d FIXED: hub {ok:false,err} shows the real reason, not "couldn\u2019t reach the server"', (await text(page, '#fa2-err')) === 'Tracking # is required. Line 1.', await text(page, '#fa2-err'));
      await go(page, '#/fa2', '#fa2-pills .cc-pill.ok');
    }
    const sb = hub.batches().filter(x => x.events.some(e => e.type === 'Returned to Stryker'));
    check('S5c Send-back never double-applies', hub.events('Returned to Stryker').length === 1, 'returned events=' + hub.events('Returned to Stryker').length + ' batches=' + sb.length);

    // ---------------- S6: Record case usage + overdraft ----------------
    await go(page, '#/fa2/use', '#fa2-pick .fa2-pk');
    const dosDef = await page.inputValue('#u-dos');
    note('S6 default DOS (real clock)', dosDef);
    await page.click('#fa2-go');
    check('S6a BO required', /BO #/.test(await text(page, '#fa2-err')));
    await page.fill('#u-bo', 'C123456'); await page.fill('#u-fac', 'WCOSC'); await page.fill('#u-sur', 'Dr. Test');
    // use InSpace D (4 on hand): tap 5 times → overdraft by 1
    const dOnHand = (hub.master().find(r => r[0] === '0131') || [])[4];
    for (let i = 0; i < 5; i++) await page.locator('#fa2-pick .fa2-pk', { hasText: 'InSpace D' }).click();
    check('S6b Usage tray allows over on-hand (5 of 4)', (await text(page, '#u-tray .k-trow .k-step b')) === '5');
    await page.click('#fa2-go');
    await page.waitForSelector('#od-chk', { timeout: 5000 });
    check('S6c Overdraft modal appears', true, await text(page, '.fa2-mcard .fa2-s'));
    await page.check('#od-chk'); await page.fill('#od-src', 'Nate trunk'); await page.fill('#od-date', '2026-08-15');
    await page.click('#od-go');
    await page.waitForSelector('.k-ban', { timeout: 10000 });
    const last = hub.batches().slice(-1)[0];
    const late = last.events.find(e => e.flags === 'Late entry'), used = last.events.find(e => e.type === 'Used in case');
    check('S6d Overdraft = late-entry Received(short) + Used(5) linked', late && late.qty === 5 - dOnHand && used && used.qty === 5 && late.linkedTo === used.eventId && late.exp === '2026-10-05', JSON.stringify({ lateQty: late && late.qty, lateExp: late && late.exp, usedQty: used && used.qty, receivedBy: late && late.receivedBy }));
    check('S6e Used event carries case fields', used.caseBO === 'C123456' && used.facility === 'WCOSC' && used.surgeon === 'Dr. Test' && used.dos === dosDef);
    const manualBtn = await page.locator('#u-man').count();
    bug('S6f usage of a ref/lot never entered: baseline has no manual add / fixed has + Manual', manualBtn === 0, manualBtn === 1, 'u-man=' + manualBtn);
    if (FIXED) {
      await page.click('#u-man');
      const urow = await page.evaluate(() => { const lab = [].map.call(document.querySelectorAll('#u-manwrap .a2fl'), n => n.innerText.trim()); const d = new Date(); const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return { labels: lab, exp: document.getElementById('u-mexp').value, today: today }; });
      check('R9e Usage manual add gets the same labelled, pre-filled row', JSON.stringify(urow.labels.map(x => x.toLowerCase())) === '["expiration","qty"]' && urow.exp === urow.today, JSON.stringify(urow));
      await page.fill('#u-mref', '0132'); await page.fill('#u-mlot', 'NEWLOT'); await page.fill('#u-mexp', '2027-09-30'); await page.fill('#u-mqty', '2');
      const mdesc = await page.inputValue('#u-mdesc');
      await page.click('#u-addman');
      check('S6g Manual usage item lands in tray with 0 on hand + catalog description', (await page.locator('#u-tray .k-trow', { hasText: '0132' }).count()) === 1 && /0 on hand/.test(await text(page, '#u-tray')) && mdesc.length > 0, 'desc=' + mdesc);
      await page.click('#fa2-go');
      await page.waitForSelector('#od-chk', { timeout: 5000 });
      check('S6h Save asks to resolve the never-entered item (0 recorded, 2 short)', /only 0 recorded \(2 short\)/.test(await text(page, '.fa2-mcard .fa2-s')), await text(page, '.fa2-mcard .fa2-s'));
      await page.check('#od-chk'); await page.fill('#od-src', 'Megan trunk'); await page.click('#od-go');
      await page.waitForSelector('.k-ban', { timeout: 10000 });
      const lb = hub.batches().slice(-1)[0];
      const lateM = lb.events.find(e => e.flags === 'Late entry' && e.ref === '0132'), usedM = lb.events.find(e => e.type === 'Used in case' && e.ref === '0132');
      check('S6i Never-entered usage = late-entry Received(2, exp from form, source) + Used(2), net zero on hand', lateM && lateM.qty === 2 && lateM.exp === '2027-09-30' && lateM.receivedBy === 'Megan trunk' && usedM && usedM.qty === 2 && !(hub.master().find(r => r[0] === '0132')), JSON.stringify({ late: lateM && [lateM.qty, lateM.exp, lateM.receivedBy], used: usedM && usedM.qty }));
    }
    note('S6 master after usage', JSON.stringify(hub.master().map(r => r[0] + ':' + r[4])));

    // ---------------- S7: History + File Correction ----------------
    await go(page, '#/fa2/history', '#fa2-list .h-ev');
    const cards = await page.locator('#fa2-list .h-ev').count();
    note('S7 history cards', String(cards));
    const firstCard = page.locator('#fa2-list .h-ev').first();
    await firstCard.click();
    check('S7a Card expands to lines', !(await firstCard.locator('.h-lines').isHidden()));
    // correct the Bridgeport Received (qty 3 → 2)
    const bridge = page.locator('#fa2-list .h-ev', { hasText: 'Bridgeport drop' }).first();
    await bridge.click();
    await bridge.locator('.h-fix').first().click();
    await page.waitForSelector('#fc-go', { timeout: 5000 });
    await page.fill('#fc-qty', '2');
    await page.click('#fc-go');
    check('S7b Correction requires explanation', /explanation is required/i.test(await text(page, '#fc-err')));
    await page.fill('#fc-why', 'miscount');
    await page.click('#fc-go');
    await page.waitForSelector('.k-ban', { timeout: 10000 });
    const fixB = hub.batches().slice(-1)[0];
    const vd = fixB.events.find(e => e.type === 'Void'), rp = fixB.events.find(e => e.type === 'Received');
    check('S7c Correction = Void + replacement Received (qty 2, linkedTo, flag)', vd && rp && rp.qty === 2 && rp.linkedTo === vd.reverses && rp.flags === 'Corrected');
    bug('S7d replacement Received: receivedBy = drop name & note dropped', rp.receivedBy === 'Bridgeport drop', rp.receivedBy === 'Katie F' && rp.note === 'note here' && rp.dropName === 'Bridgeport drop' && rp.from === 'Matt', 'receivedBy=' + JSON.stringify(rp.receivedBy) + ' note=' + JSON.stringify(rp.note) + ' from=' + JSON.stringify(rp.from));
    check('S7e Corrected qty reflected on hand (3105000740 LOTA = 2 seed + 2 = 4)', (hub.master().find(r => r[0] === '3105000740') || [])[4] === 4, String((hub.master().find(r => r[0] === '3105000740') || [])[4]));
    await page.waitForSelector('#fa2-list .h-ln.h-dim', { timeout: 10000 }).catch(() => {});
    const voidedDim = await page.locator('#fa2-list .h-ln.h-dim').count();
    check('S7f Voided line rendered dimmed', voidedDim >= 1, 'dim lines=' + voidedDim);

    // ---------------- S9: Admin (listener accumulation) ----------------
    await go(page, '#/fa2/admin', '#a-pw');
    await page.fill('#a-pw', 'nope'); await page.click('#a-go');
    await page.waitForFunction(() => /Wrong password/.test((document.getElementById('fa2-err') || {}).textContent || ''), null, { timeout: 5000 });
    check('S9a Admin wrong password message', true);
    await page.fill('#a-pw', 'SMFA2026!'); await page.click('#a-go');
    await page.waitForSelector('.a-add', { timeout: 10000 });
    await page.fill('.a-nm[data-r="fa"]', 'New Person'); await page.fill('.a-em[data-r="fa"]', 'new@example.com');
    await page.locator('.a-add[data-r="fa"]').click();
    await page.waitForFunction(() => document.body.innerText.indexOf('New Person') > -1 && !document.querySelector('.a-busy'), null, { timeout: 10000 });
    const setCalls1 = hub.log.filter(b => b.action === 'admin' && b.op === 'teams_set').length;
    check('S9b Add member → one teams_set', setCalls1 === 1 && hub.teams.length === 4, 'teams_set calls=' + setCalls1);
    // now delete one member: count confirm dialogs + teams_set calls
    let dialogs = 0; page.on('dialog', async d => { dialogs++; await d.accept(); });
    const delTarget = page.locator('.fa2-row', { hasText: 'Jordan P' }).locator('.a-del');
    await delTarget.click();
    await sleep(1500);
    const setCalls2 = hub.log.filter(b => b.action === 'admin' && b.op === 'teams_set').length - setCalls1;
    bug('S9c deleting one member after a prior save → stacked listeners (2 confirms, 2 teams_set)', dialogs === 2 && setCalls2 === 2, dialogs === 1 && setCalls2 === 1 && hub.teams.length === 3, 'confirms=' + dialogs + ' teams_set=' + setCalls2 + ' teams now=' + hub.teams.map(t => t.name).join(','));

    if (FIXED) {
      const syncBefore = hub.log.filter(b => b.action === 'admin' && b.op === 'sync_sharing').length;
      hub.teams.push({ name: 'Nate (F&A too)', email: 'nate@example.com', role: 'fa', active: true });
      await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(800);
      const syncAfterRf = hub.log.filter(b => b.action === 'admin' && b.op === 'sync_sharing').length - syncBefore;
      const dupTag = await page.evaluate(() => (document.getElementById('a-body') || {}).innerText || '');
      check('R6a Admin ↻ only re-reads — no sharing sync (no share emails)', syncAfterRf === 0, 'sync_sharing calls on refresh=' + syncAfterRf);
      check('R6b Email listed on both teams is flagged as getting every share email twice', /listed 2× — gets every share email 2×/.test(dupTag), dupTag.replace(/\s+/g, ' ').slice(0, 160));
      await page.click('#a-sync'); await sleep(800);
      const syncAfterBtn = hub.log.filter(b => b.action === 'admin' && b.op === 'sync_sharing').length - syncBefore;
      check('R6c Explicit "Sync sheet & folder access" (confirmed) runs exactly one sync', syncAfterBtn === 1 && dialogs === 2, 'sync=' + syncAfterBtn + ' confirms=' + dialogs);
      hub.teams = hub.teams.filter(t => t.name !== 'Nate (F&A too)');
    }

    // ---------------- S8: Transactions ----------------
    hub.imports.push({ importId: 'imp1', ts: '2026-08-28T10:00:00Z', source: 'email', bo: 'C777', outcome: 'pending', pdf: '', detail: { hdr: { facility: 'WCOSC', dos: '2026-08-27', surgeon: 'Dr. Modest', po: 'PO-88' }, lines: [{ refRaw: '0130', desc: 'InSpace C', lot: '', qty: 1, issue: 'no-lot', unitPrice: 1250, lineTotal: 1250 }, { refRaw: '9999', desc: 'Not ours', lot: '', qty: 1, issue: 'unknown-ref', unitPrice: 75.5, lineTotal: 75.5 }] } });
    hub.imports.push({ importId: 'imp0', ts: '2026-08-27T10:00:00Z', source: 'email', bo: 'C700', outcome: 'auto', pdf: '', detail: { hdr: {}, lines: [] } });
    await go(page, '#/fa2', '#fa2-pills .cc-pill.ok');
    await page.waitForFunction(() => /pending/.test((document.getElementById('fa2-tsub') || {}).textContent || ''), null, { timeout: 10000 });
    check('S8a Home shows pending badge on Transactions', /1 pending/.test(await text(page, '#fa2-tsub')));
    await go(page, '#/fa2/trans', '.fa2-rev');
    if (FIXED) {
      const cardTxt = (await text(page, '#fa2-list .fa2-row')).replace(/\s+/g, ' ');
      check('R1 Transactions card shows C#, account, surgeon, PO and total $', /C777/.test(cardTxt) && /WCOSC · Dr\. Modest/.test(cardTxt) && /PO PO-88/.test(cardTxt) && /\$1,325\.50/.test(cardTxt), cardTxt);
    }
    await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(500); await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(500);
    await page.locator('.fa2-rev').first().click();
    await page.waitForSelector('#t-appr', { timeout: 5000 });
    await page.fill('.fa2-tl[data-f="lot"][data-i="0"]', 'LOTC');
    await page.check('.fa2-tl[data-f="skip"][data-i="1"]');
    await page.click('#t-appr');
    await page.waitForSelector('.fa2-eyebrow', { timeout: 10000 });
    const appr = hub.log.filter(b => b.action === 'import_approve');
    check('S8b Approve sends edited lot + skip flag', appr.length === 1 && appr[0].lines[0].lot === 'LOTC' && appr[0].lines[1].skipped === true, JSON.stringify(appr.map(a => a.lines.map(l => [l.lot, l.skipped]))));
    check('S8c Approved import applied as Used in case', hub.events('Used in case').filter(e => e.importId === 'imp1').length === 1);
    if (FIXED) {
      hub.imports.push({ importId: 'imp2', ts: '2026-08-28T12:00:00Z', source: 'email', bo: 'C888', outcome: 'pending', pdf: '', detail: { hdr: { facility: 'Danbury', dos: '2026-08-28', surgeon: 'Dr. Ganal' }, lines: [{ refRaw: '0131', desc: 'InSpace D', lot: 'LOTD', qty: 1, issue: 'overdraft', lineTotal: 500 }] } });
      await page.evaluate(() => document.getElementById('fa2-rf').click()); await page.waitForSelector('.fa2-rev', { timeout: 10000 });
      await page.locator('.fa2-rev').first().click(); await page.waitForSelector('#t-deny', { timeout: 5000 });
      await page.click('#t-deny'); await page.waitForSelector('.fa2-eyebrow', { timeout: 10000 }); /* S9's dialog handler accepts the confirm */
      await go(page, '#/fa2/history', '#fa2-list .h-ev');
      const hist = await page.evaluate(() => [].map.call(document.querySelectorAll('#fa2-list .h-ev'), n => n.innerText.replace(/\s+/g, ' ')));
      const appr = hist.find(t => /Bill only approved/.test(t)), den = hist.find(t => /Bill only denied/.test(t));
      check('R2a History logs the approved bill only with reviewer, account, $ and the not-F&A skip', !!appr && /C777/.test(appr) && /by Nate/.test(appr) && /1 marked not F&A stock/.test(appr) && /\$1,325\.50/.test(appr), appr || 'missing');
      check('R2b History logs the denied bill only', !!den && /C888/.test(den) && /Danbury/.test(den) && /by Nate/.test(den) && /DENIED/.test(den), den || 'missing');
      await page.locator('#fa2-list .h-ev', { hasText: 'Bill only approved' }).click();
      const apprLines = (await page.locator('#fa2-list .h-ev', { hasText: 'Bill only approved' }).locator('.h-ln').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
      check('R2c Expanded review card shows the skipped line flagged', /9999.*SKIPPED — not F&A stock/.test(apprLines) && /0130.*Lot LOTC/.test(apprLines), apprLines);
    }

    // ---------------- R5: refresh button on every sheet-backed screen ----------------
    if (FIXED) {
      const rf = {};
      for (const [n, h, sel] of [['home', '#/fa2', '#fa2-pills'], ['onhand', '#/fa2/onhand', '#fa2-list'], ['history', '#/fa2/history', '#fa2-list'], ['trans', '#/fa2/trans', '#fa2-list'], ['add', '#/fa2/add', '#fa2-drop'], ['return', '#/fa2/return', '#fa2-pick'], ['send', '#/fa2/send', '#fa2-pick'], ['use', '#/fa2/use', '#fa2-pick'], ['admin', '#/fa2/admin', '#a-body']]) {
        await go(page, h, sel); await sleep(300);
        rf[n] = await page.evaluate(() => { const b = document.getElementById('fa2-rf'); if (!b) return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [Math.round(r.top), Math.round(r.right), top === b || (top && b.contains(top))]; });
      }
      const allOk = Object.keys(rf).every(k => rf[k] && rf[k][0] > 60 && rf[k][0] < 140 && rf[k][1] >= 370 && rf[k][2]);
      check('R5 ↻ present, visible and tappable at the top-right on all 9 sheet-backed screens', allOk, JSON.stringify(rf));
      // the refresh on Send must not stack pick handlers (qty must step by 1 after a refresh)
      await go(page, '#/fa2/send', '#fa2-pick .fa2-row');
      await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(600);
      await page.locator('.fa2-qb[data-d="1"]').first().click();
      check('R5b Refresh on Send re-wires the picker without stacking handlers', (await text(page, '.fa2-qv')) === '1', 'qty=' + (await text(page, '.fa2-qv')));
    }

    // ---------------- S13: legacy #/fa route ----------------
    await go(page, '#/fa', null); await sleep(600);
    bug('S13 #/fa: baseline opens the retired v1 tool / fixed redirects to v2', (await page.evaluate(() => location.hash)) === '#/fa', (await page.evaluate(() => location.hash)) === '#/fa2' && (await page.locator('#fa2-pills').count()) === 1, 'hash=' + (await page.evaluate(() => location.hash)));

    // ---------------- S14: re-gate when fa2 creds missing ----------------
    await page.evaluate(() => localStorage.removeItem('tbx_fa2'));
    await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('authed') && !!window.TBX_BOOT, null, { timeout: 20000 }); await page.waitForSelector('.cc-card', { timeout: 15000 }); await sleep(500);
    await go(page, '#/fa2/onhand', null); await sleep(600);
    note('S14 state after reload+navigate', await page.evaluate(() => location.hash + ' | ' + (document.getElementById('content') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 120)));
    await page.waitForSelector('#cc-pw', { timeout: 10000 });
    const gm = await text(page, '.cc-sub');
    check('S14a Missing fa2 creds → gate with one-time message', /One-time unlock/.test(gm), gm);
    await page.fill('#cc-pw', CT_PW); await page.click('#cc-go');
    await page.waitForSelector('#fa2-list .f2c', { timeout: 10000 });
    check('S14b After re-unlock lands back on the requested fa2 screen', /On hand/.test(await text(page, '.cc-h')));

    // ---------------- S15: offline → stale cache ----------------
    await go(page, '#/fa2/onhand', '#fa2-list .f2c');
    hub.abortNext = true;
    await page.evaluate(() => document.getElementById('fa2-rf').click()); await sleep(800);
    check('S15 Hub unreachable on refresh → On hand keeps the cached master', !hub.abortNext && (await page.locator('#fa2-list .f2c').count()) > 0 && !/reach the server/.test(await text(page, '#fa2-list')), 'rows=' + (await page.locator('#fa2-list .f2c').count()));

    // ---------------- S10: scan injection in Add step 2 ----------------
    await go(page, '#/fa2/add', '#fa2-drop');
    await page.fill('#fa2-drop', 'Scan drop'); await pickChip(page, 'fa2-from', 'Mia'); await pickChip(page, 'fa2-rb', 'Katie F');
    await page.click('#fa2-go'); await page.waitForSelector('#a2-go', { timeout: 10000 });
    await page.evaluate(() => window.__TBX_ONCODE('(01)07613327570463'));
    await sleep(300);
    const row1 = await text(page, '#a2-tray .k-trow');
    check('S10a GTIN-only scan adds a lot-less row', /3105000740/.test(row1) && /Lot\s*$/m.test(row1) || /Lot\s/.test(row1), row1.replace(/\n/g, ' | '));
    check('S10b Save stays disabled, warn says "tap the item to fix"', (await page.locator('#a2-go').isDisabled()) && /(tap the item to fix|scan its lot barcode)/.test(await text(page, '#a2-warn')), await text(page, '#a2-warn'));
    await page.locator('#a2-tray .k-trow .k-tmain').click(); await sleep(200);
    const afterTap = await page.evaluate(() => ({ modal: !!document.querySelector('.fa2-modal'), rows: document.querySelectorAll('#a2-tray .k-trow').length, inputs: document.querySelectorAll('#a2-tray input').length }));
    note('S10c tapping the lot-less row', JSON.stringify(afterTap) + ' (no editor either way — the fix attaches the next lot scan instead)');
    // lot/exp-only barcode scanned AFTER the GTIN
    await page.evaluate(() => window.__TBX_ONCODE('(17)270600(10)ZLOT1'));
    await sleep(300);
    const rowsAfterLot = await page.locator('#a2-tray .k-trow').count();
    const stat = await text(page, '#cc-stat');
    const lotTxt = await page.evaluate(() => [].map.call(document.querySelectorAll('#a2-tray .k-trow .k-ts'), n => n.innerText).join('|'));
    bug('S10d lot/exp barcode scanned AFTER the GTIN: baseline just "holds" it (row stays stuck) / fixed attaches it to the row', rowsAfterLot === 1 && /held/.test(stat) && /tap the item to fix/.test(await text(page, '#a2-warn')), rowsAfterLot === 1 && /ZLOT1/.test(lotTxt) && !(await page.locator('#a2-go').isDisabled()), 'rows=' + rowsAfterLot + ' status="' + stat + '" lots="' + lotTxt + '"');
    if (!FIXED) {
      await page.evaluate(() => window.__TBX_ONCODE('(01)07613327570463'));
      await sleep(300);
      const rows2 = await page.evaluate(() => [].map.call(document.querySelectorAll('#a2-tray .k-trow'), r => r.querySelector('.k-ts').innerText));
      check('S10e Re-scanning GTIN after the held lot creates a SECOND row (lot-less row remains)', rows2.length === 2 && /ZLOT1/.test(rows2[1]), JSON.stringify(rows2));
      await page.locator('#a2-tray .k-trow').first().locator('.k-x').click(); await sleep(200);
      check('S10f After deleting the lot-less row, Save enables', !(await page.locator('#a2-go').isDisabled()));
    }
    await page.click('#a2-go');
    await page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 10000 });
    if (FIXED) await page.waitForFunction(() => /Inventory add saved/.test((document.getElementById('fa2-flash') || {}).innerText || ''), null, { timeout: 15000 });
    else await sleep(500);
    const scanEv = hub.events('Received').filter(e => e.lot === 'ZLOT1').slice(-1)[0] || {};
    check('S10g Scanned exp with DD=00 is sent as month-only "2027-06" (manual path enforces full date)', scanEv.exp === '2027-06' && scanEv.entryMethod === 'scan' && scanEv.lot === 'ZLOT1', JSON.stringify({ exp: scanEv.exp, lot: scanEv.lot, entryMethod: scanEv.entryMethod }));

    check('S-errors no uncaught page errors during sports flows', !(hub.pageErrors && hub.pageErrors.length), (hub.pageErrors || []).join(' || ').slice(0, 300));
    await ctx.close();

    // ---------------- S11: timezone / UTC default dates ----------------
    {
      const hub2 = new FakeHub({ now: fixedNow });
      const evening = new Date('2026-08-28T21:30:00-04:00'); // 9:30 PM EDT = 01:30Z next day
      const r = await newPage(browser, hub2, { clock: evening });
      await ctGate(r.page, CT_PW, 'Nate');
      await go(r.page, '#/fa2/add', '#fa2-date');
      const d1 = await r.page.inputValue('#fa2-date');
      const localDate = await r.page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
      bug('S11a default drop date uses UTC (9:30 PM EDT → tomorrow)', d1 !== localDate && d1 === '2026-08-29', d1 === localDate && d1 === '2026-08-28', 'default=' + d1 + ' local=' + localDate);
      await go(r.page, '#/fa2/use', '#u-dos');
      const d2 = await r.page.inputValue('#u-dos');
      bug('S11b default DOS uses UTC too', d2 === '2026-08-29', d2 === '2026-08-28', 'default=' + d2);
      await r.ctx.close();
    }

    // ---------------- S12: F&A-side login ----------------
    {
      const hub3 = new FakeHub({ now: fixedNow });
      hub3.seed([{ type: 'Received', ref: '0130', desc: 'InSpace C', lot: 'LOTC', exp: '2027-06-15', qty: 5, dropName: 'Norwalk drop', from: 'Nate', receivedBy: 'Jordan P' }]);
      const r = await newPage(browser, hub3);
      await ctGate(r.page, FA_PW, null);
      await r.page.waitForSelector('#fa2-send', { timeout: 15000 });
      const fcreds = await r.page.evaluate(() => JSON.parse(localStorage.getItem('tbx_fa2') || 'null'));
      check('S12a FA password at CT gate → fa scope creds, F&A home (3 tiles)', fcreds && fcreds.scope === 'fa' && (await r.page.locator('.ct-big').count()) === 3);
      await go(r.page, '#/fa2/history', '#fa2-list .h-ev');
      check('S12b FA history has no File Correction', (await r.page.locator('.h-fix').count()) === 0);
      await go(r.page, '#/fa2/send', '#fa2-pick .fa2-row');
      await r.page.locator('.fa2-qb[data-d="1"]').first().click(); await r.page.fill('#fa2-trk', '1Z1');
      check('S12c FA send-back stays disabled until a name is picked', await r.page.locator('#fa2-go').isDisabled());
      await r.page.locator('#fa2-nm .fa2-chip').first().click();
      check('S12d Enabled after name', !(await r.page.locator('#fa2-go').isDisabled()));
      await r.page.click('#fa2-go');
      await r.page.waitForFunction(() => location.hash === '#/fa2', null, { timeout: 10000 });
      const sbev = hub3.events('Returned to Stryker')[0];
      check('S12e FA send-back event enteredBy = picked name', sbev && sbev.enteredBy === 'Katie F' && sbev.tracking === '1Z1', JSON.stringify({ by: sbev && sbev.enteredBy }));
      // FA user can still open sports-only screens via URL
      await go(r.page, '#/fa2/add', null); await sleep(600);
      const addVisible = await r.page.locator('#fa2-drop').count();
      let errTxt = '';
      if (addVisible) {
        await r.page.fill('#fa2-drop', 'x'); await pickChip(r.page, 'fa2-from', 'Nate'); await pickChip(r.page, 'fa2-rb', 'Bloomfield Warehouse'); await r.page.click('#fa2-go');
        await r.page.waitForSelector('#a2-go', { timeout: 10000 });
        await r.page.click('#a2-man'); await r.page.fill('#a2-ref', '0130'); await r.page.fill('#a2-lot', 'L'); await r.page.fill('#a2-exp', '2027-01-01'); await r.page.click('#a2-addman');
        await r.page.click('#a2-go');
        await r.page.waitForFunction(() => ((document.getElementById('fa2-err') || {}).textContent || '').length > 0, null, { timeout: 10000 });
        errTxt = await text(r.page, '#fa2-err');
      }
      bug('S12f FA-scope user can open Add by URL and the scope rejection reads as a network error', addVisible === 1 && /reach the server/.test(errTxt), addVisible === 0 && (await r.page.evaluate(() => location.hash)) === '#/fa2', 'addVisible=' + addVisible + ' hash=' + (await r.page.evaluate(() => location.hash)) + ' err="' + errTxt + '"');
      check('S12-errors no uncaught page errors during FA flows', !(hub3.pageErrors && hub3.pageErrors.length), (hub3.pageErrors || []).join(' || ').slice(0, 300));
      await r.ctx.close();
    }
  } catch (e) {
    console.log('HARNESS ERROR', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
    try { const pg = (browser.contexts()[0] || {}).pages ? browser.contexts()[0].pages()[0] : null; if (pg) console.log('DIAG', JSON.stringify(await pg.evaluate(() => ({ hash: location.hash, txt: (document.getElementById('content') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 160), err: (document.getElementById('fa2-err') || {}).textContent, warn: (document.getElementById('a2-warn') || {}).textContent, go: (document.getElementById('a2-go') || {}).disabled, goTxt: (document.getElementById('a2-go') || {}).textContent, pend: localStorage.getItem('tbx_fa2_pend') })))); } catch (e2) { console.log('DIAG fail', String(e2).slice(0, 100)); }
    try { const hubs = global.__hubs || []; hubs.forEach(h => console.log('HUBLOG', JSON.stringify(h.log.slice(-3).map(x => ({ action: x.action, op: x.op, opId: x.opId && x.opId.slice(0, 8), n: x.events && x.events.length, exp: x.events && x.events.map(e => e.exp) }))))); } catch (e3) {}
  } finally {
    await browser.close(); server.kill();
    const pass = results.filter(r => r.ok === true).length, fail = results.filter(r => r.ok === false).length;
    console.log('\n' + pass + ' pass / ' + fail + ' fail / ' + results.filter(r => r.ok === null).length + ' notes');
    require('fs').writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 1));
  }
})();
