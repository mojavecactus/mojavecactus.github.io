#!/usr/bin/env node
// tools/verify.mjs — pre-commit gate for SM ToolBox.
// Run AFTER decrypt+edits+encrypt, BEFORE commit:  node tools/verify.mjs
// Exit 0 = safe to ship. Any FAIL exits 1. WARNs print but do not block.
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';

const R = process.cwd();
const fails = [], warns = [];
const FAIL = (m) => fails.push(m);
const WARN = (m) => warns.push(m);
const nrm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---- load data ----
global.window = {};
const dataRaw = readFileSync(R + '/data.js', 'utf8');
if (!dataRaw.startsWith('window.TOOLBOX=')) FAIL('data.js envelope: must start with window.TOOLBOX=');
if (!dataRaw.endsWith(';\n')) FAIL('data.js envelope: must end with ";\\n"');
new Function('window', dataRaw)(global.window);
const D = global.window.TOOLBOX;
new Function('window', readFileSync(R + '/gtin.js', 'utf8'))(global.window);
const G = global.window.TBX_GTIN || {};
const app = readFileSync(R + '/app.js', 'utf8');
const sw = readFileSync(R + '/sw.js', 'utf8');
const all = [...D.items.map(i => ({ ...i, _k: 'item' })), ...D.probes.map(i => ({ ...i, _k: 'probe' })), ...D.shavers.map(i => ({ ...i, _k: 'shaver' }))];

// ---- 1 syntax ----
for (const f of ['app.js', 'sw.js']) {
  try { execFileSync('node', ['--check', R + '/' + f], { stdio: 'pipe' }); }
  catch (e) { FAIL(f + ' syntax: ' + String(e.stderr).slice(0, 200)); }
}

// ---- 2 duplicate skus ----
{
  const seen = {};
  all.forEach(i => { seen[i.sku] = (seen[i.sku] || 0) + 1; });
  Object.entries(seen).filter(([, v]) => v > 1).forEach(([k, v]) => FAIL('duplicate sku: ' + k + ' x' + v));
}

// ---- 3 counts (cat-only formula) ----
{
  const c = {};
  D.catOrder.forEach(k => { c[k] = D.items.filter(i => !i.hidden && i.cat === k).length; });
  D.catOrder.forEach(k => { if (D.counts[k] !== c[k]) FAIL('counts drift: ' + k + ' stored ' + D.counts[k] + ' vs actual ' + c[k]); });
}

// ---- 4 cat validity ----
D.items.forEach(i => {
  if (!D.catOrder.includes(i.cat)) FAIL('bad cat: ' + i.sku + ' -> ' + i.cat);
  if (i.cat2 && !D.catOrder.includes(i.cat2)) FAIL('bad cat2: ' + i.sku + ' -> ' + i.cat2);
});

// ---- 5 reference resolution (parts, links, instr) ----
{
  const BY = {};
  all.forEach(i => { BY[nrm(i.sku)] = i; });
  D.items.forEach(i => {
    (i.parts || []).forEach(p => {
      const t = BY[nrm(p)];
      if (!t) FAIL('parts ref unresolved: ' + i.sku + ' -> ' + p);
      else if (t._k !== 'item') FAIL('parts ref not an item: ' + i.sku + ' -> ' + p);
    });
    if (i.parts && !i.parts.length) WARN('empty parts array on ' + i.sku);
  });
  const famSet = new Set(D.items.map(i => i.fam));
  all.forEach(i => {
    (i.links || []).forEach(l => {
      if (l.sku && !BY[nrm(l.sku)]) FAIL('link sku unresolved: ' + i.sku + ' -> ' + l.sku);
      if (l.go && !/^#\//.test(l.go)) FAIL('link go malformed: ' + i.sku + ' -> ' + l.go);
      (l.menu || []).forEach(m => { if (!BY[nrm(m.sku)]) FAIL('menu link unresolved: ' + i.sku + ' -> ' + m.sku); });
    });
    const ov = i.instr || {};
    (ov.incl || []).concat(ov.excl || []).forEach(s => { if (!BY[nrm(s)]) FAIL('instr ref unresolved: ' + i.sku + ' -> ' + s); });
    (ov.fams || []).forEach(f => { if (!famSet.has(f)) FAIL('instr fam unknown: ' + i.sku + ' -> ' + f); });
  });
}

// ---- 6 images three-way (data refs / ASSETS / disk) ----
{
  const assets = [...sw.matchAll(/'\.\/(img\/[^']+)'/g)].map(m => m[1]);
  const adup = {};
  assets.forEach(a => { adup[a] = (adup[a] || 0) + 1; });
  Object.entries(adup).filter(([, v]) => v > 1).forEach(([k]) => FAIL('duplicate ASSETS entry: ' + k));
  const disk = readdirSync(R + '/img').map(f => 'img/' + f);
  const refs = new Set();
  all.forEach(i => (i.imgs || []).forEach(x => refs.add(x)));
  refs.forEach(r => {
    if (!existsSync(R + '/' + r)) FAIL('card image missing on disk: ' + r);
    if (!assets.includes(r)) FAIL('card image not precached: ' + r);
  });
  assets.forEach(a => { if (!existsSync(R + '/' + a)) FAIL('ASSETS entry missing on disk: ' + a); });
  disk.forEach(f => { if (!refs.has(f)) FAIL('orphan image on disk (unreferenced by any card): ' + f); });
  ['./index.html', './app.js', './payload.enc.json'].forEach(core => {
    if (!sw.includes("'" + core + "'")) FAIL('core asset missing from precache: ' + core);
  });
}

// ---- 7 grouped-cat registration (the GraftJacket bug class) ----
{
  const parseGroups = (name) => {
    const m = new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\n  \\};').exec(app);
    if (!m) { FAIL('could not parse ' + name + ' from app.js'); return null; }
    const g = {};
    for (const mm of m[1].matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) {
      g[mm[1]] = [...mm[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
    }
    return g;
  };
  const CAP = parseGroups('CAP_GROUPS'), DISP = parseGroups('DISP_GROUPS'), ALLO = parseGroups('ALLO_GROUPS');
  const check = (cat, groups, field) => {
    if (!groups) return;
    const famsInGroups = new Set(Object.values(groups).flat());
    const fams = [...new Set(D.items.filter(i => i.cat === cat || i.cat2 === cat).map(i => i.fam))];
    fams.forEach(f => { if (!famsInGroups.has(f)) WARN(cat + ' fam falls to fallback group: ' + f); });
    if (field) {
      const vals = [...new Set(D.items.filter(i => i[field]).map(i => i[field]))];
      vals.forEach(v => { if (!(v in groups)) FAIL(field + ' value not registered in groups: "' + v + '"'); });
    }
  };
  check('Capital', CAP, null);
  check('Disposables', DISP, 'dgrp');
  check('Allografts & Biologics', ALLO, 'agrp');
}

// ---- 8 formatting lints ----
all.forEach(i => (i.specs || []).forEach(([k, v]) => {
  if (/\d mm\b/.test(String(v))) FAIL('spaced-mm spec value: ' + i.sku + ' ' + k + '=' + v);
}));

// ---- 9 gtin ----
{
  const BY = {};
  all.forEach(i => { BY[nrm(i.sku)] = 1; });
  let dangling = 0;
  Object.entries(G).forEach(([g, sku]) => { if (!BY[nrm(sku)]) { dangling++; FAIL('gtin -> unknown sku: ' + g + ' -> ' + sku); } });
  const mapped = new Set(Object.values(G).map(nrm));
  const un = all.filter(i => !mapped.has(nrm(i.sku)));
  WARN('skus without gtin mapping: ' + un.length);
}

// ---- 10 sw cache version format ----
{
  const m = /var CACHE = 'tbx-v(\d+)-(\d{8})';/.exec(sw);
  if (!m) FAIL('sw.js CACHE line malformed');
  else console.log('cache version: tbx-v' + m[1] + '-' + m[2]);
}

// ---- 11 soft content telemetry ----
{
  const nb = D.items.filter(i => !(i.specs && i.specs.length) && !i.note && !i.bp && !(i.imgs && i.imgs.length));
  WARN('not-built cards: ' + nb.length);
  const nm = {};
  all.forEach(i => { (nm[i.name] = nm[i.name] || []).push(i.sku); });
  Object.entries(nm).filter(([, v]) => v.length > 1).forEach(([k, v]) => WARN('duplicate name: [' + v.join('/') + '] ' + k.slice(0, 70)));
}

// ---- report ----
warns.forEach(w => console.log('WARN  ' + w));
if (fails.length) {
  fails.forEach(f => console.log('FAIL  ' + f));
  console.log('\n' + fails.length + ' FAILURE(S) — do not commit.');
  process.exit(1);
}
console.log('\nVERIFY PASSED — ' + all.length + ' records, ' + warns.length + ' warning(s). Safe to ship.');
