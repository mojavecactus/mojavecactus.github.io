#!/bin/bash
# fa2 regression suite: real app in headless Chromium, TBX FA Hub swapped for tools/fa2-test/fakehub.js.
# Needs: node + playwright (chromium). Passwords come from the environment — never commit them.
#   APP_PW=<catalog pw> CT_PW=<CT team pw> FA_PW=<F&A pw> FIXED=1 tools/fa2-test/launch.sh
# FIXED=1 asserts the fixed behaviours (4.80+); unset it to reproduce the 4.79 bugs against an old checkout.
set -e
cd "$(dirname "$0")"; export REPO="$(cd ../.. && pwd)"
: "${APP_PW:?set APP_PW}" "${CT_PW:?set CT_PW}" "${FA_PW:?set FA_PW}"
export FA_TOKEN_SPORTS=$(node dec.mjs "$REPO/fa2.enc.json" "$CT_PW" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).token))")
export FA_TOKEN_FA=$(node dec.mjs "$REPO/fa2-fa.enc.json" "$FA_PW" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).token))")
[ ${#FA_TOKEN_SPORTS} -gt 20 ] && [ ${#FA_TOKEN_FA} -gt 20 ] || { echo "token load failed (wrong password?)"; exit 1; }
timeout 600 node run.js
