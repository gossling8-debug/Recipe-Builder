# Why things are the way they are

Short records of decisions that aren't obvious from the code — the "load-bearing walls".
Before changing one of these, read why it's there. Newest first; add one for any
Tier-3 decision.

### Card outlines: show nothing rather than a wrong shape (Nov 2026)
On a real phone, a card on a chair was outlined as a sliver or a lopsided slice running onto the
chair (reported by the owner). An outline is now accepted only if it's card-shaped (no corner
sharper than 60° or wider than 120°, opposite sides within 2:1, not folded over itself), doesn't
run along the border of the picture, and has a real edge along at least 70% of each side
(`src/lib/docscan.ts`). The corners are joined going round the shape, so they can't cross. If
nothing passes, the scanner shows the corners to aim at. The fallback method behind "Choose from
photos" gets the same checks.
On busy backgrounds (carpet, wood grain) a card's edges blur into the pattern, so it's also
spotted as paper: a bright, colourless area (`findPage` in `src/lib/opencv.ts`). Measured on
frames made from the owner's own carpet, cabinet and chair photos (varied in position, zoom,
angle, blur and light): with nothing in view the old finder outlined something in 42 of 300
frames and the new one in none; of cards fully in view on those backgrounds the old one found
17 of 83 correctly (and drew 23 wrong shapes), the new one 45 of 83 with no wrong shapes.
A real page in a plastic sleeve was then missed: its outline ran between the paper's and the
sleeve's edges. An edge up to 6 px across from a side now counts, and to keep patterns like
carpet out, the shape must be lighter or darker than what's around it on every side (by 25+
shades). On the same frames: the owner's page found, nothing outlined on carpet or cabinets,
cards found as before. Once found, the white aiming corners move onto the card's corners.

### Live scanner: keep the sharpest of 3 frames; no "this photo is blurry" warning (Nov 2026)
Deciding whether one photo is blurry wasn't reliable: two methods tried on test cards (dark ink,
faded pencil, big lettering, a mostly blank card, focus blur and hand shake) either flagged a
sharp real photo as soft or missed clearly blurry ones. Comparing photos of the same card is
reliable, so the scanner takes 3 frames ~90 ms apart and keeps the sharpest
(`src/lib/sharpness.ts`). The outline eases toward each new detection and only jumps to a far-off
shape when two frames agree, so a one-frame mistake never flashes up. Photos taken with the
phone's own camera or chosen from the library get no sharpness check.
Instead, when the AI says part of a photo was hard to read, its "Double-check" note offers
"Retake the photo": new photos are read into the same recipe (`src/lib/retake.ts`), keeping the
cook's star, labels, notes, dish photo and who-likes-what. The retake counts as a reading like any
other (for the free plan, a recipe add).

### App Check: watch first, turn away later (Nov 2026)
The app's Firebase settings are public, so a script could call the server as if it were the app.
App Check (reCAPTCHA Enterprise) lets the server tell the real app apart. It starts watch-only:
the server counts each request as from the app, no check, or failed check (owner dashboard), and
turns nothing away, so people on an older copy of the app or with reCAPTCHA blocked aren't locked
out. Turning requests away is a separate change, once a week of counts shows real use is all
"from the app". The site key is public like the other settings (`src/lib/firebaseConfig.ts`); the
emulator never uses it. Book PDFs open as plain links and can't carry the token: they stay
protected by the sign-in token in the link, which the server checks. (`functions/lib/appCheck.js`)

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
