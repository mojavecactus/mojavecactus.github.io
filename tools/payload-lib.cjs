// tools/payload-lib.cjs — the one place (Node side) that knows the payload envelope. Used by tools/decrypt-data.mjs,
// tools/encrypt-data.mjs (self-check), tools/cc-test/run.js, tools/bo/app-test.js and tools/usage/app-test.js.
//   envelope (payload.enc.json): { v, kdf, it, salt, iv, ct, [wraps], [z: 'deflate-raw'], [f: 'json'] }
//     z = 'deflate-raw' (P49): the plaintext was compressed with raw deflate before encryption
//     f = 'json'        (P50): the plaintext is {"TOOLBOX":…,"TBX_GTIN":…,"TBX_GTIN14":…,"TBX_WN":…}, not JS text
//     neither           : the old format — data.js + gtin.js + whatsnew.js concatenated (still readable)
//   openPayload(P, pw)       → Buffer: the plaintext (primary password or one of its wraps; inflated when P.z)
//   payloadGlobals(root, pw) → { TOOLBOX, TBX_GTIN, TBX_GTIN14, TBX_WN }
//   payloadScript(root, pw)  → the plaintext as a script a jsdom suite can eval (a JSON payload becomes window.X=…;)
const crypto = require('crypto'), zlib = require('zlib'), fs = require('fs'), path = require('path'), vm = require('vm');
const GLOBALS = ['TOOLBOX', 'TBX_GTIN', 'TBX_GTIN14', 'TBX_WN'];

function gcm(key, ivB64, ctB64) {
  const ct = Buffer.from(ctB64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
}
function openPayload(P, pw) {
  if (P.z && P.z !== 'deflate-raw') throw new Error('unknown payload compression z=' + P.z);
  if (P.f && P.f !== 'json') throw new Error('unknown payload format f=' + P.f);
  const key = crypto.pbkdf2Sync(String(pw), Buffer.from(P.salt, 'base64'), P.it, 32, 'sha256');
  let buf = null;
  try { buf = gcm(key, P.iv, P.ct); } catch (e) {
    // not the primary password: it may hold the content key in a wrap (same salt, so one PBKDF2 covers every attempt)
    for (const w of (P.wraps || [])) { try { buf = gcm(gcm(key, w.iv, w.ct), P.iv, P.ct); break; } catch (e2) {} }
  }
  if (!buf) throw new Error('wrong password (or corrupted payload)');
  return P.z ? zlib.inflateRawSync(buf) : buf;
}
// the jsdom suites boot many times: decrypt each payload file once per password
const memo = new Map();
function plain(root, pw) {
  const raw = fs.readFileSync(path.join(root, 'payload.enc.json'), 'utf8');
  const k = raw + '\u0000' + pw;
  if (!memo.has(k)) { const P = JSON.parse(raw); memo.clear(); memo.set(k, { P, txt: openPayload(P, pw).toString('utf8') }); }
  return memo.get(k);
}
function payloadGlobals(root, pw) {
  const { P, txt } = plain(root, pw);
  if (P.f === 'json') return JSON.parse(txt);
  const sb = { window: {} }; vm.createContext(sb); vm.runInContext(txt, sb);
  const o = {}; GLOBALS.forEach(k => { if (sb.window[k] !== undefined) o[k] = JSON.parse(JSON.stringify(sb.window[k])); });
  return o;
}
function payloadScript(root, pw) {
  const m = plain(root, pw);
  if (m.P.f !== 'json') return m.txt;
  if (!m.script) { const o = JSON.parse(m.txt); m.script = GLOBALS.filter(k => k in o).map(k => 'window.' + k + '=' + JSON.stringify(o[k]) + ';').join('\n'); }
  return m.script;
}
module.exports = { openPayload, payloadGlobals, payloadScript, GLOBALS };
