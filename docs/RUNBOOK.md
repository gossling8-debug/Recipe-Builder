# When something goes wrong

Calm, in order. Most problems are fixed by undoing the last change.

## 1. Find out what's wrong

- **Is it down for everyone?** The uptime check (`.github/workflows/uptime.yml`) runs every
  15 minutes and opens an issue titled **"Cardamix looks down"** saying which part failed.
  You can run it now: GitHub → **Actions** → **Uptime check** → **Run workflow**.
  It only shows that the website and the server *answer*. A problem behind them (the
  database, Stripe, a disabled AI key) won't trip it — check the error reports below.
  GitHub switches scheduled checks off after 60 days without any change to the repository;
  if **Uptime check** shows as disabled, open it and tap **Enable workflow**.
- **What changed last?** GitHub → **Pull requests** → **Closed**: the most recent merge is the
  usual suspect.
- **Errors people hit:** the app → Settings → **Owner dashboard** → **Error reports**.
- **Google's own status:** https://status.cloud.google.com · **Stripe:** https://status.stripe.com ·
  **Anthropic:** https://status.anthropic.com

## 2. Undo the last change (most problems)

1. GitHub → **Pull requests** → **Closed** → open the last merged pull request.
2. Tap **Revert** (near the bottom). GitHub makes a new pull request that undoes it.
3. Wait for its checks to pass, then **Merge**. The app redeploys by itself in about 5 minutes;
   if the server or database rules changed, they redeploy too (a few minutes more).

If a deploy itself failed: GitHub → **Actions** → the failed run → **Re-run failed jobs**.

## 3. Stop something right now

| What | How | Undo |
|---|---|---|
| **AI costs running away** | Anthropic Console → **API keys** → disable the app's key. AI features stop at once; people see "AI is temporarily unavailable. Please try again later." | Make a new key; put it in the GitHub secret `ANTHROPIC_API_KEY`; Actions → **Deploy server** → **Run workflow**. |
| **Google Cloud costs** | Billing → **Budgets & caps** → set a spend cap (pauses services: the app stops working). | Remove the cap. |
| **Payments misbehaving** | Stripe Dashboard → **Developers → Webhooks** → disable the Cardamix endpoint (plans then update only when the app opens). For a wrong charge, refund it in Stripe → **Payments**. | Re-enable the endpoint. |
| **A leaked key** | Stripe, Anthropic or the Firebase service account: roll (replace) it in that service, put the new one in its GitHub secret, then Actions → **Deploy server** → **Run workflow**. Lulu: roll it in Lulu's developer portal, then enter the new key and secret in the app → Owner dashboard → **Printed cookbooks (Lulu)** (no deploy needed). | — |

## 4. Get data back

Database backups: point-in-time recovery (any minute in the last 7 days) and scheduled
backups kept 98 days (both seen on 21 Nov 2026 in Google Cloud → **Firestore** →
**(default)** → **Disaster recovery**). Now and then, open the **Backups** list there and
check recent ones are actually listed — a schedule that stopped is only found by looking.

A restore always goes into a **new** database (nothing is overwritten), so it's safe to try:
pick the backup or the time, restore to a new database, check the data there, and then
copy back what was lost. Ask for help with the copy-back step: it's easy to get wrong.

Each person's recipes are also kept on their own phone, and the app offers a backup file in
Settings.

## 5. Afterwards

Write a short note in the issue: what happened, why, how it was fixed, and what test or rule
now stops it happening again (see [ENGINEERING.md](ENGINEERING.md), step 7). Add the rule to
[INVARIANTS.md](INVARIANTS.md).
