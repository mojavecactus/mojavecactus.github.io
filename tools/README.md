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
3. `node tools/encrypt-data.mjs <team-password> [extra-password ...]` — regenerates `payload.enc.json`.
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
3. Edit data.js / gtin.js / whatsnew.js and/or app assets. **After any change under `img/` or `guide/pages/`**
   (add, replace, re-encode, delete): `node tools/img-manifest.mjs` — it rewrites `img-manifest.json` and stamps
   `IMG_MANIFEST` in sw.js (verify.mjs fails until you do). `--diff <old manifest>` shows what phones will download.
4. `node tools/encrypt-data.mjs <team-password>`.
5. Round-trip check: decrypt the fresh payload in a temp dir and sha256-compare
   data.js / gtin.js / whatsnew.js against the working copies.
6. **Version-at-push rule:** after a final `git fetch`, read `origin/main:sw.js` line 1 and set
   the new CACHE to that number **+1** (`tbx-vNNN-YYYYMMDD`). Never reuse or guess a number —
   this is what prevents two sessions colliding on the same version.
7. `node tools/verify.mjs` — must print VERIFY PASSED. Fix any FAIL before committing.
8. Commit payload.enc.json + sw.js (+ app-<ver>.js/img/img-manifest.json as needed) and push.
   The app bundle is versioned by filename: `git mv app-<old>.js app-<new>.js`, then update the
   `<script src>` in index.html and both sw.js entries (ASSETS + CORE); verify.mjs/integrity.py read
   the name from index.html.
9. Trigger a Pages build (`POST /repos/<owner>/<repo>/pages/builds`) and poll `/pages/builds/latest`
   until `status=built` on the pushed SHA; re-trigger if a stale SHA reports built.

## Offline photos (service worker)

- `sw.js` precaches only the app shell (ASSETS; CORE blocks the update) into the per-release cache `tbx-vNNN-…`.
  Photos (`img/`) and the cycle-count guide pages (`guide/pages/`) live in the long-lived cache `tbx-img`, keyed by
  content hash from `img-manifest.json` (`<scope>img/x.jpg?h=<16 hex of sha256>`). A release keeps what phones
  already saved, copies photos out of older shell caches on install (hash-checked, no network), prunes files the
  manifest no longer lists, and phones download only new or changed files.
- The page fills missing photos in the background, 4 at a time from 3 s after the first screen
  (`window.TBX_PHOTOS`, event `tbx-photo`); About shows "Offline photos: N of 665 saved". An unsaved photo offline
  gets an inline "Photo downloads when online" picture from the SW; a real load error in a card shows
  "Photo not saved offline yet · Tap to try again".
- **Every sw.js — a rollback too — must delete old caches only through `isShell()` (`/^tbx-v\d+-/`)**, or phones
  lose their offline photos. verify.mjs checks this.
- If a released sw.js stops phones from loading or working offline: `tools/emergency/README.md`.

## Conventions

- **Serialization:** `data.js` is written as `'window.TOOLBOX='+JSON.stringify(D).replace(/-/g,'\\u002d')+';\n'`
  — one line, trailing newline, every `-` escaped as `\u002d` (this is what the live payload uses).
  `gtin.js` is exactly two lines. Semantic JSON comparison — not byte diff — is the correct
  round-trip test.
- **Spec style:** metric values are written tight (`4mm`, not `4 mm`). verify.mjs enforces this.
- **CACHE** bumps on every deploy. **APPVER** bumps whenever app logic changes (bundle rename).
  **What's New** entries are added only with wording provided by the owner; releases are
  otherwise silent. Append new items at the **end** of `whatsnew.js` (oldest → newest); the app
  shows the newest first.
- One-shot migration scripts stay out of the repo (run them from a scratch directory);
  `tools/` is for durable tooling only.

## Test suites

Passwords come from the environment only — never write them into a file. jsdom is borrowed from
`tools/cc-test/node_modules` or `tools/bo/node_modules` (`npm i jsdom@24` in either, once); Playwright
from the global install. Suites marked *data.js* need the decrypted catalog (step 2 of the runbook).

- `node tools/verify.mjs` — data checks; must print VERIFY PASSED.
- `cd tools/cc-test && TZ=UTC APP_PW=<catalog pw> node run.js` — cycle-count sync engine (see its README).
- `node tools/usage/test.js`, `APP_PW=<catalog pw> node tools/usage/app-test.js` — usage hub, dashboard and its
  "To review" card, feedback kept offline; `UHUB=new` runs the dashboard sections against the v2 hub (see
  `tools/usage/README.md`, which also has the hub deploy steps: hub first, then the app).
- `node tools/bo/test.js`, `cd tools/bo && APP_PW=<catalog pw> node app-test.js` — Backorder Report
  (fixtures in `tools/bo/fixtures/`, gitignored).
- `APP_PW=… CT_PW=… FA_PW=… FIXED=1 tools/fa2-test/launch.sh` — F&A (Playwright).
- `tools/search-test/` (*data.js*):
  - `node tools/search-test/run.js --out tools/search-test/before.json` on the bundle **before** a search
    change, then `node tools/search-test/run.js --base tools/search-test/before.json --expect` on the new one.
    The SPECIAL expectations must pass; every printed DIFF is a ranking change to review. The JSON is
    derived from the catalog, so `tools/search-test/*.json` is gitignored — never commit it.
  - `node tools/search-test/ui.js` — the search box: "1 item", the clear ✕, clearing re-runs the screen
    underneath (Backorder Report, family chips), "No exact match — close spellings", "Ask Nate to add …", the filters
    in one row of pills with "Clear · N" and the count in the bucket chip (P21), recent searches with Clear + Undo (P20),
    and the search state in the URL (`#/?q=…&c=Implants&dia=2.3mm`, `?t=` family chips): Back restores it, deep links
    paint it.
- `node tools/cards-test/release-a.cjs` (*data.js*) — product cards: navigation closes the photo viewer and
  share sheet, the spec grid, shared/copied text carries the name, REF and link.
- `node tools/cards-test/card-test.cjs [--no-walk]` (*data.js*) — the release-6 card: block order (title → status →
  key facts → sticky part-number band → Instrumentation links → jump chips → specs), key facts lifted from the table
  without repeats, one-line status with details, one pill style, the readable spec table, "Specs coming" (flag only
  with the owner key), the photo strip and viewer (swipe, keys, Close, page numbers), the v1 fallback, and a walk that
  renders every card (items, probes, shavers) and checks each spec row shows once.
- `APP_PW=<catalog pw> node tools/cards-test/card-shots.cjs --out <dir> [--site <dir>] [--port 84xx] [--engine webkit]`
  (Playwright, service worker blocked) — card screenshots at 320/390/430 plus interactions (status open, sticky band,
  jump, strip swipe, viewer, Back closes it, share sheet, owner flag) and `<out>/measure.json` (block positions, tap
  targets under 44 pt, overflow past the card). `--sweep` renders every card at 390×844 into `<out>/heights.json` and
  prints the height / first-spec-value percentiles; run it on the old and the new build to compare.
- `tools/platform-test/` (Playwright; serves the repo root through its own Pages-like server):
  - `APP_PW=<catalog pw> node tools/platform-test/boot-failsafe.js [--engine webkit]` — a start-up failure
    keeps the saved login, never wipes caches offline or unregisters the service worker, and shows the
    "ToolBox didn't open" card (13 checks).
  - `APP_PW=<catalog pw> node tools/platform-test/lockdev.js [--engine webkit]` — "Lock this device" signs out
    every login but keeps unsent scans and the rep's own data (4 checks).
  - `APP_PW=<catalog pw> node tools/platform-test/sw-upgrade.js --scenario <name> --old <live build> [--new <dir>]
    [--engine webkit] [--port N]` — the service worker across an update (P2/P34). `--old` is a plain copy of the
    build that is live on phones (`git worktree add` or `git archive <sha> | tar -x -C <dir>`), `--new` defaults to
    the repo root; the link is throttled to `--rate 200000` bytes/s (≈1.6 Mbps) with `--rtt 150` ms. Scenarios:
    - `update`: every photo the old version saved opens offline 10 s after tapping "Update ready" (and 11 on 8 common
      cards), no unchanged photo is downloaded, then an offline launch, the password gate, a card, `#/cc`, `#/ct`
      and `#/fa2` still work.
    - `prune`: a copy of `--new` that drops one photo and changes another (built in `--work`, default the OS temp
      folder): the removed one is pruned, only the changed one downloads.
    - `resume`: first install over the throttled link, the app closed after 25 s and reopened: the fill resumes,
      never downloads a saved photo twice, and completes.
    - `photofail`: every photo request fails during the update: it still activates, offline cards show the
      placeholder, the app works offline; back online the card swaps in the real photos; an HTTP 500 photo shows
      "Photo not saved offline yet · Tap to try again" and a tap loads it.
    - `busy`: "Update ready" tapped while the fill runs: the page reloads promptly and the fill resumes.
    - `emergency`: `tools/emergency/sw-emergency.js` served as sw.js takes over without a tap and keeps every cache.
  - All three start `tools/platform-test/tserver.js` (Pages-like: gzip, max-age=600, throttling, and `/__ctl` switches
    for offline, failing photo requests and an alternate sw.js).
  - `APP_PW=<catalog pw> node tools/platform-test/ptr-test.js [--engine webkit]` — pull to refresh (P48), with fake
    cycle-count and F&A logins and fake hubs (nothing reaches a real hub); 10 checks, about a minute. Chromium gets
    real CDP touches, WebKit gets TouchEvents at the same point; `--mode baseline --site <old build>` expects the old
    bugs instead. It checks that:
    - a full pull on the cycle-count home and on F&A refreshes once and clears, exactly as before;
    - a touchcancel, leaving the screen or the app going to the background mid-pull leaves no ↻ behind;
    - a refresh that never settles lets go of the ↻ after 20 s, and the next pull works;
    - a pull on the Backorder Report fetches it once and spins its ↻; offline, the arrow still clears.
    every login but keeps unsent scans, unsent feedback and the rep's own data (5 checks).
  - `APP_PW=<catalog pw> node tools/platform-test/feedback-offline.js [--engine webkit]` — feedback written
    without signal is kept (note in `tbx_fbq`, screenshot in Cache Storage `tbx-fbq`), survives a reload, is sent
    exactly once when signal returns; the name is remembered; the 2 MB picture budget; a service-worker update
    keeps the queue (16 checks). Its fake relay listens on `--port` + 1.
  - These harnesses never put a live hub URL in the page (TOOLBOX.usage / .bo / .fb are removed or faked): in
    WebKit, Playwright's `route()` does not apply once a service worker controls the page, so a real URL would be
    called. Pass `--port` to keep to an agreed port range.
  - WebKit (the iPhone engine) needs a Playwright WebKit build: set `PLAYWRIGHT_BROWSERS_PATH` to the folder
    holding it. Never run `playwright install` into system paths for this.
- `tools/nav-test/` — navigation (Back keeps your place, bottom-bar Back, lists, report) and the cycle-count / F&A fence.
  No decrypted data needed.
  - `APP_PW=<catalog pw> [ENGINE=chromium|webkit] [PORT=n] node tools/nav-test/e2e.js [jobRegex]` (Playwright) — search →
    filter → card → Back restores the query, chip, filters, rows and scroll (P5); long lists two levels deep, Back ×2 and
    Forward, a card whose photos land late, the Backorder Report's filter/section/scroll (P35, P46); the bottom-bar Back,
    the 9 pt shorter catalog header, 320 pt and landscape (P36); favorites 8 + Show all kept on Back, current titles (P37,
    P38); text-only list rows, plain titles, drill rows (P39, P41); 44 pt targets (P40); the report header (P47); filter
    row and recent searches in a real browser (P20, P21); plus the 4.143 fixes. Run both engines: WebKit is where Back
    used to land at the top. `MODE=baseline` asserts the old bugs instead (point `ROOT` at an old checkout).
  - `node tools/nav-test/ccfa-identity.js <live site> <candidate site> [--json out.json]` (jsdom) — drives cycle count and
    F&A through the same 26 steps on both builds (fake hubs and stored logins, no passwords) and fails on any difference
    on a CC/F&A step: content, header, bottom bar, body classes, pull-to-refresh, scrolls, `history.state`,
    `scrollRestoration`, hub traffic. The 3 catalog steps may differ. Live site: `git archive origin/main | tar -x -C <dir>`.
  - `node tools/nav-test/emoji-scan.js [--check]` — glyph inventory of the bundle and index.html; `--check` fails if a
    catalog screen uses an emoji / symbol glyph instead of the line-icon set (`ICON`). The keep list (cycle count / F&A,
    the pull-to-refresh arrow, Android's menu glyph, "Sent ✓") is in the file.
  - `node tools/nav-test/unit.js [--site <dir>]` (jsdom, fixture catalog, no passwords) — nav ids, the 60-record cap and
    untracked CC/F&A entries (P35); current titles with saved fallback and retired numbers (P38); 8 favorites + Show
    all kept on Back (P37); `#/bo?bq=` filtering, words in any order, `?bs=` and Back to the report (P46, P47). 23 checks.
  - Catalog history entries carry `history.state.nav`; their scroll, filters and screen extras live in sessionStorage
    `tbx_nav` for the launch. Cycle count / F&A entries (`routeIsCT`) are never tracked and keep `scrollRestoration`
    'auto'. Any `history.replaceState` must pass `history.state` (or call `stWrite()`), or the entry loses its place (the
    variant-chip swap drops it on purpose: the new card starts at the top).
