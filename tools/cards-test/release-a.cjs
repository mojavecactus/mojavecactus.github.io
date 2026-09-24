// Product-card checks (release 4.143: P7 overlays close on navigation, P13 spec grid, P43/P44 sharing) — the real bundle
// + the decrypted data.js in jsdom, network stubbed. jsdom is resolved from tools/bo or tools/cc-test node_modules.
//   node tools/cards-test/release-a.cjs              (repo root; TBX_R=<site dir> to test another copy)
const path = require('path'), fs = require('fs');
const R = path.resolve(process.env.TBX_R || path.join(__dirname, '../..'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [R + '/tools/bo/node_modules', R + '/tools/cc-test/node_modules'] }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  — ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : '')); };
const BOAPI = { ok: true, ver: 1, asOf: '2026-09-21', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: '',
  controlled: [{ sku: 'CAT02438', desc: 'FLOWPORT II', msg: 'Limited to 60 days in inventory.', since: '2026-09-07' }],
  backorders: [{ sku: '3911514610', desc: 'ICONIX 1', since: '2026-08-24', clearDate: '2099-10-15', clearText: '', note: 'Substitute 3910500512 where possible.', asOf: '2026-09-21' },
    { sku: '3910500575', desc: 'MULTI-SYSTEM TRAY', since: '2026-09-07', clearDate: '', clearText: 'Q4', note: '', asOf: '2026-09-09' }],
  cleared: [{ sku: 'CAT02438', desc: 'FLOWPORT II', clearedOn: '2026-09-07', since: '2026-08-10' }] };
async function boot(o) {
  o = o || {};
  const idx = fs.readFileSync(R + '/index.html', 'utf8'), APP = /<script src="(app[^"]*\.js)"/.exec(idx)[1];
  const html = idx.replace(/<script src="lib\/[^"]+"><\/script>/g, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/' + (o.hash || '#/'), pretendToBeVisual: true });
  const w = dom.window, errs = [];
  w.addEventListener('error', e => errs.push(e.message));
  w.localStorage.setItem('tbx_tour_done', '1'); w.localStorage.setItem('tbx_wn_seen', '99');
  w.localStorage.setItem('tbx_bo', JSON.stringify({ at: Date.now(), data: BOAPI }));
  if (o.admin) w.localStorage.setItem('tbx_uadm', 'k');
  w.fetch = () => Promise.reject(new Error('offline-stub'));
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} }; w.scrollTo = () => {}; w.scrollBy = () => {};
  w.eval(fs.readFileSync(R + '/data.js', 'utf8'));
  w.TOOLBOX.bo = { url: 'https://script.google.com/macros/s/fake/exec', key: 'k' }; w.TOOLBOX.usage = null;
  if (o.meta) { w.TOOLBOX.imgmeta = o.meta.imgmeta; w.TOOLBOX.lit = o.meta.lit; }
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(R + '/' + APP, 'utf8'));
  w.TBX_BOOT(); await sleep(30);
  const t = { w, errs, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)],
    txt: s => (w.document.querySelector(s) || {}).textContent || '',
    go: async h => { w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange')); await sleep(10); } };
  return t;
}
(async () => {
  // Release A (quiet fixes on the v1 card): P7 P13 P43 P44
  const t = await boot(); const D = t.w.TOOLBOX;
  await t.go('#/pn/3910200080');
  check('A: still the v1 card', t.$('#content .card') && !t.$('.pcard') && t.$('.card img.photo'));
  t.$('.card img.photo').click(); await sleep(5);
  check('A: lightbox opens and locks scroll', !t.$('#lb').hidden && t.w.document.body.style.overflow === 'hidden');
  await t.go('#/');
  check('A/P7: navigation closes the lightbox and releases the scroll lock', t.$('#lb').hidden && t.w.document.body.style.overflow === '');
  await t.go('#/pn/3910500522'); t.$('[data-share]').click(); await sleep(5);
  check('A: share sheet opens', !t.$('#share-sheet').hidden);
  await t.go('#/cat/Iconix');
  check('A/P7: navigation closes the share sheet', t.$('#share-sheet').hidden);
  const it = D.items.find(i => i.sku === '3910500522'), txt = t.w.TBX_DEV.cardText(it);
  check('A/P44: copied details = full name first, link last', txt.split('\n')[0] === it.name && /\/#\/pn\/3910500522$/.test(txt));
  check('A/P44: shared link text', t.w.TBX_DEV.card.shareLinkText(it) === it.name + '\nREF 3910500522');
  check('A/P13: minmax columns in the stylesheet', /grid-template-columns:minmax\(0,42fr\) minmax\(0,58fr\)/.test(t.w.document.querySelector('style').textContent));
  check('A: no page errors', t.errs.length === 0, t.errs);
  const f = results.filter(r => !r.ok).length; console.log('\n' + (results.length - f) + '/' + results.length + ' passed'); process.exit(f ? 1 : 0);
})();
