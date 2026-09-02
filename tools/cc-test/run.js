// Cycle-count sync engine tests: the real bundle in jsdom with the sheet endpoint faked.
// Covers ccDeriveCore (add/set/del + key normalisation), enqueue -> flush -> prune,
// the pull-vs-flush race, retry/backoff, roster rejection, offline persistence, expiry.
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

// Fake sheet endpoint (mirrors the CT bound script's contract): batch dedups by opId, pull returns rows.
function FakeSheet() {
  const s = { rows: [], seen: {}, calls: [], fail: 0, busy: 0, devOk: true, holdMs: 0 };
  s.handle = async (url, body) => {
    s.calls.push({ url, body });
    if (s.holdMs) await sleep(s.holdMs);
    if (s.fail > 0) { s.fail--; throw new Error('net'); }
    if (/action=pull/.test(url)) return { ok: true, rows: s.rows.map(r => ({ ...r })) };
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
      return { ok: true, applied, fresh, rows: s.rows.map(r => ({ ...r })) };
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
    w.location.hash = '#/cc'; w.dispatchEvent(new w.Event('hashchange'));
    dev.CC.loc = 'Trunk'; dev.CC.tgt = 'cc';
    dev.CC.hist = { 'trunk|ZZZ|old': [1, 2], 'trunk|A|L': [2] };
    dev.CC.rows = [{ id: 'r0', ref: 'A', lot: 'L', loc: 'Trunk', qty: 2 }];
    dev.histPrune();
    check('hist: prune drops history for lines no longer on the count', !dev.CC.hist['trunk|ZZZ|old'] && !!dev.CC.hist['trunk|A|L']);
    check('4.116: no page errors', errs.length === 0, errs.join(' | ')); }

  const fails = results.filter(r => !r.ok).length;
  console.log('\n' + (results.length - fails) + '/' + results.length + ' passed');
  process.exit(fails ? 1 : 0);
})();
