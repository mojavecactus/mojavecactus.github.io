// Navigation-state unit checks (jsdom, fixture catalog, no passwords, no decrypted data):
// one nav id per catalog history entry, the 60-record cap, cycle count / F&A entries never tracked (P35); Favorites /
// Recents show the card's current title with the saved one as fallback (P38); 8 favorites + Show all, kept on Back (P37);
// the Backorder Report opened as #/bo?bq=… is filtered, and its filter takes words in any order (P46).
//   node tools/nav-test/unit.js [--site <dir>]   (site defaults to the repo root)
const path = require('path');
const { bootSite, sleep, REPO } = require('./jsdom-boot.js');
const args = process.argv.slice(2), si = args.indexOf('--site'), SITE = path.resolve(si > -1 ? args[si + 1] : REPO);
const results = []; const check = (n, ok, d) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };
const BO = { ok: true, ver: 1, asOf: '2026-09-21', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: '',
  backorders: [{ sku: '3910500393', desc: 'ICONIX 1.4 DC GUIDE', since: '2026-09-07', clearDate: '2026-01-02', clearText: '', note: '' },
    { sku: '3910500471', desc: 'OMEGA 3.9 KNOTLESS', since: '2026-09-07', clearDate: '2027-01-02', clearText: '', note: '' }],
  controlled: [], cleared: [] };
(async () => {
  // ---- P35: ids, the cap, CC untouched ----
  const A = await bootSite(SITE), w = A.w, go = async (h) => { w.location.hash = h; await sleep(40); };
  const id0 = w.history.state && w.history.state.nav;
  check('P35 a catalog entry gets a nav id and manual scroll restoration', !!id0 && w.history.scrollRestoration === 'manual', { st: w.history.state, sr: w.history.scrollRestoration });
  w.dispatchEvent(new w.HashChangeEvent('hashchange')); await sleep(20);
  check('P35 routing the same entry again keeps its id', w.history.state && w.history.state.nav === id0, w.history.state);
  await go('#/cc');
  // a fresh fragment entry has no state (null in browsers, undefined in jsdom): the app must not have written one
  check('P35 a cycle-count entry is never tracked (no state, scrollRestoration auto)', w.history.state == null && w.history.scrollRestoration === 'auto', { st: String(w.history.state), sr: w.history.scrollRestoration });
  await go('#/fa2'); check('P35 an F&A entry is never tracked', w.history.state == null && w.history.scrollRestoration === 'auto', { st: String(w.history.state), sr: w.history.scrollRestoration });
  for (let i = 0; i < 70; i++) await go('#/pn/' + (i % 2 ? '3910500471' : '3910500393') + '?n=' + i);
  const store = JSON.parse(w.sessionStorage.getItem('tbx_nav') || '{}');
  check('P35 the per-launch store keeps at most 60 records', Object.keys(store).length === 60, Object.keys(store).length);
  check('no page errors (ids)', A.errs.length === 0, A.errs);

  // ---- P38: current titles, saved title as fallback, retired numbers; P37: 8 + Show all, kept on Back ----
  const moved = { sku: '3910500999', t: 'OLD ICONIX', name: 'Iconix 1.4 (old number)', fam: 'Iconix all-suture anchor', cat: 'Implants', hidden: true, moved: '3910500393', note: 'Renumbered.' };
  const favs = [{ route: '#/pn/3910500471', it: { t: 'Saved Omega title', sku: '3910500471' } }, { route: '#/pn/NOPE77', it: { t: 'Gone card', sku: 'NOPE77' } },
    { route: '#/pn/3910500999', it: { t: 'Saved old number', sku: '3910500999' } }].concat(Array.from({ length: 9 }, (_, i) => ({ route: '#/pn/X' + i, it: { t: 'Extra ' + i, sku: 'X' + i } })));
  const B = await bootSite(SITE, { items: [moved], storage: { tbx_favs: JSON.stringify(favs), tbx_recents: JSON.stringify([{ sku: '3910500393', label: 'saved recent label' }]) } });
  const d = B.w.document, rows = () => [...d.querySelectorAll('#content .rowwrap .rowitem')];
  const favRows = () => [...d.querySelectorAll('#content .rowwrap [data-unfav-route]')].length;
  const txt = (r, sel) => ((r.querySelector(sel) || {}).textContent || '');
  const t0 = rows().map(r => [txt(r, '.pnS').split(' ')[0], txt(r, '.ti')]);
  check('P38 a favorite shows the card\'s current title, part number above it', t0[0][0] === '3910500471' && t0[0][1] === 'OMEGA 3.9MM KNOTLESS', t0[0]);
  check('P38 a card no longer in ToolBox keeps its saved title', t0[1][1] === 'Gone card', t0[1]);
  check('P38 a retired number shows its new card\'s title and keeps its own number', t0[2][0] === '3910500999' && t0[2][1] === 'ICONIX 1.4', t0[2]);
  check('P38 a recent shows the current title', rows().some(r => /3910500393/.test(txt(r, '.pnS')) && txt(r, '.ti') === 'ICONIX 1.4'));
  check('P37 Home lists 8 of 12 favorites with "Show all 12 favorites"', favRows() === 8 && /Show all 12 favorites/.test((d.querySelector('[data-favall="1"]') || {}).textContent || ''), favRows());
  const sa = d.querySelector('[data-favall="1"]'); if (sa) sa.dispatchEvent(new B.w.MouseEvent('click', { bubbles: true })); await sleep(20);
  check('P37 Show all expands to 12', favRows() === 12 && d.querySelector('[data-favall="0"]'));
  B.w.location.hash = '#/pn/3910500471'; await sleep(40);
  B.w.history.back(); await sleep(120);
  check('P37 still expanded after a card and Back (per history entry)', favRows() === 12 && d.getElementById('content').classList.contains('homeview'), favRows());
  B.w.location.hash = '#/pn/3910500393'; await sleep(40); B.w.location.hash = '#/'; await sleep(40); // a new Home entry (the Home button)
  check('P37 a new visit to Home starts with 8 again', favRows() === 8, favRows());
  check('no page errors (home)', B.errs.length === 0, B.errs);

  // ---- P46: #/bo?bq= filters; words in any order; the filter + section survive Back ----
  const C = await bootSite(SITE, { hash: '#/bo?bq=3910500393', bo: () => Promise.resolve(BO) });
  const $ = s => C.w.document.querySelector(s), boRows = () => C.w.document.querySelectorAll('#bo-body .bo-row:not(.skrow)').length; // R7: .skrow = loading placeholder
  for (let i = 0; i < 40 && !$('#bo-body .grouphead:not(.sk)'); i++) await sleep(50); // first load: the fetch + the refresh spinner's 600 ms
  check('P46 #/bo?bq=<part> opens the report filtered to that part', $('#bo-q') && $('#bo-q').value === '3910500393' && boRows() === 1, { q: $('#bo-q') && $('#bo-q').value, rows: boRows() });
  // (not "guide iconix": the old whole-string match already found that by accident across the joined description + title)
  const qi = $('#bo-q'); qi.value = 'guide 3910500393'; qi.dispatchEvent(new C.w.Event('input')); await sleep(20);
  check('P46 the filter takes words in any order ("guide 3910500393")', boRows() === 1 && /3910500393/.test($('#bo-body').textContent), boRows());
  qi.value = 'iconix omega'; qi.dispatchEvent(new C.w.Event('input')); await sleep(20);
  check('P46 every word must match', boRows() === 0, boRows());
  qi.value = ''; qi.dispatchEvent(new C.w.Event('input')); await sleep(350);
  ($('[data-bo-sec="bo"]') || C.w.document.body).dispatchEvent(new C.w.MouseEvent('click', { bubbles: true })); await sleep(20);
  check('P46 the section chip is in the URL (?bs=bo) and pressed', /^#\/bo\?bs=bo$/.test(C.w.location.hash) && ($('.bochip.on') || { getAttribute() {} }).getAttribute('aria-pressed') === 'true', C.w.location.hash);
  check('P47 a passed clear date reads "Clear date passed" in its own span', ($('#bo-body .bo-late') || {}).textContent === 'Clear date passed');
  C.w.location.hash = '#/pn/3910500393'; await sleep(60);
  check('P46 the card banner opens the report filtered to the part', ($('.bobanner .bo-more') || { getAttribute() {} }).getAttribute('data-go') === '#/bo?bq=3910500393');
  C.w.history.back(); await sleep(150);
  check('P46 Back returns to the report with its section', /^#\/bo/.test(C.w.location.hash) && ($('.bochip.on') || { getAttribute() {} }).getAttribute('data-bo-sec') === 'bo', C.w.location.hash);
  check('no page errors (report)', C.errs.length === 0, C.errs);
  const fails = results.filter(x => !x).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
