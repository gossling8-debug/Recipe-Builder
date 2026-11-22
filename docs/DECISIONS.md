# Why things are the way they are

Short records of decisions that aren't obvious from the code — the "load-bearing walls".
Before changing one of these, read why it's there. Newest first; add one for any
Tier-3 decision.

### Shrinkflation: same item, same store, a 3–30% smaller package, 3%+ more per unit (Nov 2026)
Comparing across stores would flag normal size choices (Costco's big box vs the regular one),
a shrink over 30% is a different size bought on purpose, and a price that fell as much as the
size isn't shrinkflation. Only each store's latest purchase vs the one before counts, so the
flag goes away once the package is back to its size. (`src/lib/prices.ts` shrinkBetween)

### Node 22 everywhere, and its type definitions stay on 22 (Nov 2026)
The server (`functions/package.json` engines) and the build and test workflows use Node 22, so
`.github/dependabot.yml` ignores major updates of `@types/node`. When moving to a newer Node,
change all of these together and remove that ignore rule. (The database-rules test job uses
Node 24 only because its testing library requires it.)

### Sample recipes: new accounts only, and only once the box is known to be empty (Nov 2026)
An existing account was offered the samples while its recipes were still downloading in a new
browser, and one tap added them (reported by the owner). Now an empty list counts as an empty box
only after this account's recipes have been fully downloaded here (`fullSyncAt`, set by the full
sync only — not by small uploads, and not when the download failed). Samples are offered only to
accounts created in the last 14 days, and adding them re-checks all of it. If the download stalls
or fails, the screen says so and offers "Add a recipe" instead. (INVARIANTS S4)

### Test stand-ins only inside the emulator (Nov 2026)
`*_BASE_URL` settings point the server at fake Claude, Stripe and Lulu for tests. They are
honoured only when the emulator is running *and* the project is a `demo-` project
(`functions/lib/testHooks.js`), so even copying the test settings into production can't
send payments, AI requests or print orders anywhere else. (INVARIANTS M6)

### Who likes what lives on the cook's recipes, by name (Nov 2026)
Each household member has their own recipe box, so a mark can't attach to "the same
recipe" across accounts. Names on the cook's recipes also cover children without accounts.

### Waiting cards are kept in IndexedDB (Nov 2026)
A phone can close the app at any time; photos waiting to be read are kept on the phone so
none are lost, and reading resumes on the next open. Done cards drop their photos.

### Plus → Family: amount first, charged now, only if paid (Nov 2026)
`always_invoice` with the same `proration_date` as the preview makes the charge equal the
amount shown; `pending_if_incomplete` means a declined card leaves the plan unchanged.
Previously the difference was silently added to the next bill. (INVARIANTS M4)

### Stripe webhook plus checking on open (Nov 2026)
The server re-reads a subscription from Stripe on each signed webhook message and when the
app opens. Stripe stays the source of truth; the app never decides its own plan. (M3)

### Card details only on Stripe's pages
Stripe Checkout and the billing portal handle every card. This keeps Cardamix out of
storing card data at all (PCI DSS SAQ A). (M2)

### The Mix: anonymous publishing via `mixOwners`
A published recipe has a random id and no account id; who published it is in a separate
document only that person can read. Votes go through the server so each vote stays
private. (D8)

### Database rules are closed by default
Every collection is listed explicitly; anything else is denied. Plans, AI usage,
customers, households and orders are written only by the server. (D4, M1)
