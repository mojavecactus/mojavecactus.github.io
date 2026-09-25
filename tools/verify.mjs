#!/usr/bin/env node
// tools/verify.mjs — pre-commit gate for SM ToolBox.
// Run AFTER decrypt+edits+encrypt, BEFORE commit:  node tools/verify.mjs
// Exit 0 = safe to ship. Any FAIL exits 1. WARNs print but do not block.
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { check as manifestCheck, swList } from './img-manifest.mjs';
import { check as dimsCheck } from './img-dims.mjs';

const R = process.cwd();
// The app bundle is versioned by filename (app-<ver>.js); index.html's script tag is the source of truth.
const APP = ((readFileSync(R + '/index.html', 'utf8').match(/<script src="(app[^"]*\.js)"/) || [])[1]) || 'app.js';
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
const app = readFileSync(R + '/' + APP, 'utf8');
const sw = readFileSync(R + '/sw.js', 'utf8');
const all = [...D.items.map(i => ({ ...i, _k: 'item' })), ...D.probes.map(i => ({ ...i, _k: 'probe' })), ...D.shavers.map(i => ({ ...i, _k: 'shaver' }))];

// ---- 1 syntax ----
for (const f of [APP, 'sw.js']) {
  try { execFileSync('node', ['--check', R + '/' + f], { stdio: 'pipe' }); }
  catch (e) { FAIL(f + ' syntax: ' + String(e.stderr).slice(0, 200)); }
}

// ---- 2 duplicate skus ----
{
  const seen = {};
  all.forEach(i => { seen[i.sku] = (seen[i.sku] || 0) + 1; });
  Object.entries(seen).filter(([, v]) => v > 1).forEach(([k, v]) => FAIL('duplicate sku: ' + k + ' x' + v));
  // leading zeros are optional in the app (0234020117 = 234020117): twins would be two cards for one part
  const z = {};
  all.forEach(i => { const k = nrm(i.sku).replace(/^0+/, ''); (z[k] = z[k] || []).push(i.sku); });
  Object.values(z).filter(v => v.length > 1).forEach(v => FAIL('duplicate sku (leading zeros): ' + v.join(' / ')));
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

// ---- 6 images three-way (data refs / img-manifest.json / disk) + the service worker's shell lists ----
// Photos and guide pages live in the long-lived 'tbx-img' cache keyed by img-manifest.json (tools/img-manifest.mjs);
// sw.js lists only the app shell. After editing img/ or guide/pages/: node tools/img-manifest.mjs, then this script.
// tools/emergency/sw-emergency.js shipped as sw.js carries none of the lists: those checks then only warn.
const EMERGENCY_SW = /TBX-EMERGENCY-SW/.test(sw);
if (EMERGENCY_SW) WARN('sw.js is the EMERGENCY service worker (tools/emergency) — ship a normal fixed sw.js within a day');
const MANIFEST = (() => {
  const r = manifestCheck(R);
  r.fails.forEach(f => (EMERGENCY_SW && /sw\.js/.test(f) ? WARN : FAIL)('img-manifest: ' + f));
  return (r.onDisk && r.onDisk.files) || {};
})();
{
  const disk = readdirSync(R + '/img').map(f => 'img/' + f);
  const refs = new Set();
  all.forEach(i => (i.imgs || []).forEach(x => refs.add(x)));
  refs.forEach(r => {
    if (!existsSync(R + '/' + r)) FAIL('card image missing on disk: ' + r);
    if (!MANIFEST[r]) FAIL('card image not in img-manifest.json (never saved offline): ' + r);
  });
  disk.forEach(f => { if (!refs.has(f)) FAIL('orphan image on disk (unreferenced by any card): ' + f); });
  // R7 N14: every card photo has its size in img-dims.js (a lone photo keeps its box before it arrives)
  dimsCheck(R).fails.forEach(f => FAIL(f));
  const dimsJs = existsSync(R + '/img-dims.js') ? readFileSync(R + '/img-dims.js', 'utf8') : '';
  refs.forEach(r => { if (dimsJs.indexOf('"' + r + '":[') < 0) FAIL('card image has no size in img-dims.js: ' + r); });
}
if (!EMERGENCY_SW) {
  const assets = swList(sw, 'ASSETS'), core = swList(sw, 'CORE');
  if (!assets) FAIL('sw.js ASSETS list missing or unreadable');
  if (!core) FAIL('sw.js CORE list missing or unreadable');
  const A = assets || [], C = core || [];
  const adup = {};
  A.forEach(a => { adup[a] = (adup[a] || 0) + 1; });
  Object.entries(adup).filter(([, v]) => v > 1).forEach(([k]) => FAIL('duplicate ASSETS entry: ' + k));
  A.forEach(a => { if (a !== './' && !existsSync(R + '/' + a)) FAIL('ASSETS entry missing on disk: ' + a); });
  C.forEach(c => { if (c !== './' && !A.includes(c)) FAIL('CORE entry not in ASSETS (never precached): ' + c); });
  ['./index.html', './' + APP, './payload.enc.json', './img-manifest.json'].forEach(c => {
    if (!C.includes(c)) FAIL('core asset missing from precache (sw.js CORE): ' + c);
  });
  // cycle count + F&A must work offline from the first launch: their files are core, never best-effort
  ['./ccscan.js', './lib/inflate.js', './lib/zxing-reader.js', './lib/zxing_reader.wasm'].concat(
    readdirSync(R).filter(f => /^(cc|fa2)(-[a-z0-9]+)?\.enc\.json$/.test(f)).map(f => './' + f)).forEach(c => {
    if (!C.includes(c)) FAIL('cycle-count / F&A file missing from sw.js CORE: ' + c);
  });
  // old caches may only be deleted through isShell() = /^tbx-v\d+-/ — never the photo cache
  if (!/function isShell\(k\) \{ return \/\^tbx-v\\d\+-\/\.test\(k\); \}/.test(sw)) FAIL('sw.js isShell() must be exactly /^tbx-v\\d+-/ (it guards the photo cache)');
  sw.split('\n').forEach((l, i) => { if (/caches\.delete\(/.test(l) && !/isShell\(/.test(l)) FAIL('sw.js:' + (i + 1) + ' deletes a cache without the isShell() filter'); });
}

// ---- 7 grouped-cat registration (the GraftJacket bug class) ----
{
  const parseGroups = (name) => {
    const m = new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\n  \\};').exec(app);
    if (!m) { FAIL('could not parse ' + name + ' from ' + APP); return null; }
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

// ---- 8b uom + hidden lints ----
{
  all.forEach(i => {
    if (i.uom === undefined || i.uom === '') { if (!i.hidden) FAIL('missing uom: ' + i.sku); return; }
    if (!/^(Each|Kit|Box of \d+)$/.test(i.uom)) FAIL('uom not in canonical form (Each | Kit | Box of N): ' + i.sku + ' -> "' + i.uom + '"');
  });
  // hidden pseudo-items (user guides, error codes) never reach a tile count
  D.items.filter(i => i.hidden).forEach(i => { if (i.uom) WARN('hidden item carries a uom: ' + i.sku); });
}

// ---- 8c app bundle: no undefined identifiers (the skuOf-out-of-scope class) ----
{
  try {
    const out = execFileSync('npx', ['--yes', 'eslint@8', '--no-eslintrc', '--env', 'browser,es2020', '--parser-options=ecmaVersion:2020',
      '--global', 'ZXingWASM,html2canvas', '--rule', 'no-undef:error', '--rule', 'no-dupe-keys:error', '--rule', 'no-unreachable:error',
      '--format', 'unix', R + '/' + APP, R + '/sw.js'], { stdio: 'pipe', timeout: 180000 }).toString();
    if (out.trim()) FAIL('eslint: ' + out.trim().split('\n')[0]);
  } catch (e) {
    const o = String((e.stdout || '') + (e.stderr || ''));
    if (/no-undef|no-dupe-keys|no-unreachable/.test(o)) o.split('\n').filter(l => /Error/.test(l)).slice(0, 10).forEach(l => FAIL('eslint: ' + l.trim()));
    else WARN('eslint could not run (offline?) — undefined-identifier check skipped');
  }
}

// ---- 8d guide pages: PDF page count == webp pages == pages the app renders ----
{
  try {
    const pdf = readFileSync(R + '/guide/SMToolBox_Cycle_Count_Scanner_Guide.pdf', 'latin1');
    const pdfPages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const webps = readdirSync(R + '/guide/pages').filter(f => /^p\d+\.webp$/.test(f)).length;
    const loop = /for \(var i = 1; i <= (\d+); i\+\+\) pages \+= '<img src="guide\/pages\/p'/.exec(app);
    const appPages = loop ? +loop[1] : -1;
    if (pdfPages !== webps) FAIL('guide: PDF has ' + pdfPages + ' pages but guide/pages has ' + webps + ' webps');
    if (appPages !== webps) FAIL('guide: app renders ' + appPages + ' pages but guide/pages has ' + webps);
    for (let i = 1; i <= webps; i++) if (!MANIFEST['guide/pages/p' + i + '.webp']) FAIL('guide page not in img-manifest.json (never saved offline): p' + i + '.webp');
  } catch (e) { WARN('guide check skipped: ' + e.message); }
}

// ---- 8e hidden items: never orphaned, never on a tile ----
{
  const linked = new Set();
  D.items.forEach(i => { (i.links || []).forEach(l => { if (l.sku) linked.add(nrm(l.sku)); (l.menu || []).forEach(m => linked.add(nrm(m.sku))); }); (i.parts || []).forEach(p => linked.add(nrm(p))); });
  D.items.filter(i => i.hidden).forEach(i => {
    if (!linked.has(nrm(i.sku))) FAIL('hidden item unreachable (no visible card links to it): ' + i.sku);
    if (D.counts[i.cat] === undefined) FAIL('hidden item in unknown cat: ' + i.sku);
  });
  // counts stay cat-only + visible, which is what catCount() in the app derives from
  const hid = D.items.filter(i => i.hidden).length;
  const total = D.items.length - hid;
  const sum = D.catOrder.reduce((a, k) => a + (D.counts[k] || 0), 0);
  if (sum !== total) FAIL('counts sum ' + sum + ' != visible items ' + total);
}

// ---- 8f retired part numbers: hidden stub with `moved` -> a visible card; the note is the popup's explanation ----
{
  const BY = {};
  all.forEach(i => { BY[nrm(i.sku)] = i; });
  D.items.filter(i => i.moved).forEach(i => {
    if (!i.hidden) FAIL('moved stub must be hidden: ' + i.sku);
    const t = BY[nrm(i.moved)];
    if (!t) FAIL('moved target unresolved: ' + i.sku + ' -> ' + i.moved);
    else if (t.hidden) FAIL('moved target is hidden: ' + i.sku + ' -> ' + i.moved);
    if (!i.note) FAIL('moved stub has no note (the popup explanation): ' + i.sku);
  });
}

// ---- 8g spec labels (P25): one spelling per field, so the search filters catch every card ----
{
  let SL = null;
  try { SL = JSON.parse(readFileSync(R + '/tools/spec-labels.json', 'utf8')); } catch (e) { WARN('tools/spec-labels.json missing or unreadable — spec-label check skipped'); }
  if (SL) {
    const allowed = new Set(SL.allowed || []), renamed = SL.renamed || {}, pats = (SL.tablePatterns || []).map(p => new RegExp(p));
    const unknown = {};
    all.forEach(i => {
      const seen = {};
      (i.specs || []).forEach(([k]) => {
        if (!k) return;                                                  // '' = section header row
        if (k !== k.trim() || /\s{2}|:$/.test(k)) FAIL('spec label formatting: ' + i.sku + ' "' + k + '"');
        if (seen[k]) FAIL('duplicate spec label on ' + i.sku + ': ' + k); seen[k] = 1;
        if (renamed[k]) FAIL('spec label "' + k + '" was merged into "' + renamed[k] + '" — use that: ' + i.sku);
        else if (!i.hidden && !allowed.has(k) && !pats.some(re => re.test(k))) (unknown[k] = unknown[k] || []).push(i.sku);
      });
    });
    Object.entries(unknown).forEach(([k, v]) => WARN('new spec label "' + k + '" on ' + v.length + ' card(s) (' + v.slice(0, 3).join(', ') + ') — reuse an existing label, or add it to tools/spec-labels.json'));
  }
}
// ---- 8h unit notation (P26) and filter-readable values (P27) ----
{
  const FORCE = /^(Suture sliding force|Pullout strength|Retention strand strength)$/;
  const SIZED = /^(Diameter|Anchor size|Anchor diameter|Length|Total length|Anchor length|Drill diameter|Cutting-head diameter)$/;
  all.forEach(i => {
    const F = [['name', i.name], ['t', i.t], ['sz', i.sz], ['ld', i.ld], ['note', i.note], ['bp', i.bp]]
      .concat((i.specs || []).map(([k, v]) => ['label', k]), (i.specs || []).map(([k, v]) => [k || '(header)', v]));
    F.forEach(([k, v]) => {
      v = String(v == null ? '' : v); if (!v) return;
      if (/(^|[^#\d.\/–-])\d-0(?!\d)/.test(v)) FAIL('suture size needs its # (#2-0): ' + i.sku + ' ' + k + ' = ' + v.slice(0, 60));
      if (/\d'?\d*\s?"|\d\s?(in|inch|inches)\b(?!-)/.test(v)) FAIL('inches are written ″ (24″): ' + i.sku + ' ' + k + ' = ' + v.slice(0, 60));
      if (/\d cm\b|\d N\b/.test(v)) FAIL('metric values are tight (8cm, 488N): ' + i.sku + ' ' + k + ' = ' + v.slice(0, 60));
      if (/\d\s?lbs\b/.test(v)) FAIL('write lb (weight) or lbf (force), never lbs: ' + i.sku + ' ' + k);
    });
    (i.specs || []).forEach(([k, v]) => {
      v = String(v == null ? '' : v);
      if (FORCE.test(k) && /\d\s?lb\b/.test(v)) FAIL('force is written lbf: ' + i.sku + ' ' + k + ' = ' + v.slice(0, 40));
      if (!i.hidden && SIZED.test(k) && /^\s*\d+(\.\d+)?\s*$/.test(v)) WARN('size without a unit — the search filters skip it: ' + i.sku + ' ' + k + ' = ' + v);
      if (/\d(?:\s?(?:mm|cm|″))?\s?x\s?\d/.test(v)) WARN('use × between sizes in spec rows: ' + i.sku + ' ' + k + ' = ' + v.slice(0, 40));
    });
  });
}

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

// ---- 10b payload envelope (P49/P50): compressed before encryption, so the phones' download stays small ----
{
  try {
    const raw = readFileSync(R + '/payload.enc.json', 'utf8'), P = JSON.parse(raw);
    ['kdf', 'it', 'salt', 'iv', 'ct'].forEach(k => { if (!P[k]) FAIL('payload.enc.json: envelope has no "' + k + '"'); });
    if (P.z !== 'deflate-raw') FAIL('payload.enc.json is not compressed (z: ' + JSON.stringify(P.z) + ') — encrypt with tools/encrypt-data.mjs');
    if (raw.length >= 400 * 1024) FAIL('payload.enc.json is ' + Math.round(raw.length / 1024) + ' KB (limit 400 KB) — was it compressed? encrypt with tools/encrypt-data.mjs');
  } catch (e) { FAIL('payload.enc.json unreadable: ' + e.message); }
}

// ---- 11 soft content telemetry ----
{
  const nb = D.items.filter(i => !(i.specs && i.specs.length) && !i.note && !i.bp && !(i.imgs && i.imgs.length));
  WARN('not-built cards: ' + nb.length);
  const nm = {};
  all.forEach(i => { (nm[i.name] = nm[i.name] || []).push(i.sku); });
  Object.entries(nm).filter(([, v]) => v.length > 1).forEach(([k, v]) => WARN('duplicate name: [' + v.join('/') + '] ' + k.slice(0, 70)));
}

// ---- 12 quotes.json: the About drawer's quotes (R10) — {v, quotes: [{q, a, s?}]}; best-effort offline (ASSETS, never
// CORE: a missing or bad file only means the drawer shows its built-in Homer Stryker quote, and must never block an update)
{
  let Q = null;
  try { Q = JSON.parse(readFileSync(R + '/quotes.json', 'utf8')); } catch (e) { FAIL('quotes.json missing or not valid JSON: ' + e.message); }
  if (Q) {
    if (Q.v === undefined || Q.v === null) FAIL('quotes.json: no "v" (format version)');
    if (!Array.isArray(Q.quotes) || !Q.quotes.length) FAIL('quotes.json: "quotes" must be a non-empty list');
    else {
      const seen = {}, key = s => s.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); // case, punctuation, accents
      let ph = 0;
      Q.quotes.forEach((x, i) => {
        const at = 'quotes.json #' + (i + 1);
        if (!x || typeof x !== 'object' || Array.isArray(x)) return FAIL(at + ': not an object');
        const q = typeof x.q === 'string' ? x.q.trim() : '', a = typeof x.a === 'string' ? x.a.trim() : '';
        if (!q) FAIL(at + ': empty "q" (the quote)');
        if (!a) FAIL(at + ': empty "a" (who said it)' + (q ? ' — ' + q.slice(0, 50) : ''));
        if ([...q].length > 300) FAIL(at + ': "q" is ' + [...q].length + ' characters (limit 300) — ' + q.slice(0, 50));
        if (x.s !== undefined && typeof x.s !== 'string') FAIL(at + ': "s" (source) must be text');
        const k = key(q);
        if (k && seen[k]) FAIL(at + ': duplicate of #' + seen[k] + ' — ' + q.slice(0, 50)); else if (k) seen[k] = i + 1;
        if (/^["'“”‘’]/.test(q) && /["'“”‘’]$/.test(q)) WARN(at + ': "q" is wrapped in quote marks — the drawer adds its own');
        if (/placeholder/i.test(q + ' ' + a)) ph++;
      });
      if (ph) WARN('quotes.json: ' + ph + ' placeholder quote(s) — replace them before shipping');
    }
  }
  if (!EMERGENCY_SW) {
    const A = swList(sw, 'ASSETS') || [], C = swList(sw, 'CORE') || [];
    if (!A.includes('./quotes.json')) FAIL('sw.js ASSETS must list ./quotes.json (the About drawer offline)');
    if (C.includes('./quotes.json')) FAIL('sw.js CORE must not list ./quotes.json (a quote must never block an update)');
  }
}

// ---- report ----
warns.forEach(w => console.log('WARN  ' + w));
if (fails.length) {
  fails.forEach(f => console.log('FAIL  ' + f));
  console.log('\n' + fails.length + ' FAILURE(S) — do not commit.');
  process.exit(1);
}
console.log('\nVERIFY PASSED — ' + all.length + ' records, ' + warns.length + ' warning(s). Safe to ship.');
