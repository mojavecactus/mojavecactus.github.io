#!/usr/bin/env node
// Encrypts data.js + gtin.js + whatsnew.js into payload.enc.json (AES-256-GCM, key from PBKDF2).
// Usage:  node tools/encrypt-data.mjs <team-password> [extra-password ...]   (run from the repo root)
// The first password derives the content key exactly as before (so phones that chose
// "Remember me" keep working across releases). Each extra password unlocks the same payload
// through a key wrap: PBKDF2(extra, same salt) encrypts the content key, stored in `wraps`.
// The plaintext files are gitignored — commit ONLY payload.enc.json.
import { webcrypto as wc } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [pw, ...extras] = process.argv.slice(2);
if (!pw) { console.error('Usage: node tools/encrypt-data.mjs <team-password> [extra-password ...]'); process.exit(1); }

const FILES = ['data.js', 'gtin.js', 'whatsnew.js'];
for (const f of FILES) {
  if (!existsSync(f)) { console.error('Missing ' + f + ' — run tools/decrypt-data.mjs first, or restore the master copies.'); process.exit(1); }
}
const plaintext = FILES.map(f => readFileSync(f, 'utf8')).join('\n');

const b64 = a => Buffer.from(a).toString('base64');
const salt = wc.getRandomValues(new Uint8Array(16));
const iv = wc.getRandomValues(new Uint8Array(12));
const IT = 210000;

async function derive(p, usages, extractable) {
  const km = await wc.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: IT }, km, { name: 'AES-GCM', length: 256 }, extractable, usages);
}
const key = await derive(pw, ['encrypt'], true);
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
const rawKey = new Uint8Array(await wc.subtle.exportKey('raw', key));

const wraps = [];
for (const x of extras) {
  if (!x || x === pw) continue;
  const kek = await derive(x, ['encrypt'], false);
  const wiv = wc.getRandomValues(new Uint8Array(12));
  const wct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, kek, rawKey));
  wraps.push({ iv: b64(wiv), ct: b64(wct) });
}

const out = { v: wraps.length ? 2 : 1, kdf: 'PBKDF2-SHA256', it: IT, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
if (wraps.length) out.wraps = wraps;
writeFileSync('payload.enc.json', JSON.stringify(out));
console.log('payload.enc.json written (' + ct.length + ' bytes ciphertext, ' + FILES.join(' + ') + (wraps.length ? ', ' + wraps.length + ' extra password' + (wraps.length > 1 ? 's' : '') : '') + ')');
console.log('REMINDER: bump the CACHE version in sw.js before committing.');
