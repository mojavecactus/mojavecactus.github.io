// Usage: node tools/fa2-encconfig.mjs <outfile> <password> '<json-plaintext>'
// Encrypts an fa2 config exactly like the cc.enc.json format the app's gate decrypts:
// PBKDF2-SHA256 (random salt, 310000 iters) -> AES-GCM-256, fields {salt, it, iv, ct} base64.
import { webcrypto as wc } from 'crypto'; import fs from 'fs';
const [out, pw, plain] = process.argv.slice(2);
if (!out || !pw || !plain) { console.error('args: outfile password json'); process.exit(1); }
JSON.parse(plain); // must be valid JSON
const salt = wc.getRandomValues(new Uint8Array(16));
const iv = wc.getRandomValues(new Uint8Array(12));
const it = 310000;
const km = await wc.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
const b64 = a => Buffer.from(a).toString('base64');
fs.writeFileSync(out, JSON.stringify({ salt: b64(salt), it, iv: b64(iv), ct: b64(ct) }));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
