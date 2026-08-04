# Data encryption — how this repo works now

The product data (`data.js`), barcode map (`gtin.js`), and what's-new feed (`whatsnew.js`) are
**not stored in this repository in readable form**. They are encrypted into `payload.enc.json`
(AES-256-GCM; the key is derived from the team password with PBKDF2-SHA256, 210k iterations).
The site decrypts it in the browser after the password is entered — the password never leaves
the device and the readable data never touches the server.

## Editing the data

1. `node tools/decrypt-data.mjs <team-password>` — writes data.js / gtin.js / whatsnew.js
   locally. These files are **gitignored**; they must never be committed.
2. Edit them as before.
3. `node tools/encrypt-data.mjs <team-password>` — regenerates `payload.enc.json`.
4. Bump the CACHE version on line 1 of `sw.js`.
5. Commit `payload.enc.json` (+ sw.js) and push.

## Changing the team password

Re-run `tools/encrypt-data.mjs` with the new password (after decrypting with the old one).
Everyone's saved "Remember me" sessions stop working automatically — the old stored key can no
longer decrypt the new payload, so the login screen reappears.

## Recovery

Losing this repo is not fatal as long as `payload.enc.json` and the team password survive:
`decrypt-data.mjs` reproduces the plaintext exactly. A master copy of the plaintext data is
also kept in the owner's private Claude project. If the password itself is lost, the encrypted
payload is unrecoverable by design — restore from the project master copy and re-encrypt with
a new password.
