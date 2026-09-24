// Motion checks for release 7 (g4 spec §15, T1–T11; T12 is on a device) — Playwright, iPhone-sized, touch.
// READ-ONLY against the site it serves: every hub is faked, every other non-localhost request is aborted, the service
// worker is blocked (sw.js 404).
//
//   APP_PW=<catalog pw> [ENGINE=chromium|webkit] node tools/motion-test/run.js [--site <dir>] [--base <live build>]
//        [--port N] [--runs N] [--only <regex>] [--shots <dir>] [--shots-only]
//
//   --site   the build under test (default: the repo root). --base: the live build, for the T1 timings, the T7
//            cycle-count / F&A animation lists and the T9 / T11 "before" numbers (informational without it).
//   --shots  also writes phone-size screenshots (390×844 @3x): lock, launch mid-frame, Home after the launch, a landing
//            page, a card, About with the drawer open, Home with Reduce Motion (--shots-only: just those).
// T1 timings are informational (they depend on the machine's load); everything else passes or fails.
const pw = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const ENGINE = process.env.ENGINE || arg('--engine', 'chromium');
const SITE = path.resolve(arg('--site', path.resolve(__dirname, '../..')));
const BASE_SITE = arg('--base', '') ? path.resolve(arg('--base')) : '';
const PORT = +arg('--port', ENGINE === 'webkit' ? 8177 : 8175);
const RUNS = +arg('--runs', 9); // T1 rounds (spec: median of 9)
const ONLY = arg('--only', '') ? new RegExp(arg('--only')) : null;
const SHOTS = arg('--shots', '') ? path.resolve(arg('--shots')) : '';
const SHOTS_ONLY = process.argv.includes('--shots-only');
const PWD = process.env.APP_PW;
if (!PWD) { console.error('set APP_PW (the catalog password) in the environment'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : '')); }
function info(name, detail) { console.log('INFO ' + name + '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)); }
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ---- a Pages-like static server per site (both builds, so T1/T7/T9/T11 can compare) ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.pdf': 'application/pdf' };
const SLOW = { img: 0 };
function serve(root, port) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    const send = () => fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; return r.end('nf'); } r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); r.setHeader('cache-control', 'no-store'); r.end(b); });
    if (SLOW.img && /^\/img\//.test(p)) setTimeout(send, SLOW.img); else send();
  }).listen(port, '127.0.0.1');
}

// ---- fake hubs (cycle count, F&A, backorder report); nothing reaches a real hub ----
const { BO_API } = require('../nav-test/fixtures.js');
const { FakeHub } = require('../fa2-test/fakehub.js');
const CC_URL = 'https://script.google.com/macros/s/fake-cc/exec', FA_URL = 'https://script.google.com/macros/s/fake-fa/exec', BO_URL = 'https://script.google.com/macros/s/fake-bo/exec';
const DEV = "Nate's iPhone", FA_TOKEN = 'motion-sports';
const fa = new FakeHub(); fa.scopeOf = t => t === FA_TOKEN ? 'sports' : null;
fa.seed([{ type: 'Received', ref: '3910500471', desc: 'Omega', lot: 'LOTA', exp: '2028-01-31', qty: 5, receivedBy: 'Katie F', dropName: 'seed' }]);
const HUB = { boDelay: 0, ccHold: 0 };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
async function hubs(route) {
  const rq = route.request(), url = rq.url();
  const json = j => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(j) }).catch(() => {});
  if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS }).catch(() => {});
  let body = null; try { body = JSON.parse(rq.postData() || 'null'); } catch (e) {}
  if (url.indexOf(CC_URL) === 0) {
    if (HUB.ccHold) await sleep(HUB.ccHold);
    const act = (url.match(/[?&]action=(\w+)/) || [])[1];
    if (act === 'pull') return json({ ok: true, rows: [{ id: 'r0', ts: '2026-09-21T14:00:00Z', dev: DEV, ref: '3910500471', desc: 'OMEGA', lot: 'LOTA', exp: '2028-01-31', qty: 2, loc: 'Trunk' }] });
    if (act === 'roster') return json({ devices: [DEV] });
    return json({ ok: true, applied: [], fresh: [] });
  }
  if (url.indexOf(FA_URL) === 0 && body) { if (HUB.ccHold) await sleep(HUB.ccHold); return json(fa.handle(body)); }
  if (url.indexOf(BO_URL) === 0) { if (HUB.boDelay) await sleep(HUB.boDelay); return json(BO_API); }
  return route.abort().catch(() => {});
}

let browser;
async function open(o) {
  o = o || {};
  const base = 'http://localhost:' + (o.port || PORT) + '/';
  const ctx = await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, deviceScaleFactor: o.dsf || 2, isMobile: ENGINE === 'chromium', hasTouch: true,
    reducedMotion: o.reduced ? 'reduce' : 'no-preference', colorScheme: 'dark', timezoneId: 'America/New_York',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript((a) => {
    try {
      localStorage.setItem('tbx_tour_done', '1'); localStorage.setItem('tbx_a2hs_x', '1'); localStorage.setItem('tbx_wn_seen', '99');
      if (a.ct) {
        localStorage.setItem('tbx_cc', JSON.stringify({ url: a.cc, token: 'tok' })); localStorage.setItem('tbx_cc_dev', a.dev);
        localStorage.setItem('tbx_cc_roster', JSON.stringify([a.dev])); localStorage.setItem('tbx_fa2', JSON.stringify({ url: a.fa, token: a.tok, scope: 'sports' }));
      }
      if (a.ls && !sessionStorage.getItem('__seeded')) { Object.keys(a.ls).forEach(k => localStorage.setItem(k, a.ls[k])); sessionStorage.setItem('__seeded', '1'); }
    } catch (e) {}
    let t; Object.defineProperty(window, 'TOOLBOX', { configurable: true, get() { return t; }, set(v) { if (v) { v.bo = { url: a.bo, key: 'k' }; v.usage = null; v.fb = null; } t = v; } });
    window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message || e)));
    let rt = false; Object.defineProperty(window, '__tbxRouted', { configurable: true, get() { return rt; }, set(v) { rt = v; if (v && !window.__tR) window.__tR = performance.now(); } });
    let boot; Object.defineProperty(window, 'TBX_BOOT', { configurable: true, get() { return boot; }, set(f) { boot = function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally { if (window.__bootMs == null) window.__bootMs = performance.now() - t0; } }; } });
    document.addEventListener('submit', () => { window.__tS = performance.now(); }, true);
    if (a.noVT) { try { delete Document.prototype.startViewTransition; } catch (e) {} }
    if (a.breakAnimate) { Element.prototype.animate = function () { throw new Error('injected: animate'); }; }
    // lock 'open' (typed unlock succeeded) and every class the launch puts on <html>, per frame
    window.__cls = []; window.__open = null;
    document.addEventListener('DOMContentLoaded', () => {
      const lock = document.getElementById('lock');
      if (lock) new MutationObserver(() => { if (lock.classList.contains('open') && window.__open == null) window.__open = performance.now(); }).observe(lock, { attributes: true });
      new MutationObserver(() => { const c = document.documentElement.className; if (window.__cls[window.__cls.length - 1] !== c) window.__cls.push(c); }).observe(document.documentElement, { attributes: true });
    });
  }, { bo: BO_URL, cc: CC_URL, fa: FA_URL, dev: DEV, tok: FA_TOKEN, ct: !!o.ct, ls: o.ls || null, noVT: !!o.noVT, breakAnimate: !!o.breakAnimate });
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:')) { if (/\/sw\.js(\?|$)/.test(u)) return r.fulfill({ status: 404, body: '' }); return r.continue(); }
    return hubs(r);
  });
  const p = await ctx.newPage();
  p.__log = []; p.on('pageerror', e => { if (!/sw\.js load failed/.test(String(e))) p.__log.push('pageerror ' + String(e.message || e).slice(0, 160)); }); // sw.js is 404'd on purpose p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|interactive-widget/.test(m.text())) p.__log.push('console ' + m.text().slice(0, 160)); });
  p.__base = base;
  await p.goto(base + (o.start || '#/'), { waitUntil: 'domcontentloaded' });
  return { p, ctx };
}
async function unlock(p, o) {
  o = o || {};
  await p.waitForSelector('#lockpw');
  await p.fill('#lockpw', PWD); if (o.remember) await p.check('#lockrem');
  if (o.trace) await traceStart(p);
  await p.locator('#lockform').evaluate(f => f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  await p.waitForFunction(() => document.documentElement.classList.contains('authed') && window.__tbxRouted && document.getElementById('content').innerHTML.length > 100, null, { timeout: 60000 });
}
async function ready(p) { await p.waitForFunction(() => document.getElementById('content').innerHTML.length > 100 && window.__tbxRouted, null, { timeout: 60000 }); }
// per-frame trace of the launch overlay (children of #launch), with the page's own clock
function traceStart(p, ms) {
  return p.evaluate((ms) => {
    window.__tr = []; const t0 = performance.now();
    const f = () => { const h = document.getElementById('launch'); window.__tr.push([Math.round(performance.now()), h ? h.children.length : -1]); if (performance.now() - t0 < ms) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }, ms || 3500);
}
// every animation that runs during fn: CSS/WAAPI keyframe properties and view-transition pseudo-elements
async function recordAnims(p, ms) {
  await p.evaluate((ms) => {
    window.__an = []; window.__vt = []; const seen = new Set(); const t0 = performance.now();
    const f = () => {
      document.getAnimations().forEach(a => {
        if (seen.has(a)) return; seen.add(a);
        const e = a.effect, pe = String((e && e.pseudoElement) || ''), tg = e && e.target;
        let props = [];
        try { (e.getKeyframes() || []).forEach(k => Object.keys(k).forEach(x => { if (['offset', 'computedOffset', 'easing', 'composite'].indexOf(x) < 0 && props.indexOf(x) < 0) props.push(x); })); } catch (x) {}
        const who = pe ? pe : tg ? ((tg.id ? '#' + tg.id : '') + (tg.className && typeof tg.className === 'string' ? '.' + tg.className.trim().split(/\s+/).join('.') : '')) : '?';
        window.__an.push({ who: who, name: a.animationName || a.transitionProperty || (a.constructor && a.constructor.name) || '', props: props, kind: a.constructor ? a.constructor.name : '' });
        if (/view-transition/.test(pe) && window.__vt.indexOf(pe) < 0) window.__vt.push(pe);
      });
      if (performance.now() - t0 < ms) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, ms || 1500);
}
const anims = p => p.evaluate(() => ({ an: window.__an || [], vt: window.__vt || [] }));
const leftoverNames = p => p.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.style && e.style.viewTransitionName).length);

const JOBS = [];
const job = (name, fn) => JOBS.push({ name, fn });

// ================= T6 · compositor lint (static: index.html CSS, JS-set transitions) =================
job('T6-lint', async () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [];
  // keyframes: only transform / opacity
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)) {
    const props = [...m[2].matchAll(/([\w-]+)\s*:/g)].map(x => x[1]).filter(x => x !== 'offset');
    const off = props.filter(x => !/^(transform|opacity)$/.test(x));
    if (off.length) bad.push('@keyframes ' + m[1] + ': ' + off.join(','));
  }
  // transitions: transform / opacity; colour <= 180 ms; visibility (discrete); allow-list
  const ALLOW = { '.fops-fill': /^width$/, '.coll': /^grid-template-rows$/, '.coll.open': /^grid-template-rows$/ }; // cycle-count bar (untouched), R6 N13 collapsible
  const COLOR = /^(color|background-color|background|border-color|fill|stroke)$/;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    for (const d of m[2].matchAll(/(?:^|;)\s*transition\s*:\s*([^;]+)/g)) {
      if (/^none\b/.test(d[1].trim())) continue;
      d[1].split(/,(?![^(]*\))/).forEach(part => {
        const tok = part.trim().split(/\s+/), prop = tok[0], dur = tok.slice(1).find(x => /^[\d.]+m?s$|^var\(--m-/.test(x)) || '0s';
        const ms = /^var\(--m-(quick|tap|exit)/.test(dur) ? 140 : /^var\(--m-release/.test(dur) ? 180 : /^var\(/.test(dur) ? 300 : /ms$/.test(dur) ? parseFloat(dur) : parseFloat(dur) * 1000;
        if (/^(transform|opacity|visibility)$/.test(prop)) return;
        if (COLOR.test(prop) && ms <= 180) return;
        if (Object.keys(ALLOW).some(k => sel.split(',').some(s => s.trim() === k) && ALLOW[k].test(prop))) return;
        bad.push(sel.slice(0, 60) + ' → transition ' + prop + ' ' + dur);
      });
    }
  }
  check('T6 every @keyframes / transition in index.html is transform/opacity (colour ≤180 ms, allow-list: .fops-fill width, R6 .coll)', !bad.length, bad);
  const rmBlocks = (css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) || []).length;
  check('M0 one reduced-motion block in index.html', rmBlocks === 1, rmBlocks);
  const app = fs.readFileSync(path.join(SITE, (/<script src="(app[^"]*\.js)"/.exec(html) || [])[1]), 'utf8');
  const jsT = [...app.matchAll(/style\.transition\s*=\s*([^;]+);/g)].map(m => m[1]);
  check('T6 transitions set from JS are transform-only', jsT.length > 0 && jsT.every(t => !/'[^']*\b(width|height|top|left|margin|filter|box-shadow)\b/.test(t)), jsT);
  const mod = (/<script>\n(\(function \(\) \{\nvar W = window[\s\S]*?)\n<\/script>/.exec(html) || [])[1] || '';
  check('N1 launch code is inline and ≤ 3 KB', mod.length > 1000 && Buffer.byteLength(mod) <= 3072, Buffer.byteLength(mod) + ' bytes');
  check('N1 launch code makes no network request', mod.length > 0 && !/fetch\(|XMLHttpRequest|import\(|\.src\s*=/.test(mod));
});

// ================= N10 · tiles (contrast of the accents; Home carries 9 chips) =================
job('N10-tiles', async () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const lum = hex => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (fg, a, bg) => '#' + [1, 3, 5].map(i => Math.round(a * parseInt(fg.substr(i, 2), 16) + (1 - a) * parseInt(bg.substr(i, 2), 16)).toString(16).padStart(2, '0')).join('');
  const acc = {}; for (const m of html.matchAll(/--cat-(\w+):(#[0-9A-Fa-f]{6})/g)) acc[m[1]] = m[2];
  const rows = Object.keys(acc).map(k => { const bg = k === 'bo' ? '#15304F' : '#2A2A2A'; const chip = mix(acc[k], .12, bg); return { k, onPanel: +ratio(acc[k], bg).toFixed(1), onChip: +ratio(acc[k], chip).toFixed(1) }; });
  check('N10 every category accent ≥ 7:1 on its tile and ≥ 5.5:1 on its chip (spec 7.3–8.8 / 5.7–6.7)', rows.length === 8 && rows.every(r => r.onPanel >= 7 && r.onChip >= 5.5), rows);
  const { p, ctx } = await open(); await unlock(p); await sleep(1400);
  const t = await p.evaluate(() => ({ tico: document.querySelectorAll('#content .tile .tico').length, keyed: document.querySelectorAll('#content .tile .tico[class*="k-"]').length,
    svg: [...document.querySelectorAll('#content .tile .tico svg')].every(s => s.getAttribute('stroke') === 'currentColor'),
    amber: [...document.querySelectorAll('#content .tile:not(.tile-bo):not(.tile-inv) .n')].every(n => getComputedStyle(n).color === 'rgb(253, 181, 21)'),
    tlt: document.querySelectorAll('#content .tile .tlt').length, colors: [...new Set([...document.querySelectorAll('#content .tile .tico[class*="k-"]')].map(e => getComputedStyle(e).color))].length }));
  check('N10 Home: 9 tile chips, 7 category keys with 7 distinct accents, currentColor glyphs, counts stay amber', t.tico === 9 && t.keyed === 7 && t.colors === 7 && t.svg && t.amber && t.tlt === 8, t);
  await ctx.close();
});

// ================= T2 · the launch (typed unlock): overlay life cycle, lands on #brand, never blocks input =================
job('T2-launch-typed', async () => {
  const { p, ctx } = await open();
  await unlock(p, { trace: true });
  await p.waitForFunction(() => window.__tbxReadyAt, null, { timeout: 20000 });
  await sleep(2000);
  const r = await p.evaluate(() => {
    const on = window.__tr.filter(x => x[1] > 0), open = window.__open, rd = window.__tbxReadyAt;
    return { open: open && Math.round(open), ready: rd, first: on.length ? on[0][0] : null, last: on.length ? on[on.length - 1][0] : null,
      at150: window.__tr.some(x => x[0] >= open + 150 && x[0] <= open + 300 && x[1] > 0), cls: window.__cls, pe: getComputedStyle(document.getElementById('launch')).pointerEvents,
      brand: getComputedStyle(document.getElementById('brand')).opacity, brandShown: getComputedStyle(document.getElementById('brand')).display !== 'none', html: document.documentElement.className,
      badge: document.getElementById('lkbadge').style.visibility, left: document.getElementById('launch').children.length, cost: window.__tbxLaunchCost };
  });
  check('T2 overlay on screen within 150 ms of the unlock and still there at 150–300 ms', r.first != null && r.first - r.open <= 150 && r.at150, r);
  check('T2 overlay lands (launch-land) and is gone by ready + 600 ms', r.cls.some(c => /launch-land/.test(c)) && r.last != null && r.last <= r.ready + 600 && r.left === 0, { last: r.last, ready: r.ready });
  check('T2 overlay never takes input (pointer-events:none), classes cleaned, badge restored', r.pe === 'none' && !/launching|launch-land/.test(r.html) && r.badge === '', r);
  check('T2 the Home mark is visible afterwards', r.brandShown && r.brand === '1', r);
  info('T2 launch begin() main-thread cost (ms)', r.cost);
  check('T2 no page errors', !(await p.evaluate(() => window.__errs)).length && !p.__log.filter(l => /pageerror/.test(l)).length, p.__log);
  // a tap during the launch reaches Home (the overlay never blocks)
  await ctx.close();
  const b = await open(); await b.p.waitForSelector('#lockpw'); await b.p.fill('#lockpw', PWD);
  await b.p.locator('#lockform').evaluate(f => f.requestSubmit());
  await b.p.waitForFunction(() => window.__tbxReadyAt, null, { timeout: 20000 });
  const hit = await b.p.evaluate(() => { const l = document.getElementById('launch'); const t = document.querySelector('.tile[data-go="#/top/implants"]'); if (!t) return 'no tile'; const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.left + 20, r.top + r.height / 2); return (l.children.length ? 'overlay-on ' : 'overlay-off ') + (e && e.closest('.tile') === t ? 'tile' : (e && e.id || e && e.className)); });
  check('T2 a tap during the landing reaches the tile under the overlay', /tile$/.test(hit), hit);
  await b.ctx.close();
});

// T2 · a first route that isn't Home: the logo only fades (no flight); cycle count: no launch at all
job('T2-launch-routes', async () => {
  let { p, ctx } = await open({ start: '#/pn/3910500522' });
  await unlock(p, { trace: true }); await p.waitForFunction(() => window.__tbxReadyAt, null, { timeout: 20000 }); await sleep(1500);
  let r = await p.evaluate(() => ({ seen: window.__tr.some(x => x[1] > 0), land: window.__cls.some(c => /launch-land/.test(c)), left: document.getElementById('launch').children.length, h: location.hash }));
  check('T2 deep link to a card: the logo shows, then fades without a flight', r.seen && !r.land && r.left === 0 && /#\/pn\//.test(r.h), r);
  await ctx.close();
  ({ p, ctx } = await open({ start: '#/cc', ct: true }));
  await unlock(p, { trace: true }); await sleep(1500);
  r = await p.evaluate(() => ({ seen: window.__tr.some(x => x[1] > 0), cls: window.__cls.filter(c => /launch/.test(c)), errs: window.__errs }));
  check('T2 cycle count first route: no launch at all', !r.seen && !r.cls.length && !r.errs.length, r);
  await ctx.close();
});

// ================= T5 · once per launch (Remember me): a same-session reload never replays; a new launch does =================
job('T5-once', async () => {
  const { p, ctx } = await open();
  await unlock(p, { remember: true }); await sleep(1500);
  const key = await p.evaluate(() => ({ tbx_k2: localStorage.getItem('tbx_k2'), tbx_rm: '1' }));
  await p.reload({ waitUntil: 'domcontentloaded' }); await traceStart(p, 2500); await ready(p); await sleep(2600);
  const r1 = await p.evaluate(() => ({ seen: window.__tr.some(x => x[1] > 0), cls: window.__cls }));
  check('T5 a reload in the same session (update banner, repair) does not replay the launch', !r1.seen && !r1.cls.some(c => /launching/.test(c)), r1);
  await ctx.close();
  const b = await open({ ls: key });
  await traceStart(b.p, 3000); await ready(b.p); await b.p.waitForFunction(() => window.__tbxReadyAt, null, { timeout: 20000 }); await sleep(1500);
  const r2 = await b.p.evaluate(() => ({ seen: window.__tr.some(x => x[1] > 0), land: window.__cls.some(c => /launch-land/.test(c)), left: document.getElementById('launch').children.length, brand: getComputedStyle(document.getElementById('brand')).opacity, errs: window.__errs }));
  check('T5 a new launch with a saved key (Remember me) plays once and lands on the mark', r2.seen && r2.land && r2.left === 0 && r2.brand === '1' && !r2.errs.length, r2);
  await b.ctx.close();
});

// ================= T4 · heal safety: failures inside the launch / logo paths never reach the page =================
job('T4-heal', async () => {
  // 1. #brand removed before landing (spec example), 2. Element.animate throws (logo, drawer, crossfade)
  const { p, ctx } = await open({ breakAnimate: true });
  await p.waitForSelector('#lockpw'); await p.evaluate(() => { const b = document.getElementById('brand'); if (b) b.remove(); });
  await unlock(p, { trace: true }); await p.waitForFunction(() => window.__tbxReadyAt, null, { timeout: 20000 }); await sleep(1500);
  const r = await p.evaluate(() => ({ errs: window.__errs, healed: sessionStorage.getItem('tbx_healed'), healTs: localStorage.getItem('tbx_heal_ts'), left: document.getElementById('launch').children.length, cls: document.documentElement.className, content: document.getElementById('content').innerHTML.length }));
  check('T4 no #brand at landing: the overlay fades, no errors, heal untouched', !r.errs.length && !r.healed && !r.healTs && r.left === 0 && !/launching/.test(r.cls) && r.content > 500, r);
  await p.evaluate(() => { location.hash = '#/about'; }); await sleep(700);
  const hb = await p.$('.about-hold'); const bb = await hb.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await sleep(1000); await p.mouse.up(); await sleep(400);
  await p.mouse.click(bb.x + bb.width / 2, bb.y + 400); await sleep(400);
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(300);
  const r2 = await p.evaluate(() => ({ errs: window.__errs, healed: sessionStorage.getItem('tbx_healed') }));
  check('T4 Element.animate throwing: drawer, logo tap and page keep working without a page error', !r2.errs.length && !r2.healed, r2);
  check('T4 no page errors in the log', !p.__log.filter(l => /pageerror/.test(l)).length, p.__log);
  await ctx.close();
  // 3. a failing boot (tbx-boot-failed) clears the overlay within 150 ms
  const c = await open();
  await c.p.waitForSelector('#lockpw');
  await c.p.evaluate(() => { window.TBX_BOOT = function () { throw new Error('injected boot failure'); }; }); // through the harness setter
  await c.p.fill('#lockpw', PWD); await traceStart(c.p, 4000);
  await c.p.locator('#lockform').evaluate(f => f.requestSubmit());
  await c.p.waitForFunction(() => window.__tbxBootErr, null, { timeout: 20000 });
  const failAt = await c.p.evaluate(() => performance.now());
  await sleep(1200);
  const r3 = await c.p.evaluate((failAt) => ({ seen: window.__tr.some(x => x[1] > 0), after: window.__tr.filter(x => x[0] > failAt + 150 && x[1] > 0).length, card: !!document.getElementById('booterr') && !document.getElementById('booterr').hidden, cls: document.documentElement.className }), failAt);
  check('T4 boot failure: the overlay is gone within 150 ms and the "didn’t open" card shows', r3.after === 0 && r3.card && !/launching/.test(r3.cls), r3);
  await c.ctx.close();
});

// ================= T8 · N2: a tile becomes its page (and Back reverses) =================
job('T8-n2', async () => {
  const { p, ctx } = await open(); await unlock(p); await sleep(1400);
  const lands = {};
  for (const go of ['#/top/implants', '#/top/arthroscopy', '#/cat/Allografts%20%26%20Biologics', '#/cat/Disposables', '#/cat/Instruments', '#/cat/Capital', '#/cat/Suture', '#/bo']) {
    await recordAnims(p, 1100);
    await p.tap('.tile[data-go="' + go + '"]'); await sleep(1200);
    const a = await anims(p);
    const s = await p.evaluate(() => ({ hico: !!document.querySelector('#title .hico'), k: (document.querySelector('#title .hico') || {}).className || '', t: document.getElementById('title').textContent }));
    lands[go] = { vt: a.vt.filter(x => /tbx-cat/.test(x)).length, hico: s.hico, k: s.k.replace('hico ', ''), left: await leftoverNames(p) };
    await p.tap('#bb-back'); await sleep(900);
  }
  check('T8 every Home category tile morphs into its page (icon + title groups) and the header carries the icon', Object.values(lands).every(l => l.vt >= 4 && l.hico && l.left === 0), lands);
  // reverse: Back from Implants with the tile on screen
  await p.tap('.tile[data-go="#/top/implants"]'); await sleep(900);
  await recordAnims(p, 1100); await p.tap('#bb-back'); await sleep(1200);
  const a = await anims(p);
  check('T8 Back to Home reverses (icon + title fly back into the tile), 0 leftover names', a.vt.some(x => /group\(tbx-cat-ico\)/.test(x)) && a.vt.some(x => /group\(tbx-cat-title\)/.test(x)) && (await leftoverNames(p)) === 0, a.vt);
  // Inventory tile: no morph (cycle count is never animated)
  await recordAnims(p, 1100); await p.tap('.tile-inv'); await sleep(1200);
  const a2 = await anims(p);
  check('T8 Inventory Management (cycle count) opens without a View Transition', !a2.vt.length && /#\/teams/.test(await p.evaluate(() => location.hash)), a2.vt);
  const hdr = await p.evaluate(() => ({ hico: !!document.querySelector('#title .hico'), brand: getComputedStyle(document.getElementById('brand')).display }));
  check('T8 cycle count: no header icon, no Home mark', !hdr.hico && hdr.brand === 'none', hdr);
  check('T8 no page errors', !(await p.evaluate(() => window.__errs)).length && !p.__log.filter(l => /pageerror|console/.test(l)).length, p.__log);
  await ctx.close();
  // iOS < 18: no View Transitions API
  const b = await open({ noVT: true }); await unlock(b.p); await sleep(1400);
  await b.p.tap('.tile[data-go="#/cat/Suture"]'); await sleep(900);
  const s = await b.p.evaluate(() => ({ vt: !!document.startViewTransition, h: location.hash, hico: !!document.querySelector('#title .hico'), fade: document.getElementById('content').classList.contains('vt'), errs: window.__errs }));
  check('T8 without View Transitions (iOS < 18): navigates, header icon, today\'s .vt fade, no errors', !s.vt && /Suture/.test(s.h) && s.hico && s.fade && !s.errs.length, s);
  await b.p.tap('#bb-back'); await sleep(700);
  const s2 = await b.p.evaluate(() => ({ home: document.getElementById('content').classList.contains('homeview'), errs: window.__errs }));
  check('T8 without View Transitions: Back to Home works', s2.home && !s2.errs.length, s2);
  await b.ctx.close();
});

// ================= T9 · N11a: the card morph starts at the tapped row (list scrolled 1,400 px) =================
async function morphOrigin(p) {
  await p.evaluate(() => { location.hash = '#/fam/Suture/' + encodeURIComponent('XBraid TT suture tape'); }); await sleep(900);
  await p.evaluate(() => window.scrollTo(0, 1400)); await sleep(400);
  const row = await p.evaluate(() => { const r = [...document.querySelectorAll('.rowitem[data-go^="#/pn/"]')].find(x => { const b = x.getBoundingClientRect(); return b.top > 250 && b.bottom < 700; }); r.id = 'probe-row'; return { y: Math.round(r.querySelector('.ti').getBoundingClientRect().top), sy: Math.round(scrollY) }; });
  await p.evaluate(() => { window.__k = null; window.__heroK = null; const t0 = performance.now(); const f = () => { document.getAnimations().forEach(a => { const pe = String(a.effect && a.effect.pseudoElement); if (/group\(tbx-title\)/.test(pe) && !window.__k) window.__k = a.effect.getKeyframes()[0].transform; if (/group\(tbx-hero\)/.test(pe) && !window.__heroK) window.__heroK = a.effect.getKeyframes()[0].transform; }); if (performance.now() - t0 < 1500) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.tap('#probe-row'); await sleep(900);
  const k = await p.evaluate(() => ({ k: window.__k, hero: window.__heroK, sy: Math.round(scrollY), h: location.hash }));
  const y = k.k ? Math.round(parseFloat(String(k.k).split(',')[5])) : null;
  return { tappedTitleY: row.y, morphStartsAtY: y, hero: k.hero, scrollAfter: k.sy, h: k.h };
}
job('T9-n11a', async () => {
  const { p, ctx } = await open(); await unlock(p); await sleep(1400);
  const r = await morphOrigin(p);
  check('T9 the title morph starts where the tapped title was (±2 px) on a list scrolled 1,400 px', r.morphStartsAtY != null && Math.abs(r.morphStartsAtY - r.tappedTitleY) <= 2 && r.scrollAfter === 0, r);
  check('T9 N11b: the card photo morphs from the row (tbx-hero group)', !!r.hero, r.hero);
  check('T9 no leftover transition names, no errors', (await leftoverNames(p)) === 0 && !(await p.evaluate(() => window.__errs)).length);
  await ctx.close();
  if (BASE_SITE) {
    const b = await open({ port: PORT + 1 }); await unlock(b.p); await sleep(1400);
    info('T9 before (live build): morph origin on the same list', await morphOrigin(b.p));
    await b.ctx.close();
  }
});

// ================= T10 · N11c: Back returns to the same place, the title flies back to its row, the row is marked =================
job('T10-n11c', async () => {
  const { p, ctx } = await open(); await unlock(p); await sleep(1400);
  await p.evaluate(() => { location.hash = '#/fam/Suture/' + encodeURIComponent('XBraid TT suture tape'); }); await sleep(900);
  await p.evaluate(() => window.scrollTo(0, 1400)); await sleep(400);
  const before = await p.evaluate(() => { const r = [...document.querySelectorAll('.rowitem[data-go^="#/pn/"]')].find(x => { const b = x.getBoundingClientRect(); return b.top > 250 && b.bottom < 700; }); r.id = 'probe-row'; return { sy: Math.round(scrollY), go: r.getAttribute('data-go') }; });
  await p.tap('#probe-row'); await sleep(1000);
  await p.evaluate((go) => {
    window.__named = null; window.__ring = false; window.__mode = null; const t0 = performance.now();
    const f = () => {
      const r = document.querySelector('.rowitem[data-go="' + go + '"]'), ti = r && r.querySelector('.ti');
      if (ti && ti.style.viewTransitionName && !window.__named) window.__named = ti.style.viewTransitionName;
      if (document.documentElement.getAttribute('data-vt')) window.__mode = document.documentElement.getAttribute('data-vt');
      if (r && r.classList.contains('nav-ring')) window.__ring = true;
      if (performance.now() - t0 < 2000) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, before.go);
  await recordAnims(p, 1200);
  await p.tap('#bb-back'); await sleep(1600);
  const a = await anims(p);
  const r = await p.evaluate(() => ({ sy: Math.round(scrollY), named: window.__named, ring: window.__ring, mode: window.__mode, left: [...document.querySelectorAll('*')].filter(e => e.style && e.style.viewTransitionName).length, ghost: document.querySelectorAll('.vt-ghost').length }));
  check('T10 Back restores the list exactly where it was (P35)', Math.abs(r.sy - before.sy) <= 2, { before: before.sy, after: r.sy });
  check('T10 the title flies back to its row (tbx-title on the row, "back" transition with title + photo groups)', r.named === 'tbx-title' && r.mode === 'back' && a.vt.some(x => /group\(tbx-title\)/.test(x)) && a.vt.some(x => /group\(tbx-hero\)/.test(x)), { named: r.named, mode: r.mode, vt: a.vt });
  check('T10 the row you came from is marked, then everything is cleaned up', r.ring && r.left === 0 && r.ghost === 0, r);
  check('T10 no page errors', !(await p.evaluate(() => window.__errs)).length);
  await ctx.close();
});

// ================= N12 · button feedback =================
job('N12-feedback', async () => {
  const { p, ctx } = await open({ start: '#/pn/3910500522' }); await unlock(p); await sleep(1400);
  const w0 = await p.evaluate(() => document.querySelector('.cd-copy').getBoundingClientRect().width);
  await p.tap('.cd-copy'); await sleep(250);
  const c1 = await p.evaluate(() => { const b = document.querySelector('.cd-copy'); return { done: b.classList.contains('done'), w: b.getBoundingClientRect().width, toast: document.getElementById('toast').classList.contains('on'), label: b.getAttribute('aria-label'),
    check: getComputedStyle(b, '::after').opacity, svg: getComputedStyle(b.querySelector('svg')).opacity }; });
  await sleep(1200);
  const c2 = await p.evaluate(() => ({ done: document.querySelector('.cd-copy').classList.contains('done'), label: document.querySelector('.cd-copy').getAttribute('aria-label') }));
  check('N12 Copy turns into ✓ in place: same width, no toast, back after 1.2 s', c1.done && c1.w === w0 && !c1.toast && c1.label === 'Copied' && !c2.done && c2.label === 'Copy part number', { c1, c2, w0 });
  await recordAnims(p, 700);
  await p.tap('.cd-fav'); await sleep(700);
  let a = await anims(p);
  const pop = a.an.filter(x => /tbx-pop|tbx-burst/.test(x.name));
  check('N12 Favorite: the star pops with a burst (transform/opacity only)', pop.some(x => x.name === 'tbx-pop') && pop.some(x => x.name === 'tbx-burst') && pop.every(x => x.props.every(k => /^(transform|opacity)$/.test(k))), pop);
  await recordAnims(p, 500); await p.tap('.cd-fav'); await sleep(500);
  a = await anims(p);
  check('N12 un-Favorite: the star shrinks, no burst', a.an.some(x => /tbx-unpop/.test(x.name)) && !a.an.some(x => /tbx-burst/.test(x.name)), a.an.map(x => x.name));
  const css = await p.evaluate(() => { const s = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch (e) { return []; } }).map(r => r.cssText).join('\n'); return { press: /\.tile:active[^{]*\{[^}]*transform: scale\(var\(--m-press-lg\)\)/.test(s), spring: /transition: transform var\(--m-release\) var\(--e-spring\)/.test(s) }; });
  check('N12 one press rule set: sink fast (--m-tap), spring back (--e-spring)', css.press && css.spring, css);
  const ts = await p.evaluate(() => typeof window.ontouchstart !== 'undefined' || 'ok');
  check('N12 :active does not depend on pull-to-refresh (a document touchstart listener is registered at start)', /touchstart', function \(\) \{\}, \{ passive: true \}/.test(fs.readFileSync(path.join(SITE, (/<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')) || [])[1]), 'utf8')), ts);
  await ctx.close();
});

// ================= N3 · the logo: four variations, taps during one ignored =================
job('N3-logo', async () => {
  const { p, ctx } = await open(); await unlock(p); await sleep(1500);
  const played = [];
  for (let i = 0; i < 4; i++) {
    await recordAnims(p, 850);
    const v = await p.evaluate(() => { const lg = document.querySelector('#brand .lg'); const o = window.TBX_LOGO.order.slice(); document.getElementById('brand').click(); return { busy: lg.__busy, order: o }; });
    await sleep(850);
    const a = await anims(p);
    played.push({ busy: v.busy, layers: [...new Set(a.an.filter(x => /\.L\.l-|lg-in/.test(x.who)).map(x => x.who.replace(/^.*\.l-/, 'l-').replace(/^.*lg-in/, 'lg-in')))], props: [...new Set(a.an.flatMap(x => x.props))] });
  }
  const sig = played.map(x => x.layers.sort().join('+'));
  check('N3 four taps on the Home mark play four different variations on the logo layers', played.every(x => x.busy && x.layers.length) && new Set(sig).size === 4, sig);
  check('N3 logo motion is transform/opacity only', played.every(x => x.props.every(k => /^(transform|opacity)$/.test(k))), played.map(x => x.props));
  const busy = await p.evaluate(async () => { const lg = document.querySelector('#brand .lg'); const a = window.TBX_LOGO.play(lg); const b = window.TBX_LOGO.play(lg); return [a, b]; });
  check('N3 a tap during a variation is ignored (no queue)', busy[0] && busy[1] === '', busy);
  check('N3 no page errors', !(await p.evaluate(() => window.__errs)).length);
  await ctx.close();
});

// ================= N4 · the toolbox drawer (hold the About logo) =================
async function holdLogo(p, ms, move) {
  const hb = await p.$('.about-hold'); const bb = await hb.boundingBox();
  const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
  await p.mouse.move(x, y); await p.mouse.down();
  if (move) { await sleep(200); await p.mouse.move(x + move, y); }
  await sleep(ms); await p.mouse.up();
  return bb;
}
job('N4-drawer', async () => {
  const { p, ctx } = await open({ start: '#/about' }); await unlock(p); await sleep(1400);
  const txt = await p.evaluate(() => document.getElementById('ab-drw').textContent);
  check('N4 the drawer holds only real credit lines + the version/data line (no placeholders)', /Built by\s*Nate Merrell/.test(txt) && /Made for\s*the CT Sports Medicine Team/.test(txt) && /v[\d.]+ · data updated \d{4}-\d\d-\d\d/.test(txt) && !/\[|Your text/.test(txt), txt);
  await recordAnims(p, 1700);
  const bb = await holdLogo(p, 950); await sleep(500);
  const o = await p.evaluate(() => { const d = document.getElementById('ab-drw'); return { hidden: d.hidden, op: getComputedStyle(d).opacity, open: d.classList.contains('open') }; });
  const a = await anims(p);
  check('N4 hold ~1 s: the drawer slides out (visible, opacity 1)', !o.hidden && o.open && o.op === '1', o);
  check('N4 hold + drawer motion is transform/opacity only', a.an.filter(x => /drw|holdbar|hb-fill|l-/.test(x.who)).every(x => x.props.every(k => /^(transform|opacity)$/.test(k))), a.an.filter(x => /drw|holdbar|hb-fill|l-/.test(x.who)).map(x => x.who + ':' + x.props));
  await p.mouse.click(bb.x + bb.width / 2, bb.y + 420); await sleep(450);
  check('N4 a tap outside closes it', await p.evaluate(() => document.getElementById('ab-drw').hidden));
  await holdLogo(p, 150); await sleep(80);
  const q = await p.evaluate(() => ({ busy: !!document.querySelector('.about-hold .lg').__busy, hidden: document.getElementById('ab-drw').hidden })); await sleep(800);
  check('N4 a quick tap (< 260 ms) plays the logo (N3), no drawer', q.busy && q.hidden && await p.evaluate(() => document.getElementById('ab-drw').hidden), q);
  await holdLogo(p, 1000, 20); await sleep(400);
  check('N4 moving the finger 20 px cancels the hold', await p.evaluate(() => document.getElementById('ab-drw').hidden));
  // handle closes it; navigation removes it
  await holdLogo(p, 950); await sleep(500);
  await p.tap('.drw-front'); await sleep(450);
  check('N4 the drawer handle closes it', await p.evaluate(() => document.getElementById('ab-drw').hidden));
  check('N4 the logo is a button (no <img>: no iOS save-image sheet), long-press menu suppressed', await p.evaluate(() => { const b = document.querySelector('.about-hold'); const cs = getComputedStyle(b); return b.tagName === 'BUTTON' && !b.querySelector('img') && (cs.userSelect || cs.webkitUserSelect) === 'none'; }));
  check('N4 no page errors', !(await p.evaluate(() => window.__errs)).length);
  await ctx.close();
});

// ================= T3 · Reduce Motion: nothing moves; screenshots normal vs reduced =================
job('T3-reduced', async () => {
  const shots = SHOTS ? path.join(SHOTS, 'T3') : ''; if (shots) fs.mkdirSync(shots, { recursive: true });
  const pairs = {};
  for (const red of [false, true]) {
    const { p, ctx } = await open({ reduced: red });
    await p.waitForSelector('#lockpw'); await sleep(300); if (shots) await p.screenshot({ path: path.join(shots, (red ? 'reduced' : 'normal') + '-1-lock.png') });
    await unlock(p, { trace: true }); await sleep(1500);
    const L = await p.evaluate(() => ({ seen: window.__tr.filter(x => x[1] > 0).length, cls: window.__cls.filter(c => /launch/.test(c)) }));
    if (shots) await p.screenshot({ path: path.join(shots, (red ? 'reduced' : 'normal') + '-2-home.png') });
    const moves = [];
    const step = async (label, fn, ms) => { await recordAnims(p, ms || 1000); await fn(); await sleep(ms || 1000); const a = await anims(p);
      const tr = a.an.filter(x => x.props.some(k => k === 'transform') && !/holdbar|hb-fill/.test(x.who) && !/skel|::after/.test(x.who + x.name));
      moves.push({ label, vt: a.vt.length, transforms: tr.map(x => x.who + ' ' + x.name).slice(0, 4) }); };
    await step('tile tap', () => p.tap('.tile[data-go="#/top/implants"]'));
    if (shots) await p.screenshot({ path: path.join(shots, (red ? 'reduced' : 'normal') + '-3-implants.png') });
    const hico = await p.evaluate(() => !!document.querySelector('#title .hico'));
    await step('Back to Home', () => p.tap('#bb-back'));
    await p.evaluate(() => { location.hash = '#/fam/Suture/' + encodeURIComponent('XBraid TT suture tape'); }); await sleep(900);
    await step('row → card', () => p.tap('.rowitem[data-go^="#/pn/"]'));
    if (shots) await p.screenshot({ path: path.join(shots, (red ? 'reduced' : 'normal') + '-4-card.png') });
    await step('Back to the list', () => p.tap('#bb-back'));
    await p.evaluate(() => { location.hash = '#/'; }); await sleep(900);
    await step('logo tap', () => p.tap('#brand'), 700);
    await p.evaluate(() => { location.hash = '#/about'; }); await sleep(900);
    await step('About hold', async () => { await holdLogo(p, 950); }, 1500);
    if (shots) await p.screenshot({ path: path.join(shots, (red ? 'reduced' : 'normal') + '-5-about.png') });
    const drw = await p.evaluate(() => !document.getElementById('ab-drw').hidden);
    pairs[red ? 'reduced' : 'normal'] = { launchFrames: L.seen, launchClasses: L.cls.length, moves, hico, drw };
    if (red) {
      check('T3 Reduce Motion: no launch frames at all', L.seen === 0 && !L.cls.length, L);
      check('T3 Reduce Motion: no transform animation and no View Transition on tile tap, Back, card, Back, logo tap, hold', moves.every(m => m.vt === 0 && !m.transforms.length), moves);
      check('T3 Reduce Motion: the landing page still gets its header icon; the hold still opens the drawer', hico && drw, { hico, drw });
    } else {
      check('T3 (normal motion, for comparison) the same steps do move', moves.filter(m => m.vt > 0 || m.transforms.length).length >= 4, moves.map(m => m.label + ':' + m.vt + '/' + m.transforms.length));
    }
    await ctx.close();
  }
});

// ================= T7 · cycle count / F&A: the same animations as the live build (none added) =================
async function ctAnims(port) {
  const { p, ctx } = await open({ port, ct: true }); await unlock(p); await sleep(1500);
  const out = {};
  for (const h of ['#/teams', '#/cc', '#/fa2']) {
    await p.evaluate(h => { location.hash = h; }, h); await sleep(1600);
    out[h] = await p.evaluate(() => ({ anims: document.getAnimations().map(a => a.animationName || a.transitionProperty || 'waapi').sort(), chrome: document.body.classList.contains('ct-chrome-off'),
      brand: document.getElementById('brand') ? getComputedStyle(document.getElementById('brand')).display : 'none', hico: !!document.querySelector('#title .hico'), vt: document.documentElement.getAttribute('data-vt') }));
  }
  const errs = await p.evaluate(() => window.__errs);
  await ctx.close();
  return { out, errs };
}
job('T7-ct', async () => {
  const c = await ctAnims(PORT);
  const idle = Object.keys(c.out).every(h => !c.out[h].anims.filter(n => !/^(skel|ccspin|bo-spin|ptrspin|fa2pulse)$/.test(n)).length && c.out[h].chrome && c.out[h].brand === 'none' && !c.out[h].hico && !c.out[h].vt);
  check('T7 #/teams, #/cc, #/fa2: no new animation, no Home mark, no header icon, no View Transition', idle && !c.errs.length, c);
  if (BASE_SITE) {
    const b = await ctAnims(PORT + 1);
    const same = Object.keys(c.out).every(h => JSON.stringify(c.out[h].anims) === JSON.stringify(b.out[h].anims));
    check('T7 the animation lists equal the live build\'s', same, { live: Object.fromEntries(Object.keys(b.out).map(h => [h, b.out[h].anims])), r7: Object.fromEntries(Object.keys(c.out).map(h => [h, c.out[h].anims])) });
  }
  // while cycle count loads: only the skeleton shimmer (now on the compositor), and nothing once loaded
  HUB.ccHold = 1500;
  const { p, ctx } = await open({ ct: true }); await unlock(p); await sleep(1200);
  await p.evaluate(() => { location.hash = '#/cc'; }); await sleep(250);
  const during = await p.evaluate(() => document.getAnimations().filter(a => a.animationName && a.animationName !== 'vtin').map(a => ({ n: a.animationName, pe: String((a.effect && a.effect.pseudoElement) || '') }))); // vtin = today's route fade
  await sleep(2500);
  const after = await p.evaluate(() => document.getAnimations().map(a => a.animationName || 'waapi'));
  HUB.ccHold = 0;
  info('T7 #/cc animations while loading (the shimmer, if a skeleton shows)', during);
  check('T7 while loading only the skeleton shimmer runs (on ::after, compositor); nothing once loaded', during.every(x => x.n === 'skel' && x.pe === '::after') && !after.filter(n => !/^(ccspin|bo-spin|ptrspin)$/.test(n)).length, { during, after });
  await ctx.close();
});

// ================= T11 · N14: a lone photo never moves the text; the report's placeholder → data ≤ 1 px =================
async function photoShift(port) {
  SLOW.img = 800;
  const { p, ctx } = await open({ port }); await unlock(p); await sleep(1200);
  const sku = await p.evaluate(() => { const it = window.TOOLBOX.items.find(i => !i.hidden && i.imgs && i.imgs.length === 1 && i.src && !/serfas|shaver/.test(i.imgs[0]) && i.specs && i.specs.length > 3); return it && it.sku; });
  await p.evaluate(s => { location.hash = '#/pn/' + encodeURIComponent(s); }, sku); await sleep(250);
  await p.evaluate(() => { const g = document.getElementById('cd-photos'); if (g) g.scrollIntoView({ block: 'center' }); }); await sleep(100); // lazy photos: bring it near the screen
  const y0 = await p.evaluate(() => { const s = document.querySelector('#cd-src, .src'), c = document.getElementById('pcard') || document.querySelector('.card'); return s && c ? Math.round(s.getBoundingClientRect().top - c.getBoundingClientRect().top) : null; });
  await p.waitForFunction(() => [...document.querySelectorAll('#content img.photo')].every(i => i.complete), null, { timeout: 10000 }).catch(() => {});
  await sleep(300);
  const y1 = await p.evaluate(() => { const s = document.querySelector('#cd-src, .src'), c = document.getElementById('pcard') || document.querySelector('.card'); return s && c ? Math.round(s.getBoundingClientRect().top - c.getBoundingClientRect().top) : null; });
  SLOW.img = 0;
  await ctx.close();
  return { sku, before: y0, after: y1, shift: y0 == null || y1 == null ? null : y1 - y0 };
}
job('T11-n14', async () => {
  const r = await photoShift(PORT);
  check('T11 a lone card photo loading 800 ms late moves the text below it by 0 px', r.shift === 0, r);
  if (BASE_SITE) info('T11 before (live build): the same card', await photoShift(PORT + 1));
  // the Backorder Report's first load: placeholder rows sit where the real rows land
  HUB.boDelay = 1500;
  const { p, ctx } = await open(); await unlock(p); await sleep(300);
  await p.evaluate(() => { localStorage.removeItem('tbx_bo'); location.hash = '#/bo'; }); await sleep(500);
  const s0 = await p.evaluate(() => { const r = document.querySelector('#bo-body .list .rowitem'), b = document.getElementById('bo-body'); return { sk: !!document.querySelector('#bo-body .skrow'), head: !document.getElementById('bo-skh').hidden, y: r ? Math.round(r.getBoundingClientRect().top - b.getBoundingClientRect().top) : null, abs: r ? Math.round(r.getBoundingClientRect().top + scrollY) : null, sub: document.getElementById('bo-sub').getBoundingClientRect().height }; });
  let saw = false; for (let i = 0; i < 40; i++) { if (await p.evaluate(() => !!document.querySelector('#bo-body.sk-stack'))) { saw = true; break; } await sleep(60); }
  await sleep(900);
  const s1 = await p.evaluate(() => { const r = document.querySelector('#bo-body .list .rowitem'), b = document.getElementById('bo-body'); return { sk: document.querySelectorAll('#bo-body .skrow').length, head: document.getElementById('bo-skh').hidden, filter: !document.getElementById('bo-q').hidden, y: r ? Math.round(r.getBoundingClientRect().top - b.getBoundingClientRect().top) : null, abs: r ? Math.round(r.getBoundingClientRect().top + scrollY) : null, sub: document.getElementById('bo-sub').getBoundingClientRect().height, rows: document.querySelectorAll('#bo-body .bo-row').length }; });
  HUB.boDelay = 0;
  check('T11 the Backorder Report shows placeholders shaped like it while it loads (filter, chips, rows)', s0.sk && s0.head, s0);
  check('T11 the first real row lands where the placeholder row was (≤ 1 px within the report), after one crossfade', s0.y != null && s1.y != null && Math.abs(s1.y - s0.y) <= 1 && saw && s1.sk === 0 && s1.head && s1.filter && s1.rows > 10, { s0, s1, crossfade: saw });
  info('T11 on the page: the first row moved ' + (s1.abs - s0.abs) + ' px (the status line above the report went from ' + s0.sub + ' to ' + s1.sub + ' px tall: its text is only known once the report arrives)', { s0, s1 });
  check('T11 no page errors', !(await p.evaluate(() => window.__errs)).length);
  await ctx.close();
});

// ================= T1 · boot never grows (informational on a loaded machine) =================
job('T1-boot', async () => {
  // one typed unlock (Remember me) and one Remember-me cold load per round; with --base the two builds take turns
  // (A B, B A, …) so a load change on the machine lands on both
  const acc = port => ({ port, typed: [], auto: [], boot: [], cost: [], key: null });
  const round = async (a) => {
    const { p, ctx } = await open({ port: a.port }); await unlock(p, { remember: true });
    const r = await p.evaluate(() => ({ t: Math.round(window.__tR - window.__tS), boot: window.__bootMs, cost: window.__tbxLaunchCost }));
    a.typed.push(r.t); a.boot.push(r.boot); a.cost.push(r.cost);
    if (!a.key) a.key = await p.evaluate(() => ({ tbx_k2: localStorage.getItem('tbx_k2'), tbx_rm: '1' }));
    await ctx.close();
    const b = await open({ port: a.port, ls: a.key }); await ready(b.p);
    a.auto.push(await b.p.evaluate(() => Math.round(window.__tR)));
    await b.ctx.close();
  };
  const sum = a => ({ submitToRouted: med(a.typed), loadToRouted_rememberMe: med(a.auto), TBX_BOOT: a.boot.length ? Math.round(med(a.boot) * 10) / 10 : null, beginCost: med(a.cost) });
  const A = acc(PORT), B = BASE_SITE ? acc(PORT + 1) : null;
  for (let i = 0; i < RUNS; i++) for (const a of (B ? (i % 2 ? [B, A] : [A, B]) : [A])) await round(a);
  const c = sum(A);
  info('T1 R7 build (median of ' + RUNS + ')', c);
  if (B) { const b = sum(B); info('T1 live build (median of ' + RUNS + ', interleaved)', b); info('T1 difference R7 − live (ms)', { submitToRouted: c.submitToRouted - b.submitToRouted, loadToRouted_rememberMe: c.loadToRouted_rememberMe - b.loadToRouted_rememberMe, TBX_BOOT: Math.round((c.TBX_BOOT - b.TBX_BOOT) * 10) / 10 }); }
  info('T1 note', 'timings depend on the machine; re-run on an idle runner (spec T1: median of 9 ≤ live + 20 ms; begin() ≤ 3 ms)');
});

// ================= screenshots for Nate (phone size) =================
job('shots', async () => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const o = { dsf: 3 };
  let { p, ctx } = await open(o);
  await p.waitForSelector('#lockpw'); await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, '1-lock.png') });
  await p.fill('#lockpw', PWD);
  await p.evaluate(() => { new MutationObserver((m, ob) => { if (document.getElementById('lock').classList.contains('open')) { window.__openAt = performance.now(); ob.disconnect(); } }).observe(document.getElementById('lock'), { attributes: true }); });
  await p.locator('#lockform').evaluate(f => f.requestSubmit());
  await p.waitForFunction(() => window.__openAt && performance.now() - window.__openAt > 230, null, { timeout: 20000, polling: 10 });
  await p.screenshot({ path: path.join(SHOTS, '2-launch-mid-frame.png') });
  await ready(p); await sleep(1600);
  await p.screenshot({ path: path.join(SHOTS, '3-home-after-launch.png') });
  await p.tap('.tile[data-go="#/top/implants"]'); await sleep(1100);
  await p.screenshot({ path: path.join(SHOTS, '4-landing-implants.png') });
  await p.evaluate(() => { location.hash = '#/pn/3910500522'; }); await sleep(1500);
  await p.screenshot({ path: path.join(SHOTS, '5-card.png') });
  await p.evaluate(() => { location.hash = '#/about'; }); await sleep(1000);
  await holdLogo(p, 950); await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, '6-about-drawer-open.png') });
  await ctx.close();
  ({ p, ctx } = await open(Object.assign({ reduced: true }, o)));
  await unlock(p); await sleep(1500);
  await p.screenshot({ path: path.join(SHOTS, '7-home-reduced-motion.png') });
  await ctx.close();
  console.log('shots → ' + SHOTS);
});

(async () => {
  const servers = [serve(SITE, PORT)];
  if (BASE_SITE) servers.push(serve(BASE_SITE, PORT + 1));
  browser = await pw[ENGINE].launch();
  for (const j of JOBS) {
    if (SHOTS_ONLY && j.name !== 'shots') continue;
    if (ONLY && !ONLY.test(j.name)) continue;
    try { await j.fn(); } catch (e) { check('JOB ' + j.name + ' ran', false, String(e && e.stack || e).slice(0, 300)); }
  }
  await browser.close(); servers.forEach(s => s.close());
  const n = results.filter(r => r.ok).length;
  console.log('\n' + n + '/' + results.length + ' passed (ENGINE=' + ENGINE + ', SITE=' + SITE + (BASE_SITE ? ', BASE=' + BASE_SITE : '') + ')');
  process.exit(n === results.length ? 0 : 1);
})();
