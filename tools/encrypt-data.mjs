#!/usr/bin/env node
// Encrypts data.js + gtin.js + whatsnew.js into payload.enc.json (AES-256-GCM, key from PBKDF2).
// Usage:  node tools/encrypt-data.mjs <team-password>   (run from the repo root)
// The plaintext files are gitignored — commit ONLY payload.enc.json.
import { webcrypto as wc } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const pw = process.argv[2];
if (!pw) { console.error('Usage: node tools/encrypt-data.mjs <team-password>'); process.exit(1); }

const FILES = ['data.js', 'gtin.js', 'whatsnew.js'];
for (const f of FILES) {
  if (!existsSync(f)) { console.error('Missing ' + f + ' — run tools/decrypt-data.mjs first, or restore the master copies.'); process.exit(1); }
}
const plaintext = FILES.map(f => readFileSync(f, 'utf8')).join('\n');

const b64 = a => Buffer.from(a).toString('base64');
const salt = wc.getRandomValues(new Uint8Array(16));
const iv = wc.getRandomValues(new Uint8Array(12));
const IT = 210000;

const km = await wc.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: IT },
  km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));

writeFileSync('payload.enc.json', JSON.stringify({
  v: 1, kdf: 'PBKDF2-SHA256', it: IT, salt: b64(salt), iv: b64(iv), ct: b64(ct)
}));
console.log('payload.enc.json written (' + ct.length + ' bytes ciphertext, ' + FILES.join(' + ') + ')');
console.log('REMINDER: bump the CACHE version in sw.js before committing.');
