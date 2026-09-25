// The About quote drawer (R10): the per-phone shuffle bag and how quotes.json loads — jsdom, the real bundle and
// index.html of <site> with the nav-test fixture catalog and fixture quote lists (never the site's quotes.json), no
// passwords, no decrypted data. About 20 s (each hold waits out the real 0.9 s timer).
//   node tools/motion-test/qbag.js [--site <dir>]   (site defaults to the repo root)
// Checks: N openings show all N quotes; a new round never repeats the last quote back-to-back; the bag survives a
// relaunch (localStorage tbx_qbag = {h, o, i}); a changed list starts a fresh bag; no storage (private mode) still
// never repeats within the session; a damaged saved bag is replaced; the list is fetched at the hold's pointerdown,
// once, and kept; offline / a bad file / a list still on its way = Homer Stryker's line, and a failed fetch is tried
// again at the next hold; the drawer markup (curly quotes, "— Name, source", labels) and escaping.
const path = require('path');
const { bootSite, sleep, REPO } = require('../nav-test/jsdom-boot.js');
const args = process.argv.slice(2), si = args.indexOf('--site'), SITE = path.resolve(si > -1 ? args[si + 1] : REPO);
const results = [];
const check = (n, ok, d) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };
const HOMER = 'If your tools don’t work, make them work. If you can’t make them work, make some that do work.';
const list = (n, tag) => ({ v: 1, quotes: Array.from({ length: n }, (_, i) => Object.assign({ q: (tag || 'Test quote') + ' ' + (i + 1), a: 'Author ' + (i + 1) }, i % 2 ? { s: 'Source ' + (i + 1) } : {})) });
const clean = j => j.quotes.map(x => ({ q: x.q, a: x.a, s: x.s || '' }));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// pick() many times: every round of n shows each quote once, and no quote follows itself (also across rounds)
function rounds(Q, L, h, nRounds) {
  const seq = []; for (let i = 0; i < L.length * nRounds; i++) seq.push(Q.pick(L, h));
  let whole = true, back = 0;
  for (let r = 0; r < nRounds; r++) if (new Set(seq.slice(r * L.length, (r + 1) * L.length)).size !== L.length) whole = false;
  for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) back++;
  return { seq, whole, back };
}
// the page: quotes.json answered by `answer` (a function of the call number), every other request as jsdom-boot does
function quotesFetch(w, answer) {
  const orig = w.fetch, calls = [];
  w.fetch = (u, o) => { if (/quotes\.json/.test(String(u))) { calls.push(String(u)); return answer(calls.length); } return orig(u, o); };
  return calls;
}
const ok = j => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(j) });
const later = (ms, j) => new Promise(r => setTimeout(() => r({ ok: true, status: 200, json: () => Promise.resolve(j) }), ms));
const fire = (w, el, type) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
async function hold(w, extra) { // press the About logo past the 0.9 s hold, release; returns what the open drawer shows
  const b = w.document.querySelector('.about-hold');
  fire(w, b, 'pointerdown'); if (extra) extra(); await sleep(960); fire(w, b, 'pointerup'); await sleep(10);
  const d = w.document.getElementById('ab-drw');
  if (!d || d.hidden) return null;
  const q = d.querySelector('.drw-qt'), by = d.querySelector('.drw-by'), nm = by && by.querySelector('b'), src = by && by.querySelector('.drw-s');
  return { q: q ? q.textContent : '', by: by ? by.textContent : '', name: nm ? nm.textContent : '', src: src ? src.textContent : '' };
}
async function close(w) { const f = w.document.querySelector('.drw-front'); if (f) fire(w, f, 'click'); await sleep(300); }
const words = s => s.q.replace(/^“|”$/g, '');

(async () => {
  // ---- 1 the bag, straight through TBX_DEV.quote.pick ----
  const A = await bootSite(SITE, { hash: '#/about' }), Q = A.w.TBX_DEV && A.w.TBX_DEV.quote;
  check('TBX_DEV.quote is exposed (pick, next, load, hash, shuffle)', Q && ['pick', 'next', 'load', 'hash', 'shuffle', 'whole', 'reset'].every(k => typeof Q[k] === 'function'));
  const L7 = clean(list(7)), h7 = Q.hash(L7);
  Q.reset(); A.w.localStorage.removeItem(Q.KEY);
  const r7 = rounds(Q, L7, h7, 60);
  check('7 openings show all 7 quotes — every round of 60', r7.whole, r7.seq.slice(0, 21));
  check('a new round never starts with the quote that ended the last one (0 back-to-back in 420 openings)', r7.back === 0, r7.back);
  const roundOrders = new Set(); for (let r = 0; r < 60; r++) roundOrders.add(r7.seq.slice(r * 7, r * 7 + 7).join(''));
  check('every round is reshuffled (60 rounds of 7: > 40 different orders)', roundOrders.size > 40, roundOrders.size);
  const st = JSON.parse(A.w.localStorage.getItem('tbx_qbag') || 'null');
  check('the bag is saved per phone as tbx_qbag = {h, o, i}', st && st.h === h7 && Array.isArray(st.o) && st.o.length === 7 && st.i === 7 && Q.whole(st, 7, h7), st);
  const orders = new Set(); for (let i = 0; i < 40; i++) orders.add(Q.shuffle(7, -1).join(''));
  check('the order is shuffled (40 shuffles of 7: many different orders)', orders.size > 30, orders.size);
  let firsts = 0; for (let i = 0; i < 500; i++) if (Q.shuffle(7, 3)[0] === 3) firsts++;
  check('shuffle(n, last) never starts with last (500 tries)', firsts === 0, firsts);
  for (const n of [1, 2, 3]) {
    const L = clean(list(n, 'Small ' + n)), r = rounds(Q, L, Q.hash(L), 30);
    check('a list of ' + n + ': every round whole' + (n > 1 ? ', no back-to-back' : ' (the one quote repeats: nothing else to show)'), r.whole && (n === 1 || r.back === 0), r.seq.slice(0, 12));
  }
  // relaunch mid-round: a new session on the same phone carries on with the quotes not yet shown
  Q.reset(); A.w.localStorage.removeItem(Q.KEY);
  const firstTwo = [Q.pick(L7, h7), Q.pick(L7, h7)], saved = JSON.parse(A.w.localStorage.getItem('tbx_qbag'));
  const B = await bootSite(SITE, { hash: '#/about', storage: { tbx_qbag: JSON.stringify(saved) } }), QB = B.w.TBX_DEV.quote;
  const rest = []; for (let i = 0; i < 5; i++) rest.push(QB.pick(L7, h7));
  check('after a relaunch the bag carries on where it was: 2 + 5 openings = all 7 quotes in the saved order', saved.i === 2 && same(firstTwo.concat(rest), saved.o), { saved, firstTwo, rest });
  // a changed list (an app update with new quotes): a fresh bag for it
  const L8 = clean(list(8, 'Changed')), h8 = QB.hash(L8), p8 = QB.pick(L8, h8), st8 = JSON.parse(B.w.localStorage.getItem('tbx_qbag'));
  check('a changed list has a different hash and starts a fresh bag', h8 !== h7 && st8.h === h8 && st8.o.length === 8 && st8.i === 1 && st8.o[0] === p8, st8);
  const L7b = L7.map((x, i) => i === 3 ? Object.assign({}, x, { q: x.q + '!' }) : x);
  check('editing one quote\'s words changes the hash; editing only who said it does not', QB.hash(L7b) !== h7 && QB.hash(L7.map(x => Object.assign({}, x, { a: 'Someone else' }))) === h7);
  // a damaged saved bag is replaced, never trusted
  const bad = ['garbage{', '{"h":"' + h7 + '","o":[0,0,1,2,3,4,5],"i":2}', '{"h":"' + h7 + '","o":[0,1,2,3,4,5,6],"i":9}', '{"h":"' + h7 + '","o":[0,1,2,3,4,5],"i":1}', '{"h":"' + h7 + '","o":"0123456","i":0}', 'null', '[]'];
  const badOk = [];
  for (const s of bad) { QB.reset(); B.w.localStorage.setItem('tbx_qbag', s); const r = rounds(QB, L7, h7, 2); badOk.push(r.whole && r.back === 0); }
  check('a damaged tbx_qbag (bad JSON, repeats, i past the end, wrong length, wrong types) starts a fresh bag', badOk.every(Boolean), badOk);
  // no storage at all (private mode): the bag lives in memory for the session
  const C = await bootSite(SITE, { hash: '#/about' }), QC = C.w.TBX_DEV.quote, SP = C.w.Storage.prototype;
  SP.getItem = function () { throw new Error('storage denied'); }; SP.setItem = function () { throw new Error('storage denied'); };
  QC.reset();
  let rc = null, threw = null; try { rc = rounds(QC, L7, h7, 20); } catch (e) { threw = String(e); }
  check('with no localStorage (private mode) the bag still works in memory: whole rounds, no back-to-back, nothing thrown', !threw && rc.whole && rc.back === 0, threw || rc.seq.slice(0, 14));
  const calls0 = quotesFetch(C.w, () => ok(list(3, 'Private')));
  const cq = [await hold(C.w)]; await close(C.w); cq.push(await hold(C.w)); await close(C.w); cq.push(await hold(C.w)); await close(C.w);
  check('with no localStorage the drawer shows 3 different quotes in 3 holds, no errors', cq.every(x => x && /^Private \d$/.test(words(x))) && new Set(cq.map(words)).size === 3 && !C.errs.length && calls0.length === 1, { cq: cq.map(x => x && words(x)), errs: C.errs });

  // ---- 2 the drawer on the page: loading, markup, labels ----
  const D = await bootSite(SITE, { hash: '#/about' }), w = D.w, doc = w.document;
  const drw = doc.getElementById('ab-drw'), tray = drw && drw.querySelector('.drw-tray'), front = drw && drw.querySelector('.drw-front'), logo = doc.querySelector('.about-hold');
  check('labels: tray role=group "Quote", handle "Close the quote drawer", logo "SM ToolBox logo — hold for a quote"',
    tray && tray.getAttribute('role') === 'group' && tray.getAttribute('aria-label') === 'Quote' && front && front.getAttribute('aria-label') === 'Close the quote drawer' &&
    logo && logo.getAttribute('aria-label') === 'SM ToolBox logo — hold for a quote', [tray && tray.outerHTML.slice(0, 80), front && front.getAttribute('aria-label'), logo && logo.getAttribute('aria-label')]);
  check('no credits and no version line in the drawer; the Credits card below is unchanged', !/Built by|Made for|data updated/.test(drw.textContent) &&
    /Created by Nate Merrell/.test(doc.getElementById('content').textContent) && /Built for the CT Sports Medicine Team\./.test(doc.getElementById('content').textContent), drw.textContent);
  const L3 = list(3, 'Page');
  let calls = quotesFetch(w, () => ok(L3));
  check('About alone does not fetch quotes.json (it waits for a hold)', calls.length === 0, calls);
  const shown = [];
  const s1 = await hold(w, () => shown.push(calls.length)); shown.push(s1);
  check('the fetch starts at the hold\'s pointerdown (before the drawer opens)', shown[0] === 1, shown[0]);
  check('the drawer opens with a quote from the list: “words”, then "— Name" (+ ", source")', s1 && /^“Page [123]”$/.test(s1.q) && /^— Author [123](, Source 2)?$/.test(s1.by) && /^Author [123]$/.test(s1.name), s1);
  const i1 = +words(s1).slice(-1);
  check('the source line: "— Author 2, Source 2" for the item with an "s", no ", …" without one', i1 === 2 ? s1.src === ', Source 2' && s1.by === '— Author 2, Source 2' : s1.src === '' && s1.by === '— Author ' + i1, s1);
  await close(w);
  check('the handle closes it', drw.hidden);
  const s2 = await hold(w); await close(w); const s3 = await hold(w); await close(w); const s4 = await hold(w); await close(w);
  check('3 holds show the 3 quotes of a 3-quote list', [s1, s2, s3].every(Boolean) && new Set([s1, s2, s3].map(words)).size === 3, [s1, s2, s3].map(x => x && words(x)));
  check('the 4th hold starts a new round without repeating the 3rd quote', s4 && words(s4) !== words(s3) && /^Page [123]$/.test(words(s4)), { s3: s3 && words(s3), s4: s4 && words(s4) });
  check('quotes.json is fetched once and kept in memory (4 holds, 1 request)', calls.length === 1, calls.length);
  check('the bag on this page is saved as tbx_qbag', (() => { try { const b = JSON.parse(w.localStorage.getItem('tbx_qbag')); return b.o.length === 3 && b.i === 1; } catch (e) { return false; } })(), w.localStorage.getItem('tbx_qbag'));
  // escaping: a quote is text, never markup
  const esc = w.TBX_DEV.quote.html({ q: '<img src=x onerror="window.__pwn=1">Tom & "Jerry"', a: '<b>A</b>', s: '<i>s</i>' });
  const box = doc.createElement('div'); box.innerHTML = esc;
  check('quote, name and source are escaped (text, not markup)', !box.querySelector('img, i, b b') && box.querySelector('.drw-qt').textContent === '“<img src=x onerror="window.__pwn=1">Tom & "Jerry"”' && box.querySelector('b').textContent === '<b>A</b>', esc);
  check('no page errors (page)', D.errs.length === 0, D.errs);

  // ---- 3 fallback: offline, bad files, a list still on its way; a failed fetch is tried again ----
  const E = await bootSite(SITE, { hash: '#/about' }), we = E.w;
  const offline = quotesFetch(we, n => n === 1 ? Promise.reject(new TypeError('Load failed')) : ok(list(2, 'Back online')));
  const f1 = await hold(we);
  check('offline (quotes.json not saved): the drawer shows Homer Stryker\'s quote — never empty', f1 && words(f1) === HOMER && f1.name === 'Homer Stryker' && f1.src === ', Stryker founder' && f1.by === '— Homer Stryker, Stryker founder', f1);
  await close(we);
  const f2 = await hold(we); await close(we);
  check('the next hold tries again and shows a quote from the list', offline.length === 2 && f2 && /^Back online [12]$/.test(words(f2)), { calls: offline.length, f2 });
  const Qe = we.TBX_DEV.quote, variants = {
    'HTTP 404': () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
    'not JSON': () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }),
    'no quotes list': () => ok({ v: 1, quotes: 'none' }),
    'an empty list': () => ok({ v: 1, quotes: [] }),
    'no usable item (no words / nobody)': () => ok({ v: 1, quotes: [{ q: '', a: 'X' }, { q: 'Y', a: '  ' }, null, 5, { q: 7, a: 'Z' }] }),
    'fetch throws': () => { throw new Error('fetch unavailable'); }
  };
  const fb = {};
  for (const k of Object.keys(variants)) {
    Qe.reset(); quotesFetch(we, variants[k]);
    let r = null; try { r = await Qe.load(); } catch (e) { r = 'rejected ' + e; }
    fb[k] = r === null && Qe.next() === Qe.FALLBACK;
  }
  check('a bad file (404, not JSON, no list, empty list, no usable item) or fetch throwing: load() resolves null, the drawer gets Homer Stryker', Object.values(fb).every(Boolean), fb);
  Qe.reset(); quotesFetch(we, () => ok({ v: 1, quotes: [{ q: '  Keep going.  ', a: ' Someone ', s: 7 }, { q: 'x' }] }));
  const kept = await Qe.load();
  check('usable items are kept, trimmed; a non-text source is dropped', kept && kept.length === 1 && kept[0].q === 'Keep going.' && kept[0].a === 'Someone' && kept[0].s === '', kept);
  // still on its way when the drawer opens: Homer Stryker now (never empty, no waiting); the list is used next time
  const F = await bootSite(SITE, { hash: '#/about' }), wf = F.w;
  const slow = quotesFetch(wf, () => later(1500, list(2, 'Slow')));
  const g1 = await hold(wf); await close(wf); await sleep(800);
  const g2 = await hold(wf); await close(wf);
  check('a list still on its way at the opening: Homer Stryker, then the list at the next hold (one request)', g1 && words(g1) === HOMER && g2 && /^Slow [12]$/.test(words(g2)) && slow.length === 1, { g1: g1 && g1.name, g2, calls: slow.length });
  check('no page errors (fallback)', E.errs.length === 0 && F.errs.length === 0 && A.errs.length === 0 && B.errs.length === 0, E.errs.concat(F.errs, A.errs, B.errs));

  const fails = results.filter(x => !x).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
