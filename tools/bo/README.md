# Backorder Report — core, hub, tests

The weekly Stryker "Inventory Report: Week of M.D.YY" email (forwarded by the owner to the
syksmtoolbox Gmail) is parsed by an Apps Script hub into a Google Sheet and served to the app as
JSON (`{action:'bo', key}` POST, text/plain — same shape as the other hubs). The app reads
`TOOLBOX.bo = {url, key}` from the encrypted payload, caches the JSON in `localStorage.tbx_bo`,
fetches at most every 30 min (never on the render path), and shows status pills / the report.

- `bo-core.js` — pure parser + snapshot rules. **Pasted verbatim into the hub project as `Core.gs`**;
  keep the two identical (the hub has no build step).
- `test.js` — parser/snapshot/API tests. `node tools/bo/test.js`
- `app-test.js` — the real bundle in jsdom with the hub faked (tile, #/bo, pills, fetch policy, offline,
  CT screens untouched). `cd tools/bo && npm i jsdom@24 && APP_PW=<catalog pw> node app-test.js`
- `shots.js` — phone-width screenshots via Playwright into `tools/bo/shots/`. `APP_PW=<pw> node tools/bo/shots.js`
- `fixtures/` (gitignored, Stryker-internal): `report-2026-09-07.html` (a real forwarded email) and
  `seed-2026-09-09.json` (the Highspot export). Copies live in the owner's private project; the
  suites skip the fixture-based checks when the folder is empty.

Hub source (`Code.gs`) and deployment details are kept in the owner's private project (`claude/bo-state.md`).
