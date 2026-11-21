# Working on Cardamix

Cardamix is a recipe app (Vite + React + TypeScript PWA, Firebase: Auth, Firestore,
Cloud Functions; Stripe for payments; Claude for reading recipes). The owner approves
merges but doesn't review code line by line, so **you are expected to be a careful,
sceptical engineer: verify with evidence, say when you're unsure, and never rely on
your own review alone for risky changes.**

Read and follow [docs/ENGINEERING.md](docs/ENGINEERING.md) for every change. In short:

1. **Classify the risk tier** (1 looks · 2 behaviour · 3 money, accounts, others' data,
   secrets, server, `firestore.rules`, `.github/`, AI instructions). Use the highest tier
   anything in the change touches.
2. **Check [docs/INVARIANTS.md](docs/INVARIANTS.md)** for rules the change touches, and
   [docs/DECISIONS.md](docs/DECISIONS.md) before changing anything listed there.
3. **Smallest change**; no unrelated edits.
4. **Run the checks**: `npx tsc --noEmit` and `npx tsc --noEmit -p tsconfig.tests.json`, `npm test`, `npm run test:rules` (Tier 3 or
   any `firestore.rules` change), `npm run e2e` (Tier 2–3), and `npx vite build`.
5. **Prove new tests can fail** (Tier 2–3): break the code on purpose, see the test fail,
   restore it, and say so in the PR.
6. **Tier 3: get an independent review** (e.g. `/code-review` at high effort) of the diff
   without your own reasoning attached; fix or answer each finding.
7. **Pull request**: fill in `.github/pull_request_template.md` in plain language,
   including what could go wrong. Add or update INVARIANTS/DECISIONS when a rule or a
   load-bearing decision changes.

Never:
- weaken, skip or delete a test or a security rule to get green;
- put a secret in code, commits, logs or chat;
- let a test stand-in (`*_BASE_URL`) work outside the emulator;
- merge with a failing or missing check.

The owner's preferences: plain language, one task for them at a time (the last thing in
the message, with steps), and challenge your own conclusions before stating them.
