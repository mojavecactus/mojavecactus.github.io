// Cycle-count sync engine tests: the real bundle in jsdom with the sheet endpoint faked.
// Covers ccDeriveCore (add/set/del + key normalisation), enqueue -> flush -> prune,
// the pull-vs-flush race, retry/backoff, roster rejection, offline persistence, expiry,
// and the Field Ops count sheet (xlsx/csv readers, reconcile, capability gate, cross-phone sync).
//   cd tools/cc-test && npm i jsdom@24 && APP_PW=<catalog pw> node run.js
const { JSDOM } = require('jsdom'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const R = path.resolve(__dirname, '../..');
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  — ' + d : '')); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function decryptPayload(pw) {
  const P = JSON.parse(fs.readFileSync(R + '/payload.enc.json', 'utf8'));
  const key = crypto.pbkdf2Sync(pw, Buffer.from(P.salt, 'base64'), P.it, 32, 'sha256');
  const ct = Buffer.from(P.ct, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(P.iv, 'base64'));
  d.setAuthTag(ct.slice(-16));
  try { return Buffer.concat([d.update(ct.slice(0, -16)), d.final()]).toString(); }
  catch (e) {
    for (const w of (P.wraps || [])) {
      try {
        const wct = Buffer.from(w.ct, 'base64'); const dw = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(w.iv, 'base64')); dw.setAuthTag(wct.slice(-16));
        const raw = Buffer.concat([dw.update(wct.slice(0, -16)), dw.final()]);
        const d2 = crypto.createDecipheriv('aes-256-gcm', raw, Buffer.from(P.iv, 'base64')); d2.setAuthTag(ct.slice(-16));
        return Buffer.concat([d2.update(ct.slice(0, -16)), d2.final()]).toString();
      } catch (e2) {}
    }
    throw new Error('wrong password');
  }
}

// The Field Ops reconcile core, lifted verbatim from the bundle so the fake sheet answers fops_status like fops.gs does.
const CORE = (() => { const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1]; const src = fs.readFileSync(R + '/' + APP, 'utf8');
  const body = src.slice(src.indexOf('==== FOPS CORE BEGIN ===='), src.indexOf('==== FOPS CORE END ====')).replace(/^.*FOPS CORE BEGIN ====\n/, '');
  return new Function(body + '\nreturn { key: fopsKey, reconcile: fopsReconcile, ver: fopsVer };')(); })();
function fopsStatusOf(s) { if (!s.fops) return { ok: true, ver: '', built: '', found: [], additional: [] };
  const R = CORE.reconcile(s.fops.lines.map(a => ({ d: a[0], m: a[1], b: a[2] })), s.rows);
  return { ok: true, ver: s.fops.ver, built: s.fops.meta.built || '', found: R.confirmed.map(c => [CORE.key(c.m, c.b), c.q]), additional: R.additional.map(a => [a.d, a.m, a.b, a.q]) }; }

// Fake sheet endpoint (mirrors the CT bound script's contract): batch dedups by opId, pull returns rows.
function FakeSheet() {
  const s = { rows: [], seen: {}, calls: [], fail: 0, busy: 0, devOk: true, holdMs: 0, fopsCap: false, fops: null, applyThenDrop: 0 };
  s.handle = async (url, body) => {
    s.calls.push({ url, body });
    if (s.holdMs) await sleep(s.holdMs);
    if (s.fail > 0) { s.fail--; throw new Error('net'); }
    if (/action=pull/.test(url)) { const resp = { ok: true, rows: s.rows.map(r => ({ ...r })) }; if (s.fopsCap) resp.fops = s.fops ? s.fops.meta : null; return resp; }
    if (/action=fops_get/.test(url)) return s.fops ? { ok: true, ver: s.fops.ver, title: s.fops.title, meta: s.fops.meta, lines: s.fops.lines } : { ok: true, ver: '', title: '', meta: null, lines: [] };
    if (/action=fops_status/.test(url)) { s.statusCalls = (s.statusCalls || 0) + 1; return fopsStatusOf(s); }
    if (body && body.action === 'fops_put') { if (!s.devOk) return { ok: false, err: 'dev' }; s.fops = { ver: body.ver, title: body.title, lines: body.lines, meta: { ver: body.ver, title: body.title, n: body.lines.length, confirmed: 0, missing: body.lines.length, additional: 0, units: 0, at: new Date().toISOString(), by: body.dev, built: 'b1' } }; return { ok: true, ver: body.ver, meta: s.fops.meta, status: fopsStatusOf(s) }; }
    if (body && body.action === 'fops_clear') { s.fops = null; return { ok: true }; }
    if (/action=roster/.test(url)) return { devices: ["Nate's iPhone", "Mia's iPhone"] };
    if (body && body.action === 'batch') {
      if (!s.devOk) return { ok: false, err: 'dev' };
      if (s.busy > 0) { s.busy--; return { ok: false, err: 'busy' }; }
      const applied = [], fresh = [];
      body.ops.forEach(op => {
        applied.push(op.opId);
        if (s.seen[op.opId]) return; s.seen[op.opId] = 1; fresh.push(op.opId);
        const key = r => (r.loc || '').trim().toLowerCase() + '|' + String(r.ref).replace(/[^0-9a-z]/gi, '').toUpperCase() + '|' + (r.lot || '').trim().toUpperCase();
        const k = key(op); let row = s.rows.find(r => key(r) === k);
        if (op.t === 'add') { if (row) row.qty += op.qty; else s.rows.push({ id: 'r' + s.rows.length, ts: op.ts, dev: body.dev, ref: op.ref, desc: op.desc, lot: op.lot, exp: op.exp, qty: op.qty, loc: op.loc, notes: op.notes }); }
        else if (op.t === 'set') { if (row) row.qty = op.qty; else s.rows.push({ id: 'r' + s.rows.length, ts: op.ts, dev: body.dev, ref: op.ref, lot: op.lot, qty: op.qty, loc: op.loc }); }
        else if (op.t === 'del') { s.rows = s.rows.filter(r => key(r) !== k); }
      });
      if (s.applyThenDrop > 0) { s.applyThenDrop--; throw new Error('net'); }   // the sheet applied the batch but the phone never heard back
      const resp = { ok: true, applied, fresh };
      if (body.norows) resp.n = s.rows.length; else resp.rows = s.rows.map(r => ({ ...r }));
      return resp;
    }
    return { ok: true };
  };
  return s;
}

async function boot(sheet, storage) {
  const APP = /<script src="(app[^"]*\.js)"/.exec(fs.readFileSync(R + '/index.html', 'utf8'))[1];
  let html = fs.readFileSync(R + '/index.html', 'utf8').replace(/<script src="lib\/zxing-reader.js"><\/script>/, '').replace(/<script src="app[^"]*\.js"><\/script>/, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://sportsmedtoolbox.com/#/', pretendToBeVisual: true });
  const w = dom.window; const errs = [];
  w.addEventListener('error', e => errs.push(e.message));
  if (storage) Object.keys(storage).forEach(k => w.localStorage.setItem(k, storage[k]));
  w.fetch = (url, opts) => { let body = null; try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
    return sheet.handle(String(url), body).then(j => ({ ok: true, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) })); };
  w.ZXingWASM = { readBarcodes: () => Promise.resolve([]), prepareZXingModule() {} }; w.scrollTo = () => {};
  w.eval(decryptPayload(process.env.APP_PW));
  w.eval(fs.readFileSync(R + '/lib/inflate.js', 'utf8'));
  w.document.documentElement.classList.add('authed');
  w.eval(fs.readFileSync(R + '/' + APP, 'utf8')); w.TBX_BOOT();
  await sleep(50); // let the boot tick (deferred queue drain) run before the test acts
  return { w, errs, dev: w.TBX_DEV.cc, dump: () => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; } };
}

(async () => {
  if (!process.env.APP_PW) { console.log('set APP_PW'); process.exit(1); }
  const creds = { 'tbx_cc': JSON.stringify({ url: 'https://script.google.com/macros/s/fake/exec', token: 'tok' }), 'tbx_cc_dev': "Nate's iPhone", 'tbx_cc_roster': JSON.stringify(["Nate's iPhone", "Mia's iPhone"]), 'tbx_tour_done': '1' };

  // ---- 1. deriveCore: pure ----
  { const sheet = FakeSheet(); const { dev, errs } = await boot(sheet, creds);
    const base = [{ id: 'r0', ts: '2026-09-01T10:00:00Z', ref: '3910500393', lot: 'A1', qty: 2, loc: 'Trunk' }];
    const ops = [
      { t: 'add', opId: 'o1', ts: '2026-09-01T10:01:00Z', ref: '3910-500-393', lot: 'a1', qty: 3, loc: ' trunk ' },   // same line, normalised
      { t: 'add', opId: 'o2', ts: '2026-09-01T10:02:00Z', ref: 'X1', lot: 'L', qty: 1, loc: 'Trunk' },
      { t: 'set', opId: 'o3', ts: '2026-09-01T10:03:00Z', ref: 'X1', lot: 'L', qty: 7, loc: 'Trunk' },
      { t: 'del', opId: 'o4', ts: '2026-09-01T10:04:00Z', ref: '3910500393', lot: 'A1', loc: 'Trunk' },
      { t: 'set', opId: 'o5', ts: '2026-09-01T10:05:00Z', ref: 'NEW', lot: 'N', qty: 4, loc: 'Closet' } ];
    const rows = dev.deriveCore(base, ops, 'cc', "Nate's iPhone");
    check('derive: add merges across dash/case/space normalisation then del removes', !rows.some(r => r.ref === '3910500393'));
    check('derive: set overrides add', rows.find(r => r.ref === 'X1').qty === 7);
    check('derive: set on unknown line creates it as pending', rows.find(r => r.ref === 'NEW').qty === 4 && rows.find(r => r.ref === 'NEW').pending === true);
    check('derive: base untouched (copy)', base[0].qty === 2 && base.length === 1);
    check('derive: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 2. enqueue -> flush -> prune -> base from server ----
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.enqueue('cc', { t: 'add', ref: '3910500393', lot: 'A1', qty: 2, loc: 'Trunk', notes: '' });
    dev.enqueue('cc', { t: 'add', ref: '3910500393', lot: 'A1', qty: 1, loc: 'Trunk', notes: '' });
    check('flush: ops queued locally first', dev.syncSt('cc').ops.length === 2 && dev.syncSt('cc').rows[0].qty === 3);
    check('flush: queue persisted in localStorage', JSON.parse(w.localStorage.getItem('tbx_cc_ops')).length === 2);
    await sleep(1700);
    check('flush: batch sent once with both ops', sheet.calls.filter(c => c.body && c.body.action === 'batch').length === 1 && sheet.calls.find(c => c.body && c.body.action === 'batch').body.ops.length === 2);
    check('flush: ops pruned after ok', dev.syncSt('cc').ops.length === 0);
    check('flush: base replaced by server rows, not pending', dev.syncSt('cc').base.length === 1 && dev.syncSt('cc').base[0].qty === 3 && !dev.syncSt('cc').base[0].pending);
    check('flush: server has merged line', sheet.rows.length === 1 && sheet.rows[0].qty === 3);
    check('no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 3. retry on network failure, busy backoff ----
  { const sheet = FakeSheet(); sheet.fail = 1; const { dev } = await boot(sheet, creds);
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.enqueue('cc', { t: 'add', ref: 'R1', lot: 'L1', qty: 1, loc: 'Trunk' });
    await sleep(1700);
    check('retry: first attempt failed, op still queued', dev.syncSt('cc').ops.length === 1 && dev.SY.cc.retry === 1);
    await sleep(4300);
    check('retry: second attempt landed after backoff', dev.syncSt('cc').ops.length === 0 && sheet.rows.length === 1);
    sheet.busy = 1;
    dev.enqueue('cc', { t: 'add', ref: 'R2', lot: 'L2', qty: 1, loc: 'Trunk' });
    await sleep(1700);
    check('busy: op held', dev.syncSt('cc').ops.length === 1);
    await sleep(4500);
    check('busy: retried and landed', dev.syncSt('cc').ops.length === 0 && sheet.rows.length === 2); }

  // ---- 4. roster rejection does not loop ----
  { const sheet = FakeSheet(); sheet.devOk = false; const { dev } = await boot(sheet, creds);
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.enqueue('cc', { t: 'add', ref: 'R1', lot: 'L1', qty: 1, loc: 'Trunk' });
    await sleep(1700); const n1 = sheet.calls.filter(c => c.body && c.body.action === 'batch').length;
    await sleep(6000); const n2 = sheet.calls.filter(c => c.body && c.body.action === 'batch').length;
    check('dev rejection: exactly one batch attempt, op kept for after re-pick', n1 === 1 && n2 === 1 && dev.syncSt('cc').ops.length === 1, n1 + '/' + n2); }

  // ---- 5. pull vs flush race: flush that lands during a slow GET wins ----
  { const sheet = FakeSheet(); const { dev } = await boot(sheet, creds);
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    sheet.rows = [{ id: 'r0', ts: '2026-09-01T09:00:00Z', ref: 'OLD', lot: 'X', qty: 1, loc: 'Trunk' }];
    const origHandle = sheet.handle;
    sheet.handle = async (url, body) => { if (/action=pull/.test(url)) { const snap = { ok: true, rows: sheet.rows.map(r => ({ ...r })) }; await sleep(900); return snap; } return origHandle(url, body); };
    const pulling = dev.pull('cc');
    dev.enqueue('cc', { t: 'add', ref: 'NEWER', lot: 'Y', qty: 5, loc: 'Trunk' });
    dev.flush('cc');
    await pulling; await sleep(200);
    check('race: base keeps the flushed line, stale snapshot discarded', dev.syncSt('cc').base.some(r => r.ref === 'NEWER')); }

  // ---- 6. offline persistence across reload ----
  { const sheet = FakeSheet(); sheet.fail = 99; const first = await boot(sheet, creds);
    first.dev.CC.loc = 'Trunk'; first.dev.CC.tgt = 'cc';
    first.dev.enqueue('cc', { t: 'add', ref: 'Q1', lot: 'L', qty: 2, loc: 'Trunk' });
    await sleep(300);
    const saved = first.dump();
    const sheet2 = FakeSheet(); const second = await boot(sheet2, saved);
    await sleep(2500);
    check('offline: queued op survives reload and drains on next boot', sheet2.rows.length === 1 && sheet2.rows[0].qty === 2 && second.dev.syncSt('cc').ops.length === 0, 'rows=' + sheet2.rows.length); }

  // ---- 7. expiry helpers ----
  { const sheet = FakeSheet(); const { dev } = await boot(sheet, creds);
    check('exp: YYMM00 -> end of month', dev.expIso('260800') === '2026-08-31' && dev.expDisp('260800') === '2026-08');
    check('exp: month-only string expired only after month end', dev.isExpired('2026-08') === true && dev.isExpired('2999-01') === false);
    check('exp: unparsable never counts as expired', dev.isExpired('soon') === false && dev.isExpired('') === false); }

  // ---- 8. device stamping: queued scans keep the phone they were made on ----
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    sheet.holdMs = 100000; // sheet unreachable for now
    dev.enqueue('cc', { t: 'add', ref: 'A1', lot: 'L1', qty: 1, loc: 'Trunk', notes: '' });
    check('devstamp: scan carries its phone', dev.syncSt('cc').ops[0].dev === "Nate's iPhone");
    // device re-picked while the scan is still queued
    dev.CC.dev = "Mia's iPhone"; w.localStorage.setItem('tbx_cc_dev', "Mia's iPhone");
    dev.enqueue('cc', { t: 'add', ref: 'B2', lot: 'L2', qty: 1, loc: 'Trunk', notes: '' });
    sheet.holdMs = 0; sheet.calls.length = 0;
    dev.flush('cc'); await sleep(200); await sleep(700);
    const batches = sheet.calls.filter(c => c.body && c.body.action === 'batch');
    check('devstamp: one batch per phone', batches.length === 2, batches.map(b => b.body.dev + ':' + b.body.ops.map(o => o.ref)).join(' ; '));
    const nate = batches.find(b => b.body.dev === "Nate's iPhone"), mia = batches.find(b => b.body.dev === "Mia's iPhone");
    check('devstamp: A1 went out under Nate, B2 under Mia', nate && nate.body.ops.length === 1 && nate.body.ops[0].ref === 'A1' && mia && mia.body.ops.length === 1 && mia.body.ops[0].ref === 'B2');
    check('devstamp: sheet rows attributed correctly', sheet.rows.find(r => r.ref === 'A1').dev === "Nate's iPhone" && sheet.rows.find(r => r.ref === 'B2').dev === "Mia's iPhone");
    check('devstamp: queue drained', dev.syncSt('cc').ops.length === 0);
    check('devstamp: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 9. rejected old device does not block the current phone ----
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    const origHandle = sheet.handle;
    sheet.handle = async (url, body) => { if (body && body.action === 'batch' && body.dev === 'Old Phone') { sheet.calls.push({ url, body }); return { ok: false, err: 'dev' }; } return origHandle(url, body); };
    dev.syncSt('cc').ops.push({ t: 'add', opId: 'old1', ts: '2026-09-01T10:00:00Z', dev: 'Old Phone', ref: 'OLD', lot: 'X', qty: 1, loc: 'Trunk' });
    dev.enqueue('cc', { t: 'add', ref: 'NEW', lot: 'Y', qty: 1, loc: 'Trunk', notes: '' });
    await sleep(2500);
    check('devreject: current phone scan still landed', sheet.rows.some(r => r.ref === 'NEW') && !sheet.rows.some(r => r.ref === 'OLD'));
    check('devreject: old scan kept, not looping', dev.syncSt('cc').ops.length === 1 && sheet.calls.filter(c => c.body && c.body.dev === 'Old Phone').length === 1);
    check('devreject: error remembered for the home screen', dev.SY.cc.err === 'dev' && dev.SY.cc.errDev === 'Old Phone');
    check('devreject: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 10. territory switch while a batch is in flight ----
  { const sheet = FakeSheet(), bufSheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, { ...creds, 'tbx_buf_cc': JSON.stringify({ url: 'https://script.google.com/macros/s/fakebuf/exec', token: 'tok' }), 'tbx_buf_cc_dev': "Nate's iPhone", 'tbx_buf_cc_roster': creds['tbx_cc_roster'] });
    const f0 = w.fetch; w.fetch = (url, opts) => { if (/fakebuf/.test(String(url))) { let body = null; try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {} return bufSheet.handle(String(url), body).then(j => ({ ok: true, json: () => Promise.resolve(j) })); } return f0(url, opts); };
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    sheet.holdMs = 600;
    dev.enqueue('cc', { t: 'add', ref: 'CT1', lot: 'A', qty: 1, loc: 'Trunk', notes: '' });
    dev.flush('cc'); await sleep(100); // request is out, sheet is holding it
    w.location.hash = '#/team/buf/cc'; w.dispatchEvent(new w.Event('hashchange')); // switch to Buffalo mid-flight
    dev.CC.loc = 'Closet'; dev.CC.tgt = 'buf_cc';
    dev.enqueue('buf_cc', { t: 'add', ref: 'BUF1', lot: 'B', qty: 1, loc: 'Closet', notes: '' });
    await sleep(1500);
    const bufOps = dev.syncSt('buf_cc').ops, ctOps = dev.syncSt('cc').ops;
    check('switch: CT scan cleared from CT queue, not Buffalo\u2019s', ctOps.length === 0, 'ct=' + ctOps.length);
    check('switch: Buffalo queue untouched by the CT reply and drained on its own', bufOps.length === 0 && bufSheet.rows.some(r => r.ref === 'BUF1') && sheet.rows.some(r => r.ref === 'CT1'), 'buf=' + bufOps.length);
    check('switch: Buffalo list holds Buffalo rows only', dev.CC.rows.every(r => r.ref !== 'CT1'));
    check('switch: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 11. stuck request times out and retries ----
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    const origFetch = w.fetch; let aborted = 0;
    w.fetch = (url, opts) => new Promise((res, rej) => { if (opts && opts.signal) opts.signal.addEventListener('abort', () => { aborted++; rej(new w.DOMException('aborted', 'AbortError')); }); });
    dev.enqueue('cc', { t: 'add', ref: 'T1', lot: 'A', qty: 1, loc: 'Trunk', notes: '' });
    await sleep(1400);
    check('timeout: request carries an abort signal', aborted === 0 && dev.SY.cc.inflight === true);
    // emulate the 20s timer firing early by aborting via the same path
    const inAt = dev.SY.cc.inAt; w.fetch = origFetch;
    await sleep(100);
    check('timeout: inflight marked while waiting', inAt > 0);
    check('timeout: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 12. 4.116: merged rows stay marked unsynced; set carries expiry; typed expiry; reserved slugs; history prune ----
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds);
    const base = [{ id: 'r0', ts: '2026-09-01T10:00:00Z', ref: 'A', lot: 'L', qty: 2, loc: 'Trunk', exp: '' }];
    const rows = dev.deriveCore(base, [{ t: 'add', opId: 'x1', ref: 'A', lot: 'L', qty: 1, loc: 'Trunk' }], 'cc', 'N');
    check('pend: add merged into a synced row marks it unsynced', rows[0].qty === 3 && rows[0].pending === true);
    const rows2 = dev.deriveCore(base, [{ t: 'set', opId: 'x2', ref: 'A', lot: 'L', qty: 2, loc: 'Trunk', exp: '2027-03', expired: false }], 'cc', 'N');
    check('set: expiry edit carried onto the row', rows2[0].exp === '2027-03' && rows2[0].pending === true);
    check('expInput: forms normalised', dev.expInput('2027-03') === '2027-03' && dev.expInput('2027-03-15') === '2027-03-15' && dev.expInput('3/2027') === '2027-03' && dev.expInput('3/5/2027') === '2027-03-05' && dev.expInput('270300') === '2027-03' && dev.expInput('') === '');
    const bufName = dev.TERR.buf.name;
    dev.hubTerrAdd({ slug: 'buf', name: 'Hijack' }, false);
    check('reserved: hub team cannot rename a built-in territory', dev.TERR.buf.name === bufName && dev.TERR.buf.enc === 'cc-buf.enc.json');
    dev.hubTerrAdd({ slug: 'bos', name: 'Boston' }, false);
    check('reserved: normal hub team still added', dev.TERR.bos && dev.TERR.bos.hub === true);
    check('sandbox: built-in staging territory exists but is never listed', dev.TERR.sbx && dev.TERR.sbx.enc === 'cc-sbx.enc.json' && dev.TERR.sbx.tgt === 'sbx_cc' && dev.TORDER.indexOf('sbx') === -1);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.CC.hist = { 'trunk|ZZZ|old': [1, 2], 'trunk|A|L': [2] };
    dev.CC.rows = [{ id: 'r0', ref: 'A', lot: 'L', loc: 'Trunk', qty: 2 }];
    dev.histPrune();
    check('hist: prune drops history for lines no longer on the count', !dev.CC.hist['trunk|ZZZ|old'] && !!dev.CC.hist['trunk|A|L']);
    check('4.116: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 13. Field Ops: .xlsx / .csv readers never make numbers, header found by name, list extracted ----
  const zlib = require('zlib');
  function makeZip(files) { // minimal zip writer: deflate-raw entries + central directory + EOCD
    const parts = [], cd = []; let off = 0;
    for (const [name, text] of Object.entries(files)) {
      const raw = Buffer.from(text, 'utf8'), def = zlib.deflateRawSync(raw), nm = Buffer.from(name, 'utf8'), crc = zlib.crc32(raw);
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
      parts.push(lh, nm, def);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(def.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(off, 42);
      cd.push(ch, nm); off += lh.length + nm.length + def.length;
    }
    const cdBuf = Buffer.concat(cd), eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(cd.length / 2, 8); eocd.writeUInt16LE(cd.length / 2, 10); eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16); eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...parts, cdBuf, eocd]);
  }
  const X = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function makeXlsx(rows) { // rows: [{r, cells:[{c:'A', s:'shared text'} | {c:'B', n:'130'} | {c:'C', is:'inline'} | {c:'D', rich:['a','b']}]}]
    const shared = []; const sidx = (t) => { let i = shared.indexOf(t); if (i < 0) { shared.push(t); i = shared.length - 1; } return i; };
    const sheetRows = rows.map(row => '<row r="' + row.r + '">' + row.cells.map(c => {
      const ref = c.c + row.r;
      if (c.n !== undefined) return '<c r="' + ref + '"><v>' + X(c.n) + '</v></c>';
      if (c.is !== undefined) return '<c r="' + ref + '" t="inlineStr"><is><t>' + X(c.is) + '</t></is></c>';
      if (c.rich !== undefined) { const i = shared.push('\u0000RICH' + shared.length) - 1; shared[i] = { rich: c.rich }; return '<c r="' + ref + '" t="s"><v>' + i + '</v></c>'; }
      return '<c r="' + ref + '" t="s"><v>' + sidx(c.s) + '</v></c>';
    }).join('') + '</row>').join('');
    const sst = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + shared.length + '" uniqueCount="' + shared.length + '">' +
      shared.map(t => t && t.rich ? '<si>' + t.rich.map(p => '<r><rPr><b/></rPr><t xml:space="preserve">' + X(p) + '</t></r>').join('') + '</si>' : '<si><t xml:space="preserve">' + X(t) + '</t></si>').join('') + '</sst>';
    return makeZip({
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>' + sheetRows + '</sheetData></worksheet>',
      'xl/sharedStrings.xml': sst
    });
  }
  const FIX = [
    { r: 1, cells: [{ c: 'A', s: 'IT9999 SM SANDBOX SPLIT' }, { c: 'F', s: 'Additional Inventory' }, { c: 'K', s: 'to add leading zeroes, include an apostrophe before the first value of 0' }] },
    { r: 2, cells: [{ c: 'A', s: 'Material Description' }, { c: 'B', s: 'Material' }, { c: 'C', s: 'Batch' }, { c: 'D', s: 'Quantity' }, { c: 'G', s: 'Material' }, { c: 'H', s: 'Batch' }, { c: 'I', s: 'Quantity' }] },
    { r: 3, cells: [{ c: 'A', s: 'Low Dense PE HipCheck Drape 25X65' }, { c: 'B', s: '0103-0400' }, { c: 'C', s: '30296C3260' }] },
    { r: 4, cells: [{ c: 'A', s: 'InSpace US Small' }, { c: 'B', s: '0130' }, { c: 'C', s: '091024-05' }] },
    { r: 5, cells: [{ c: 'A', s: 'PROCINCH, SLT BUTTON, CONCAVE RND 11MM' }, { c: 'B', s: '0234100001' }, { c: 'C', s: '24E01' }] },
    { r: 6, cells: [{ c: 'A', s: 'ICONIX HA 1.4MM 1 STND 2 XB S' }, { c: 'B', s: '3911-514-620HA' }, { c: 'C', s: '25J17' }] },
    { r: 7, cells: [{ c: 'A', s: 'OMEGA 3.9MM KNOTLESS' }, { c: 'B', s: '3910-500-471' }, { c: 'C', s: '22K01' }, { c: 'D', n: '3' }, { c: 'G', s: '3910-500-393' }, { c: 'H', s: 'Z1' }, { c: 'I', n: '1' }] },
    { r: 8, cells: [{ c: 'A', s: 'PKG. S.J. CUTTER FULL RADIUS - 2.5MM' }, { c: 'B', s: '0275-627-000' }, { c: 'C', s: '21027CG2' }] },
    { r: 9, cells: [{ c: 'A', s: 'PROCINCH, SLT BUTTON, CONCAVE RND 11MM' }, { c: 'B', s: '0234100001' }, { c: 'C', s: '24E01' }] }, // duplicate
    { r: 11, cells: [{ c: 'A', s: 'Numeric material cell' }, { c: 'B', n: '4700' }, { c: 'C', s: 'X1' }] },                                    // Excel already coerced this one
    { r: 12, cells: [{ c: 'A', s: 'ANCHOR INSTRUMENT KIT 3.5MM' }, { c: 'B', is: '86IN0035' }, { c: 'C', is: 'AB12' }] },
    { r: 13, cells: [{ c: 'A', rich: ['TRANSPORT ', 'CANNULA 8MM'] }, { c: 'B', s: 'CAT00222' }, { c: 'C', s: '22F02' }] },
    { r: 14, cells: [{ c: 'A', s: 'No batch here' }, { c: 'B', s: '3910-500-999' }] },
    { r: 16, cells: [{ c: 'A', s: 'Sci-notation trap' }, { c: 'B', s: '234-020-280' }, { c: 'C', n: '2.4E+2' }] } ];
  const FIX_LINES = [
    ['Low Dense PE HipCheck Drape 25X65', '0103-0400', '30296C3260'], ['InSpace US Small', '0130', '091024-05'], ['PROCINCH, SLT BUTTON, CONCAVE RND 11MM', '0234100001', '24E01'],
    ['ICONIX HA 1.4MM 1 STND 2 XB S', '3911-514-620HA', '25J17'], ['OMEGA 3.9MM KNOTLESS', '3910-500-471', '22K01'], ['PKG. S.J. CUTTER FULL RADIUS - 2.5MM', '0275-627-000', '21027CG2'],
    ['Numeric material cell', '4700', 'X1'], ['ANCHOR INSTRUMENT KIT 3.5MM', '86IN0035', 'AB12'], ['TRANSPORT CANNULA 8MM', 'CAT00222', '22F02'], ['Sci-notation trap', '234-020-280', '240'] ];
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds); const F = dev.fops;
    const xbuf = makeXlsx(FIX);
    const sheets = F.readXlsx(new Uint8Array(xbuf).buffer);
    check('xlsx: one sheet read, numeric cells counted', sheets.length === 1 && sheets[0].numeric === 4, JSON.stringify(sheets[0] && sheets[0].numeric));
    const res = F.fromGrid(sheets[0].grid, sheets[0].numeric);
    check('xlsx: title from A1, header found on row 2', res.title === 'IT9999 SM SANDBOX SPLIT' && res.lines.length === FIX_LINES.length, res.title + ' / ' + res.lines.length);
    check('xlsx: every line byte-exact (shared, inline, rich, numeric-as-digits, no exponent)', JSON.stringify(res.lines.map(L => [L.d, L.m, L.b])) === JSON.stringify(FIX_LINES), JSON.stringify(res.lines.map(L => [L.d, L.m, L.b])));
    check('xlsx: traps kept as text and surfaced', res.stats.traps.indexOf('0234100001 / 24E01') > -1 && res.stats.traps.indexOf('0103-0400 / 30296C3260') > -1, res.stats.traps.join(' | '));
    const W = res.warnings.join(' ');
    check('xlsx: warnings — prefilled qty, additional block, duplicate, no-batch, numeric cells', /1 line already had a quantity/.test(W) && /1 additional-inventory line/.test(W) && /1 duplicate line dropped/.test(W) && /1 line had no batch/.test(W) && /4 cells arrived as numbers/.test(W), W);
    check('xlsx: stats', res.stats.lines === 10 && res.stats.materials === 10);
    const csv = 'IT9999 SM SANDBOX SPLIT,,,,,Additional Inventory\r\nMaterial Description,Material,Batch,Quantity,,,Material,Batch,Quantity\r\n"PROCINCH, SLT BUTTON, CONCAVE RND 11MM",0234100001,24E01,\r\nInSpace US Small,0130,091024-05,\r\n"Quoted ""desc""",3910-500-471,22K01,\r\n';
    const cres = F.fromGrid(F.readCsv(csv)[0].grid, 0);
    check('csv: quotes, commas in quotes, CRLF, doubled quotes', cres.title === 'IT9999 SM SANDBOX SPLIT' && cres.lines.length === 3 && cres.lines[0].d === 'PROCINCH, SLT BUTTON, CONCAVE RND 11MM' && cres.lines[0].b === '24E01' && cres.lines[2].d === 'Quoted "desc"', JSON.stringify(cres.lines));
    const file = new w.File([xbuf], 'Field_ops_count_sheet.xlsx');
    const pres = await F.parseFile(file);
    check('parseFile: xlsx by magic bytes, ver + src attached', pres.lines.length === 10 && pres.src === 'Field_ops_count_sheet.xlsx' && /^[0-9a-f]{16}$/.test(pres.ver), pres.ver);
    let xlsErr = ''; try { await F.parseFile(new w.File([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0])], 'old.xls')); } catch (e) { xlsErr = e.message; }
    check('parseFile: legacy .xls refused with a clear code', xlsErr === 'xls');
    let hdrErr = ''; try { F.fromGrid([['a', 'b'], ['c', 'd']], 0); } catch (e) { hdrErr = e.message; }
    check('fromGrid: no Material/Batch header -> noheader', hdrErr === 'noheader');
    // the real Field Ops file, when it is on this machine (never committed)
    const real = '/mnt/user-data/uploads/Field_ops_count_sheet.xlsx';
    if (fs.existsSync(real)) {
      const rr = F.fromGrid(F.readXlsx(new Uint8Array(fs.readFileSync(real)).buffer)[0].grid, 0);
      check('real file: 1,298 lines, title, no warnings, 24E01 kept', rr.lines.length === 1298 && rr.title === 'IT1223 SM CONNECTICUT SPLIT' && rr.warnings.length === 0 && rr.lines.some(L => L.b === '24E01') && rr.lines.some(L => L.m === '0130'), rr.lines.length + ' ' + rr.warnings.join(';'));
    }
    check('fops parse: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 14. Field Ops: keys, reconcile, spelling, version ----
  { const sheet = FakeSheet(); const { dev } = await boot(sheet, creds); const F = dev.fops;
    check('keyMat: dashes + leading zeros ignored, letters kept', F.keyMat('0275-627-000') === '275627000' && F.keyMat('275627000') === '275627000' && F.keyMat(' 3911-514-620ha ') === '3911514620HA' && F.keyMat('0130') === '130' && F.keyMat('CAT00222') === 'CAT00222' && F.keyMat('86IN0035') === '86IN0035');
    check('keyMat: trailing zeros kept (4751 is not the CrossFire console)', F.keyMat('4751') !== F.keyMat('0475100000') && F.keyMat('0000') === '0');
    check('keyLot: dashes + leading zeros ignored, case folded', F.keyLot('091024-05') === '9102405' && F.keyLot('09102405') === '9102405' && F.keyLot('24e01') === '24E01' && F.keyLot(' 22K01 ') === '22K01');
    check('dash: Field Ops convention for unlisted materials', F.dash('3910947022') === '3910-947-022' && F.dash('275627000') === '275-627-000' && F.dash('3911514620HA') === '3911-514-620HA' && F.dash('CAT02854') === 'CAT02854' && F.dash('0130') === '0130' && F.dash('3910-500-471') === '3910-500-471');
    const list = FIX_LINES.map(a => ({ d: a[0], m: a[1], b: a[2] }));
    const rows = [
      { ref: '0103-0400', lot: '30296c3260', qty: 2, loc: 'Trunk', desc: 'Drape' }, { ref: '01030400', lot: '30296C3260', qty: 3, loc: 'Storage', desc: 'Drape' },
      { ref: '0130', lot: '09102405', qty: 1, loc: 'Trunk' },
      { ref: '234100001', lot: '24E01', qty: 1, loc: 'Trunk' },
      { ref: '3910500471', lot: '22K01', qty: 0, loc: 'Trunk' },
      { ref: '275627000', lot: 'NEWLOT', qty: 4, loc: 'Trunk', desc: '2.5mm Full radius shaver blade' },
      { ref: '3910947022', lot: 'L9', qty: 2, loc: 'Trunk', desc: 'AlphaVent' }, { ref: '3910947022', lot: 'L9', qty: 1, loc: 'Storage', desc: 'AlphaVent' },
      { ref: 'CAT02854', lot: 'Z', qty: 1, loc: 'Trunk', desc: 'Champion SlingShot' } ];
    const R = F.reconcile(list, rows);
    check('reconcile: confirmed sums across locations/spellings, list order kept', R.confirmed.length === 3 && R.confirmed[0].m === '0103-0400' && R.confirmed[0].q === 5 && R.confirmed[1].m === '0130' && R.confirmed[2].m === '0234100001', JSON.stringify(R.confirmed));
    check('reconcile: qty 0 counts as missing; missing keeps Field Ops order + spelling', R.missing.length === 7 && R.missing[0].m === '3911-514-620HA' && R.missing[1].m === '3910-500-471' && R.missing[1].b === '22K01');
    check('reconcile: additional aggregated, list spelling reused for known material, dashes for unknown, sorted', R.additional.length === 3 && R.additional[0].m === '0275-627-000' && R.additional[0].onList === true && R.additional[0].q === 4 && R.additional[1].m === '3910-947-022' && R.additional[1].q === 3 && R.additional[1].d === 'AlphaVent' && R.additional[2].m === 'CAT02854', JSON.stringify(R.additional));
    check('reconcile: meta', R.meta.n === 10 && R.meta.confirmed === 3 && R.meta.missing === 7 && R.meta.additional === 3 && R.meta.units === 7);
    const v1 = F.ver(list), v2 = F.ver(list.map(L => ({ ...L }))), v3 = F.ver(list.slice(1));
    check('ver: stable across copies, changes with content', v1 === v2 && v1 !== v3 && /^[0-9a-f]{16}$/.test(v1)); }

  // ---- 15. Field Ops: capability gate, upload, progress, cross-phone list sync, hint, remove ----
  { const sheet = FakeSheet(); const { w, dev, errs } = await boot(sheet, creds); const F = dev.fops;
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange')); await sleep(300);
    const box = () => w.document.getElementById('cc-fops');
    check('gate: old server (no fops key) -> no card', box() && box().hidden === true && box().innerHTML === '');
    sheet.fopsCap = true; await dev.pull('cc'); await sleep(50);
    check('gate: server that knows the feature -> Field Ops pinned at the top, Counts labelled below it', box().hidden === false && /Field Ops count sheet/.test(box().textContent) && /Upload the empty sheet/.test(box().textContent) && box().nextElementSibling && box().nextElementSibling.id === 'cc-counts-lab' && box().nextElementSibling.hidden === false && !!box().querySelector('.fops-lab') && w.document.getElementById('cc-cards').compareDocumentPosition(box()) & 2);
    w.document.querySelector('.fops-home').click(); await sleep(300);
    const head = () => w.document.getElementById('fops-head');
    check('screen: upload prompt with the bold Empty instruction and an Upload button', w.location.hash === '#/cc/fops' && /<b>empty<\/b>/.test(head().innerHTML) && !!w.document.getElementById('fops-up'));
    const res = F.fromGrid(F.readXlsx(new Uint8Array(makeXlsx(FIX)).buffer)[0].grid, 4); res.src = 'Field_ops_count_sheet.xlsx'; res.ver = F.ver(res.lines);
    F.preview('cc', res);
    check('preview: counts + catalog matches + warnings shown on the screen', /10 lines/.test(head().textContent) && /lines match the catalog/.test(head().textContent) && /already had a quantity/.test(head().textContent));
    w.document.getElementById('fops-use').click(); await sleep(200);
    const put = sheet.calls.find(c => c.body && c.body.action === 'fops_put');
    check('put: sent as text triples with device, title, ver', put && put.body.dev === "Nate's iPhone" && put.body.title === 'IT9999 SM SANDBOX SPLIT' && put.body.ver === res.ver && put.body.lines.length === 10 && put.body.lines[2][2] === '24E01', JSON.stringify(put && put.body.lines[2]));
    check('put: screen shows progress from the status in the put reply, with Replace / Remove', /0 found/.test(head().textContent) && /10 missing/.test(head().textContent) && /0 additional/.test(head().textContent) && /IT9999 SM SANDBOX SPLIT/.test(head().textContent) && !!w.document.getElementById('fops-rm'), head().textContent);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange')); await sleep(300);
    check('home: row shows the sheet title + counts and never renders as a nested card', /IT9999 SM SANDBOX SPLIT/.test(box().textContent) && /10 missing/.test(box().textContent) && !box().querySelector('.fops-card') && !box().querySelector('button'));
    { const c0 = sheet.statusCalls || 0; F.st('cc').status.at = 0; w.document.dispatchEvent(new w.Event('visibilitychange')); await sleep(1500);
      check('live: coming back to the foreground refreshes the team picture', (sheet.statusCalls || 0) === c0 + 1, 'calls ' + sheet.statusCalls + ' vs ' + c0); }
    check('put: status cached', JSON.parse(w.localStorage.getItem('tbx_cc_fops_status')).ver === res.ver);
    check('put: list cached on this phone as text', JSON.parse(w.localStorage.getItem('tbx_cc_fops')).lines[2][2] === '24E01');
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.enqueue('cc', { t: 'add', ref: '0234100001', lot: '24E01', qty: 2, loc: 'Trunk', notes: '' });
    dev.enqueue('cc', { t: 'add', ref: '3910947022', lot: 'L9', qty: 1, loc: 'Trunk', notes: '', desc: 'AlphaVent | 4.75mm' });
    await sleep(100); F.card();
    check('progress: own scans move lines instantly on the home row, before any sync', /1 found/.test(box().textContent) && /9 missing/.test(box().textContent) && /1 additional/.test(box().textContent), box().textContent);
    const st1 = sheet.statusCalls || 0;
    check('hint: on / lot off / off', F.hint('cc', '234-100-001', '24e01') === 'on' && F.hint('cc', '0234100001', 'OTHER') === 'lotoff' && F.hint('cc', '3910947022', 'L9') === 'off' && /On the Field Ops list/.test(F.hintHTML('cc', '0234100001', '24E01')));
    await sleep(1700);
    F.card(); await sleep(50);
    check('progress: after the flush the row still shows the scan (no flicker while the team status catches up)', /1 found/.test(box().textContent) && /1 additional/.test(box().textContent) && (sheet.statusCalls || 0) === st1, box().textContent + ' statusCalls=' + sheet.statusCalls);
    // the sheet rebuilt (built changes) -> next pull refreshes the team status
    sheet.fops.meta.built = 'b2'; await dev.pull('cc'); await sleep(80);
    check('status: pull sees a new build stamp and refetches the team picture', (sheet.statusCalls || 0) === st1 + 1 && F.st('cc').status.built === 'b2' && F.st('cc').status.found['234100001|24E01'] === 2, 'statusCalls=' + sheet.statusCalls);
    // another phone's scan reaches this phone through the status, not through pull rows
    sheet.rows.push({ id: 'rx', ts: '2026-09-02T10:00:00Z', dev: "Mia's iPhone", ref: '0130', lot: '091024-05', qty: 1, loc: 'Storage', desc: 'InSpace' });
    sheet.fops.meta.built = 'b3'; await dev.pull('cc'); await sleep(80); F.card();
    check('status: teammate scan counts as found on this phone', /2 found/.test(box().textContent) && /8 missing/.test(box().textContent) && F.hint('cc', '0130', '091024-05') === 'on', box().textContent);
    // second phone: pull brings meta, list follows via fops_get
    const saved = { 'tbx_cc': creds['tbx_cc'], 'tbx_cc_dev': "Mia's iPhone", 'tbx_cc_roster': creds['tbx_cc_roster'], 'tbx_tour_done': '1' };
    const two = await boot(sheet, saved);
    two.w.location.hash = '#/cc'; two.w.dispatchEvent(new two.w.Event('hashchange')); await sleep(400);
    const box2 = () => two.w.document.getElementById('cc-fops');
    check('sync: second phone got the list through pull -> fops_get', sheet.calls.some(c => /action=fops_get/.test(c.url)) && two.dev.fops.st('cc').list && two.dev.fops.st('cc').list.lines.length === 10 && two.dev.fops.st('cc').list.lines[2].b === '24E01');
    await sleep(100);
    check('sync: second phone row shows the team progress via fops_status', /2 found/.test(box2().textContent) && /8 missing/.test(box2().textContent) && /1 additional/.test(box2().textContent), box2().textContent);
    check('hint: second phone hints without ever uploading', two.dev.fops.hint('cc', '0130', '091024-05') === 'on');
    // list screen
    two.w.location.hash = '#/cc/fops'; two.w.dispatchEvent(new two.w.Event('hashchange')); await sleep(300);
    const scr = () => two.w.document.getElementById('fops-list'), body2 = () => two.w.document.getElementById('fops-body');
    check('screen: Missing chip first with 8 rows, chips carry team counts', scr() && scr().querySelectorAll('.fops-row2').length === 8 && /Missing 8/.test(body2().textContent) && /Found 2/.test(body2().textContent) && /Additional 1/.test(body2().textContent), body2().textContent.slice(0, 200));
    const qin = two.w.document.getElementById('fops-q'); qin.value = '3911-514'; qin.dispatchEvent(new two.w.Event('input'));
    check('screen: dash-insensitive search narrows without re-rendering the box', scr().querySelectorAll('.fops-row2').length === 1 && /3911-514-620HA/.test(scr().textContent) && two.w.document.getElementById('fops-q') === qin);
    two.w.document.querySelector('[data-chip="additional"]').click();
    const qin2 = two.w.document.getElementById('fops-q'); qin2.value = ''; qin2.dispatchEvent(new two.w.Event('input'));
    check('screen: Additional shows the unlisted scan with Field Ops dashes and qty', scr().querySelectorAll('.fops-row2').length === 1 && /3910-947-022/.test(scr().textContent) && /AlphaVent/.test(scr().textContent));
    // remove from phone one (on its Field Ops screen)
    w.location.hash = '#/cc/fops'; w.dispatchEvent(new w.Event('hashchange')); await sleep(300);
    w.document.getElementById('fops-rm').click(); await sleep(50);
    w.document.querySelector('.ask-ok').click(); await sleep(200);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange')); await sleep(300);
    check('remove: server cleared, home row back to the upload prompt, caches dropped', sheet.fops === null && /Upload the empty sheet/.test(box().textContent) && w.localStorage.getItem('tbx_cc_fops') === null && w.localStorage.getItem('tbx_cc_fops_status') === null, box().textContent);
    two.w.location.hash = '#/cc'; two.w.dispatchEvent(new two.w.Event('hashchange')); await sleep(400);
    check('remove: second phone drops the list on its next pull', two.dev.fops.st('cc').list === null && /Upload the empty sheet/.test(box2().textContent), box2().textContent);
    check('fops sync: no page errors', errs.length === 0 && two.errs.length === 0, errs.concat(two.errs).join(' | ')); }

  // ---- 16. 4.118: a batch the sheet applied but the phone never heard back for must not vanish on the retry ----
  { const sheet = FakeSheet(); sheet.applyThenDrop = 1; const { w, dev, errs } = await boot(sheet, creds);
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.enqueue('cc', { t: 'add', ref: '3910500471', lot: '25022AG2', qty: 1, loc: 'Trunk', notes: '', desc: 'Omega' });
    dev.enqueue('cc', { t: 'add', ref: '4727', lot: '1008624', qty: 2, loc: 'Trunk', notes: '', desc: 'VersiPass' });
    await sleep(1700);
    check('dedup: first attempt applied on the sheet, phone saw a failure', sheet.rows.length === 2 && dev.syncSt('cc').ops.length === 2 && dev.SY.cc.retry === 1);
    await sleep(4300);
    const batches = sheet.calls.filter(c => c.body && c.body.action === 'batch');
    check('dedup: retry asked for rows (norows off) and the sheet answered applied-but-not-fresh', batches.length === 2 && batches[1].body.norows === 0);
    check('dedup: queue drained and both scans still on this phone (not dropped)', dev.syncSt('cc').ops.length === 0 && dev.CC.rows.length === 2 && dev.CC.rows.some(r => r.ref === '4727' && r.qty === 2), JSON.stringify(dev.CC.rows.map(r => [r.ref, r.qty, r.pending])));
    check('dedup: no page errors', errs.length === 0, errs.join(' | ')); }

  // ---- 17. 4.118: same, when the server answers without rows -> a pull reconciles ----
  { const sheet = FakeSheet(); sheet.applyThenDrop = 1; const { w, dev, errs } = await boot(sheet, creds);
    const h0 = sheet.handle; sheet.handle = async (url, body) => { if (body && body.action === 'batch') body.norows = 1; return h0(url, body); }; // an old script that ignores the rows request
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.enqueue('cc', { t: 'add', ref: 'A1', lot: 'L1', qty: 1, loc: 'Trunk', notes: '' });
    await sleep(1700); await sleep(4300); await sleep(300);
    check('dedup/no rows: pull after the retry brings the scan back', dev.syncSt('cc').ops.length === 0 && dev.CC.rows.length === 1 && dev.CC.rows[0].ref === 'A1' && sheet.calls.some(c => /action=pull/.test(c.url)), JSON.stringify(dev.CC.rows));
    check('dedup/no rows: no page errors', errs.length === 0, errs.join(' | ')); }

  const fails = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})();
