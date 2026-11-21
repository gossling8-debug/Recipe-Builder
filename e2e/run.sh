#!/usr/bin/env bash
# Runs the click-through tests: builds the app for the emulators, starts the Firebase
# emulators (sign-in, database, server functions) with stand-ins for Claude and Stripe,
# serves the app, and runs Playwright. Nothing here reaches Anthropic or Stripe.
#
#   bash e2e/run.sh                 all tests
#   bash e2e/run.sh payments        only e2e/payments.e2e.ts
#
# Needs: Node 22, Java 21 (for the database emulator), and `npm ci` in the root and in functions/.
# FIREBASE overrides the firebase-tools command (default: npx firebase-tools at the version the deploy uses).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
OUT=$ROOT/e2e/.out/logs  # not test-results: Playwright empties that when it starts
mkdir -p "$OUT"
FIREBASE=${FIREBASE:-"npx --yes firebase-tools@15.35.0"}

# The server functions' test settings (these files are git-ignored; real ones are never used here).
# Kept if they already exist, so a developer's own setup isn't overwritten.
if [ ! -f functions/.env.local ]; then
  printf 'ANTHROPIC_BASE_URL=http://127.0.0.1:4466\nSTRIPE_BASE_URL=http://127.0.0.1:43200\nLULU_BASE_URL=http://127.0.0.1:43100\n' > functions/.env.local
fi
if [ ! -f functions/.secret.local ]; then
  printf 'ANTHROPIC_API_KEY=test-key\nSTRIPE_SECRET_KEY=sk_test_e2e\nSTRIPE_WEBHOOK_SECRET=whsec_test\nPLUS_EMAILS=owner@example.com\n' > functions/.secret.local
fi

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do pkill -P "$p" 2>/dev/null || true; kill "$p" 2>/dev/null || true; done; } # npx starts the real process as a child
trap cleanup EXIT

wait_for() { # url, name
  for _ in $(seq 1 90); do curl -s -o /dev/null "$1" && return 0; sleep 1; done
  echo "$2 didn't start; see $OUT" >&2; return 1
}

node e2e/fakes/ai.cjs > "$OUT/ai.log" 2>&1 & PIDS+=($!)
node e2e/fakes/stripe.cjs > "$OUT/stripe.log" 2>&1 & PIDS+=($!)

$FIREBASE emulators:start --only auth,firestore,functions --project demo-recipe-builder > "$OUT/emulators.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 120); do grep -q "All emulators ready" "$OUT/emulators.log" && break; sleep 1; done
grep -q "All emulators ready" "$OUT/emulators.log" || { echo "The emulators didn't start:"; tail -40 "$OUT/emulators.log"; exit 1; }

VITE_FIREBASE_EMULATOR=1 npx vite build --outDir "$ROOT/e2e/.out/app" > "$OUT/build.log" 2>&1
npx vite preview --port 4329 --strictPort --outDir "$ROOT/e2e/.out/app" > "$OUT/preview.log" 2>&1 & PIDS+=($!)
wait_for http://localhost:4329/ "The app"
wait_for http://127.0.0.1:43200/test/charges "The test Stripe"

npx playwright test --config e2e/playwright.config.ts "$@"
