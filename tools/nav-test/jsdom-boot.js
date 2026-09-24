// Shared jsdom boot for the CC / F&A identity check (ccfa-identity.js) and the nav unit checks (unit.js).
// Real bundle + index.html of <site>, a two-item fixture catalog, a fake cycle-count sheet, the fake F&A hub from
// tools/fa2-test/fakehub.js and stored (fake) credentials — no network, no passwords, no decrypted data needed.
// opts: hash (start route), items (extra catalog items), storage (extra localStorage), bo (fake report answer).
// jsdom comes from tools/cc-test/node_modules or tools/bo/node_modules (npm i jsdom@24 in either, once).
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '../..');
const { JSDOM } = require(require.resolve('jsdom', { paths: [REPO + '/tools/cc-test/node_modules', REPO + '/tools/bo/node_modules', __dirname] }));
process.env.FA_TOKEN_SPORTS = process.env.FA_TOKEN_SPORTS || 'sports-tok'; process.env.FA_TOKEN_FA = process.env.FA_TOKEN_FA || 'fa-tok';
const { FakeHub } = require(REPO + '/tools/fa2-test/fakehub.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// fake territory login (hub url + token + device) — the same shape the CT gate stores after a real unlock
const CREDS = { tbx_cc: JSON.stringify({ url: 'https://script.google.com/macros/s/fake/exec', token: 'tok' }), tbx_cc_dev: "Nate's iPhone",
  tbx_cc_roster: JSON.stringify(["Nate's iPhone", "Mia's iPhone"]), tbx_tour_done: '1' };

// fake cycle-count sheet (the bound Apps Script): pull / roster / batch, keyed like the real one
function FakeSheet() {
  const s = { rows: [], seen: {}, calls: [] };
  const key = r => (r.loc || '').trim().toLowerCase() + '|' + String(r.ref).replace(/[^0-9a-z]/gi, '').toUpperCase() + '|' + (r.lot || '').trim().toUpperCase();
  s.handle = async (url, body) => {
    s.calls.push({ url, body });
    if (/action=pull/.test(url)) return { ok: true, rows: s.rows.map(r => ({ ...r })) };
    if (/action=roster/.test(url)) return { devices: ["Nate's iPhone", "Mia's iPhone"] };
    if (body && body.action === 'batch') {
      const applied = [], fresh = [];
      body.ops.forEach(op => {
        applied.push(op.opId); if (s.seen[op.opId]) return; s.seen[op.opId] = 1; fresh.push(op.opId);
        const k = key(op); const row = s.rows.find(r => key(r) === k);
        if (op.t === 'add') { if (row) row.qty += op.qty; else s.rows.push({ id: 'r' + s.rows.length, ts: op.ts, dev: body.dev, ref: op.ref, desc: op.desc, lot: op.lot, exp: op.exp, qty: op.qty, loc: op.loc, notes: op.notes }); }
        else if (op.t === 'set') { if (row) row.qty = op.qty; else s.rows.push({ id: 'r' + s.rows.length, ts: op.ts, dev: body.dev, ref: op.ref, lot: op.lot, qty: op.qty, loc: op.loc }); }
        else if (op.t === 'del') { s.rows = s.rows.filter(r => key(r) !== k); }
      });
      return body.norows ? { ok: true, applied, fresh } : { ok: true, applied, fresh, rows: s.rows.map(r => ({ ...r })) };
    }
    return { ok: true };
  };
  return s;
}

async function bootSite(site, opts) {
  opts = opts || {};
  const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(site + '/index.html', 'utf8'))[1];
  const html = fs.readFileSync(site + '/index.html', 'utf8').replace(/<script src="lib\/zxing-reader.js"><\/script>/, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/' + (opts.hash || '#/'), pretendToBeVisual: true });
  const w = dom.window, errs = [], traffic = [], scrolls = [];
  w.addEventListener('error', e => errs.push(e.message));
  const sheet = FakeSheet(), faHub = new FakeHub();
  faHub.seed([{ type: 'Received', ref: '3910500471', desc: 'Omega', lot: 'LOTA', exp: '2028-01-31', qty: 5, receivedBy: 'Katie F', dropName: 'seed' },
              { type: 'Received', ref: '3910500393', desc: 'Iconix', lot: 'LOTB', exp: '2026-10-15', qty: 2, receivedBy: 'Katie F', dropName: 'seed' }]);
  const store = Object.assign({}, CREDS, { tbx_tour_done: '1', tbx_wn_seen: '99',
    tbx_fa2: JSON.stringify({ url: 'https://script.google.com/macros/s/fakefa/exec', token: 'sports-tok', scope: 'sports' }) });
  Object.keys(store).forEach(k => w.localStorage.setItem(k, store[k]));
  w.fetch = (url, o) => {
    let body = null; try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) {}
    url = String(url); traffic.push((body && body.action) || (url.match(/action=(\w+)/) || [])[1] || url.slice(0, 40));
    const wrap = j => ({ ok: true, status: 200, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)), blob: () => Promise.resolve(new w.Blob(['x'])) });
    if (/fakefa/.test(url)) return Promise.resolve(wrap(faHub.handle(body)));
    if (/fakehub/.test(url)) return Promise.resolve(wrap({ ok: true, terrs: [] }));
    if (/fake-bo/.test(url)) return opts.bo ? opts.bo(body).then(wrap) : Promise.reject(new Error('no bo'));
    return sheet.handle(url, body).then(wrap);
  };
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} };
  w.scrollTo = (x, y) => scrolls.push([x, y]); w.scrollBy = () => {};
  // jsdom has no history.scrollRestoration; give it one (browser default 'auto') so the mode the app sets on each
  // route is visible to the identity check. Without this, a build that set 'manual' on CC/F&A would still pass.
  if (!('scrollRestoration' in w.history)) Object.defineProperty(w.history, 'scrollRestoration', { value: 'auto', writable: true, configurable: true, enumerable: true });
  const T = FIXTURE(); if (opts.bo) T.bo = { url: 'https://script.google.com/macros/s/fake-bo/exec', key: 'k' };
  if (opts.items) T.items = T.items.concat(opts.items);
  if (opts.storage) Object.keys(opts.storage).forEach(k => w.localStorage.setItem(k, opts.storage[k]));
  w.TOOLBOX = T; w.TBX_GTIN = {}; w.TBX_WN = { v: 0, items: [] };
  if (!w.TextEncoder) { w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; }
  w.eval(fs.readFileSync(site + '/lib/inflate.js', 'utf8'));
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(site + '/' + APP, 'utf8')); w.TBX_BOOT();
  await sleep(80);
  return { w, errs, traffic, scrolls, sheet, faHub };
}
function FIXTURE() { // a usage-free, backorder-free two-item catalog
  return { items: [
    { sku: '3910500471', t: 'OMEGA 3.9MM KNOTLESS', name: 'Omega 3.9', fam: 'Omega knotless anchor', cat: 'Implants' },
    { sku: '3910500393', t: 'ICONIX 1.4', name: 'Iconix 1.4', fam: 'Iconix all-suture anchor', cat: 'Implants' }],
    probes: [], shavers: [], catOrder: ['Implants'], sheets: { cc: '', fa2: '' }, built: '2026-09-23',
    hub: { url: 'https://script.google.com/macros/s/fakehub/exec', key: 'hk' } };
}
function norm(html) { // timestamps, "2m ago", uuids and event ids differ between two runs: normalise them away
  return String(html || '')
    .replace(/data-since="\d+"/g, 'data-since="T"')
    .replace(/\b(just now|\d+m ago|\d+h ago|\d+d ago|\d+ min ago)\b/g, 'AGO')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
    .replace(/\bev-\d{4}-[0-9a-f]{6}\b/g, 'EVID')
    .replace(/\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z\b/g, 'ISO')
    .replace(/\d{1,2}:\d\d(:\d\d)?\s?(AM|PM)?/g, 'HH:MM');
}
module.exports = { bootSite, norm, sleep, REPO };
