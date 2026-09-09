// Backorder core tests: parser against the real forwarded email, seed + snapshot rules, API shape.
// Fixtures are Stryker-internal and gitignored (tools/bo/fixtures/); the suite skips when they are absent.
//   node tools/bo/test.js
const fs = require('fs'), path = require('path');
const C = require('./bo-core.js');
const FX = path.join(__dirname, 'fixtures');
const results = [];
const check = (n, ok, d) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  — ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : '')); };

// ---- unit: text + subject helpers ----
check('decode: nbsp/amp/numeric', C.decode('a&nbsp;b &amp; c &#39;d&#x27; &ndash; e') === "a b & c 'd' – e", C.decode('a&nbsp;b &amp; c &#39;d&#x27; &ndash; e'));
check('textOf: strips nested spans, collapses whitespace', C.textOf('<td><span style="x">FLOWPORT&nbsp;II  <b>CANNULA</b></span>\r\n</td>') === 'FLOWPORT II CANNULA');
check('weekOf: 9.7.26', C.parseWeekOf('Fw: Inventory Report: Week of 9.7.26') === '2026-09-07');
check('weekOf: 10/12/2026 + FW:', C.parseWeekOf('FW: Inventory Report: Week of 10/12/2026') === '2026-10-12');
check('weekOf: garbage -> empty', C.parseWeekOf('Re: lunch') === '');
check('isReportSubject', C.isReportSubject('Fwd: Inventory Report: Week of 9.14.26') && !C.isReportSubject('Inventory count sheet'));
check('keyZ: zero + dash tolerant', C.keyZ('0234-020-235') === '234020235' && C.keyZ('cat02438') === 'CAT02438');

// ---- parser: synthetic edge cases ----
const synth = '<table><tr><td colspan=5>Inventory Controlled Products - Subject to Availability</td></tr>' +
  '<tr><td>Segment</td><td>Product line</td><td>Item number</td><td>Item description</td><td>Message to the Sales Force</td></tr>' +
  '<tr><td>Hip</td><td>FlowPort</td><td>CAT02438</td><td>FLOWPORT II</td><td>Restock&nbsp;next week.</td></tr>' +
  '<tr><td></td><td></td><td></td><td></td><td></td></tr>' +
  '<tr><td>New BOs since last report</td><td></td></tr>' +
  '<tr><td>Segment</td><td>Product line</td><td>Item number</td><td>Item description</td></tr>' +
  '<tr><td>Knee</td><td>ISI</td><td>234118084</td><td>ISI TUNNEL NOTCHER</td></tr>' +
  '<tr><td>Items cleared since last report</td></tr>' +
  '<tr><td>Segment</td><td>Product line</td><td>Item number</td><td>Item description</td></tr>' +
  '<tr><td>Hip</td><td>FlowPort</td><td>CAT02438</td><td>FLOWPORT II</td></tr></table>';
const ps = C.parseReportHtml(synth);
check('synthetic: three sections in one table', ps.sections.join(',') === 'controlled,newBOs,cleared', ps.sections);
check('synthetic: rows + message decoded', ps.controlled.length === 1 && ps.controlled[0].msg === 'Restock next week.' && ps.newBOs.length === 1 && ps.cleared.length === 1);
check('synthetic: blank rows ignored', ps.controlled.every(r => r.sku));
const noCtl = C.parseReportHtml('<table><tr><td>New BOs since last report</td></tr><tr><td>Item number</td></tr><tr><td>1</td></tr></table>');
check('validate: missing controlled table is an error', C.validateParsed(noCtl).length === 1, C.validateParsed(noCtl));

// ---- parser: the real forwarded email ----
const fxHtml = path.join(FX, 'report-2026-09-07.html');
let parsed = null;
if (!fs.existsSync(fxHtml)) { console.log('SKIP  fixture report-2026-09-07.html not present'); }
else {
  const html = fs.readFileSync(fxHtml, 'utf8');
  parsed = C.parseReportHtml(html);
  check('email: sections found', parsed.sections.join(',') === 'controlled,newBOs,cleared', parsed.sections);
  check('email: 10 controlled / 11 new BOs / 11 cleared', parsed.controlled.length === 10 && parsed.newBOs.length === 11 && parsed.cleared.length === 11, [parsed.controlled.length, parsed.newBOs.length, parsed.cleared.length]);
  check('email: no validation errors', C.validateParsed(parsed).length === 0, C.validateParsed(parsed));
  const c0 = parsed.controlled[0];
  check('email: first controlled row', c0.sku === '485840000' && c0.seg === 'Arthro Shaver' && c0.line === 'CrossBlade' && /XL ROUND DIAMOND BUR/.test(c0.desc) && /limited to 60 days/.test(c0.msg), c0);
  const samurai = parsed.controlled.find(r => r.sku === 'CAT02421');
  check('email: long message intact', samurai && /replaced by CAT02423/.test(samurai.msg) && /manufacturing transfer/.test(samurai.msg));
  check('email: new BO skus', parsed.newBOs.map(r => r.sku).join(',') === 'CAT00776,295725130,295725140,295727100,295800000,234118007,234118009,234118084,234118238,3910500742,86PS1000S', parsed.newBOs.map(r => r.sku));
  check('email: cleared skus', parsed.cleared.map(r => r.sku).join(',') === '375035302,375628000,CAT02974,CAT02438,295727202,234020235,234020083,3910947205,3911723522,3911000502,3910500472', parsed.cleared.map(r => r.sku));
  check('email: CAT02438 is both controlled and cleared', parsed.controlled.some(r => r.sku === 'CAT02438') && parsed.cleared.some(r => r.sku === 'CAT02438'));
  check('email: no cell keeps nbsp or tags', JSON.stringify(parsed).indexOf(' ') < 0 && JSON.stringify(parsed).indexOf('<') < 0);
  check('email: highspot link', /^https:\/\/stryker\.highspot\.com\/items\//.test(parsed.highspot), parsed.highspot);
  check('email: signature/phone not captured anywhere', JSON.stringify(parsed).indexOf('978 846') < 0 && JSON.stringify(parsed).indexOf('303 345') < 0);
}

// ---- snapshot rules: seed + email is a no-op; deltas apply; re-ingest is idempotent ----
const fxSeed = path.join(FX, 'seed-2026-09-09.json');
if (!fs.existsSync(fxSeed) || !parsed) { console.log('SKIP  seed fixture not present'); }
else {
  const seed = JSON.parse(fs.readFileSync(fxSeed, 'utf8'));
  const st0 = C.seedState(seed);
  check('seed: 77 active, 11 cleared', st0.backorders.length === 77 && st0.cleared.length === 11, [st0.backorders.length, st0.cleared.length]);
  check('seed: dates + notes carried', st0.backorders.filter(r => r.clearDate).length === 20 && st0.backorders.filter(r => r.clearText).length === 1 && st0.backorders.filter(r => r.note).length === 18);
  const r1 = C.applyReport(st0, parsed, { weekOf: '2026-09-07', at: '2026-09-09T18:00:00Z', source: 'email' });
  const skus = s => s.backorders.map(r => r.k).sort().join(',');
  check('seed+email: active list unchanged (new BOs already in, cleared already out)', skus(r1.state) === skus(st0), [r1.state.backorders.length, r1.counts]);
  check('seed+email: CAT00776 keeps its clear date + note', (() => { const r = r1.state.backorders.find(x => x.sku === 'CAT00776'); return r && r.clearDate === '2026-09-15' && /September 14/.test(r.note) && r.since === '2026-09-07' && r.asOf === '2026-09-09'; })());
  check('seed+email: controlled = 10 with messages', r1.state.controlled.length === 10 && r1.state.controlled.every(r => r.msg) && r1.state.controlled.every(r => r.since === '2026-09-07'));
  check('seed+email: cleared still 11 (same week replaced, not duplicated)', r1.state.cleared.length === 11 && r1.state.cleared.every(r => r.clearedOn === '2026-09-07'));
  check('seed+email: log has ctl_add for each controlled, no bo_new', r1.events.filter(e => e.event === 'ctl_add').length === 10 && !r1.events.some(e => e.event === 'bo_new'), r1.events.length);
  // re-ingest the same message
  const r2 = C.applyReport(r1.state, parsed, { weekOf: '2026-09-07', at: '2026-09-09T18:30:00Z', source: 'email' });
  check('re-ingest: idempotent', skus(r2.state) === skus(r1.state) && r2.state.cleared.length === 11 && r2.state.controlled.length === 10 && r2.events.length === 0, r2.events);
  // a following week: one new BO, one cleared (CAT00776), controlled list shrinks by one and one message changes
  const wk2 = { controlled: parsed.controlled.slice(1).map(r => r.sku === 'CAT02438' ? Object.assign({}, r, { msg: 'Restocked; releasing orders.' }) : r),
    newBOs: [{ sku: '0234020117', desc: 'RATCHETING DRIVER HANDLE', seg: 'Shoulder Surgical Implants', line: 'Omega Instruments' }],
    cleared: [{ sku: 'CAT00776', desc: 'FLOWPORT II CANNULA WITH OBTURATOR', seg: 'Hip Surgical Implants', line: 'FlowPort Disposables' }], sections: ['controlled', 'newBOs', 'cleared'], highspot: '' };
  const r3 = C.applyReport(r1.state, wk2, { weekOf: '2026-09-14', at: '2026-09-16T18:00:00Z', source: 'email' });
  check('week 2: +1 new (since 9/14, no date) −1 cleared', r3.state.backorders.length === 77 && !r3.state.backorders.some(r => r.sku === 'CAT00776') && (() => { const n = r3.state.backorders.find(r => r.sku === '0234020117'); return n && n.since === '2026-09-14' && n.clearDate === '' && n.source === 'email' && n.k === '234020117'; })());
  check('week 2: cleared keeps last week + adds this week with since', r3.state.cleared.length === 12 && (() => { const c = r3.state.cleared.find(r => r.sku === 'CAT00776'); return c && c.clearedOn === '2026-09-14' && c.since === '2026-09-07'; })());
  check('week 2: controlled 9, message change logged, removal logged', r3.state.controlled.length === 9 && r3.events.some(e => e.event === 'ctl_msg' && e.sku === 'CAT02438') && r3.events.some(e => e.event === 'ctl_remove' && e.sku === '485840000'));
  check('week 2: untouched rows keep dates/notes and since', (() => { const r = r3.state.backorders.find(x => x.sku === '3910500575'); return r && r.clearText === 'Q4' && /Q4/.test(r.note) && r.lastSeen === '2026-09-14'; })());
  // xlsx refresh path: authoritative list
  const r4 = C.applyReport(r3.state, { controlled: wk2.controlled, newBOs: [], cleared: [], sections: ['controlled'] }, { weekOf: '2026-09-21', at: '2026-09-23T18:00:00Z', source: 'xlsx', reportDate: '2026-09-23',
    active: [{ sku: 'CAT00599', desc: 'FG, CAPSULE PUNCH', seg: 'Hip Surgical Implants', line: 'Capsule Pass', clearDate: '2026-10-14', clearText: '', note: 'Second week of October.' }] });
  check('xlsx refresh: list replaced, date/asOf from file, since kept', r4.state.backorders.length === 1 && r4.state.backorders[0].clearDate === '2026-10-14' && r4.state.backorders[0].asOf === '2026-09-23' && r4.state.backorders[0].source === 'xlsx' && r4.events.filter(e => e.event === 'bo_cleared').length === 76);
  // API shape + cleared window
  const api = C.buildApi(r3.state, { clearedDays: 30, now: '2026-09-20T12:00:00Z', reportId: '2026-09-14', weekOf: '2026-09-14', highspot: 'https://stryker.highspot.com/items/x' });
  check('api: shape', api.ok && api.ver === 1 && api.weekOf === '2026-09-14' && api.controlled.length === 9 && api.backorders.length === 77 && api.cleared.length === 12 && Object.keys(api.backorders[0]).join() === 'sku,desc,seg,line,since,clearDate,clearText,note,asOf');
  const api2 = C.buildApi(r3.state, { clearedDays: 30, now: '2026-10-12T12:00:00Z' });
  check('api: cleared window drops 9/7 rows after 30 days, keeps 9/14', api2.cleared.length === 1 && api2.cleared[0].clearedOn === '2026-09-14', api2.cleared.length);
  check('api: no internal keys leak', JSON.stringify(api).indexOf('"k":') < 0 && JSON.stringify(api).indexOf('lastSeen') < 0);
}

const bad = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
process.exit(bad ? 1 : 0);
