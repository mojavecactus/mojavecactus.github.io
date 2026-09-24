#!/usr/bin/env node
// Encrypts data.js + gtin.js + whatsnew.js into payload.enc.json.
// Usage:  node tools/encrypt-data.mjs <team-password> [extra-password ...]   (run from the repo root)
// Format (P49 + P50): the three files are evaluated and the four globals they define (TOOLBOX, TBX_GTIN, TBX_GTIN14,
// TBX_WN) become one JSON object (envelope f:'json' — the page JSON.parses it instead of eval'ing JS), which is
// compressed with raw deflate (z:'deflate-raw', about 1.2 MB → 0.11 MB) and then encrypted: AES-256-GCM, the key from
// PBKDF2-SHA256 (210k iterations) over the team password and a new random salt. A new salt means phones that chose
// "Remember me" ask for the team password once after the release. Each extra password unlocks the same payload
// through a key wrap: PBKDF2(extra, same salt) encrypts the content key, stored in `wraps`.
// Nothing is written unless the data is plain JSON (no functions, undefined, NaN) and the finished payload, opened
// again with every password (tools/payload-lib.cjs, the same code the test suites use), gives back exactly what the
// three files define.
// The plaintext files are gitignored — commit ONLY payload.enc.json.
import { webcrypto as wc } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
const require = createRequire(import.meta.url);
const { openPayload, GLOBALS } = require('./payload-lib.cjs');

const [pw, ...extras] = process.argv.slice(2);
if (!pw) { console.error('Usage: node tools/encrypt-data.mjs <team-password> [extra-password ...]'); process.exit(1); }

const FILES = ['data.js', 'gtin.js', 'whatsnew.js'];
for (const f of FILES) {
  if (!existsSync(f)) { console.error('Missing ' + f + ' — run tools/decrypt-data.mjs first, or restore the master copies.'); process.exit(1); }
}
// P50: values, not code. The files are ours (window.X = …); evaluate them and keep the data they define.
const win = {};
for (const f of FILES) {
  try { new Function('window', readFileSync(f, 'utf8'))(win); }
  catch (e) { console.error(f + ' does not run: ' + e.message + ' — not written.'); process.exit(1); }
}
const G = {};
for (const k of GLOBALS) if (win[k] !== undefined) G[k] = win[k];
if (!G.TOOLBOX || !G.TBX_GTIN || !G.TBX_WN) { console.error('data.js, gtin.js and whatsnew.js must set window.TOOLBOX, window.TBX_GTIN and window.TBX_WN — not written.'); process.exit(1); }
const json = JSON.stringify(G);
if (!isDeepStrictEqual(JSON.parse(json), G)) { console.error('The data is not plain JSON (a function, undefined, NaN or Infinity somewhere) — not written.'); process.exit(1); }
const plain = Buffer.from(json, 'utf8');
const body = zlib.deflateRawSync(plain, { level: 9 });                                                  // P49

const b64 = a => Buffer.from(a).toString('base64');
const salt = wc.getRandomValues(new Uint8Array(16));
const iv = wc.getRandomValues(new Uint8Array(12));
const IT = 210000;

async function derive(p, usages, extractable) {
  const km = await wc.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: IT }, km, { name: 'AES-GCM', length: 256 }, extractable, usages);
}
const key = await derive(pw, ['encrypt'], true);
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
const rawKey = new Uint8Array(await wc.subtle.exportKey('raw', key));

const wraps = [], pws = [pw];
for (const x of extras) {
  if (!x || x === pw || pws.includes(x)) continue;
  const kek = await derive(x, ['encrypt'], false);
  const wiv = wc.getRandomValues(new Uint8Array(12));
  const wct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, kek, rawKey));
  wraps.push({ iv: b64(wiv), ct: b64(wct) });
  pws.push(x);
}

const out = { v: wraps.length ? 2 : 1, kdf: 'PBKDF2-SHA256', it: IT, salt: b64(salt), iv: b64(iv), ct: b64(ct), z: 'deflate-raw', f: 'json' };
if (wraps.length) out.wraps = wraps;
// Self-check: what a phone will decode, with every password, must equal what the three files define.
for (const p of pws) {
  let back = null;
  try { back = JSON.parse(openPayload(out, p).toString('utf8')); } catch (e) { console.error('Self-check failed: ' + e.message + ' — not written.'); process.exit(1); }
  if (!isDeepStrictEqual(back, G)) { console.error('Self-check failed: the payload does not decode to the same data — not written.'); process.exit(1); }
}
const file = JSON.stringify(out);
writeFileSync('payload.enc.json', file);
console.log('payload.enc.json written: ' + plain.length + ' B of data → ' + body.length + ' B compressed → ' + file.length + ' B file (' +
  FILES.join(' + ') + (wraps.length ? ', ' + wraps.length + ' extra password' + (wraps.length > 1 ? 's' : '') : '') + '; decrypts back to the same data)');
console.log('REMINDER: bump the CACHE version in sw.js before committing.');
