# Usage — anonymous in-app usage data + the Team Usage dashboard

The app records what gets used — screens, cards opened, catalog searches (term + result count), catalog
scans (card / moved / no card / unknown barcode), favorites, shares, JavaScript errors and a heartbeat
while the app is open — and sends it to a hub on the syksmtoolbox Apps Script. **No names and nothing typed
into forms**: each phone is a random id (`tbx_uid`), sessions end after 30 idle minutes, cycle-count and F&A
screens are recorded by screen name only. The cycle-count scanner is not tracked.

**Real people only (since 4.153).** Nothing is recorded — no id, no queue, no request — in automated or test
browsers (`navigator.webdriver`: Playwright, Puppeteer, Selenium; HeadlessChrome, jsdom, Electron user agents; an
iPhone / iPad / Mac user agent on a Linux or Windows `navigator.platform`, which is Playwright WebKit and device
emulation; Playwright / Selenium / PhantomJS page globals), in a browser switched off on the dashboard foot ("Don’t
count this device" → `localStorage.tbx_unotrack = 1`; "Count it again" undoes it; Lock this device keeps it), and for
the rest of a launch after machine-speed navigation (15 screens or cards inside 5 s; what hadn't gone out is dropped).
The dashboard itself still works in all of them. A test that needs the tracker in a real browser engine must fake
`navigator.webdriver` and `navigator.platform` on purpose, and must never carry the live hub URL.

- App side (bundle `app-<ver>.js`, "Usage (anonymous)" module): config = `TOOLBOX.usage {url, key}` in the
  encrypted payload (`usage.off: true` switches it off). Events queue in memory, are saved when the app is
  hidden and restored on the next launch, and go out in batches of ≤100 with a batch id (the hub drops a
  repeated id, so a lost reply never double-counts). Nothing runs on the render path.
- Dashboard `#/usage`: five quick taps on the version number at the foot of Home (or the footer "Usage" link
  once a device has the key). Needs the **admin key**, which is not in the payload; a device holding it is
  flagged and left out of the numbers unless "Include my devices" is ticked.
- **To review** (under the Live card): the last 30 days' searches whose latest try still finds nothing, barcodes
  the scanner didn't recognize, and part numbers with no card (no-card scans + missing-card links, merged) —
  most people first, then tries, top 100 per list. Row actions: Search it (opens `#/?q=…`, logs nothing), Copy,
  Done / Ignore with Undo, Note; the Barcodes list has "Copy GTINs for the FDA lookup". Ignore is permanent
  (Reopen from "Show done & ignored"); a Done row comes back ("BACK") when it happens again after the mark, unless
  this phone's catalog already answers it. The list follows "Include my devices". With a hub older than v2 the
  card is one quiet line: "The review list needs the usage-hub update."
- Hub: standalone Apps Script project "TBX Usage Hub" on the syksmtoolbox account (kept separate from the
  backorder hub) — `usage-main.js` → `Code.gs` (doGet/doPost), `usage-hub.js` → `Usage.gs`, `usage-core.js` →
  `UsageCore.gs`, all verbatim. Data: spreadsheet "SM ToolBox — Usage", tab Events (ts · device · session · type ·
  key · extra) and tab Review (type · key · status · note · updated — what the owner decided, written only by
  `u_mark`), all plain text. Keys and ids: owner's private project doc `claude/usage-state.md`.

API (POST text/plain JSON; `u_queue` / `u_mark` need the admin key):
- `{action:'u_queue', key, days: 30|7, incl: 0|1, fresh: 0|1}` → `{ok, v: 2, asOf, days, from, cap: 100,
  tot: {search, barcode, part}, search: [{k, n, dev, last, first, ok?, st?, note?, at?, back?}], barcode: […],
  part: [{k, id, …, scan?, link?}]}`. The 30-day aggregate is cached 5 min and the Review statuses 10 min;
  statuses are merged on every request, so a mark never forces a 30-day re-read; `fresh=1` skips both caches.
- `{action:'u_mark', key, t: 'search'|'barcode'|'part', k, st: 'todo'|'done'|'ignore', note?}` → `{ok, t, k, st,
  note, at}` — upsert on type + normalized key (the app sends `row.k`, or `row.id` for parts); the note (≤140)
  stays as it is when not sent, `''` clears it. Errors: `type`, `status`, `bad` (empty key), `busy`, `full`
  (5,000 decisions). `u_ping` → `{ok, v: 2}`.

## Deploying the hub (always BEFORE the app release that uses it)

The v2 hub (review queue) is backward compatible: today's app keeps working against it, and an app with the
"To review" card shows one quiet line against the old hub. So: **hub first, then the app.**

1. `node tools/usage/test.js` → all pass (105).
2. Open the **TBX Usage Hub** project (syksmtoolbox account; link in `claude/usage-state.md`). **Paste the three
   files verbatim**, each replacing the whole editor content, then save (⌘S):
   - `UsageCore.gs` ← `tools/usage/usage-core.js`
   - `Usage.gs` ← `tools/usage/usage-hub.js`
   - `Code.gs` ← `tools/usage/usage-main.js` (unchanged — its checksum must still match)
   Check each against the repo file with a 32-bit FNV-1a over the text (same method as the checksums recorded in
   `claude/usage-state.md`). In the editor tab's console:
   `(s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); })(monaco.editor.getEditors()[0].getModel().getValue())`
   and locally: `node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}console.log((h>>>0).toString(16))" tools/usage/usage-core.js`
3. Optional: run `usageSetup()` once from the editor. It is safe to re-run (it keeps the sheet and the keys) and
   adds the Review tab; the first `u_mark` also creates it. It logs the keys — don't copy that log anywhere.
4. **Deploy → Manage deployments → ✎ → Version: New version → Deploy.** The exec URL stays the same.
5. Check: `u_ping` → `v: 2`; `u_queue` with the admin key → `ok` with three lists; `u_live` / `u_stats` still
   answer; new rows still arrive in Events; a `u_mark` on a junk term adds a Review row. The first POST after a
   deploy can come back as HTML — retry once.
6. Then release the app.

Rollback: Manage deployments → ✎ → Version 1 → Deploy (instant, same URL). The Review tab stays, unused; the app
shows the one-line note.

## Tests
- `node tools/usage/test.js` — core (Eastern time, ingest validation, live/stats, review queue + statuses) + the
  hub project (all three files, as Apps Script would load them) in a vm with fake Apps Script services.
- `APP_PW=<pw> node tools/usage/app-test.js` — the real bundle in jsdom with the hub faked (borrows jsdom from
  `tools/bo/node_modules` or `tools/cc-test/node_modules`). Sections 1–6 run against today's hub (no `u_queue`:
  the one-line note); `UHUB=new` runs them against the v2 hub instead. Section 7 is the "To review" card against
  v2, section 8 the feedback queue (P45: remembered name, focus, kept offline, sent once, refusals, About).
- `APP_PW=<pw> node tools/usage/shots.js` — phone-width screenshots of the dashboard over synthetic data (needs
  Playwright and a decrypted `data.js`), into `tools/usage/shots/` (gitignored): 01–07 the dashboard, 08–12 the
  "To review" card at 390 and 320 px (lists, Done + toggle, note, old hub), 13–14 feedback kept offline.
  `PORT=` / `OUT=` override the local server port (8124) and the output folder.
