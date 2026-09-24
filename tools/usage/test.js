// Usage core + hub tests. The hub (usage-hub.js + usage-main.js) runs in a vm with fake Apps Script services,
// the way the standalone "TBX Usage Hub" project runs it.
//   node tools/usage/test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const U = require('./usage-core.js');
const results = []; const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined && !ok ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300) : '')); };
const H = 3600000, DAY = 86400000;

// ---------- Eastern time ----------
{
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const ref = (ms) => { const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; }); return [p.year + '-' + p.month + '-' + p.day, +p.hour]; };
  let bad = [];
  for (let ms = Date.UTC(2025, 0, 1); ms < Date.UTC(2029, 0, 1); ms += H + 17 * 60000) { // every ~77 min for 4 years
    const [d, h] = ref(ms);
    if (U.etDay(ms) !== d || U.etHour(ms) !== h) { bad.push([new Date(ms).toISOString(), d, h, U.etDay(ms), U.etHour(ms)]); if (bad.length > 5) break; }
  }
  check('Eastern day/hour match Intl for 4 years (incl. every DST switch)', bad.length === 0, bad);
  const edges = ['2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z', '2026-11-01T05:59:59Z', '2026-11-01T06:00:00Z', '2027-03-14T07:00:00Z'];
  check('DST edges', edges.every(s => { const ms = Date.parse(s), [d, h] = ref(ms); return U.etDay(ms) === d && U.etHour(ms) === h; }));
  let badStart = [];
  for (let ms = Date.UTC(2026, 0, 1, 15); ms < Date.UTC(2028, 0, 1); ms += DAY) {
    const s = U.etDayStart(ms), [d0, h0] = ref(s), [dm] = ref(s - 1);
    if (d0 !== U.etDay(ms) || h0 !== 0 || dm === d0) badStart.push(new Date(ms).toISOString());
  }
  check('etDayStart = Eastern midnight every day for 2 years', badStart.length === 0, badStart.slice(0, 5));
  const now = Date.parse('2026-09-23T15:00:00Z');
  check('windowStart(1) = today 00:00 ET', U.windowStart(now, 1) === Date.parse('2026-09-23T04:00:00Z'));
  check('windowStart(7) = 6 days back', U.windowStart(now, 7) === Date.parse('2026-09-17T04:00:00Z'));
  check('windowStart(30) across no DST', U.windowStart(now, 30) === Date.parse('2026-08-25T04:00:00Z'));
  check('windowStart across the November switch', U.windowStart(Date.parse('2026-11-03T15:00:00Z'), 7) === Date.parse('2026-10-28T04:00:00Z'));
}

// ---------- ingest validation ----------
{
  const now = Date.parse('2026-09-23T15:00:00Z');
  const r = U.rowsFromBatch({ d: 'abcde12345', e: [
    [now - 1000, 'open', 'boot', 'iPhone|app|4.142', 'sess0001'],
    [now - 900, 'card', '3910500580', '', 'sess0001'],
    [now - 800, 'search', '=HYPERLINK("x")', '0', 'sess0001'],
    [now - 700, 'bogus', 'x', '', 'sess0001'],
    [now + 10 * 60000, 'view', 'home', '', 'sess0001'],
    [now - 5 * DAY, 'view', 'bo', '', 'BAD SESSION'],
    'not an event',
    [now - 600, 'scan', 'a'.repeat(200), 'card', 'sess0001'],
    [now - 500, 'search', 'line\nbreak\ttab', '3', 'sess0001']
  ] }, now);
  check('ingest: accepts a valid batch', r.ok && r.rows.length === 7, r);
  check('ingest: unknown types and junk dropped', !r.rows.some(x => x[3] === 'bogus'));
  check('ingest: row shape = ts, device, session, type, key, extra', r.rows[0].join('|') === new Date(now - 1000).toISOString() + '|abcde12345|sess0001|open|boot|iPhone|app|4.142');
  check('ingest: a leading "=" is stripped (no formulas in the sheet)', r.rows[2][4] === 'HYPERLINK("x")', r.rows[2][4]);
  check('ingest: future time → received time', r.rows[3][0] === new Date(now).toISOString(), r.rows[3]);
  check('ingest: old time clamped to received − 2 days, bad session blanked', r.rows[4][0] === new Date(now - 2 * DAY).toISOString() && r.rows[4][2] === '', r.rows[4]);
  check('ingest: keys capped at 80 chars', r.rows[5][4].length === 80);
  check('ingest: control characters collapsed', r.rows[6][4] === 'line break tab', r.rows[6][4]);
  check('ingest: bad device id rejected', !U.rowsFromBatch({ d: 'Nate', e: [] }, now).ok && !U.rowsFromBatch({ d: 'ABCDE12345', e: [] }, now).ok);
  check('ingest: missing events rejected', !U.rowsFromBatch({ d: 'abcde12345' }, now).ok);
  const big = { d: 'abcde12345', e: Array.from({ length: 500 }, (_, i) => [now - i, 'ping', '', '', 'sess0001']) };
  check('ingest: at most 200 events per batch', U.rowsFromBatch(big, now).rows.length === 200);
}

// ---------- live + stats on synthetic data ----------
function mk(now) {
  const rows = [], iso = (ms) => new Date(ms).toISOString();
  const add = (ms, d, s, ty, k, x) => rows.push([iso(ms), d, s, ty, k || '', x || '']);
  const t0 = U.etDayStart(now);
  // yesterday: device A
  add(t0 - 3 * H, 'aaaaaaaaaa', 's1', 'open', 'boot', 'iPhone|app|4.141');
  add(t0 - 3 * H + 1000, 'aaaaaaaaaa', 's1', 'card', '3910500580');
  add(t0 - 3 * H + 2000, 'aaaaaaaaaa', 's1', 'search', 'nanotack', '12');
  // today: A (app), B (browser), admin C
  add(t0 + 8 * H, 'aaaaaaaaaa', 's2', 'open', 'boot', 'iPhone|app|4.142');
  add(t0 + 8 * H + 1000, 'aaaaaaaaaa', 's2', 'view', 'home');
  add(t0 + 8 * H + 2000, 'aaaaaaaaaa', 's2', 'search', 'zzkx', '0');
  add(t0 + 8 * H + 3000, 'aaaaaaaaaa', 's2', 'search', 'iconix', '31');
  add(t0 + 8 * H + 4000, 'aaaaaaaaaa', 's2', 'card', '3910500580');
  add(t0 + 8 * H + 5000, 'aaaaaaaaaa', 's2', 'scan', '3910500580', 'card');
  add(t0 + 8 * H + 6000, 'aaaaaaaaaa', 's2', 'scan', '00887868123456', 'unknown');
  add(t0 + 8 * H + 7000, 'aaaaaaaaaa', 's2', 'fav', '3910500580', 'on');
  add(t0 + 8 * H + 8000, 'aaaaaaaaaa', 's2', 'share', '3910500580', 'img');
  add(now - 3 * 60000, 'bbbbbbbbbb', 's3', 'open', 'boot', 'Android|web|4.142');
  add(now - 2 * 60000, 'bbbbbbbbbb', 's3', 'card', 'CAT00229');
  add(now - 90000, 'bbbbbbbbbb', 's3', 'search', 'zzkx', '0');
  add(now - 60000, 'bbbbbbbbbb', 's3', 'scan', '234020123', 'nocard');
  add(now - 30000, 'bbbbbbbbbb', 's3', 'error', "Cannot read properties of null (reading 'x')", 'app-4.142.js:120');
  add(now - 20000, 'bbbbbbbbbb', 's3', 'ping');
  add(now - 10000, 'cccccccccc', 's4', 'open', 'boot', 'iPhone|app|4.142');
  add(now - 5000, 'cccccccccc', 's4', 'card', '0279401100');
  return rows;
}
{
  const now = Date.parse('2026-09-23T18:30:00Z'); // 14:30 EDT
  const rows = mk(now);
  const L = U.live(rows, { now, excl: { cccccccccc: 1 } });
  check('live: 2 devices today (admin excluded), 1 on now', L.today.devices === 2 && L.now.n5 === 1 && L.now.list[0].d === 'bbbbbbbbbb', L.today);
  check('live: sessions / cards / searches / zero / scans / errors today', L.today.sessions === 2 && L.today.cards === 2 && L.today.searches === 3 && L.today.zero === 2 && L.today.scans === 3 && L.today.errors === 1, L.today);
  check('live: yesterday not in today', L.today.opens === 2);
  check('live: hours by Eastern hour (8 am and 2 pm)', L.hours[8] === 1 && L.hours[14] === 1 && L.hours.reduce((a, b) => a + b, 0) === 2 && L.hourNow === 14, L.hours);
  check('live: recent feed newest first, no pings, includes yesterday', L.recent[0][2] === 'error' && !L.recent.some(r => r[2] === 'ping') && L.recent[L.recent.length - 1][3] === 'boot', L.recent.slice(0, 3));
  check('live: device info for the feed', L.info.aaaaaaaaaa === 'iPhone|app|4.142' && L.info.bbbbbbbbbb === 'Android|web|4.142');
  check('live: now list carries the last thing done (not the ping)', L.now.list[0].last[0] === 'error', L.now.list[0]);
  const Li = U.live(rows, { now, excl: {} });
  check('live: incl counts the admin device', Li.today.devices === 3 && Li.now.n5 === 2);

  const S = U.stats(rows, { now, days: 7, excl: { cccccccccc: 1 } });
  check('stats: 7 day keys ending today', S.dayKeys.length === 7 && S.dayKeys[6] === '2026-09-23' && S.perDay.length === 7, S.dayKeys);
  check('stats: devices/sessions in window', S.devices === 2 && S.sessions === 3, [S.devices, S.sessions]);
  check('stats: per-day buckets', S.perDay[5].devices === 1 && S.perDay[6].devices === 2 && S.perDay[6].cards === 2, S.perDay.slice(5));
  check('stats: top card counts views + devices', S.topCards[0].k === '3910500580' && S.topCards[0].n === 2 && S.topCards[0].dev === 1, S.topCards);
  check('stats: searches normalised and ranked', S.topSearches[0].k === 'zzkx' && S.topSearches[0].n === 2 && S.topSearches[0].dev === 2, S.topSearches);
  check('stats: zero-result list', S.zeroSearches.length === 1 && S.zeroSearches[0].k === 'zzkx');
  check('stats: scans by outcome + no-card list', S.scans.card === 1 && S.scans.unknown === 1 && S.scans.nocard === 1 && S.noCard.length === 2 && S.noCard.some(x => x.k === '234020123' && x.kind === 'nocard'), [S.scans, S.noCard]);
  check('stats: favs / shares', S.favs.on === 1 && S.topFavs[0].k === '3910500580' && S.shares.img === 1);
  check('stats: platforms + versions from the latest open', S.platforms.some(p => p.k === 'iPhone app' && p.n === 1) && S.platforms.some(p => p.k === 'Android browser') && S.versions.some(v => v.k === '4.142' && v.n === 2), [S.platforms, S.versions]);
  check('stats: errors', S.errors.length === 1 && /reading 'x'/.test(S.errors[0].k) && S.errors[0].at === 'app-4.142.js:120');
  check('stats: device list newest first', S.deviceList[0].d === 'bbbbbbbbbb' && S.deviceList[1].sess === 2, S.deviceList);
  const S1 = U.stats(rows, { now, days: 1, excl: {} });
  check('stats: today only (incl admin)', S1.devices === 3 && S1.dayKeys.length === 1 && S1.counts.card === 3, [S1.devices, S1.counts]);
  const search2 = U.stats(rows.concat([[new Date(now - 1000).toISOString(), 'bbbbbbbbbb', 's3', 'search', 'zzkx', '4']]), { now, days: 7, excl: {} });
  check('stats: a later successful try clears a zero-result term', !search2.zeroSearches.some(x => x.k === 'zzkx'));
}

// ---------- hub in a vm with fake Apps Script services ----------
function fakeGas() {
  const props = {}, cache = {}, sheets = {}, logs = [];
  let nid = 0;
  function Sheet(name) {
    let data = [], maxRows = 1000, fmt = {};
    const sh = {
      name, frozen: 0,
      getLastRow: () => data.length,
      getMaxRows: () => maxRows,
      getMaxColumns: () => 26,
      insertRowsAfter: (r, n) => { maxRows += n; },
      deleteRows: (r, n) => { data.splice(r - 1, n); maxRows -= n; },
      setFrozenRows: (n) => { sh.frozen = n; },
      getRange: (r, c, nr, nc) => {
        nr = nr || 1; nc = nc || 1;
        if (r + nr - 1 > maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        const rg = {
          setNumberFormat: (f) => { for (let i = r; i < r + nr; i++) fmt[i] = f; return rg; },
          setFontWeight: () => rg,
          setValues: (vals) => {
            if (vals.length !== nr || vals.some(v => v.length !== nc)) throw new Error('dimension mismatch');
            vals.forEach((row, i) => {
              const rr = r + i; while (data.length < rr) data.push(new Array(6).fill(''));
              // Sheets auto-parses dates / numbers in cells that are not plain text
              data[rr - 1] = row.map(v => (fmt[rr] === '@') ? String(v) : (/^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : (/^\d+(\.\d+)?(E\d+)?$/i.test(v) ? Number(v) : v)));
            });
            return rg;
          },
          getValues: () => { const out = []; for (let i = r; i < r + nr; i++) out.push((data[i - 1] || new Array(nc).fill('')).slice(c - 1, c - 1 + nc)); return out; }
        };
        return rg;
      },
      _data: () => data
    };
    return sh;
  }
  function Book(name) {
    const id = 'sheet' + (++nid), tabs = { Sheet1: Sheet('Sheet1') };
    const ss = {
      getId: () => id, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit', name,
      getSheetByName: (n) => tabs[n] || null,
      insertSheet: (n) => (tabs[n] = Sheet(n)),
      deleteSheet: (s) => { delete tabs[s.name]; },
      getSheets: () => Object.values(tabs)
    };
    sheets[id] = ss; return ss;
  }
  const ctx = {
    console, JSON, Date, Math, String, Number, Array, Object, RegExp, Error,
    Logger: { log: (s) => logs.push(String(s)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    SpreadsheetApp: { create: (n) => Book(n), openById: (id) => { if (!sheets[id]) throw new Error('no sheet ' + id); return sheets[id]; } },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { if (String(v).length > 100000) throw new Error('too big'); cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) }
  };
  ctx.globalThis = ctx;
  return { ctx: vm.createContext(ctx), props, cache, sheets, logs };
}
{
  const G = fakeGas();
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'usage-core.js'), 'utf8'), G.ctx, { filename: 'UsageCore.gs' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'usage-hub.js'), 'utf8'), G.ctx, { filename: 'Usage.gs' });
  const call = (p) => JSON.parse(G.ctx.usageHandle(p).getContent());
  const setup = G.ctx.usageSetup();
  const wk = G.props.USAGE_WKEY, ak = G.props.USAGE_AKEY;
  check('hub: setup makes the sheet + keys', /spreadsheets/.test(setup.sheet) && wk.length === 24 && ak.length === 32 && G.logs.some(l => /USAGE/.test(l)));
  const sh = G.ctx.SpreadsheetApp.openById(G.props.USAGE_SHEET_ID).getSheetByName('Events');
  check('hub: Events header, Sheet1 removed', sh.getLastRow() === 1 && sh._data()[0].join(',') === 'ts,device,session,type,key,extra' && !G.ctx.SpreadsheetApp.openById(G.props.USAGE_SHEET_ID).getSheetByName('Sheet1'));
  const setup2 = G.ctx.usageSetup();
  check('hub: setup is idempotent (same keys, same sheet)', setup2.writeKey === wk && setup2.adminKey === ak && setup2.sheet === setup.sheet);
  const now = Date.now();
  const ev = (d, b, list, a) => call({ action: 'u_ev', key: wk, d, b, a: a || 0, e: list });
  check('hub: bad write key refused', call({ action: 'u_ev', key: 'nope', d: 'aaaaaaaaaa', b: 'batch0000001', e: [] }).err === 'key');
  check('hub: bad batch id refused', call({ action: 'u_ev', key: wk, d: 'aaaaaaaaaa', b: 'x', e: [] }).err === 'batch');
  const r1 = ev('aaaaaaaaaa', 'batch0000001', [[now - 5000, 'open', 'boot', 'iPhone|app|4.142', 'sess0001'], [now - 4000, 'card', '24E01', '', 'sess0001']]);
  check('hub: batch stored', r1.ok && r1.n === 2 && sh.getLastRow() === 3, r1);
  check('hub: cells are plain text (24E01 stays 24E01, ts stays ISO)', sh._data()[2][4] === '24E01' && typeof sh._data()[2][0] === 'string');
  const r2 = ev('aaaaaaaaaa', 'batch0000001', [[now - 5000, 'open', 'boot', 'x', 'sess0001']]);
  check('hub: repeated batch id acknowledged, not stored twice', r2.ok && r2.dup && sh.getLastRow() === 3, r2);
  ev('cccccccccc', 'batch0000002', [[now - 3000, 'open', 'boot', 'Mac|web|4.142', 'sess0009'], [now - 2000, 'view', 'usage', '', 'sess0009']], 1);
  check('hub: a=1 marks the device as admin', G.props.USAGE_ADMIN_DEVICES === 'cccccccccc');
  check('hub: live needs the admin key', call({ action: 'u_live', key: wk }).err === 'key' && call({ action: 'u_stats', key: 'x' }).err === 'key');
  const L = call({ action: 'u_live', key: ak });
  check('hub: live excludes admin devices by default', L.ok && L.today.devices === 1 && L.now.n5 === 1, L.today);
  check('hub: live is cached briefly', G.cache['ul:0'] && JSON.parse(G.cache['ul:0']).asOf === L.asOf);
  const Li = call({ action: 'u_live', key: ak, incl: 1 });
  check('hub: incl=1 counts them', Li.today.devices === 2);
  const S = call({ action: 'u_stats', key: ak, days: 30 });
  check('hub: stats 30 days', S.ok && S.days === 30 && S.dayKeys.length === 30 && S.topCards[0].k === '24E01', S.topCards);
  check('hub: odd days value falls back to 7', call({ action: 'u_stats', key: ak, days: 12 }).days === 7);
  check('hub: ping', call({ action: 'u_ping' }).ok);
  check('hub: unknown action', call({ action: 'u_nope' }).err === 'action');
  // grow past the initial 1000-row grid and past one read chunk
  let bi = 3; const big = [];
  const base = Math.max(now - 20 * 60000, U.etDayStart(now) + 1000);
  for (let i = 0; i < 9000; i++) big.push([base + i * 100, i % 7 ? 'card' : 'search', i % 7 ? 'SKU' + (i % 40) : 'term' + (i % 9), i % 7 ? '' : String(i % 3), 'sess0002']);
  for (let i = 0; i < big.length; i += 200) ev('bbbbbbbbbb', 'batch' + String(bi++).padStart(7, '0'), big.slice(i, i + 200));
  check('hub: 9,000 more events appended across grid growth', sh.getLastRow() === 3 + 2 + 9000, sh.getLastRow());
  delete G.cache['us:1:0'];
  const t1 = Date.now(), S1 = call({ action: 'u_stats', key: ak, days: 1 }), ms = Date.now() - t1;
  check('hub: stats read across chunks (every event counted)', S1.counts.card + S1.counts.search === 1 + 9000 && S1.devices === 2, [S1.counts, S1.devices]);
  check('hub: stats compute time for ~9k rows (vm, fake sheet) < 1.5 s', ms < 1500, ms + ' ms');
  const Lr = G.ctx.uRead_(Date.now() - 1000, 50);
  check('hub: uRead_ honours minRows for the feed', Lr.length === 50 && Lr[49][0] >= Lr[0][0], Lr.length);
  const errOut = JSON.parse(G.ctx.usageHandle({ action: 'u_stats', key: ak, days: 7, fresh: 1, get incl() { throw new Error('boom'); } }).getContent());
  check('hub: unexpected errors come back as {ok:false, err:server}', errOut.ok === false && errOut.err === 'server', errOut);
}

// ---------- the whole hub project as Apps Script loads it: UsageCore.gs + Usage.gs + Code.gs in one global scope ----------
{
  const G = fakeGas();
  const files = [['usage-core.js', 'UsageCore.gs'], ['usage-hub.js', 'Usage.gs'], ['usage-main.js', 'Code.gs']];
  const names = {}, dupes = [];
  files.forEach(([f, n]) => {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    (src.match(/^(?:function\s+([A-Za-z0-9_$]+)|var\s+([A-Za-z0-9_$]+))/gm) || []).forEach(m => {
      const k = m.replace(/^(function|var)\s+/, '');
      if (names[k] && names[k] !== n) dupes.push(k + ' (' + names[k] + ' + ' + n + ')'); names[k] = n;
    });
    vm.runInContext(src, G.ctx, { filename: n });
  });
  check('project: no global name collisions across UsageCore/Usage/Code', dupes.length === 0, dupes);
  G.ctx.usageSetup();
  const post = (o) => JSON.parse(G.ctx.doPost({ postData: { contents: JSON.stringify(o) } }).getContent());
  check('project: doPost JSON body reaches usageHandle', post({ action: 'u_ping' }).v === 1);
  check('project: doGet ?action=u_ping answers', JSON.parse(G.ctx.doGet({ parameter: { action: 'u_ping' } }).getContent()).ok === true);
  check('project: doPost with a broken body falls back to the query string', JSON.parse(G.ctx.doPost({ postData: { contents: '{nope' }, parameter: { action: 'u_ping' } }).getContent()).ok === true);
  const wk = G.props.USAGE_WKEY, ak = G.props.USAGE_AKEY, now = Date.now();
  check('project: ingest through doPost', post({ action: 'u_ev', key: wk, d: 'abcdefghij', b: 'projbatch001', e: [[now - 1000, 'card', '3910500580', '', 'sess0001']] }).n === 1);
  check('project: live through doPost', post({ action: 'u_live', key: ak }).today.cards === 1);
}

const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
