#!/usr/bin/env bash
# Tests the database security rules (firestore.rules) against the Firestore emulator.
# Needs Java 21. FIREBASE overrides the firebase-tools command.
set -euo pipefail
cd "$(dirname "$0")/.."
FIREBASE=${FIREBASE:-"npx --yes firebase-tools@15.35.0"}
$FIREBASE emulators:exec --only firestore --project demo-rules-test "npx vitest run -c rules/vitest.config.ts"
