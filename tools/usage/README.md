# Usage — anonymous in-app usage data + the Team Usage dashboard

The app records what gets used — screens, cards opened, catalog searches (term + result count), catalog
scans (card / moved / no card / unknown barcode), favorites, shares, JavaScript errors and a heartbeat
while the app is open — and sends it to a hub on the syksmtoolbox Apps Script. **No names and nothing typed
into forms**: each phone is a random id (`tbx_uid`), sessions end after 30 idle minutes, cycle-count and F&A
screens are recorded by screen name only. The cycle-count scanner is not tracked.

- App side (bundle `app-<ver>.js`, "Usage (anonymous)" module): config = `TOOLBOX.usage {url, key}` in the
  encrypted payload (`usage.off: true` switches it off). Events queue in memory, are saved when the app is
  hidden and restored on the next launch, and go out in batches of ≤100 with a batch id (the hub drops a
  repeated id, so a lost reply never double-counts). Nothing runs on the render path.
- Dashboard `#/usage`: five quick taps on the version number at the foot of Home (or the footer "Usage" link
  once a device has the key). Needs the **admin key**, which is not in the payload; a device holding it is
  flagged and left out of the numbers unless "Include my devices" is ticked.
- Hub (`usage-hub.js` → `Usage.gs`, `usage-core.js` → `UsageCore.gs`) lives in the "TBX Backorder Hub" project
  (same deployment URL; Code.gs hands `u_*` actions to `usageHandle`). Data: spreadsheet "SM ToolBox — Usage",
  tab Events (ts · device · session · type · key · extra, all plain text). Keys and ids: owner's private
  project doc `claude/usage-state.md`.

Tests
- `node tools/usage/test.js` — core (Eastern time, ingest validation, live/stats) + the hub in a vm with fake
  Apps Script services. `BO_CODE=<path to Code.gs>` also loads the backorder code to check the dispatch.
- `APP_PW=<pw> node tools/usage/app-test.js` — the real bundle in jsdom with the hub faked (borrows jsdom from
  `tools/bo/node_modules` or `tools/cc-test/node_modules`).
- `APP_PW=<pw> node tools/usage/shots.js` — phone-width screenshots of the dashboard over synthetic data
  (needs Playwright and a decrypted `data.js`), into `tools/usage/shots/` (gitignored).
