# Cycle-count sync engine tests

The real bundle (`app-<ver>.js`) runs in jsdom with the team-sheet endpoint faked. No browser needed.

```
cd tools/cc-test
npm i jsdom@24            # one-off
APP_PW=<catalog password> node run.js
```

Covers `ccDeriveCore` (add/set/del, key normalisation), enqueue → flush → prune, network retry and
`busy` backoff, roster (`dev`) rejection not looping, the pull-vs-flush race, offline queue surviving a
reload, and the shared expiry helpers. Hooks are exposed on `window.TBX_DEV.cc`.
