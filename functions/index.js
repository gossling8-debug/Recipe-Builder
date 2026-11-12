/**
 * Cardamix's server (Firebase Cloud Functions):
 *  - ai:            relays AI requests to Claude with the app's own Anthropic key,
 *                   within each person's monthly allowance.
 *  - refreshPlan:   works out whether someone has Plus (from Stripe) and saves it.
 *  - checkout:      starts a Stripe Checkout for Plus (monthly or yearly).
 *  - billingPortal: opens Stripe's page to manage or cancel a subscription.
 *  - closeMyAccount / accountDeleted: cancel a deleted account's subscription and clear its records.
 *
 * Firestore (written only here; people can read their own):
 *   plans/{uid}     { plan, source ("stripe" | "comp" | "beta" | "none"), status, renews, cancelsAt, checkedAt }
 *   aiUsage/{uid}   { month, spent, uses, limit, minute, minuteCount }
 *   customers/{uid} { stripeId }   (not readable by the app)
 */
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import * as functionsV1 from "firebase-functions/v1";
import { ALLOWANCE, MAX_BODY_BYTES, addUsage, allowanceCheck, allowedOrigin, checkRequest, costOf, isBeta, isComp, planFromSubscriptions } from "./lib/guard.js";

initializeApp();
const db = getFirestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const PLUS_EMAILS = defineSecret("PLUS_EMAILS");

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"; // tests point this at a fake
const PRICES = {
  monthly: { lookup: "cardamix_plus_monthly", amount: 399, interval: "month" },
  yearly: { lookup: "cardamix_plus_yearly", amount: 2999, interval: "year" },
};
const DAY = 86_400_000;
// invoker "public": anyone may *call* these (each one checks the sign-in itself).
// Set explicitly so every deploy applies it — a function whose first creation
// failed and was then updated otherwise keeps Cloud Run's private default.
const opts = { region: "us-central1", maxInstances: 10, invoker: "public" };

const stripe = () => new Stripe(STRIPE_SECRET_KEY.value());
const hasStripe = () => !!STRIPE_SECRET_KEY.value()?.startsWith("sk_");

// ---------- plan ----------
async function computePlan(uid, email) {
  if (isComp(email, PLUS_EMAILS.value())) return { plan: "plus", source: "comp", status: "comp", renews: null, cancelsAt: null };
  // Testing period ("*"): everyone gets Plus — unless they're already paying, which Stripe shows below.
  const beta = isBeta(PLUS_EMAILS.value());
  const cust = (await db.doc(`customers/${uid}`).get()).data();
  const free = beta ? { plan: "plus", source: "beta", status: "beta", renews: null, cancelsAt: null } : { plan: "free", source: "none", status: "none", renews: null, cancelsAt: null };
  if (!cust?.stripeId || !hasStripe()) return free;
  const subs = await stripe().subscriptions.list({ customer: cust.stripeId, status: "all", limit: 10 });
  const fromStripe = planFromSubscriptions(subs.data);
  return fromStripe.plan === "plus" ? fromStripe : free;
}
async function savePlan(uid, email) {
  const p = { ...(await computePlan(uid, email)), checkedAt: Date.now() };
  await db.doc(`plans/${uid}`).set(p);
  return p;
}
/** The saved plan, re-checked with Stripe if it's more than a day old. */
async function currentPlan(uid, email) {
  const saved = (await db.doc(`plans/${uid}`).get()).data();
  if (saved && Date.now() - (saved.checkedAt ?? 0) < DAY) return saved;
  return savePlan(uid, email);
}

export const refreshPlan = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY, PLUS_EMAILS] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return savePlan(req.auth.uid, req.auth.token.email);
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

  const plan = (await currentPlan(user.uid, user.email)).plan;
  const usageRef = db.doc(`aiUsage/${user.uid}`);
  const blocked = allowanceCheck(plan, (await usageRef.get()).data());
  if (blocked) return fail(res, blocked.status, blocked.type, blocked.message);

  // Pass it on with the app's key. Only Anthropic's own headers go through.
  const headers = { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY.value(), "anthropic-version": req.get("anthropic-version") || "2023-06-01" };
  if (req.get("anthropic-beta")) headers["anthropic-beta"] = req.get("anthropic-beta");
  let upstream;
  try {
    upstream = await fetch(`${ANTHROPIC_BASE}/v1/messages${req.url.includes("beta=true") ? "?beta=true" : ""}`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });
  } catch {
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
  if (upstream.ok && parsed?.usage) {
    const cost = costOf(req.body.model, parsed.usage);
    await db.runTransaction(async (tx) => {
      const now = (await tx.get(usageRef)).data();
      tx.set(usageRef, { ...addUsage(now, cost), limit: ALLOWANCE[plan] ?? ALLOWANCE.free, plan });
    });
  }
  // Anthropic's own errors about the app's key or credit shouldn't blame the person.
  if (upstream.status === 401 || upstream.status === 403 || (upstream.status === 400 && /credit balance/i.test(text)))
    return fail(res, 503, "api_error", "AI is temporarily unavailable. Please try again later.");
  res.status(upstream.status).type("application/json").send(text);
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
async function closeAccount(uid) {
  const cust = (await db.doc(`customers/${uid}`).get()).data();
  if (cust?.stripeId && hasStripe()) {
    const s = stripe();
    const subs = await s.subscriptions.list({ customer: cust.stripeId, status: "all", limit: 10 });
    for (const sub of subs.data) if (!["canceled", "incomplete_expired"].includes(sub.status)) await s.subscriptions.cancel(sub.id);
  }
  await Promise.all([`customers/${uid}`, `plans/${uid}`, `aiUsage/${uid}`].map((p) => db.doc(p).delete()));
}

/** Called by the app just before it deletes the account. */
export const closeMyAccount = onCall({ ...opts, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  await closeAccount(req.auth.uid);
  return { ok: true };
});

// When someone deletes their account, stop their subscription right away and
// remove what the server kept about them. (Stripe keeps its own payment records.)
export const accountDeleted = functionsV1
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .auth.user()
  .onDelete((user) => closeAccount(user.uid)); // backup, in case the app couldn't call closeMyAccount
