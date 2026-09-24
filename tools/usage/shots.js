// Visual check: the real app in headless Chromium at phone width with the usage hub faked by the real core
// over 30 days of synthetic team activity. Screenshots to tools/usage/shots/ (gitignored).
//   APP_PW=<catalog pw> node tools/usage/shots.js      (needs data.js decrypted in the repo root for the part numbers)
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const U = require('./usage-core.js');
const R = path.resolve(__dirname, '../..'); const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 8124, BASE = 'http://localhost:' + PORT + '/';
const HUB = 'https://script.google.com/macros/s/fake-usage/exec';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 30 days of believable activity ----
global.window = {}; new Function('window', fs.readFileSync(R + '/data.js', 'utf8'))(global.window);
const D = global.window.TOOLBOX;
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const skus = D.items.filter(i => !i.hidden && /Implants|Disposables|Instruments|Suture/.test(i.cat)).map(i => i.sku);
const hot = skus.slice(0, 400).filter((_, i) => i % 9 === 0).slice(0, 18);
const terms = ['iconix', 'nanotack', 'alphavent', 'flowport', 'omega 4.75', 'samurai', 'knotilus', 'versitomic', 'xbraid tt', 'cinchlock', '3910500580', 'dc guide'];
const zero = ['healicoil', 'swivelock', 'quattro link', 'tightrope'];
const devs = Array.from({ length: 23 }, (_, i) => ({ d: ('dev' + i).padEnd(10, 'x').slice(0, 10).replace(/[^a-z0-9]/g, 'x'), p: i % 7 === 0 ? 'Android|web' : i % 5 === 0 ? 'iPhone|web' : i === 3 ? 'Mac|web' : 'iPhone|app', v: i % 6 === 0 ? '4.141' : '4.142' }));
function gen(now) {
  const rows = [], iso = (ms) => new Date(Math.min(ms, now - 1000)).toISOString();
  for (let day = 29; day >= 0; day--) {
    const dayStart = U.windowStart(now, day + 1), wkend = [0, 6].indexOf(new Date(dayStart + 12 * 3600e3).getUTCDay()) > -1;
    devs.forEach((dv, di) => {
      if (rnd() < (wkend ? 0.85 : 0.35 + (di % 3) * 0.05)) return;
      const sessions = 1 + Math.floor(rnd() * 3);
      for (let s = 0; s < sessions; s++) {
        let t = dayStart + (6.5 + rnd() * 11) * 3600e3; if (t > now) return;
        const sid = ('s' + di + day + s + 'abcdefgh').slice(0, 8).replace(/[^a-z0-9]/g, 'a');
        rows.push([iso(t), dv.d, sid, 'open', 'boot', dv.p + '|' + dv.v]); rows.push([iso(t += 900), dv.d, sid, 'view', 'home', '']);
        const n = 2 + Math.floor(rnd() * 7);
        for (let k = 0; k < n; k++) {
          t += 20000 + rnd() * 90000; if (t > now) break;
          const r = rnd();
          if (r < 0.45) rows.push([iso(t), dv.d, sid, 'card', rnd() < 0.6 ? pick(hot) : pick(skus), '']);
          else if (r < 0.7) { const z = rnd() < 0.12; rows.push([iso(t), dv.d, sid, 'search', z ? pick(zero) : pick(terms), z ? '0' : String(2 + Math.floor(rnd() * 30))]); }
          else if (r < 0.82) { const o = rnd(); rows.push([iso(t), dv.d, sid, 'scan', o < 0.85 ? pick(hot) : o < 0.93 ? '234020123' : '00887868' + Math.floor(100000 + rnd() * 899999), o < 0.85 ? 'card' : o < 0.93 ? 'nocard' : 'unknown']); }
          else if (r < 0.9) rows.push([iso(t), dv.d, sid, 'view', pick(['cat/Disposables', 'top/implants', 'bo', 'cc', 'teams', 'cat/Suture', 'fam/Implants/Iconix all-suture anchor']), '']);
          else if (r < 0.95) rows.push([iso(t), dv.d, sid, 'fav', pick(hot), 'on']);
          else rows.push([iso(t), dv.d, sid, 'share', pick(hot), pick(['img', 'link', 'copy'])]);
        }
      }
    });
  }
  // a few people on right now
  [0, 1, 4].forEach((di, j) => { const dv = devs[di], sid = 'live' + di + 'aaa'; rows.push([iso(now - (4 - j) * 60000), dv.d, sid.slice(0, 8), 'open', 'boot', dv.p + '|' + dv.v]); rows.push([iso(now - (3 - j) * 50000), dv.d, sid.slice(0, 8), 'card', hot[j], '']); rows.push([iso(now - (2 - j) * 20000), dv.d, sid.slice(0, 8), 'search', j === 1 ? 'healicoil' : terms[j], j === 1 ? '0' : '14']); });
  rows.push([iso(now - 7 * 60000), devs[2].d, 'errsess1', 'error', "Cannot read properties of undefined (reading 'sku')", 'app-4.142.js:2210']);
  rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
  return rows;
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: R, stdio: 'ignore' });
  await sleep(800);
  const browser = await chromium.launch({ headless: true });
  const shots = [];
  async function page(opts) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
    await ctx.addInitScript((a) => {
      try { localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99'); if (a.admin) localStorage.setItem('tbx_uadm', 'admin-key-123'); } catch (e) {}
      let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v) { v.usage = { url: a.hub, key: 'write-key' }; delete v.bo; } t = v; } });
    }, { hub: HUB, admin: !!opts.admin });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    const rows = gen(Date.now());
    await p.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
    await p.route(/script\.google\.com/, r => {
      let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      const now = Date.now();
      const out = b.action === 'u_live' ? (b.key === 'admin-key-123' ? U.live(rows, { now, excl: {} }) : { ok: false, err: 'key' })
        : b.action === 'u_stats' ? U.stats(rows, { now, days: +b.days || 7, excl: {} }) : { ok: true, n: (b.e || []).length };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    });
    await p.goto(BASE + '#/');
    await p.fill('#lockpw', process.env.APP_PW);
    await p.locator('#lockform').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
    await sleep(1800);
    return { p, ctx, errs };
  }
  const shot = async (p, name, full) => { const f = path.join(OUT, name + '.png'); await p.screenshot({ path: f, fullPage: !!full }); shots.push(f); };

  { const { p, ctx, errs } = await page({ admin: true });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(300); await shot(p, '01-home-footer');
    await p.evaluate(() => { location.hash = '#/usage'; }); await sleep(1500);
    await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200); await shot(p, '02-usage-live');
    await p.locator('#ug-livebody .ug-col.hi').click(); await sleep(200); await shot(p, '03-usage-tooltip');
    await shot(p, '04-usage-full-7d', true);
    await p.locator('[data-ug-days="30"]').click(); await sleep(900);
    await p.locator('#ug-filters').scrollIntoViewIfNeeded(); await sleep(200); await shot(p, '05-usage-30d');
    await shot(p, '06-usage-full-30d', true);
    console.log('page errors (admin):', errs.length ? errs : 'none');
    await ctx.close(); }
  { const { p, ctx, errs } = await page({ admin: false });
    await p.evaluate(() => { location.hash = '#/usage'; }); await sleep(800); await shot(p, '07-usage-gate');
    console.log('page errors (gate):', errs.length ? errs : 'none');
    await ctx.close(); }
  await browser.close(); server.kill();
  console.log(shots.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
