#!/usr/bin/env node
// Search regression test — drives the REAL bundle's search UI in jsdom (network stubbed) and records, per query:
// total hits, bucket-chip counts, the fuzzy banner, the empty state and the first 10 part numbers.
//
// Needs the decrypted data.js in the repo root (tools/decrypt-data.mjs) and jsdom from tools/cc-test or tools/bo node_modules.
//
//   node run.js --out now.json                         # record (defaults: repo root = ../.., bundle from index.html, data.js)
//   node run.js --root <dir> --app <bundle.js> --data <data.js> --out cand.json
//   node run.js --base baseline.json [--expect] [--strict]   # record + diff against a baseline (+ assert SPECIAL expectations)
//   --repo <dir>  where to find jsdom (tools/cc-test/node_modules) when --root is a scratch copy
//
// Before a search change: record the baseline on the current bundle (--out), then run the new bundle with --base and --expect.
// Recorded JSON is derived from the encrypted catalog: it is gitignored and must never be committed.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; }, flag = (k) => args.indexOf('--' + k) > -1;
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '../..')));
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP = path.resolve(arg('app', path.join(ROOT, /<script src="(app[^"]*\.js)"/.exec(HTML)[1])));
const DATA = path.resolve(arg('data', path.join(ROOT, 'data.js')));
const REPO = path.resolve(arg('repo', path.resolve(__dirname, '../..')));   // where tools/cc-test/node_modules (jsdom) lives
const { JSDOM } = require(require.resolve('jsdom', { paths: [REPO + '/tools/cc-test/node_modules', REPO + '/tools/bo/node_modules', ROOT + '/tools/cc-test/node_modules', ROOT + '/tools/bo/node_modules', __dirname] }));
const Q = require(arg('queries', './queries.js'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function boot() {
  const html = HTML.replace(/<script src="lib\/[^"]+"><\/script>/g, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/#/', pretendToBeVisual: true });
  const w = dom.window, errs = [];
  w.addEventListener('error', e => errs.push(e.message));
  ['tbx_tour_done', 'tbx_a2hs_x'].forEach(k => w.localStorage.setItem(k, '1')); w.localStorage.setItem('tbx_wn_seen', '99');
  w.fetch = () => Promise.reject(new Error('offline-stub'));            // no network at all
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} }; w.scrollTo = () => {};
  w.eval(fs.readFileSync(DATA, 'utf8'));
  w.TOOLBOX.usage = null; w.TOOLBOX.bo = null;                          // inert hubs
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(APP, 'utf8'));
  w.TBX_BOOT(); await sleep(30);
  return { w, errs };
}
// raw searchable text per sku (same composition as the bundle's index) — used by the SPECIAL expectations
function rawOf(D) {
  const m = {};
  D.items.forEach(it => { m[it.sku] = [it.name, it.sku, it.fam, it.sub, it.cat].concat((it.specs || []).map(s => s[1]), it.alt || []).join(' '); });
  D.probes.forEach(p => { m[p.sku] = [p.name, p.sku, 'probe wand serfas arthro', p.fam].join(' '); });
  D.shavers.forEach(s => { m[s.sku] = [s.name, s.sku, 'shaver blade bur'].join(' '); });
  return (sku) => m[sku] || '';
}
function read(w) {
  const d = w.document, chips = {};
  d.querySelectorAll('#content .schips .schip, #content .schips .scount').forEach(c => {   // .scount = single-bucket count (new UI)
    const t = c.textContent.replace(/\s+/g, ' ').trim(), m = /^(.*?) · (?:\d+ of )?(\d+)/.exec(t), m2 = /^(?:\d+ of )?(\d+) results?$/.exec(t);
    if (m) chips[m[1]] = +m[2]; else if (m2) chips.All = +m2[1];
  });
  const rows = [...d.querySelectorAll('#content .list .rowitem[data-go^="#/pn/"]')].map(r => ({
    sku: decodeURIComponent(r.getAttribute('data-go').slice(5)), t: (r.querySelector('.ti') || {}).textContent || '', ld: (r.querySelector('.ld') || {}).textContent || '' }));
  const empty = !!d.querySelector('#content .emp') && !rows.length;
  return { n: chips.All || (empty ? 0 : rows.length), chips, fuzzy: !!d.querySelector('#content [data-sfuzzy]'), empty,
    top: rows.slice(0, 10).map(r => r.sku), skus: rows.map(r => r.sku), rows };
}
async function run() {
  const { w, errs } = await boot();
  const q = w.document.getElementById('q'), type = (s) => { q.value = s; q.dispatchEvent(new w.Event('input')); };
  const out = { meta: { app: path.basename(APP), data: w.TOOLBOX.built, at: new Date().toISOString() }, queries: {}, facets: {} };
  for (const s of Q.SPECIAL.map(x => x.q).concat(Q.SAMPLE)) { type(''); type(s); out.queries[s] = read(w); }
  for (const [s, b] of Q.FACETS) {                                      // bucket chip -> spec-filter options with counts
    type(''); type(s); const chip = w.document.querySelector('#content .schip[data-sf="' + b + '"]'); if (chip) chip.click();
    const f = {}; w.document.querySelectorAll('#content select[data-sfk]').forEach(sel => { f[sel.getAttribute('data-sfk')] = [...sel.options].slice(1).map(o => o.textContent); });
    out.facets[s + ' / ' + b] = f;
  }
  type('');
  out.meta.errors = errs;
  return { out, raw: rawOf(w.TOOLBOX) };
}
(async () => {
  const { out, raw } = await run();
  const slim = JSON.parse(JSON.stringify(out)); Object.values(slim.queries).forEach(r => { delete r.rows; delete r.skus; });
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(slim, null, 1));
  let fails = 0, changed = 0;
  if (out.meta.errors.length) { fails++; console.log('FAIL page errors: ' + out.meta.errors.join(' | ')); }
  if (flag('expect')) {
    Q.SPECIAL.filter(x => x.expect).forEach(x => { const r = out.queries[x.q], v = x.expect(r, out.queries, raw);
      if (v === true) console.log('PASS ' + x.q + '  (' + r.n + (r.fuzzy ? ', fuzzy' : '') + ')'); else { fails++; console.log('FAIL ' + x.q + '  — ' + v); } });
  }
  if (arg('base')) {
    const B = JSON.parse(fs.readFileSync(arg('base'), 'utf8'));
    Object.keys(B.queries).forEach(s => { const a = B.queries[s], b = out.queries[s]; if (!b) return;
      const same = a.n === b.n && a.fuzzy === b.fuzzy && JSON.stringify(a.top) === JSON.stringify(b.top);
      if (!same) { changed++; const lost = a.top.filter(x => !b.top.includes(x)), gained = b.top.filter(x => !a.top.includes(x));
        console.log('DIFF ' + JSON.stringify(s).padEnd(22) + ' n ' + a.n + ' -> ' + b.n + (a.fuzzy !== b.fuzzy ? '  fuzzy ' + a.fuzzy + ' -> ' + b.fuzzy : '') +
          (lost.length ? '  top10 lost ' + lost.join(',') : '') + (gained.length ? '  gained ' + gained.join(',') : '') + (!lost.length && !gained.length && a.n === b.n ? '  (order only)' : '')); } });
    Object.keys(B.facets || {}).forEach(k => { if (JSON.stringify(B.facets[k]) !== JSON.stringify(out.facets[k])) { changed++; console.log('FACET ' + k + '\n   was ' + JSON.stringify(B.facets[k]) + '\n   now ' + JSON.stringify(out.facets[k])); } });
    if (flag('strict') && changed) fails++;
  }
  console.log('\n' + Object.keys(out.queries).length + ' queries, ' + Object.keys(out.facets).length + ' facet snapshots' + (arg('base') ? ', ' + changed + ' changed vs baseline' : '') + (fails ? ' — ' + fails + ' FAILURE(S)' : ' — OK'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
