// CC / F&A identity check: drive the cycle-count and F&A screens through the same script on two builds and
// compare what the rep would see and what the app did, step by step. Proves a release left CC/F&A unchanged.
//   node tools/nav-test/ccfa-identity.js <siteA> <siteB> [--json <file>]
//   (siteA = the live build, e.g. `git archive origin/main | tar -x -C /tmp/live`; siteB = the candidate, e.g. the repo root)
// Exit 0 = every CC/F&A step identical; catalog-step differences are printed but do not fail it.
// Needs no passwords and no decrypted data: a fixture catalog, fake hubs and fake stored logins (jsdom-boot.js).
// Each step records: hash, header title, header Back hidden, bottom bar display, body classes, #content HTML
// (timestamps/ids normalised), the pull-to-refresh arrow, window.scrollTo calls, history.state and
// scrollRestoration, plus the hub traffic. jsdom + the fakes in jsdom-boot.js; no network.
const fs = require('fs'), path = require('path');
const { bootSite, norm, sleep } = require('./jsdom-boot.js');
async function run(site) {
  const B = await bootSite(site), w = B.w, d = w.document, $ = s => d.querySelector(s);
  const steps = [];
  const snap = (label) => {
    const ptr = $('#ptr'), cs = ptr ? ptr.style : {};
    steps.push({ label, hash: w.location.hash, title: $('#title').innerHTML, back: $('#back').hidden,
      bar: $('#bottombar').style.display, body: d.body.className.split(/\s+/).filter(c => c && !/^(gloss-on|kb-on|upd-on)$/.test(c)).sort().join(' '),
      content: norm($('#content').innerHTML), ptr: ptr ? [cs.opacity || '', cs.transform || '', ptr.classList.contains('spin')] : null,
      scrolls: B.scrolls.splice(0).map(a => a.join(',')).join(' '), state: JSON.stringify(w.history.state), sr: w.history.scrollRestoration,
      traffic: B.traffic.splice(0).filter(t => t !== 'ping').join(',') }); // 'ping' = FA hub warm-up, timing-dependent
  };
  const go = async (h, ms) => { w.location.hash = h; await sleep(ms || 150); };
  const back = async (ms) => { w.history.back(); await sleep(ms || 200); };
  const click = (s) => { const el = typeof s === 'string' ? $(s) : s; if (!el) throw new Error('no ' + s); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const val = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const touch = (type, y) => { const ev = new w.Event(type, { bubbles: true, cancelable: true }); const t = [{ clientX: 100, clientY: y, identifier: 1, target: $('#content') }];
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' || type === 'touchcancel' ? [] : t }); Object.defineProperty(ev, 'changedTouches', { value: t });
    $('#content').dispatchEvent(ev); };
  snap('boot home');
  await go('#/teams', 300); snap('teams');
  await go('#/ct', 300); snap('ct hub');
  await go('#/cc', 400); snap('cc home');
  // pull-to-refresh on the cycle-count home: the normal pull must behave exactly as before
  touch('touchstart', 200); touch('touchmove', 250); touch('touchmove', 330); touch('touchend', 330); await sleep(60); snap('cc pull (spinning)');
  await sleep(900); snap('cc pull (settled)');
  click('#cc-new'); await sleep(60); snap('cc new-count sheet');
  val('#cc-loc', 'Trunk'); click('#cc-start'); await sleep(200); snap('cc counting');
  await back(300); snap('back to cc home');
  await go('#/cc/fops', 400); snap('field ops');
  await back(300); snap('back from field ops');
  await go('#/fa2', 500); snap('fa2 home');
  touch('touchstart', 200); touch('touchmove', 330); touch('touchend', 330); await sleep(60); snap('fa2 pull (spinning)');
  await sleep(900); snap('fa2 pull (settled)');
  for (const h of ['#/fa2/onhand', '#/fa2/history', '#/fa2/add', '#/fa2/use', '#/fa2/return', '#/fa2/send', '#/fa2/trans']) { await go(h, 450); snap(h); }
  await back(300); snap('back once');
  await back(300); snap('back twice');
  await go('#/team/buf', 300); snap('team buf');
  await go('#/teams/help', 300); snap('teams help (catalog chrome)');
  await go('#/', 300); snap('home again');
  return { steps, errs: B.errs };
}
process.on('unhandledRejection', () => {});
(async () => {
  const argv = process.argv.slice(2), ji = argv.indexOf('--json'), JSON_OUT = ji > -1 ? argv.splice(ji, 2)[1] : '';
  const [A, Bs] = argv;
  if (!A || !Bs) { console.log('usage: node ccfa-identity.js <siteA> <siteB> [--json <file>]'); process.exit(2); }
  const ra = await run(path.resolve(A)), rb = await run(path.resolve(Bs));
  // Only steps on cycle-count / F&A routes (the app's routeIsCT rule) gate the result. The three catalog steps
  // (boot Home, #/teams/help, Home again) are there to show the chrome switching back; their differences are
  // listed as expected, because the catalog is meant to change (Home content, nav ids in history.state).
  const isCT = h => { h = String(h || '').split('?')[0];
    return h === '#/cc' || h === '#/cc/fops' || h === '#/fa' || h === '#/ct' || h === '#/teams' || h === '#/signup' || h.indexOf('#/team/') === 0 || h.indexOf('#/fa2') === 0; };
  let diffs = 0, catDiffs = 0, ctSteps = 0;
  ra.steps.forEach((sa, i) => {
    const sb = rb.steps[i] || {}, ct = isCT(sa.hash);
    if (ct) ctSteps++;
    Object.keys(sa).forEach(k => {
      if (JSON.stringify(sa[k]) === JSON.stringify(sb[k])) return;
      if (ct) diffs++; else catDiffs++;
      const a = String(sa[k]), b = String(sb[k]); let p = 0; while (p < a.length && a[p] === b[p]) p++;
      console.log((ct ? 'DIFF' : 'catalog (expected)') + ' step ' + i + ' [' + sa.label + '] ' + k + ':\n   A: …' + a.slice(Math.max(0, p - 60), p + 120) + '\n   B: …' + b.slice(Math.max(0, p - 60), p + 120));
    });
  });
  console.log('steps ' + ra.steps.length + '/' + rb.steps.length + ', errors A=' + ra.errs.length + ' B=' + rb.errs.length + (rb.errs.length ? ' (' + rb.errs.join(' | ') + ')' : '') +
    '\nCC/F&A steps: ' + ctSteps + ', differing fields: ' + diffs + (diffs ? '  <- FAIL' : '  (identical)') +
    '\ncatalog steps: ' + (ra.steps.length - ctSteps) + ', differing fields: ' + catDiffs + ' (expected, not gating)');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ A: ra, B: rb }, null, 1));
  process.exit(diffs || ra.steps.length !== rb.steps.length || rb.errs.length > ra.errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
