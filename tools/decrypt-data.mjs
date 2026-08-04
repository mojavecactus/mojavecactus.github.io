#!/usr/bin/env node
// Recovers the plaintext data files from payload.enc.json.
// Usage:  node tools/decrypt-data.mjs <team-password>   (run from the repo root)
// Writes data.js, gtin.js, whatsnew.js locally (they are gitignored — never commit them).
import { webcrypto as wc } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const pw = process.argv[2];
if (!pw) { console.error('Usage: node tools/decrypt-data.mjs <team-password>'); process.exit(1); }

const P = JSON.parse(readFileSync('payload.enc.json', 'utf8'));
const b = s => new Uint8Array(Buffer.from(s, 'base64'));

const km = await wc.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt: b(P.salt), iterations: P.it },
  km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);

let pt;
try {
  pt = new TextDecoder().decode(await wc.subtle.decrypt({ name: 'AES-GCM', iv: b(P.iv) }, key, b(P.ct)));
} catch (e) {
  console.error('Decryption failed — wrong password (or corrupted payload).');
  process.exit(1);
}

// The payload is the three files concatenated; split on the window.X= markers.
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
