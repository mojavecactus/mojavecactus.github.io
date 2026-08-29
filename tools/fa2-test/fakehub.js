// Fake "TBX FA Hub" — mirrors the documented contract closely enough to drive the fa2 client.
// Event-sourced: append-only ledger, master rebuilt from ledger on every read.
const LEDGER_COLS = ['Timestamp', 'EventId', 'OpId', 'Type', 'Qty', 'Ref', 'Description', 'Lot', 'Exp', 'From', 'ReceivedBy',
  'AccountName', 'AccountLocation', 'DropName', 'CaseBO', 'CasePO', 'Facility', 'Surgeon', 'DOS', 'PatientId', 'Tracking',
  'EnteredBy', 'EntryMethod', 'Note', 'Reverses', 'LinkedTo', 'Flags', 'EventDate', 'Reason', 'ImportId'];
const MASTER_COLS = ['Ref', 'Description', 'Lot', 'Exp', 'Qty', 'Status', 'LastLocation', 'LastActivity'];
const COLKEY = { Timestamp: 'timestamp', EventId: 'eventId', OpId: 'opId', Type: 'type', Qty: 'qty', Ref: 'ref', Description: 'desc', Lot: 'lot', Exp: 'exp',
  From: 'from', ReceivedBy: 'receivedBy', AccountName: 'accountName', AccountLocation: 'accountLocation', DropName: 'dropName', CaseBO: 'caseBO', CasePO: 'casePO',
  Facility: 'facility', Surgeon: 'surgeon', DOS: 'dos', PatientId: 'patientId', Tracking: 'tracking', EnteredBy: 'enteredBy', EntryMethod: 'entryMethod', Note: 'note',
  Reverses: 'reverses', LinkedTo: 'linkedTo', Flags: 'flags', EventDate: 'eventDate', Reason: 'reason', ImportId: 'importId' };
const NEG = ['Used in case', 'Returned to rep', 'Sent back to Stryker', 'Returned to Stryker', 'External Transfer', 'Written Off', 'Returned to CT SM'];
const TYPES = ['Received', 'Adjustment', 'Void'].concat(NEG);
const TOKENS = { sports: process.env.FA_TOKEN_SPORTS, fa: process.env.FA_TOKEN_FA };
const ADMIN_PW = 'SMFA2026!';

let seq = 0;
function uuid() { seq++; return 'ev-' + String(seq).padStart(4, '0') + '-' + Math.random().toString(16).slice(2, 8); }

// month-only -> end of month (matches the documented hub parse)
function expEnd(e) {
  e = String(e || '').trim();
  let m;
  if ((m = e.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59);
  if ((m = e.match(/^(\d{4})-(\d{1,2})$/))) return new Date(+m[1], +m[2], 0, 23, 59, 59);
  if ((m = e.match(/^(\d{1,2})\/(\d{4})$/))) return new Date(+m[2], +m[1], 0, 23, 59, 59);
  if ((m = e.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return new Date(+m[3], +m[1] - 1, +m[2], 23, 59, 59);
  return null;
}
function status(exp, now) {
  const end = expEnd(exp); if (!end) return 'OK';
  if (end < now) return 'EXPIRED';
  const m2 = new Date(now); m2.setMonth(m2.getMonth() + 2);
  const m3 = new Date(now); m3.setMonth(m3.getMonth() + 3);
  if (end <= m2) return 'SEND BACK \u22642 MO';
  if (end <= m3) return '\u22643 MO';
  return 'OK';
}

class FakeHub {
  constructor(opts) {
    opts = opts || {};
    this.now = opts.now || (() => new Date());
    this.ledger = [];            // array of event objects (oldest first)
    this.ops = {};               // opId -> true
    this.imports = [];
    this.teams = opts.teams || [
      { name: 'Nate', email: 'nate@example.com', role: 'sports', active: true },
      { name: 'Katie F', email: 'katie@example.com', role: 'fa', active: true },
      { name: 'Jordan P', email: 'jordan@example.com', role: 'fa', active: true }
    ];
    this.toggles = { weeklyEmail: true, monthlyEmail: false };
    this.log = [];               // every request {action, body}
    this.failNext = null;        // {action, mode:'abort'|'abort-after-apply'|'blank'}
  }
  scopeOf(token) { return token === TOKENS.sports ? 'sports' : token === TOKENS.fa ? 'fa' : null; }
  row(ev) { return LEDGER_COLS.map(c => { const k = COLKEY[c]; return ev[k] == null ? '' : String(ev[k]); }); }
  master() {
    const now = this.now();
    const voided = {}; this.ledger.forEach(e => { if (e.type === 'Void' && e.reverses) voided[e.reverses] = 1; });
    const agg = {}; const order = [];
    this.ledger.forEach(e => {
      if (e.type === 'Void' || voided[e.eventId]) return;
      const k = String(e.ref).toUpperCase() + '\u0001' + String(e.lot || '').toUpperCase();
      if (!agg[k]) { agg[k] = { ref: e.ref, desc: e.desc || '', lot: e.lot || '', exp: e.exp || '', qty: 0, loc: '', act: e.timestamp }; order.push(k); }
      const a = agg[k];
      const q = Number(e.qty) || 0;
      if (e.type === 'Received') { a.qty += q; if (e.exp) a.exp = e.exp; if (e.desc) a.desc = e.desc; a.loc = e.receivedBy || e.dropName || a.loc; }
      else if (e.type === 'Adjustment') a.qty += q;
      else if (NEG.indexOf(e.type) > -1) a.qty -= Math.abs(q);
      a.act = e.timestamp;
    });
    const rows = order.map(k => agg[k]).filter(a => a.qty > 0)
      .sort((a, b) => { const ea = expEnd(a.exp), eb = expEnd(b.exp); return (ea ? ea.getTime() : 9e15) - (eb ? eb.getTime() : 9e15); })
      .map(a => [a.ref, a.desc, a.lot, a.exp, a.qty, status(a.exp, now), a.loc, a.act]);
    return rows;
  }
  units() { return this.master().reduce((s, r) => s + r[4], 0); }
  validate(ev, scope) {
    if (TYPES.indexOf(ev.type) < 0) return 'type';
    if (scope === 'fa' && ev.type !== 'Returned to Stryker' && ev.type !== 'Sent back to Stryker') return 'scope';
    if (ev.type === 'Received' && !ev.exp) return 'exp';
    if (ev.type === 'Void' && !ev.reverses) return 'reverses';
    if (ev.type !== 'Void' && !(Number(ev.qty) !== 0)) return 'qty';
    return null;
  }
  handle(body) {
    this.log.push(body);
    const scope = this.scopeOf(body.token);
    if (!scope) return { ok: false, err: 'auth' };
    const f = this.failNext; if (f && f.action === body.action) { this.failNext = null; if (f.mode === 'blank') return { ok: true }; if (f.mode === 'reject') return { ok: false, err: f.err, at: f.at }; }
    switch (body.action) {
      case 'ping': return { ok: true, scope, version: 'fake-1.0' };
      case 'read': {
        const L = this.ledger.slice().reverse().slice(0, body.limit || 1000).map(e => this.row(e));
        return { ok: true, master: this.master(), masterCols: MASTER_COLS, ledger: L, ledgerCols: LEDGER_COLS, cases: [], casesCols: [], toggles: this.toggles, teams: this.teams };
      }
      case 'batch': {
        if (!body.opId) return { ok: false, err: 'opid' };
        if (this.ops[body.opId]) return { ok: true, dup: true, master: this.master(), units: this.units() };
        const evs = body.events || [];
        for (let i = 0; i < evs.length; i++) { const e = this.validate(evs[i], scope); if (e) return { ok: false, err: e, at: i }; }
        const ts = this.now().toISOString();
        evs.forEach(e => { const ev = Object.assign({}, e, { eventId: e.eventId || uuid(), opId: body.opId, timestamp: ts }); this.ledger.push(ev); });
        this.ops[body.opId] = true;
        if (f && f.mode === 'abort-after-apply') return '__ABORT__';
        return { ok: true, applied: evs.length, master: this.master(), units: this.units() };
      }
      case 'import_list': return { ok: true, imports: this.imports };
      case 'poll_now': return { ok: true, threads: 0, results: [] };
      case 'import_deny': { const x = this.imports.find(i => i.importId === body.importId); if (x) x.outcome = 'denied'; return { ok: true }; }
      case 'import_approve': {
        const x = this.imports.find(i => i.importId === body.importId); if (!x) return { ok: false, err: 'noimport' };
        const ts = this.now().toISOString();
        (body.lines || []).forEach((L, i) => {
          if (L.skipped) return;
          if (L.resolve) this.ledger.push({ eventId: uuid(), opId: 'imp-' + x.importId + '-r' + i, timestamp: ts, type: 'Received', ref: L.refRaw, desc: L.desc, lot: L.lot, exp: '2099-12', qty: L.qty, receivedBy: L.resolve.source, flags: 'Late entry', entryMethod: 'import-approved', importId: x.importId });
          this.ledger.push({ eventId: uuid(), opId: 'imp-' + x.importId, timestamp: ts, type: 'Used in case', ref: L.refRaw, desc: L.desc, lot: L.lot, qty: L.qty, caseBO: x.bo, facility: x.detail.hdr.facility, surgeon: x.detail.hdr.surgeon, dos: x.detail.hdr.dos, entryMethod: 'import-approved', enteredBy: body.by, importId: x.importId });
        });
        x.outcome = 'approved'; return { ok: true };
      }
      case 'admin': {
        if (scope !== 'sports') return { ok: false, err: 'scope' };
        if (body.adminPw !== ADMIN_PW) return { ok: false, err: 'adminpw' };
        switch (body.op) {
          case 'toggles_get': return { ok: true, toggles: this.toggles };
          case 'toggles_set': this.toggles = { weeklyEmail: !!body.weeklyEmail, monthlyEmail: !!body.monthlyEmail }; return { ok: true };
          case 'teams_get': return { ok: true, teams: this.teams };
          case 'teams_set': this.teams = (body.rows || []).map(t => Object.assign({}, t)); return { ok: true, teams: this.teams, sharing: { added: [], errors: [] }, welcomed: [], welcomeErrors: [] };
          case 'sync_sharing': return { ok: true, sharing: { added: [], errors: [] } };
          case 'report_preview': { const m = this.master(); return { ok: true, lots: m.length, units: m.reduce((s, r) => s + r[4], 0), instruction: false }; }
          case 'send_report': return (body.to || []).length ? { ok: true, sent: body.to.length } : { ok: false, err: 'norecipients' };
          case 'email_weekly_now': case 'email_monthly_now': return { ok: true, sent: 1 };
          case 'poll_now': return { ok: true, threads: 0, results: [] };
          default: return { ok: false, err: 'op' };
        }
      }
      default: return { ok: false, err: 'action' };
    }
  }
  // helpers for tests
  seed(evs) { const ts = this.now().toISOString(); evs.forEach(e => this.ledger.push(Object.assign({ eventId: uuid(), opId: 'seed-' + uuid(), timestamp: ts, entryMethod: 'manual', enteredBy: 'seed' }, e))); }
  events(type) { return this.ledger.filter(e => !type || e.type === type); }
  batches() { return this.log.filter(b => b.action === 'batch'); }
}
module.exports = { FakeHub, LEDGER_COLS, MASTER_COLS, expEnd, status };
