# Emergency service worker (release safety)

`sw-emergency.js` is a prepared, tested replacement for `sw.js`. It lives here so it is **never** served as `/sw.js`
by accident. Use it only when a released service worker stops phones from loading ToolBox or from working offline,
and the normal fix (a new release with a corrected `sw.js`) can't reach them.

## What it does on a phone

- Installs and takes over at once (`skipWaiting` + `clients.claim`): no "Update ready" tap is needed.
- Deletes nothing: the app shell, the offline photos (`tbx-img`), queued data and every `localStorage` key stay,
  including unsent cycle-count scans.
- Serves everything network-first, with any cached copy (from any cache) as the offline fallback. Phones load the
  fixed site when they have signal and keep working offline from what they already saved.
- Precaches nothing new, so it is a bridge, not a release.

Tested by `tools/platform-test/sw-upgrade.js --scenario emergency` (Chromium and WebKit): it took over without a tap,
the offline launch opened Home, every saved photo stayed available offline and every cache was kept.

## Deploy it

1. Start from remote HEAD, as in the deploy runbook (`tools/README.md`).
2. `cp tools/emergency/sw-emergency.js sw.js`, then set its `CACHE` line to `origin/main:sw.js`'s number **+1** and
   today's date (version-at-push rule), e.g. `var CACHE = 'tbx-v391-20261003';`.
3. `node tools/verify.mjs`: it recognises the emergency worker and prints a WARN instead of the sw.js list and
   manifest-stamp checks. Everything else must still pass.
4. Commit `sw.js` alone and push; trigger and confirm the Pages build.
5. Check: `curl -s https://sportsmedtoolbox.com/sw.js?nc=$RANDOM | head -2` shows the new CACHE and the
   `TBX-EMERGENCY-SW` line. Phones pick it up on their next launch or foreground with signal.

## Afterwards (within a day)

Ship a normal fixed release: restore the real `sw.js` (from git history, fixed), run `node tools/img-manifest.mjs`
so its `IMG_MANIFEST` stamp is current, bump CACHE again, verify, push. The fixed worker must keep deleting old
caches only through `isShell()` (`/^tbx-v\d+-/`), or phones lose their offline photos.

## Never

- Never tell reps to clear Safari website data or to delete and re-add the Home Screen app: that deletes unsent scans.
  The "ToolBox didn't open" card shows how many are waiting.
- Never leave the emergency worker in place as the normal `sw.js`: it precaches nothing, so a new phone would only
  work offline for what it happened to open while online.
