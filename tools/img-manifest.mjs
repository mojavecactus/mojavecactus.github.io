#!/usr/bin/env node
// tools/img-manifest.mjs — content-hash manifest for the long-lived offline photo cache (P2).
// Phones keep every photo (img/) and guide page (guide/pages/) in the service worker's 'tbx-img' cache, keyed by the
// first 16 hex of the file's SHA-256. A release downloads only files whose hash changed and prunes removed ones, so
// photos are no longer re-downloaded (or lost offline) on every CACHE bump.
//
// Run it from the repo root after ANY change under img/ or guide/pages/ (add, replace, re-encode, delete), before
// verify.mjs:
//   node tools/img-manifest.mjs                  write img-manifest.json and stamp IMG_MANIFEST in sw.js
//   node tools/img-manifest.mjs --check          exit 1 if img-manifest.json or the sw.js stamp don't match the files
//                                                (verify.mjs runs the same checks)
//   node tools/img-manifest.mjs --diff <old>     added / changed / removed vs an older manifest, and what each phone
//                                                downloads in that release (e.g. <old> = git show origin/main:img-manifest.json)
//   node tools/img-manifest.mjs --out <file>     write the manifest elsewhere (dry run; sw.js untouched)
//   [<siteDir>]                                  another site folder instead of the current directory
//
// Format (sorted keys, one line, so a diff shows exactly which photos changed):
//   {"v":1,"alg":"sha256/16","n":<files>,"nImg":<img/ files>,"bytes":<total>,
//    "files":{"guide/pages/p1.webp":["<16 hex>",<bytes>],…,"img/a.jpg":["<16 hex>",<bytes>],…}}
// sw.js carries  var IMG_MANIFEST = '<16 hex of the manifest text>';  so any photo change also changes sw.js bytes
// (phones only look for an update when sw.js changes).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIRS = ['img', 'guide/pages'];
export const CACHE_NAME = 'tbx-img';
const EXT = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

export function build(dir) {
  const files = {};
  let bytes = 0, nImg = 0;
  for (const d of DIRS) {
    if (!existsSync(join(dir, d))) continue;
    for (const f of readdirSync(join(dir, d)).sort()) {
      if (!EXT.test(f)) continue;
      const p = d + '/' + f, buf = readFileSync(join(dir, p));
      files[p] = [createHash('sha256').update(buf).digest('hex').slice(0, 16), buf.length];
      bytes += buf.length; if (d === 'img') nImg++;
    }
  }
  const sorted = {}; Object.keys(files).sort().forEach(k => { sorted[k] = files[k]; });
  return { v: 1, alg: 'sha256/16', n: Object.keys(sorted).length, nImg, bytes, files: sorted };
}
export const text = (m) => JSON.stringify(m) + '\n';
export const stamp = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16);

// The sw.js lists as arrays of strings ('./a', './b'); null when the line is missing or unreadable.
export function swList(sw, name) {
  const m = new RegExp('var ' + name + ' = (\\[[^\\]]*\\]);').exec(sw);
  try { return m ? JSON.parse(m[1].replace(/'/g, '"')) : null; } catch (e) { return null; }
}

// Everything verify.mjs needs to know about the photo cache wiring. Returns { fails: [...], built, onDisk }.
export function check(root) {
  const fails = [];
  const built = build(root), want = text(built);
  // the cache key is <scope><path>?h=…; a name that needs URL-encoding would never match what the page looks up
  for (const k of Object.keys(built.files)) if (!/^[A-Za-z0-9._-]+$/.test(k.split('/').pop())) fails.push('file name needs URL-encoding — rename it (letters, digits, . _ - only): ' + k);
  const p = join(root, 'img-manifest.json');
  let onDisk = null;
  if (!existsSync(p)) fails.push('img-manifest.json missing — run node tools/img-manifest.mjs');
  else {
    const cur = readFileSync(p, 'utf8');
    try { onDisk = JSON.parse(cur); } catch (e) { fails.push('img-manifest.json is not JSON — run node tools/img-manifest.mjs'); }
    if (onDisk && cur !== want) {
      const old = onDisk.files || {}, n0 = fails.length;
      for (const k of Object.keys(built.files)) {
        if (!old[k]) fails.push('on disk but not in img-manifest.json: ' + k);
        else if (old[k][0] !== built.files[k][0] || old[k][1] !== built.files[k][1]) fails.push('changed since img-manifest.json was written: ' + k);
      }
      for (const k of Object.keys(old)) if (!built.files[k]) fails.push('in img-manifest.json but not on disk: ' + k);
      if (fails.length === n0) fails.push('img-manifest.json is not in canonical form');
      fails.push('→ re-run node tools/img-manifest.mjs');
    }
  }
  const swp = join(root, 'sw.js');
  if (!existsSync(swp)) fails.push('sw.js missing');
  else {
    const sw = readFileSync(swp, 'utf8');
    const sm = /var IMG_MANIFEST = '([0-9a-f]{16})';/.exec(sw);
    if (!sm) fails.push("sw.js has no IMG_MANIFEST line (var IMG_MANIFEST = '<16 hex>';)");
    else if (sm[1] !== stamp(want)) fails.push('sw.js IMG_MANIFEST stamp is stale (' + sm[1] + ' != ' + stamp(want) + ') — re-run node tools/img-manifest.mjs');
    const core = swList(sw, 'CORE'), assets = swList(sw, 'ASSETS');
    if (!core) fails.push('sw.js CORE list not found');
    else if (!core.includes('./img-manifest.json')) fails.push('img-manifest.json is not in the sw.js CORE list');
    if (!assets) fails.push('sw.js ASSETS list not found');
    else if (!assets.includes('./img-manifest.json')) fails.push('img-manifest.json is not in the sw.js ASSETS list');
    if (/'\.\/(img|guide\/pages)\/[^']+'/.test(sw)) fails.push('sw.js still lists img/ or guide/pages/ files — photos come from img-manifest.json now');
    if (!new RegExp("var IMG = '" + CACHE_NAME + "';").test(sw)) fails.push("sw.js photo cache is not var IMG = '" + CACHE_NAME + "';");
  }
  return { fails, built, onDisk };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
function main() {
  const args = process.argv.slice(2);
  const valued = new Set(['--diff', '--out']);
  const opt = (k) => { const i = args.indexOf(k); return i > -1 ? (valued.has(k) ? args[i + 1] : true) : null; };
  const pos = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
  const root = resolve(pos[0] || '.');
  if (!existsSync(join(root, 'index.html'))) { console.error('usage (from the repo root): node tools/img-manifest.mjs [--check | --diff old.json | --out file] [siteDir]'); process.exit(2); }
  const t0 = Date.now();

  if (opt('--check')) {
    const r = check(root), m = r.built;
    r.fails.forEach(f => console.log('FAIL  ' + f));
    console.log(r.fails.length ? r.fails.length + ' manifest failure(s)' : 'manifest OK — ' + m.n + ' files (' + m.nImg + ' photos), ' + (m.bytes / 1e6).toFixed(2) + ' MB, checked in ' + (Date.now() - t0) + ' ms');
    process.exit(r.fails.length ? 1 : 0);
  }
  const m = build(root), out = text(m);
  if (opt('--diff')) {
    const old = JSON.parse(readFileSync(opt('--diff'), 'utf8')).files || {};
    const add = [], chg = [], del = [];
    for (const k of Object.keys(m.files)) if (!old[k]) add.push(k); else if (old[k][0] !== m.files[k][0]) chg.push(k);
    for (const k of Object.keys(old)) if (!m.files[k]) del.push(k);
    const dl = add.concat(chg).reduce((a, k) => a + m.files[k][1], 0);
    console.log(JSON.stringify({ added: add, changed: chg, removed: del, phoneDownloadBytes: dl }, null, 1));
    process.exit(0);
  }
  const dest = opt('--out') ? resolve(opt('--out')) : join(root, 'img-manifest.json');
  writeFileSync(dest, out);
  let stamped = '';
  if (!opt('--out')) {
    const swp = join(root, 'sw.js'), sw = readFileSync(swp, 'utf8');
    if (/var IMG_MANIFEST = '[0-9a-f]*';/.test(sw)) { writeFileSync(swp, sw.replace(/var IMG_MANIFEST = '[0-9a-f]*';/, "var IMG_MANIFEST = '" + stamp(out) + "';")); stamped = ', sw.js stamped'; }
    else stamped = ' — WARNING: sw.js has no IMG_MANIFEST line to stamp';
  }
  console.log('wrote ' + dest + ': ' + m.n + ' files (' + m.nImg + ' photos), ' + (m.bytes / 1e6).toFixed(2) + ' MB, manifest ' + out.length + ' B, stamp ' + stamp(out) + stamped + ' (' + (Date.now() - t0) + ' ms)');
}
