// Fake backorder-hub reply for tools/nav-test/e2e.js (35 backorders so the report scrolls; one clear date already passed).
const BO_API = {
  ok: true, ver: 1, asOf: '2026-09-21T18:00:00Z', reportId: '2026-09-21', weekOf: '2026-09-21', clearedDays: 30, highspot: 'https://example.invalid/highspot',
  backorders: [
    { sku: '3911514610', desc: 'ICONIX 1 1.4MM ANCHOR W/ 1 #1 XBRAID S', since: '2026-08-24', clearDate: '2026-10-15', clearText: '', note: 'Allocation in place.', asOf: '2026-09-21' },
    { sku: '86IN2027', desc: 'GRAVITY INSERTER 2.7MM', since: '2026-09-07', clearDate: '', clearText: 'Mid-November', note: '', asOf: '2026-09-21' },
    { sku: '3910200080', desc: 'BIOSTEON INTRALINE 4.5MM', since: '2026-07-27', clearDate: '2026-09-12', clearText: '', note: '', asOf: '2026-09-21' },
    { sku: 'CAT02438', desc: 'FLOWPORT II 165MM STRYKER', since: '2026-09-14', clearDate: '2026-10-03', clearText: '', note: '', asOf: '2026-09-21' },
    { sku: '3910500580', desc: 'ICONIX DC GUIDE 1.4', since: '2026-09-14', clearDate: '2026-10-20', clearText: '', note: '', asOf: '2026-09-21' }
  ].concat(Array.from({ length: 30 }, (_, i) => ({ sku: 'ZZ' + (1000 + i), desc: 'FILLER PART ' + i + ' FOR SCROLL TESTS', since: '2026-09-14', clearDate: '2026-09-25', clearText: '', note: '', asOf: '2026-09-21' }))),
  controlled: [{ sku: '3910500522', desc: 'ICONIX 2 2.3MM ANCHOR', msg: 'Orders limited to 2 boxes per account per week.', since: '2026-09-07' }],
  cleared: [{ sku: '3910500312', desc: 'ICONIX 1 TT', clearedOn: '2026-09-14', since: '2026-08-10' }]
};
module.exports = { BO_API };
