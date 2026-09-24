#!/usr/bin/env node
// tools/img-dims.mjs — writes img-dims.js: the pixel size of every photo in img/ (JPEG SOF / PNG IHDR, no dependencies).
// The app gives a lone card photo its box before the photo arrives (R7 N14), so the text below never jumps.
//   node tools/img-dims.mjs            rewrite img-dims.js (run after any change under img/, with tools/img-manifest.mjs)
//   node tools/img-dims.mjs --check    exit 1 if img-dims.js is missing, stale or incomplete (verify.mjs runs this check)
// img-dims.js is public (the photos are public anyway) and lives at the site root, not in img/ (that folder is photos only).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

export function sizeOf(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; // PNG IHDR
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7) || m === 0xFF) { i += (m === 0xFF ? 1 : 2); continue; }
    const len = buf.readUInt16BE(i + 2);
    if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
export function build(root) {
  const out = {};
  readdirSync(join(root, 'img')).filter(f => /\.(jpe?g|png)$/i.test(f)).sort().forEach(f => {
    const d = sizeOf(readFileSync(join(root, 'img', f)));
    if (d && d[0] > 0 && d[1] > 0) out['img/' + f] = d;
  });
  return out;
}
export function text(dims) {
  return '/* photo sizes for R7 N14 (tools/img-dims.mjs) */\nwindow.TBX_IMGD=' + JSON.stringify(dims) + ';\n';
}
// → { fails: [...] } for verify.mjs: img-dims.js must exist and match img/ exactly
export function check(root) {
  const fails = [], f = join(root, 'img-dims.js');
  if (!existsSync(f)) return { fails: ['img-dims.js missing — run node tools/img-dims.mjs'] };
  if (readFileSync(f, 'utf8') !== text(build(root))) fails.push('img-dims.js is stale (a photo was added, removed or changed) — run node tools/img-dims.mjs');
  return { fails };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  if (process.argv.includes('--check')) {
    const r = check(root);
    r.fails.forEach(x => console.log('FAIL ' + x));
    console.log(r.fails.length ? 'img-dims: FAILED' : 'img-dims: OK');
    process.exit(r.fails.length ? 1 : 0);
  }
  const d = build(root);
  writeFileSync(join(root, 'img-dims.js'), text(d));
  console.log('img-dims.js: ' + Object.keys(d).length + ' photos, ' + text(d).length + ' bytes');
}
