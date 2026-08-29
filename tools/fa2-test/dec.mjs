import fs from 'fs'; import { webcrypto as c } from 'crypto';
const [,, file, pw] = process.argv; const P = JSON.parse(fs.readFileSync(file, 'utf8'));
const b = s => Buffer.from(s, 'base64');
const km = await c.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await c.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b(P.salt), iterations: P.it }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const buf = await c.subtle.decrypt({ name: 'AES-GCM', iv: b(P.iv) }, key, b(P.ct));
console.log(new TextDecoder().decode(buf));
