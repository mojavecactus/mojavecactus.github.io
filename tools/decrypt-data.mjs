#!/usr/bin/env node
// Recovers the plaintext data files from payload.enc.json.
// Usage:  node tools/decrypt-data.mjs <password>   (run from the repo root) — any of the payload's passwords works.
// Writes data.js, gtin.js, whatsnew.js locally (they are gitignored — never commit them).
// Reads both payload formats (tools/payload-lib.cjs):
//   - JSON (z/f in the envelope; tools/encrypt-data.mjs writes this): data.js and gtin.js come back in the house
//     serialization (tools/README.md), byte-identical to the files that were encrypted; whatsnew.js in the canonical
//     form `window.TBX_WN = <JSON, 2-space indent>;` — the same data as the encrypted file, laid out like this.
//   - the old format (no z/f): the three files concatenated, split on their window.X= markers exactly as before.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { openPayload } = require('./payload-lib.cjs');

const pw = process.argv[2];
if (!pw) { console.error('Usage: node tools/decrypt-data.mjs <password>'); process.exit(1); }

const P = JSON.parse(readFileSync('payload.enc.json', 'utf8'));
let pt = null;
try { pt = openPayload(P, pw).toString('utf8'); }
catch (e) { console.error('Decryption failed — ' + e.message + '.'); process.exit(1); }

if (P.f === 'json') {
  const G = JSON.parse(pt);
  const files = {
    'data.js': 'window.TOOLBOX=' + JSON.stringify(G.TOOLBOX).replace(/-/g, '\\u002d') + ';\n',
    'gtin.js': 'window.TBX_GTIN=' + JSON.stringify(G.TBX_GTIN) + ';\n' + ('TBX_GTIN14' in G ? 'window.TBX_GTIN14=' + JSON.stringify(G.TBX_GTIN14) + ';\n' : ''),
    'whatsnew.js': 'window.TBX_WN = ' + JSON.stringify(G.TBX_WN, null, 2) + ';\n'
  };
  Object.entries(files).forEach(([name, txt]) => { writeFileSync(name, txt); console.log('wrote ' + name); });
} else {
  // The old payload is the three files concatenated; split on the window.X= markers.
  const starts = [
    { name: 'data.js', marker: 'window.TOOLBOX=' },
    { name: 'gtin.js', marker: 'window.TBX_GTIN' },
    { name: 'whatsnew.js', marker: 'window.TBX_WN' }
  ].map(f => ({ ...f, idx: pt.indexOf(f.marker) }));
  starts.sort((a, b2) => a.idx - b2.idx);
  starts.forEach((f, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].idx : pt.length;
    writeFileSync(f.name, pt.slice(f.idx, end).replace(/\n+$/, '\n'));
    console.log('wrote ' + f.name);
  });
}
