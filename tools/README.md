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

## Deploy runbook (every release)

1. `git fetch origin && git pull --ff-only origin main` — always start from remote HEAD.
   If another chat/session is also deploying, finish one before starting the other.
2. `node tools/decrypt-data.mjs <team-password>` — live payload is the ONLY source of truth
   (any project-knowledge copy of data.js is a stale convenience snapshot).
3. Edit data.js / gtin.js / whatsnew.js and/or app assets.
4. `node tools/encrypt-data.mjs <team-password>`.
5. Round-trip check: decrypt the fresh payload in a temp dir and sha256-compare
   data.js / gtin.js / whatsnew.js against the working copies.
6. **Version-at-push rule:** after a final `git fetch`, read `origin/main:sw.js` line 1 and set
   the new CACHE to that number **+1** (`tbx-vNNN-YYYYMMDD`). Never reuse or guess a number —
   this is what prevents two sessions colliding on the same version.
7. `node tools/verify.mjs` — must print VERIFY PASSED. Fix any FAIL before committing.
8. Commit payload.enc.json + sw.js (+ app-<ver>.js/img as needed), push, then trigger a Pages build.
   The app bundle is versioned by filename: `git mv app-<old>.js app-<new>.js`, then update the
   `<script src>` in index.html and both sw.js entries (ASSETS + CORE); verify.mjs/integrity.py read
   the name from index.html
   (`POST /repos/<owner>/<repo>/pages/builds`) and poll `/pages/builds/latest` until
   `status=built` on the pushed SHA; re-trigger if a stale SHA reports built.

## Conventions

- **Serialization:** `data.js` is written as `window.TOOLBOX=` + `JSON.stringify(D)` + `;\n`
  (plain JSON, trailing newline). The old `\u002d` dash-escaping is retired; semantic JSON
  comparison — not byte diff — is the correct round-trip test.
- **Spec style:** metric values are written tight (`4mm`, not `4 mm`). verify.mjs enforces this.
- **CACHE** bumps on every deploy. **APPVER** bumps only for user-visible feature changes.
  **What's New** entries are added only with wording provided by the owner; releases are
  otherwise silent.
- One-shot migration scripts stay out of the repo (run them from a scratch directory);
  `tools/` is for durable tooling only.
