/**
 * Cardamix's server (Firebase Cloud Functions):
 *  - ai:            relays AI requests to Claude with the app's own Anthropic key,
 *                   within each person's monthly allowance.
 *  - refreshPlan:   works out whether someone has Plus (from Stripe) and saves it.
 *  - checkout:      starts a Stripe Checkout for Plus (monthly or yearly).
 *  - billingPortal: opens Stripe's page to manage or cancel a subscription.
 *  - closeMyAccount / accountDeleted: cancel a deleted account's subscription and clear its records.
 *  - ownerStats / ownerClearErrors: the owner dashboard (admins only; counts, no names or emails).
 *  - ownerConfirmEmail: the owner marks someone's email as confirmed when the email never arrives.
 *  - mixVote:       rates or reports a Mix recipe, privately (only totals are public).
 *  - deleteMyData / accountDeleted: remove everything an account left, server-side.
 *  - mixDeleted:    clears the private votes on a Mix recipe once it's taken down.
 *
 * Firestore (written only here; people can read their own):
 *   plans/{uid}     { plan, source ("stripe" | "comp" | "beta" | "none"), status, interval ("month" | "year"), renews, cancelsAt, checkedAt }
 *   aiUsage/{uid}   { month, spent, uses, counts: { scan, create, … }, limit, plan, minute, minuteCount }
 *   customers/{uid} { stripeId }   (not readable by the app)
 *   mixVotes/{mixId}_{uid} { mixId, uid, stars, reportedAt, reason, at }   (readable by that person and admins)
 */
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import * as functionsV1 from "firebase-functions/v1";
import { summarize } from "./lib/stats.js";
import { deleteUserData, deleteVotesOn } from "./lib/cleanup.js";
import { nextVote, parseVote, voteDelta } from "./lib/mixVotes.js";
import { randomUUID } from "node:crypto";
import {
  ALLOWANCE, MAX_BODY_BYTES, allowanceCheck, allowanceKey, allowedBeta, allowedOrigin, checkRequest, costOf, estimateCost, freeCheck,
  isBeta, isComp, planFromSubscriptions, plusEmailOk, reserveUsage, retryAllowed, settleUsage,
} from "./lib/guard.js";

initializeApp();
const db = getFirestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const PLUS_EMAILS = defineSecret("PLUS_EMAILS");

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"; // tests point this at a fake
const PRICES = {
  // Stripe prices can't be changed, so a new price gets a new lookup key.
  monthly: { lookup: "cardamix_plus_monthly_449", amount: 449, interval: "month" },
  yearly: { lookup: "cardamix_plus_yearly_3499", amount: 3499, interval: "year" },
};
const DAY = 86_400_000;
// invoker "public": anyone may *call* these (each one checks the sign-in itself).
// Set explicitly so every deploy applies it — a function whose first creation
// failed and was then updated otherwise keeps Cloud Run's private default.
const opts = { region: "us-central1", maxInstances: 10, invoker: "public" };

const stripe = () => new Stripe(STRIPE_SECRET_KEY.value());
const hasStripe = () => !!STRIPE_SECRET_KEY.value()?.startsWith("sk_");

// ---------- plan ----------
async function computePlan(uid, email, verified) {
  // Gifted and testing-period Plus need a confirmed email (accounts made before VERIFY_PLUS_FROM keep it),
  // so throwaway accounts can't each get Plus's AI.
  let emailOk = !!verified;
  if (!emailOk) {
    const created = Date.parse((await getAuth().getUser(uid)).metadata.creationTime) || 0;
    emailOk = plusEmailOk(false, created);
  }
  if (emailOk && isComp(email, PLUS_EMAILS.value())) return { plan: "plus", source: "comp", status: "comp", renews: null, cancelsAt: null };
  // Testing period ("*"): everyone gets Plus — unless they're already paying, which Stripe shows below.
  const beta = isBeta(PLUS_EMAILS.value());
  const cust = (await db.doc(`customers/${uid}`).get()).data();
  const free =
    beta && emailOk
      ? { plan: "plus", source: "beta", status: "beta", renews: null, cancelsAt: null }
      : { plan: "free", source: "none", status: "none", renews: null, cancelsAt: null, ...(!emailOk && (beta || isComp(email, PLUS_EMAILS.value())) ? { needsVerify: true } : {}) };
  if (!cust?.stripeId || !hasStripe()) return free;
  const subs = await stripe().subscriptions.list({ customer: cust.stripeId, status: "all", limit: 10 });
  const fromStripe = planFromSubscriptions(subs.data);
  return fromStripe.plan === "plus" ? fromStripe : free;
}
async function savePlan(uid, email, verified) {
  const p = { ...(await computePlan(uid, email, verified)), checkedAt: Date.now() };
  await db.doc(`plans/${uid}`).set(p);
  return p;
}
/** The saved plan, re-checked with Stripe if it's more than a day old. */
async function currentPlan(uid, email, verified) {
  const saved = (await db.doc(`plans/${uid}`).get()).data();
  // Re-check right away once a waiting email is confirmed.
  if (saved && Date.now() - (saved.checkedAt ?? 0) < DAY && !(saved.needsVerify && verified)) return saved;
  return savePlan(uid, email, verified);
}

export const refreshPlan = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY, PLUS_EMAILS] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return savePlan(req.auth.uid, req.auth.token.email, req.auth.token.email_verified);
});

// ---------- AI relay ----------
function cors(req, res) {
  res.set("Access-Control-Allow-Origin", req.get("origin") || "*");
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", req.get("access-control-request-headers") || "authorization, content-type");
  res.set("Access-Control-Max-Age", "3600");
}
const fail = (res, status, type, message) => res.status(status).json({ type: "error", error: { type, message } });

export const ai = onRequest({ ...opts, secrets: [ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, PLUS_EMAILS], timeoutSeconds: 300, memory: "512MiB" }, async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST" || !/\/v1\/messages$/.test(req.path)) return fail(res, 404, "not_found_error", "Not found.");
  if ((req.rawBody?.length ?? 0) > MAX_BODY_BYTES) return fail(res, 413, "request_too_large", "That's too much to send at once. Try fewer or smaller photos.");

  // Who's asking?
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let user;
  try {
    user = await getAuth().verifyIdToken(token);
  } catch {
    return fail(res, 401, "authentication_error", "Please sign in again.");
  }

  const problem = checkRequest(req.body);
  if (problem) return fail(res, 400, "invalid_request_error", problem);

  const planDoc = await currentPlan(user.uid, user.email, user.email_verified);
  const plan = allowanceKey(planDoc.plan, planDoc.interval);
  // What the app says this request is for (scan, create, nutrition…), and whether it's an automatic retry.
  const kind = String(req.get("x-cardamix-kind") || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 20) || "other";
  const retry = req.get("x-cardamix-retry") === "1";
  // Free AI needs a confirmed email address, so throwaway accounts can't farm it.
  if (plan === "free" && !user.email_verified)
    return fail(res, 403, "email_not_verified", "Confirm your email address to use AI on the free plan: tap the link we emailed you, or send a new one in Settings.");
  // Only the beta features the app uses.
  const beta = allowedBeta(req.get("anthropic-beta"));
  if (beta === false) return fail(res, 400, "invalid_request_error", "That isn't allowed.");

  // Check and reserve in one step, so requests sent at once can't all slip under the limits:
  // the worst-case cost, the count and the per-minute count are taken now and settled after.
  const usageRef = db.doc(`aiUsage/${user.uid}`);
  const id = randomUUID();
  const limit = ALLOWANCE[plan] ?? ALLOWANCE.free;
  let counted = null; // the kind counted for this request (null for an allowed retry)
  const blocked = await db.runTransaction(async (tx) => {
    const now = Date.now();
    const usage = (await tx.get(usageRef)).data();
    const retryOf = retry ? retryAllowed(usage, kind, now) : null;
    const no = (plan === "free" ? freeCheck(kind, req.body.model, usage, now, !!retryOf) : null) ?? allowanceCheck(plan, usage, now);
    if (no) return no;
    counted = retryOf ? null : kind;
    tx.set(usageRef, { ...reserveUsage(usage, id, estimateCost(req.body), now, counted, retryOf), limit, plan });
    return null;
  });
  if (blocked) return fail(res, blocked.status, blocked.type, blocked.message);
  /** Adds the real cost; a request that failed gets its count back. */
  const settle = (cost, failed) =>
    db.runTransaction(async (tx) => {
      const usage = (await tx.get(usageRef)).data();
      tx.set(usageRef, { ...settleUsage(usage, id, cost, Date.now(), failed ? counted : null), limit, plan });
    });

  // Pass it on with the app's key. Only Anthropic's own headers go through.
  const headers = { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY.value(), "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  let upstream;
  try {
    upstream = await fetch(`${ANTHROPIC_BASE}/v1/messages${req.url.includes("beta=true") ? "?beta=true" : ""}`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });
  } catch {
    await settle(0, true).catch(() => {});
    return fail(res, 502, "api_error", "Couldn't reach Claude. Try again in a minute.");
  }
  const text = await upstream.text();

  // Count what it cost (list price), even if the answer was a refusal.
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const cost = upstream.ok && parsed?.usage ? costOf(req.body.model, parsed.usage) : 0;
  await settle(cost, !(upstream.ok && parsed?.usage));
  // Anthropic's own errors about the app's key or credit shouldn't blame the person.
  if (upstream.status === 401 || upstream.status === 403 || (upstream.status === 400 && /credit balance/i.test(text)))
    return fail(res, 503, "api_error", "AI is temporarily unavailable. Please try again later.");
  res.status(upstream.status).type("application/json").send(text);
});

// ---------- owner dashboard ----------
async function requireAdmin(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await db.doc(`admins/${req.auth.uid}`).get()).exists) throw new HttpsError("permission-denied", "Only the app's owner can see this.");
}

/** Every account's sign-up time, last activity and whether its email is confirmed (up to 20,000). */
async function allUsers() {
  const out = [];
  let page;
  for (let i = 0; i < 20; i++) {
    const r = await getAuth().listUsers(1000, page);
    for (const u of r.users) {
      const created = Date.parse(u.metadata.creationTime) || 0;
      const last = Date.parse(u.metadata.lastRefreshTime || u.metadata.lastSignInTime || u.metadata.creationTime) || 0;
      out.push({ created, lastActive: last, verified: !!u.emailVerified });
    }
    page = r.pageToken;
    if (!page) break;
  }
  return out;
}

export const ownerStats = onCall({ ...opts, timeoutSeconds: 60 }, async (req) => {
  await requireAdmin(req);
  const [users, plans, usage, mix, cookbooks, errors] = await Promise.all([
    allUsers(),
    db.collection("plans").select("plan", "source", "interval").get(),
    db.collection("aiUsage").select("month", "spent", "uses", "counts", "plan").get(),
    db.collection("mix").select("reportCount", "reporters").get(),
    db.collection("cookbooks").count().get(),
    db.collection("errors").orderBy("at", "desc").limit(500).get(),
  ]);
  const data = (q) => q.docs.map((d) => d.data());
  return summarize({ users, plans: data(plans), usage: data(usage), mix: data(mix), cookbooks: cookbooks.data().count, errors: data(errors) });
});

/**
 * The confirmation email never arrived (spam filters, a blocked sender): the
 * owner, who knows the person, marks their address as confirmed by hand.
 */
export const ownerConfirmEmail = onCall({ ...opts, timeoutSeconds: 30 }, async (req) => {
  await requireAdmin(req);
  const email = typeof req.data?.email === "string" ? req.data.email.trim() : "";
  if (!email) throw new HttpsError("invalid-argument", "Enter their email address.");
  let u;
  try {
    u = await getAuth().getUserByEmail(email);
  } catch {
    throw new HttpsError("not-found", "No account with that email. Check the spelling (it must match exactly).");
  }
  if (u.emailVerified) return { already: true };
  await getAuth().updateUser(u.uid, { emailVerified: true });
  return { already: false };
});

/** Delete every error report (after reading them). */
export const ownerClearErrors = onCall({ ...opts, timeoutSeconds: 60 }, async (req) => {
  await requireAdmin(req);
  let removed = 0;
  for (;;) {
    const q = await db.collection("errors").limit(400).get();
    if (q.empty) break;
    const batch = db.batch();
    q.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += q.size;
  }
  return { removed };
});

// ---------- The Mix: private ratings and reports ----------
export const mixVote = onCall(opts, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  // A confirmed email, so throwaway accounts can't pile up ratings or hide recipes with reports.
  if (!req.auth.token.email_verified)
    throw new HttpsError("failed-precondition", "Confirm your email first (tap the link we sent you), then you can rate and report recipes in The Mix.");
  const id = typeof req.data?.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(req.data.id) ? req.data.id : null;
  let change;
  try {
    change = parseVote(req.data);
  } catch {
    throw new HttpsError("invalid-argument", "That isn't a rating or a report.");
  }
  if (!id) throw new HttpsError("invalid-argument", "Which recipe?");
  const uid = req.auth.uid;
  const mixRef = db.doc(`mix/${id}`);
  const voteRef = db.doc(`mixVotes/${id}_${uid}`);
  return db.runTransaction(async (t) => {
    const [m, v, o] = await Promise.all([t.get(mixRef), t.get(voteRef), t.get(db.doc(`mixOwners/${id}`))]);
    if (!m.exists) throw new HttpsError("not-found", "That recipe isn't in The Mix any more.");
    if (o.data()?.uid === uid || m.data().by === uid) throw new HttpsError("permission-denied", "You can't rate or report your own recipe.");
    const before = v.exists ? v.data() : null;
    const { vote, already } = nextVote(before, change, id, uid, Date.now());
    if (!already) {
      const d = voteDelta(before, vote);
      t.update(mixRef, { ratingSum: FieldValue.increment(d.ratingSum), ratingCount: FieldValue.increment(d.ratingCount), reportCount: FieldValue.increment(d.reportCount) });
      if (vote) t.set(voteRef, vote);
      else if (before) t.delete(voteRef);
    }
    return { stars: vote?.stars ?? null, reported: !!vote?.reportedAt };
  });
});

// A recipe taken out of The Mix (by its cook or an admin): the votes on it go too.
export const mixDeleted = functionsV1.firestore.document("mix/{id}").onDelete(async (snap, ctx) => {
  await db.recursiveDelete(snap.ref); // anything left under it (older report notes)
  await deleteVotesOn(db, ctx.params.id);
});

// ---------- Stripe ----------
async function ensurePrices(s) {
  const found = await s.prices.list({ lookup_keys: Object.values(PRICES).map((p) => p.lookup), active: true, limit: 10 });
  const byKey = Object.fromEntries(found.data.map((p) => [p.lookup_key, p.id]));
  if (Object.values(PRICES).every((p) => byKey[p.lookup])) return byKey;
  const product = await s.products.create({ name: "Cardamix Plus", description: "Every Cardamix feature, and much more AI each month." });
  for (const p of Object.values(PRICES)) {
    if (byKey[p.lookup]) continue;
    const price = await s.prices.create({ product: product.id, currency: "usd", unit_amount: p.amount, recurring: { interval: p.interval }, lookup_key: p.lookup, transfer_lookup_key: true });
    byKey[p.lookup] = price.id;
  }
  return byKey;
}
async function ensureCustomer(s, uid, email) {
  const ref = db.doc(`customers/${uid}`);
  const saved = (await ref.get()).data();
  if (saved?.stripeId) return saved.stripeId;
  const c = await s.customers.create({ email, metadata: { uid } });
  await ref.set({ stripeId: c.id });
  return c.id;
}

export const checkout = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY, PLUS_EMAILS] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!hasStripe()) throw new HttpsError("failed-precondition", "Payments aren't set up yet.");
  const interval = req.data?.interval === "yearly" ? "yearly" : "monthly";
  const current = await savePlan(req.auth.uid, req.auth.token.email);
  if (current.plan === "plus" && current.source !== "beta") throw new HttpsError("already-exists", "You already have Plus.");
  const s = stripe();
  const prices = await ensurePrices(s);
  const customer = await ensureCustomer(s, req.auth.uid, req.auth.token.email);
  const origin = allowedOrigin(req.rawRequest.get("origin"));
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: prices[PRICES[interval].lookup], quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: req.auth.uid,
    success_url: `${origin}/#/plus/done`,
    cancel_url: `${origin}/#/plus`,
  });
  return { url: session.url };
});

async function ensurePortal(s) {
  const configs = await s.billingPortal.configurations.list({ active: true, limit: 1 });
  if (configs.data.length) return;
  await s.billingPortal.configurations.create({
    business_profile: { headline: "Cardamix Plus" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
}

export const billingPortal = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!hasStripe()) throw new HttpsError("failed-precondition", "Payments aren't set up yet.");
  const cust = (await db.doc(`customers/${req.auth.uid}`).get()).data();
  if (!cust?.stripeId) throw new HttpsError("not-found", "No subscription to manage.");
  const s = stripe();
  await ensurePortal(s);
  const origin = allowedOrigin(req.rawRequest.get("origin"));
  const session = await s.billingPortal.sessions.create({ customer: cust.stripeId, return_url: `${origin}/#/plus` });
  return { url: session.url };
});

// ---------- account deleted ----------
async function closeAccount(uid, forgetUsage) {
  const cust = (await db.doc(`customers/${uid}`).get()).data();
  if (cust?.stripeId && hasStripe()) {
    const s = stripe();
    const subs = await s.subscriptions.list({ customer: cust.stripeId, status: "all", limit: 10 });
    for (const sub of subs.data) if (!["canceled", "incomplete_expired"].includes(sub.status)) await s.subscriptions.cancel(sub.id);
  }
  // AI usage is only forgotten once the account is really gone; otherwise calling this would reset the month's counts.
  await Promise.all([`customers/${uid}`, `plans/${uid}`, ...(forgetUsage ? [`aiUsage/${uid}`] : [])].map((p) => db.doc(p).delete()));
}

/** Called by older versions of the app just before they delete the account. */
export const closeMyAccount = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  await closeAccount(req.auth.uid, false);
  return { ok: true };
});

/**
 * Called by the app just before it deletes the account (after asking for the
 * password again): stops any subscription, then removes everything the
 * account left — its recipes, cookbook additions, Mix recipes and votes.
 */
export const deleteMyData = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY], timeoutSeconds: 300 }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  // Only right after the password was entered again, so a stolen sign-in can't wipe an account.
  if (Date.now() / 1000 - (req.auth.token.auth_time ?? 0) > 10 * 60) throw new HttpsError("unauthenticated", "Enter your password again first.");
  await closeAccount(req.auth.uid, false);
  await deleteUserData(db, req.auth.uid, req.auth.token.email);
  return { ok: true };
});

// When someone deletes their account, stop their subscription right away and
// remove everything they left. (Stripe keeps its own payment records.)
// Also a backup, in case the app couldn't finish (or the account was deleted another way).
export const accountDeleted = functionsV1
  .runWith({ secrets: ["STRIPE_SECRET_KEY"], timeoutSeconds: 300 })
  .auth.user()
  .onDelete(async (user) => {
    await closeAccount(user.uid, true);
    await deleteUserData(db, user.uid, user.email);
  });
