# Rules that must never break

Each rule says where it's enforced and which test proves it. A change that touches one
says so in its pull request. **No test yet** means the rule is real but unproven: it's on
the list for the next audit.

## People's data

| # | Rule | Enforced in | Proven by |
|---|---|---|---|
| D1 | Only you can read or change your recipes and settings. | `firestore.rules` `users/{owner}` | `rules/firestore.rules.ts` "your own recipes" |
| D2 | Members-only spaces (cookbooks, shared lists, household) keep everyone else out; nobody adds someone else or posts under another's name. | `firestore.rules` | rules tests "cookbooks", "shared shopping lists and invites" |
| D3 | An invite is seen only by its sender and the person invited (with a confirmed email). | `firestore.rules` `invites` | rules test "invites…" |
| D4 | Anything the rules don't list is closed. | `firestore.rules` (no wildcard) | rules test "anything not listed is closed" |
| D5 | Deleting your account removes your data and cancels your subscription. | `functions/index.js` `deleteMyData`, `functions/lib/cleanup.js` | **No test yet** |
| D6 | The owner dashboard shows counts only — never who. | `functions/lib/stats.js` | `functions/lib/stats.test.js`; `e2e/owner.e2e.ts` |
| D7 | Error reports hold no account id or recipe text. | `firestore.rules` `errors` | rules test "error reports" |
| D8 | Who published an anonymous Mix recipe stays private. | `firestore.rules` `mixOwners` | rules test "only the publisher edits…" |

## Plans and money

| # | Rule | Enforced in | Proven by |
|---|---|---|---|
| M1 | Nobody can give themselves a paid plan, admin rights or more AI allowance. | `firestore.rules` (server-only writes) | rules tests "plans, payments and admin rights" |
| M2 | Card details never touch Cardamix: only Stripe's own pages see them. | Stripe Checkout and billing portal | Design (see DECISIONS) |
| M3 | Plans change only from Stripe's data, read by the server; Stripe's messages must be signed. | `functions/index.js` `stripeWebhook`, `computeOwnPlan` | `e2e/payments.e2e.ts` (forged messages refused; plan ends via the webhook alone) |
| M4 | Moving from Plus to Family shows the amount first, charges exactly that, and switches only if payment succeeds. | `functions/index.js` `checkout` | `e2e/payments.e2e.ts` ($3.00 shown, Cancel and decline charge nothing, 300¢ charged) |
| M5 | Free limits and AI allowances are enforced on the server, never trusted from the phone. | `functions/lib/guard.js` | `functions/lib/guard.test.js`; `e2e/stack.e2e.ts` (free limit) |
| M6 | Test stand-ins (Claude, Stripe, Lulu) are used only in the local emulator running a demo project. | `functions/lib/testHooks.js` (used by `functions/index.js`, `functions/lib/lulu.js`) | `functions/lib/book.test.js` "test stand-ins … only inside the demo emulator" |
| M7 | Stripe customer records can't be read by anyone's app. | `firestore.rules` | rules test "Stripe customer records…" |

## AI

| # | Rule | Enforced in | Proven by |
|---|---|---|---|
| A1 | AI answers must fit the strict recipe format and are shown as plain text (no raw HTML anywhere in the app). | `src/lib/claude.ts` (schema output); React escaping | CodeQL scanning; **no dedicated test** |
| A2 | Your own Anthropic key goes from your phone straight to Anthropic, never through Cardamix's server. | `src/lib/claude.ts` `makeClient` | Design; **no dedicated test** |

## Safety for people using the app

| # | Rule | Enforced in | Proven by |
|---|---|---|---|
| S1 | Deleting a recipe can be undone for 8 seconds. | `src/lib/undoDelete.ts` | `e2e/recipes.e2e.ts` |
| S2 | Cards waiting to be read survive closing the app. | `src/lib/stackScan.ts` | `e2e/stack.e2e.ts` |
| S3 | Main screens meet accessibility standards (WCAG 2.2 AA checks). | everywhere | `e2e/accessibility.e2e.ts` |
| S4 | Nothing is added to someone's recipes without their say-so. The sample recipes are offered only to **new accounts** (created in the last 14 days), only once the account's recipes have loaded and the box is really empty — never to an existing account — and adding them re-checks all of this first. | `src/components/Library.tsx` (`boxKnown`, `newAccount`, `trySamples`), `src/lib/samples.ts` (`isNewAccount`) | `e2e/recipes.e2e.ts` "a fresh browser … never offers the sample recipes" (fails on the old code over a slow connection); `src/lib/samples.test.ts` "who is offered the sample recipes" |
