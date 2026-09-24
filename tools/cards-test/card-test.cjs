// Product card, release 6 (N6 P28–P33 N7 N13): the real bundle + the decrypted data.js in jsdom, network stubbed.
// jsdom is resolved from tools/bo or tools/cc-test node_modules.
//   node tools/cards-test/card-test.cjs              (repo root; TBX_R=<site dir> to test another copy)
//   node tools/cards-test/card-test.cjs --no-walk    skip the all-cards walk (about 30 s)
const path = require('path'), fs = require('fs');
const R = path.resolve(process.env.TBX_R || path.join(__dirname, '../..'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [R + '/tools/bo/node_modules', R + '/tools/cc-test/node_modules'] }));
const WALK = !process.argv.includes('--no-walk');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  — ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 240) : '')); };
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
  const w = dom.window, errs = [], scrolls = [];
  w.addEventListener('error', e => errs.push(e.message));
  w.localStorage.setItem('tbx_tour_done', '1'); w.localStorage.setItem('tbx_wn_seen', '99');
  w.localStorage.setItem('tbx_bo', JSON.stringify({ at: Date.now(), data: BOAPI }));
  if (o.admin) w.localStorage.setItem('tbx_uadm', 'k');
  w.fetch = () => Promise.reject(new Error('offline-stub'));
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} };
  w.scrollTo = (a, b) => scrolls.push(typeof a === 'object' ? a : { top: b }); w.scrollBy = () => {};
  w.eval(fs.readFileSync(R + '/data.js', 'utf8'));
  w.TOOLBOX.bo = { url: 'https://script.google.com/macros/s/fake/exec', key: 'k' }; w.TOOLBOX.usage = null;
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(R + '/' + APP, 'utf8'));
  w.TBX_BOOT(); await sleep(30);
  const t = { w, errs, scrolls, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)],
    txt: s => (w.document.querySelector(s) || {}).textContent || '',
    go: async h => { w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange')); await sleep(10); } };
  return t;
}
const kids = t => [...t.$('#pcard').children].map(e => e.id || e.className.split(' ')[0]);
function lum(hex) { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  const t = await boot();
  const D = t.w.TOOLBOX, css = [...t.w.document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  // ---- P30 status lines ----
  await t.go('#/pn/3911514610');
  check('P30 backorder: one line, pill inside .bobanner, none in the title', t.$$('.bobanner .st-row').length === 1 && t.$('.bobanner .bopill.bo') && !t.$('.card h1 .bopill'));
  check('P30 summary reads "clears Oct 15"', /clears Oct 15/.test(t.txt('.st-l .st-t')), t.txt('.st-l'));
  check('P30 details keep the date, report stamp, note and the report link (filtered to the part, P46)', /Est\. full clear Oct 15/.test(t.txt('.bobanner')) && /per 9\/21 report/.test(t.txt('.bobanner')) && /Substitute 3910500512/.test(t.txt('.bobanner')) && t.$('.bobanner [data-go="#/bo?bq=3911514610"]'));
  check('P30 starts collapsed', t.$('.st-l').getAttribute('aria-expanded') === 'false' && !t.$('.bobanner .coll').classList.contains('open'));
  t.$('.st-l').click(); await sleep(5);
  check('P30/N13 tap expands (aria-expanded + .open)', t.$('.st-l').getAttribute('aria-expanded') === 'true' && t.$('.bobanner .coll').classList.contains('open'));
  t.$('.st-l').click(); await sleep(5);
  check('P30/N13 second tap collapses again', t.$('.st-l').getAttribute('aria-expanded') === 'false' && !t.$('.bobanner .coll').classList.contains('open'));
  const k1 = [...t.$('.card').children].map(e => e.className);
  check('P30 .bobanner is a direct child before .pnblock (tools/bo/app-test.js contract)', k1.indexOf('bobanner') > -1 && k1.indexOf('bobanner') < k1.indexOf('pnblock') && k1.indexOf('bobanner') > k1.indexOf('fam'), k1);
  await t.go('#/pn/CAT02438');
  check('P30 controlled + cleared = two lines, two pills', t.$$('.bobanner .st-row').length === 2 && t.$$('.bobanner .bopill').length === 2 && /24–36 hr/.test(t.txt('.bobanner')) && /Cleared backorder · week of Sep 7/.test(t.txt('.bobanner')) && /Limited to 60 days/.test(t.txt('.bobanner')));
  await t.go('#/pn/3910500575');
  check('P30 text clear date: "clears Q4" in the line, "Est. full clear Q4" in the details', /clears Q4/.test(t.txt('.st-l')) && /Est\. full clear Q4/.test(t.txt('.bobanner')));
  await t.go('#/pn/3910947022');
  check('P30 no status → no banner, no pill', !t.$('.bobanner') && !t.$('.card .bopill'));
  // ---- N6 block order, key facts, band, jump chips ----
  await t.go('#/pn/3910500522');
  const order = kids(t);
  check('N6 block order: title → key facts → part-number band → Instrumentation → jump chips → specs → photos → sources',
    JSON.stringify(order.slice(0, 6)) === JSON.stringify(['pc-head', 'kf', 'pnblock', 'cd-rel', 'cd-jump', 'cd-specs']) && order.indexOf('cd-photos') > order.indexOf('cd-specs') && order[order.length - 1] === 'cd-src', order);
  const kf = t.$$('.kf-i').map(e => e.querySelector('.kf-k').textContent + '=' + e.querySelector('.kf-v').textContent);
  check('N6 Iconix 2 key facts = drill Ø, drill depth, length (verbatim rows)', JSON.stringify(kf) === JSON.stringify(['Drill diameter=2.3mm', 'Drill depth=21.5mm', 'Length=12mm (8mm deployed)']), kf);
  const lk = t.$$('.ledger .lk').map(e => e.textContent);
  check('N6 lifted rows are not repeated in the table', !lk.includes('Drill diameter') && !lk.includes('Drill depth') && !lk.includes('Length') && lk.includes('Anchor size'), lk);
  const rec = D.items.find(i => i.sku === '3910500522');
  check('N6 no row lost: table + tiles = spec rows', lk.length + kf.length === rec.specs.filter(s => s[0] && s[1]).length);
  await t.go('#/pn/3911514610');
  check('N6 status line sits between the title and the key facts', (o => o.indexOf('pc-head') < o.indexOf('bobanner') && o.indexOf('bobanner') < o.indexOf('kf') && o.indexOf('kf') < o.indexOf('pnblock'))(kids(t)), kids(t));
  await t.go('#/pn/3910500580');
  check('N6 short table with < 2 qualifying rows → no tiles', !t.$('.kf') || t.$$('.kf-i').length >= 2);
  await t.go('#/pn/0234010160');
  check('N6 screws (4-row table) → no tiles', !t.$('.kf'));
  await t.go('#/pn/3910500522');
  const band = t.$('#pcard > .pnblock');
  check('N6 band = part # + unit + Copy / Favorite / Share icons', band && band.querySelector('.num').textContent === '3910500522' && t.txt('.pn-u') === 'Box of 5' &&
    JSON.stringify([...band.querySelectorAll('.cd-ico')].map(b => b.getAttribute('aria-label'))) === '["Copy part number","Favorite","Share"]' &&
    band.querySelector('[data-copy="3910500522"]') && band.querySelector('[data-fav]') && band.querySelector('[data-share]') && band.querySelectorAll('.cd-ico svg').length === 3);
  check('N6 Favorite / Share are icons: no text buttons, no "Unit:" line, no .favbtn', !t.$('#pcard .favbtn') && !t.$('#pcard .uomline') && !/Favorite|Share/.test(band.textContent));
  check('N6 band sticks under the header (position: sticky, top = header height)', /\.pcard > \.pnblock\{position:sticky; top:var\(--hdr-h, calc\(var\(--sat\) \+ var\(--hdr-pad\) \+ var\(--hdr-row\) \+ 11px\)\)/.test(css));
  const chips = t.$$('.cd-jump [data-jump]').map(e => e.textContent + '>' + e.getAttribute('data-jump'));
  check('N6 jump chips = Specs · Diagrams · Sources, only sections present', JSON.stringify(chips) === JSON.stringify(['Specs>cd-specs', 'Diagrams>cd-photos', 'Sources>cd-src']) && chips.every(c => t.$('#' + c.split('>')[1])), chips);
  t.scrolls.length = 0; t.$('.cd-jump [data-jump="cd-src"]').click(); await sleep(5);
  check('N6 a jump chip scrolls to its section (smooth unless Reduce Motion)', t.scrolls.length === 1 && typeof t.scrolls[0].top === 'number' && t.scrolls[0].behavior === 'smooth', t.scrolls);
  await t.go('#/pn/3910400107'); // TwinLoop Flex guide: specs + sources, no photo
  check('N6 no jump chips when fewer than 3 sections', t.$('#pcard') && t.$('#cd-specs') && t.$('#cd-src') && !t.$('.cd-jump'), kids(t));
  await t.go('#/pn/3910400000'); // TwinLoop guide: specs, photo and sources, but a short card
  check('N6 no jump chips on a short card (all 3 sections, one flick long)', t.$('#cd-specs') && t.$('#cd-photos') && t.$('#cd-src') && !t.$('.cd-jump'), kids(t));
  await t.go('#/pn/3911514610');
  check('N6 the size chip that repeats the title is dropped; sub/grp labels stay (below the specs)', !t.$$('.cd-lab .chip').some(e => e.textContent === '1.4mm') && (kids(t).indexOf('cd-lab') === -1 || kids(t).indexOf('cd-lab') > kids(t).indexOf('cd-specs')));
  const kv = [...t.$('#pcard').children];
  check('variants keep .chip.link[data-go] and sit below the specs (tools/usage/app-test.js contract)', t.$('.cd-vars .chip.link[data-go]') && kv.indexOf(t.$('.cd-vars')) > kv.indexOf(t.$('#cd-specs')));
  const fav = t.$('.cd-ico[data-fav]');
  fav.click(); await sleep(5);
  check('favorite icon: toggles aria-pressed and .on, keeps its icon', fav.getAttribute('aria-pressed') === 'true' && fav.querySelector('svg') && fav.classList.contains('on') && JSON.parse(t.w.localStorage.getItem('tbx_favs') || '[]').some(f => f.route === '#/pn/3911514610'));
  fav.click(); await sleep(5);
  check('favorite icon: second tap removes it', fav.getAttribute('aria-pressed') === 'false' && !fav.classList.contains('on') && !JSON.parse(t.w.localStorage.getItem('tbx_favs') || '[]').some(f => f.route === '#/pn/3911514610'));
  // ---- P28 / P29 related links ----
  await t.go('#/pn/3910500522');
  const o2 = kids(t);
  check('P28 Instrumentation sits right under the part-number band, before the specs and photos', o2.indexOf('cd-rel') === o2.indexOf('pnblock') + 1 && o2.indexOf('cd-rel') < o2.indexOf('cd-specs') && o2.indexOf('cd-rel') < o2.indexOf('cd-photos'), o2);
  check('P28 first pill is Instrumentation', /^Instrumentation$/.test(t.txt('.cd-rel .rel')) && t.$('.cd-rel .rel').getAttribute('data-go') === '#/instr/3910500522');
  check('P28 item-to-item links stay after the photos (Hard bone drill)', o2.indexOf('cd-parts') > o2.indexOf('cd-photos') && /Hard bone drill/.test(t.txt('#cd-parts')));
  check('P29 one style: no .linkbtn / .refbtn / .reflinkrow on the card', !t.$('.card .linkbtn') && !t.$('.card .refbtn') && !t.$('.card .reflinkrow'));
  const navs = t.$$('#pcard [data-go], #pcard [data-lmenu], #pcard [data-pnm]').filter(b => !b.closest('.cd-vars') && !b.closest('.bobanner'));
  check('P29 every related link on the card is a .rel pill (variants and the report link excepted)', navs.length > 0 && navs.every(b => b.classList.contains('rel')), navs.map(b => b.className));
  check('P29 pill: ≥44 pt, amber border ≥3:1, chevron', /\.rel\{display:inline-flex; align-items:center; gap:6px; min-height:44px;/.test(css) && /\.rel::after\{content:"\\203A"/.test(css));
  await t.go('#/pn/0450000000');
  const refs = t.$$('.cd-rel .rel').map(e => e.textContent);
  check('P28/P29 guide cards stay one tap away at the top (User guide menu, Error codes, Icon dictionary)', ['User guide', 'Error codes', 'Icon dictionary'].every(x => refs.includes(x)) && t.$('.cd-rel [data-lmenu]'), refs);
  await t.go('#/pn/CAT00229');
  check('P29 the retired-number link still opens the change popup', t.$('.cd-rel [data-pnm="CAT00227"]'));
  await t.go('#/pn/3910947201'); // AlphaVent punch: 7 "Used with" pills
  const more = t.$('#pcard .rel-more');
  check('N13 more than 5 related → 4 + "N more", collapsed', more && more.getAttribute('aria-expanded') === 'false' && t.$$('#cd-used > .rel-row > .rel').length === 5 && !t.$('#' + more.getAttribute('aria-controls')).classList.contains('open'));
  if (more) { more.click(); await sleep(5); }
  check('N13 "N more" expands and relabels', more && more.getAttribute('aria-expanded') === 'true' && t.$('#' + more.getAttribute('aria-controls')).classList.contains('open') && more.textContent === 'Fewer');
  check('N13 smooth expand: grid rows 0fr → 1fr, off with Reduce Motion', /\.coll\{display:grid; grid-template-rows:0fr; visibility:hidden; transition:grid-template-rows \.22s ease/.test(css) && /\.coll\.open\{grid-template-rows:1fr; visibility:visible;/.test(css) && /@media \(prefers-reduced-motion: reduce\)\{[^@]*\.coll, \.coll\.open\{transition:none;\}/.test(css)); // R7 M0: inside the one reduced-motion block
  // ---- P31 spec table ----
  const rule = (/--rule-3:(#[0-9A-Fa-f]{6})/.exec(css) || [])[1] || '';
  check('P31 values 16 px / 600, labels 13 px', /\.pcard \.ledger \.lv\{font-size:16px; font-weight:600;/.test(css) && /\.pcard \.ledger \.lk\{font-size:13px;/.test(css));
  check('P31 row lines ≥3:1 on both panel colours, shared --line unchanged', rule && ratio(rule, '#2A2A2A') >= 3 && ratio(rule, '#242424') >= 3 && /--line:#3A3A3A;/.test(css) && /\.pcard \.ledger \.lr\{padding:11px 2px; border-bottom:1px solid var\(--rule-3\)/.test(css), rule && [ratio(rule, '#2A2A2A').toFixed(2), ratio(rule, '#242424').toFixed(2)]);
  // ---- P33 ----
  await t.go('#/pn/3910500575');
  check('P33 not-built card: neutral "Specs coming", no red box, no owner flag', t.txt('.cd-soon') === 'Specs coming' && !t.$('.nobuild') && !t.$('.cd-todo'));
  const ta = await boot({ admin: true, hash: '#/pn/3910500575' }); await ta.go('#/pn/3910500575');
  check('P33 the owner phone (tbx_uadm) also sees the build flag', ta.$('.cd-todo') && /Not built yet/.test(ta.txt('.cd-todo')));
  await t.go('#/pn/0234102102');
  check('P33 note-only card says "Specs coming" (no catalog boilerplate)', t.txt('.cd-soon') === 'Specs coming' && !/2026 catalog/.test(t.txt('.card')));
  // ---- P32 strip + viewer ----
  await t.go('#/pn/3910200080');
  check('P32 Biosteon: 4-photo strip with counter 1/4, below the spec table', t.$$('.pgal-s').length === 4 && t.txt('.pgal-n') === '1/4' && t.$('.pgal[data-n="4"]') && kids(t).indexOf('cd-photos') > kids(t).indexOf('cd-specs'));
  check('hooks: #pcard[data-sku][data-kind], h1[data-hero=title], one img[data-hero=image] (the title photo)', t.$('h1[data-hero="title"]') && t.$$('img[data-hero="image"]').length === 1 && t.$('.pc-hero img[data-hero="image"]') && t.$('#pcard').getAttribute('data-sku') === '3910200080' && t.$('#pcard').getAttribute('data-kind') === 'item');
  const ph = t.w.TBX_DEV.card.photoImgHTML('img/x.jpg', 'A "b"', 'class="photo"');
  check('photoImgHTML: one helper builds every product photo (one <img>, escaped)', ph === '<img src="img/x.jpg" alt="A &quot;b&quot;" class="photo">' && t.$$('#pcard img').length === 5 && t.$$('#pcard img').every(i => i.hasAttribute('alt')));
  t.$$('.pgal-s')[2].click(); await sleep(5);
  const V = t.w.TBX_DEV.card.viewer;
  check('P32 tap photo 3 → viewer on 3 / 4 with the card\'s whole set', !t.$('#lb').hidden && V.state().idx === 2 && V.state().n === 4 && t.txt('#lb-n') === '3 / 4' && t.$$('#lb-track .lb-s img').length === 4);
  check('P32 viewer: card name at the top, Close at the bottom, dialog', /Biosteon IntraLine/.test(t.txt('#lb-title')) && t.$('#lb-bot #lb-close') && t.$('#lb').getAttribute('role') === 'dialog' && t.$('#lb').getAttribute('aria-modal') === 'true');
  check('N7 no captions or source links yet (zoom hint instead)', !t.$('#lb-cap') && !t.$('#lb .lb-src') && /Pinch or double-tap/.test(t.txt('#lb-hint')));
  t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'ArrowRight' })); await sleep(5);
  check('P32 → key pages forward', V.state().idx === 3 && t.txt('#lb-n') === '4 / 4');
  t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'ArrowRight' })); await sleep(5);
  check('P32 no paging past the last photo', V.state().idx === 3);
  const lbEl = t.$('#lb'), pe = (type, x) => { const e = new t.w.MouseEvent(type, { bubbles: true, clientX: x, clientY: 300 }); Object.defineProperty(e, 'pointerId', { value: 1 }); lbEl.dispatchEvent(e); };
  pe('pointerdown', 120); pe('pointermove', 190); pe('pointermove', 280); pe('pointerup', 280); await sleep(5);
  check('P32 swipe right pages back (the track follows the finger)', V.state().idx === 2 && t.txt('#lb-n') === '3 / 4', V.state());
  check('P32 viewer locks page scroll', t.w.document.body.style.overflow === 'hidden');
  t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(5);
  check('P32 Esc closes and releases the lock', t.$('#lb').hidden && t.w.document.body.style.overflow === '');
  t.$('.pc-hero').click(); await sleep(5);
  check('P32 the title photo opens the viewer on photo 1 of 4', !t.$('#lb').hidden && V.state().idx === 0 && V.state().n === 4 && t.txt('#lb-n') === '1 / 4');
  t.$('#lb-close').click(); await sleep(5);
  check('P32 Close closes', t.$('#lb').hidden && t.w.document.body.style.overflow === '');
  await t.go('#/about'); { const im = t.w.document.createElement('img'); im.src = 'favicon.svg'; t.$('#content').appendChild(im); im.click(); } await sleep(5); // R7 N4: the About logo is the credits-drawer button now; any other <img> in #content still opens alone
  check('P32 a non-card image still opens alone (no counter)', !t.$('#lb').hidden && V.state().n === 1 && t.txt('#lb-n') === '');
  await t.go('#/pn/3910200080'); t.$$('.pgal-s')[1].click(); await sleep(5); await t.go('#/');
  check('P7 navigation closes the viewer and releases the scroll lock', t.$('#lb').hidden && t.w.document.body.style.overflow === '');
  await t.go('#/pn/3910500522'); t.$('[data-share]').click(); await sleep(5);
  check('share sheet opens from the band icon', t.$('#share-sheet') && !t.$('#share-sheet').hidden && t.$('#share-sheet .shopt[data-sh="copy"]'));
  await t.go('#/cat/Iconix');
  check('P7 navigation closes the share sheet', t.$('#share-sheet').hidden);
  // ---- probes / shavers ----
  await t.go('#/pn/' + encodeURIComponent(D.probes[0].sku));
  check('probe card renders the new layout (data-kind=probe)', t.$('#pcard[data-kind="probe"] .pnblock') && !t.errs.length);
  await t.go('#/pn/' + encodeURIComponent(D.shavers[0].sku));
  check('shaver card renders the new layout (data-kind=shaver)', t.$('#pcard[data-kind="shaver"] .pnblock') && !t.errs.length);
  // ---- safety net: a new-card bug falls back to the 4.143 card, never a blank screen ----
  t.w.TBX_DEV.card.setV2(() => { throw new Error('boom'); });
  await t.go('#/pn/3910500522'); await t.go('#/pn/3910200080');
  check('fallback: a throwing new card renders the 4.143 card (no page error)', t.$('#content .card') && !t.$('#content .pcard') && t.$('#content .card .pnblock') && t.$('#content .card img.photo') && /3910200080/.test(t.txt('#content .card')) && !t.errs.length);
  t.w.TBX_DEV.card.setV2(null);
  await t.go('#/pn/3910500522');
  check('fallback: the new card is back once the renderer works', t.$('#content .pcard'));
  // ---- every card ----
  if (WALK) {
    const all = D.items.map(i => ['item', i]).concat(D.probes.map(p => ['probe', p]), D.shavers.map(s => ['shaver', s]));
    let bad = [], lost = [], n = 0;
    for (const [k, r] of all) {
      await t.go('#/pn/' + encodeURIComponent(r.sku)); n++;
      const moved = k === 'item' && r.hidden && r.moved;
      if (moved) continue;
      if (!t.$('#pcard') || !t.$('#pcard > .pnblock')) { bad.push(r.sku); continue; }
      const rows = (r.specs || []).filter(s => s[0] && s[1]).length, shown = t.$$('#pcard .ledger .lr').length + t.$$('#pcard .kf-i').length;
      if (rows !== shown) lost.push(r.sku + ' ' + rows + '≠' + shown);
    }
    check('walk: all ' + D.items.length + ' items + ' + D.probes.length + ' probes + ' + D.shavers.length + ' shavers render the new card, no fallback (retired numbers open their new card)', n === all.length && !bad.length, bad.slice(0, 8));
    check('walk: every card shows every spec row once (table rows + key facts = spec rows)', !lost.length, lost.slice(0, 8));
  }
  check('no page errors', t.errs.length === 0 && ta.errs.length === 0, t.errs.concat(ta.errs));
  const f = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - f) + '/' + results.length + ' passed');
  process.exit(f ? 1 : 0);
})();
