#!/usr/bin/env node
// Search UI checks — the real bundle in jsdom, network stubbed (the backorder hub is faked):
// P16 "1 item", P24 the clear button, P6 clearing re-runs the screen underneath, P22 "close spellings", P23 "Ask Nate",
// P21 filters in one row of pills, P20 recent searches, and the search/filter state in the URL (Back restores it, deep links).
//   node ui.js [--root <site dir>] [--data <data.js>] [--repo <dir with tools/cc-test/node_modules>]
// Needs the decrypted data.js in the repo root (tools/decrypt-data.mjs).
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '../..'))), REPO = path.resolve(arg('repo', path.resolve(__dirname, '../..')));
const HTML = fs.readFileSync(ROOT + '/index.html', 'utf8'), APP = ROOT + '/' + /<script src="(app[^"]*\.js)"/.exec(HTML)[1], DATA = path.resolve(arg('data', ROOT + '/data.js'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [REPO + '/tools/cc-test/node_modules', REPO + '/tools/bo/node_modules', __dirname] }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const check = (n, ok, d) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };
const BOAPI = { ok: true, ver: 1, asOf: '2026-09-21', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: '',
  controlled: [], backorders: [{ sku: '3910500580', desc: 'DC GUIDE 1.4', since: '2026-09-21', clearDate: '2026-10-01', clearText: '', note: '' }], cleared: [] };
async function boot(o) {
  o = o || {};
  const html = HTML.replace(/<script src="lib\/[^"]+"><\/script>/g, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/' + (o.hash || '#/'), pretendToBeVisual: true });
  const w = dom.window, errs = [];
  w.addEventListener('error', e => errs.push(e.message));
  ['tbx_tour_done', 'tbx_a2hs_x'].forEach(k => w.localStorage.setItem(k, '1')); w.localStorage.setItem('tbx_wn_seen', '99');
  w.fetch = (url, op) => { let b = null; try { b = JSON.parse(op && op.body); } catch (e) {} if (b && b.action === 'bo') return Promise.resolve({ ok: true, json: () => Promise.resolve(BOAPI) }); return Promise.reject(new Error('offline-stub')); };
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} }; w.scrollTo = () => {};
  w.eval(fs.readFileSync(DATA, 'utf8')); w.TOOLBOX.usage = null;
  if (o.noFb) w.TOOLBOX.fb = null;
  else w.TOOLBOX.fb = { url: 'https://script.google.com/macros/s/fake-fb/exec', token: 't', email: '' }; // the form opens; nothing is sent
  if (!o.noBo) w.TOOLBOX.bo = { url: 'https://script.google.com/macros/s/fake-bo/exec', key: 'k' };
  w.document.documentElement.classList.add('authed'); w.eval(fs.readFileSync(APP, 'utf8')); w.TBX_BOOT(); await sleep(40);
  const d = w.document, q = d.getElementById('q'), C = () => d.getElementById('content');
  const type = (s) => { q.value = s; q.dispatchEvent(new w.Event('input')); };
  const go = async (h) => { w.location.hash = h; await sleep(60); };
  return { w, d, q, C, type, go, errs };
}
(async () => {
  const t = await boot();
  // ---- P16: "1 item", never "1 items" ----
  await t.go('#/cat/Instruments');
  const txt = t.C().textContent;
  check('P16 no "1 items" on a category list', !/\b1 items\b/.test(txt) && /\b1 item\b/.test(txt), txt.match(/\d+ items?/g));
  await t.go('#/'); check('P16 home tiles still say "N items"', /\d+ items/.test(t.C().textContent));
  // ---- P24: the clear button ----
  const X = t.d.getElementById('qclear');
  check('P24 ✕ hidden while the box is empty', X && X.hidden === true);
  t.type('omega'); check('P24 ✕ shows once there is text', X.hidden === false);
  X.click(); await sleep(20);
  check('P24 ✕ clears the box, hides itself and repaints Home', t.q.value === '' && X.hidden && t.C().classList.contains('homeview') && !/[?&]q=/.test(t.w.location.hash), t.C().className);
  t.q.focus(); t.type('iconix'); X.click(); await sleep(20);
  check('P24 ✕ keeps the keyboard up when the box had focus', t.d.activeElement === t.q && t.q.value === '');
  t.q.blur();
  // ---- P6: clearing re-runs the screen underneath (it restored a saved HTML shell before) ----
  await t.go('#/bo'); for (let i = 0; i < 40 && !t.C().querySelector('.bo-row:not(.skrow)'); i++) await sleep(50); // R7: .skrow = loading placeholder
  const boRows = () => t.C().querySelectorAll('.bo-row:not(.skrow)').length;
  const before = boRows(); t.type('dc'); t.d.getElementById('qclear').click(); await sleep(60);
  check('P6 clearing a search on the Backorder Report repaints the report', before > 0 && boRows() === before && /Backorder/.test(t.d.getElementById('title').textContent), { before, after: boRows() });
  const bq = t.d.getElementById('bo-q'); bq.value = 'zzzz-none'; bq.dispatchEvent(new t.w.Event('input')); await sleep(20);
  check('P6 the report filter still works after clearing (listeners re-bound)', boRows() === 0);
  await t.go('#/sub/Iconix/' + encodeURIComponent('Iconix all-suture anchor') + '/Iconix'); await sleep(40);
  const chip = t.C().querySelector('.fchip[data-filt]');
  if (chip) {
    const ft = chip.getAttribute('data-filt'); chip.click(); await sleep(20);
    const n0 = t.C().querySelectorAll('.list .rowitem').length;
    t.type('omega'); t.type(''); await sleep(20);
    const on = [...t.C().querySelectorAll('.fchip.on')].map(b => b.getAttribute('data-filt'));
    check('P6 a family list keeps its chip filter when the search is cleared', on.indexOf(ft) > -1 && t.C().querySelectorAll('.list .rowitem').length === n0, { ft, on, n0 });
  } else check('P6 family list chips present', false, t.C().innerHTML.slice(0, 200));
  await t.go('#/');
  // ---- P22 close spellings + P23 "Ask Nate" ----
  t.type('fiberwire');
  const fz = t.C().querySelector('[data-sfuzzy]');
  check('P22 typo matches are labelled', fz && /^No exact match — close spellings/.test(fz.textContent) && fz.querySelector('[data-act="asknate"]'), fz && fz.textContent);
  t.type('iconix'); check('P22 no label on exact matches', !t.C().querySelector('[data-sfuzzy]'));
  t.type('oca');
  const ask = t.C().querySelector('.emp [data-act="asknate"]');
  check('P23 no-results screen offers "Ask Nate to add “oca”"', ask && ask.textContent.indexOf('Ask Nate to add “oca”') === 0 && t.C().querySelector('.emp [data-act="scan"]'), ask && ask.textContent);
  ask.click(); await sleep(20);
  const ov = t.d.getElementById('fb-ov'), note = t.d.getElementById('fb-note');
  check('P23 it opens feedback with the term filled in and no screenshot', ov && !ov.hidden && /“oca”/.test(note.value) && t.d.getElementById('fb-shotrow').style.display === 'none', note && note.value);
  t.d.getElementById('fb-cancel').click();
  check('P23 Cancel leaves no stale pre-filled note', ov.hidden && note.value === '');
  check('P23 the bubble still opens the plain form', (() => { t.d.getElementById('fb-fab').click(); const ok = !ov.hidden && note.value === '' && t.d.getElementById('fb-shotrow').style.display !== 'none'; t.d.getElementById('fb-cancel').click(); return ok; })());
  // ---- P21: filters in one row of pills; the count moves into the bucket chip; the state lives in the URL (g1 model) ----
  t.type(''); await t.go('#/');
  t.type('iconix'); t.C().querySelector('.schip[data-sf="Implants"]').click();
  const frow = t.C().querySelector('.sfrow');
  check('P21 one filter row of value pills (no "N matches" / "Clear filters" link)', frow && frow.querySelectorAll('.sfsel .sfv').length >= 3 && !t.C().querySelector('.sfcount, .sfclear') && !frow.querySelector('.schip'), frow && frow.outerHTML.slice(0, 200));
  const sel = t.C().querySelector('select[data-sfk="dia"]'), v = [...sel.options].map(o => o.value).find(x => /^mm:2\.3$/.test(x)) || sel.options[2].value;
  sel.value = v; sel.dispatchEvent(new t.w.Event('change', { bubbles: true })); await sleep(10);
  const bchip = t.C().querySelector('.schip.on[data-sf="Implants"]');
  check('P21 the match count lives in the bucket chip ("Implants · N of M")', bchip && /· \d+ of \d+$/.test(bchip.textContent.trim()), bchip && bchip.textContent);
  const sfx = t.C().querySelector('.sfrow .sfx');
  check('P21 "Clear · 1" (line close icon) leads the row', sfx && sfx === t.C().querySelector('.sfrow').firstElementChild && sfx.textContent.trim() === 'Clear · 1' && sfx.querySelector('svg.ico') && sfx.getAttribute('aria-label') === 'Clear 1 filter', sfx && sfx.outerHTML.slice(0, 160));
  const dsel = t.C().querySelector('select[data-sfk="dia"]');
  check('P21 the chosen value shows on its pill (and in its label for VoiceOver)', dsel.closest('.sfsel').classList.contains('on') && dsel.closest('.sfsel').querySelector('.sfv').textContent !== 'Any' && /^Diameter: /.test(dsel.getAttribute('aria-label')) && !/Any$/.test(dsel.getAttribute('aria-label')));
  check('STATE the hash carries q, c and dia (fixed order)', /^#\/\?q=iconix&c=Implants&dia=[\d.]+mm$/.test(t.w.location.hash), t.w.location.hash);
  const nRes = t.C().querySelectorAll('.list .rowitem').length;
  t.C().querySelector('.list .rowitem').click(); await sleep(80);
  check('STATE opening a result lands on the card', /^#\/pn\//.test(t.w.location.hash), t.w.location.hash);
  t.w.history.back(); await sleep(150);
  const sel2 = t.C().querySelector('select[data-sfk="dia"]');
  check('STATE Back restores the query, the bucket chip and Diameter (P5)', t.q.value === 'iconix' && sel2 && sel2.value === v && !!t.C().querySelector('.schip.on[data-sf="Implants"]') && t.C().querySelectorAll('.list .rowitem').length === nRes, { q: t.q.value, dia: sel2 && sel2.value, rows: t.C().querySelectorAll('.list .rowitem').length, nRes });
  t.C().querySelector('.sfrow .sfx').click(); await sleep(10);
  check('P21 Clear resets the filters and the hash', !t.C().querySelector('.sfrow .sfx') && !/dia=/.test(t.w.location.hash) && /c=Implants/.test(t.w.location.hash), t.w.location.hash);
  // ---- P20: recent searches ----
  t.type(''); await t.go('#/'); t.w.localStorage.removeItem('tbx_qrecent');
  t.q.focus(); await sleep(5);
  const R = t.d.getElementById('qrecent');
  check('P20 no strip without recent searches', R && R.hidden === true);
  t.q.blur(); await sleep(200);
  t.type('omega 4.75'); t.C().querySelector('.list .rowitem').click(); await sleep(80);
  check('P20 opening a result commits the term', JSON.parse(t.w.localStorage.getItem('tbx_qrecent') || '[]')[0] === 'omega 4.75', t.w.localStorage.getItem('tbx_qrecent'));
  await t.go('#/'); t.type(''); t.q.focus(); await sleep(5);
  check('P20 focusing the empty box shows the recent chips (not .schip)', R.hidden === false && R.querySelectorAll('.qrc').length === 1 && !R.querySelector('.schip') && t.d.body.classList.contains('qr-on'), R.outerHTML.slice(0, 200));
  R.querySelector('.qrc').click(); await sleep(20);
  check('P20 a recent chip runs the search and drops the keyboard', t.q.value === 'omega 4.75' && t.C().querySelectorAll('.list .rowitem').length > 0 && t.d.activeElement !== t.q && R.hidden, { q: t.q.value });
  t.type('iconix'); t.q.focus(); t.q.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('P20 the Search key commits the term (newest first)', JSON.parse(t.w.localStorage.getItem('tbx_qrecent'))[0] === 'iconix' && t.d.activeElement !== t.q);
  ['zqzqa', 'zqzqb'].forEach(s => { t.type(s); t.q.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  check('P20 a term with no results is never committed', JSON.parse(t.w.localStorage.getItem('tbx_qrecent')).length === 2, t.w.localStorage.getItem('tbx_qrecent'));
  ['anchor', 'screw', 'suture', 'cannula'].forEach(s => { t.type(s); t.q.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  check('P20 keeps the last 5, newest first', JSON.stringify(JSON.parse(t.w.localStorage.getItem('tbx_qrecent'))) === JSON.stringify(['cannula', 'suture', 'screw', 'anchor', 'iconix']), t.w.localStorage.getItem('tbx_qrecent'));
  t.type(''); t.q.focus(); await sleep(5);
  R.querySelector('[data-qrclear]').click(); await sleep(10);
  check('P20 Clear empties the list and offers Undo', !t.w.localStorage.getItem('tbx_qrecent') && R.hidden && /Recent searches cleared/.test(t.d.getElementById('toast').textContent) && t.d.querySelector('#toast button'));
  t.d.querySelector('#toast button').click(); await sleep(300);
  check('P20 Undo puts them back', (JSON.parse(t.w.localStorage.getItem('tbx_qrecent') || '[]')).length === 5);
  t.q.blur(); await sleep(200);
  check('no page errors (main)', t.errs.length === 0, t.errs);
  // without a feedback config there is nothing to ask
  const t2 = await boot({ noFb: true }); t2.type('oca');
  check('P23 hidden when the payload has no feedback config', !t2.C().querySelector('[data-act="asknate"]') && t2.C().querySelector('.emp'));
  check('no page errors (no fb)', t2.errs.length === 0, t2.errs);
  // deep links straight into a filtered search / a filtered family list (what a reload or a shared link carries)
  const t3 = await boot({ hash: '#/?q=anchor&c=Implants&strands=2' });
  const s3 = t3.C().querySelector('select[data-sfk="strands"]');
  check('STATE a deep link paints the filtered search', t3.q.value === 'anchor' && s3 && s3.value === 'n2' && /Implants · \d+ of \d+/.test(t3.C().textContent), { q: t3.q.value, v: s3 && s3.value });
  await t3.go('#/sub/Iconix/' + encodeURIComponent('Iconix all-suture anchor') + '/Iconix?t=TT');
  check('STATE ?t= opens a family list with its chip on', !!t3.C().querySelector('.fchip.on[data-filt="TT"]'), [...t3.C().querySelectorAll('.fchip.on')].map(x => x.getAttribute('data-filt')));
  t3.C().querySelector('.fchip[data-filt="TT"]').click(); await sleep(10);
  check('STATE a chip tap rewrites ?t= (entry keeps its nav id)', !/[?&]t=/.test(t3.w.location.hash) && t3.w.history.state && t3.w.history.state.nav, t3.w.location.hash);
  check('no page errors (deep link)', t3.errs.length === 0, t3.errs);
  const fails = results.filter(x => !x).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
