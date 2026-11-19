/**
 * The AI relay's rules, kept free of Firebase and network code so they can
 * be unit-tested. The relay holds the app's Anthropic key; these rules decide
 * what it will pass on, and how much each person may use per month.
 */

/** Models the app pays for (list prices per million tokens). Opus needs your own key. */
export const APP_MODELS = {
  "claude-sonnet-5-5": { inPerM: 2, outPerM: 10 },
  "claude-haiku-5-5": { inPerM: 0.1, outPerM: 0.5 },
};

/**
 * Monthly AI allowance, in dollars of Anthropic list price. Yearly plans are a
 * little lower (they're cheaper per month). Free is limited by counts (below);
 * its dollar amount is only a backstop. Family is one allowance shared by the
 * whole household (up to HOUSEHOLD_MAX accounts), not one each.
 */
export const ALLOWANCE = { free: 0.4, plus: 2.5, plus_yearly: 2.25, family: 5, family_yearly: 4.5 };
/** Accounts in one Family plan, the payer included. */
export const HOUSEHOLD_MAX = 6;
/** Free accounts each month: recipe adds (photo, website, text) and created recipes. */
export const FREE_LIMITS = { scan: 5, create: 3 };
/** Free accounts read recipes with the budget model. */
export const FREE_SCAN_MODEL = "claude-haiku-5-5";

/** Which allowance applies: free, Plus or Family, monthly or yearly. */
export const allowanceKey = (plan, interval) =>
  plan === "plus" || plan === "family" ? `${plan}${interval === "year" ? "_yearly" : ""}` : "free";

/** Whose AI usage a request counts against: Family shares one, kept under the payer's id. */
export const usageId = (uid, planDoc) => (planDoc?.plan === "family" ? `household_${planDoc.owner ?? uid}` : uid);

const NOUN = { scan: ["recipe add", "recipe adds"], create: ["created recipe", "created recipes"] };
/**
 * What a free account may do: only add recipes (with the budget model) and
 * create recipes, up to the monthly counts. null if allowed, else an error.
 */
export function freeCheck(kind, model, usage, now = Date.now(), retry = false) {
  if (!Object.hasOwn(FREE_LIMITS, kind))
    return { status: 403, type: "plus_feature", message: "That's a Plus feature. Upgrade to Plus to use it." };
  if (kind === "scan" && model !== FREE_SCAN_MODEL)
    return { status: 400, type: "invalid_request_error", message: "Free accounts read recipes with the Standard reader. Reload the app and try again." };
  // An automatic retry of a created recipe that was just counted isn't a new one (see retryAllowed;
  // the dollar backstop still applies).
  if (retry) return null;
  const used = usage?.month === monthKey(now) ? usage.counts?.[kind] ?? 0 : 0;
  const limit = FREE_LIMITS[kind];
  if (used >= limit)
    return {
      status: 429,
      type: "free_limit",
      message: `You've used this month's ${limit} free ${NOUN[kind][1]}. Upgrade to Plus for many more, or wait until the 1st.`,
    };
  return null;
}
/** Requests per minute per person, to stop runaway loops. */
export const PER_MINUTE = 12;
export const MAX_TOKENS = 16000;
export const MAX_BODY_BYTES = 12 * 1024 * 1024;

/** "2026-11" — allowances reset on the 1st (UTC). */
export const monthKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

/** Returns an error message if the request isn't one the app itself would send, else null. */
export function checkRequest(body) {
  if (!body || typeof body !== "object") return "Bad request.";
  if (!APP_MODELS[body.model]) return "That model isn't available.";
  if (body.stream) return "Streaming isn't supported.";
  if (typeof body.max_tokens !== "number" || body.max_tokens < 1 || body.max_tokens > MAX_TOKENS) return "max_tokens is out of range.";
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 4) return "Bad messages.";
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length > 1) return "Tools aren't allowed.";
    const t = body.tools[0];
    if (!t || t.name !== "web_fetch" || !/^web_fetch_\d{8}$/.test(String(t.type))) return "Tools aren't allowed.";
    if (!(t.max_uses >= 1 && t.max_uses <= 2)) return "web_fetch max_uses must be 1–2.";
    if (!(t.max_content_tokens >= 1 && t.max_content_tokens <= 30000)) return "web_fetch max_content_tokens must be 30000 or less.";
  }
  if (body.mcp_servers || body.container || body.fallbacks) return "Not allowed.";
  if (Object.keys(body).some((k) => !BODY_KEYS.has(k))) return "Not allowed.";
  if (body.output_config !== undefined && (typeof body.output_config !== "object" || Object.keys(body.output_config ?? {}).some((k) => !OUTPUT_KEYS.has(k))))
    return "Not allowed.";
  return null;
}

/** List-price cost of one response, in dollars. */
export function costOf(model, usage) {
  const m = APP_MODELS[model];
  if (!m || !usage) return 0;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  return (input * m.inPerM + (usage.output_tokens ?? 0) * m.outPerM) / 1_000_000;
}

/**
 * Can this person make another request now? `usage` is their aiUsage doc.
 * Returns null if yes, or { status, type, message }.
 */
export function allowanceCheck(plan, usage, now = Date.now()) {
  const month = monthKey(now);
  // Requests still running count too, so many sent at once can't all slip under the limit.
  const spent = (usage?.month === month ? usage.spent ?? 0 : 0) + pendingTotal(usage, now);
  const limit = ALLOWANCE[plan] ?? ALLOWANCE.free;
  if (spent >= limit)
    return {
      status: 429,
      type: "allowance_exceeded",
      message:
        plan.startsWith("family")
          ? "Your household has used this month's AI allowance. It resets on the 1st."
          : plan.startsWith("plus")
          ? "You've used this month's AI allowance. It resets on the 1st."
          : "You've used this month's free AI. Upgrade to Plus for much more, or wait until the 1st.",
    };
  const minute = Math.floor(now / 60_000);
  if (usage?.minute === minute && (usage.minuteCount ?? 0) >= PER_MINUTE)
    return { status: 429, type: "rate_limited", message: "Too many requests at once. Wait a minute and try again." };
  return null;
}

/** The usage doc after one request that cost `cost` dollars; `kind` (scan, create…) is counted when given. */
export function addUsage(usage, cost, now = Date.now(), kind = null) {
  const month = monthKey(now);
  const minute = Math.floor(now / 60_000);
  const sameMonth = usage?.month === month;
  const counts = { ...(sameMonth ? usage.counts ?? {} : {}) };
  if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
  return {
    month,
    spent: (sameMonth ? usage.spent ?? 0 : 0) + cost,
    uses: (sameMonth ? usage.uses ?? 0 : 0) + 1,
    counts,
    minute,
    minuteCount: (usage?.minute === minute ? usage.minuteCount ?? 0 : 0) + 1,
  };
}

// ---------- reserving before the request, settling after ----------
/**
 * A request is reserved before it goes to Claude (its worst-case cost, its
 * count and the per-minute count), inside the same transaction as the
 * checks, then settled with the real cost when the answer comes back. A
 * reservation left behind by a crash stops counting after 10 minutes.
 */
export const PENDING_TTL = 10 * 60_000;
const fresh = (usage, now) => Object.entries(usage?.pending ?? {}).filter(([, v]) => v && now - (v.at ?? 0) < PENDING_TTL);
export const pendingTotal = (usage, now = Date.now()) => fresh(usage, now).reduce((t, [, v]) => t + (v.cost ?? 0), 0);

/** The usage doc with request `id` reserved: worst-case `cost`, and `kind` counted (null for a retry). */
export function reserveUsage(usage, id, cost, now = Date.now(), kind = null, retryOf = null) {
  const next = addUsage(usage, 0, now, kind);
  next.pending = { ...Object.fromEntries(fresh(usage, now)), [id]: { cost, at: now } };
  // Remember the last created recipe, so one automatic retry of it isn't counted again.
  next.lastCreate = kind === "create" ? now : usage?.lastCreate ?? null;
  next.retriedFor = retryOf ?? usage?.retriedFor ?? null;
  return next;
}

/** The usage doc once request `id` is done: its real cost added; its count and use given back if it failed. */
export function settleUsage(usage, id, cost, now = Date.now(), refundKind = null) {
  const month = monthKey(now);
  const sameMonth = usage?.month === month;
  const counts = { ...(sameMonth ? usage.counts ?? {} : {}) };
  if (refundKind && counts[refundKind]) counts[refundKind] -= 1;
  const pending = Object.fromEntries(fresh(usage, now).filter(([k]) => k !== id));
  return {
    ...usage,
    month,
    spent: (sameMonth ? usage.spent ?? 0 : 0) + cost,
    uses: Math.max(0, (sameMonth ? usage.uses ?? 0 : 0) - (refundKind ? 1 : 0)),
    counts,
    pending,
  };
}

/**
 * The app retries a created recipe once, automatically, when the answer was
 * cut off. Only that is free of the count: a create counted in the last 10
 * minutes that hasn't been retried yet. Returns the create it retries, or null.
 */
export function retryAllowed(usage, kind, now = Date.now()) {
  const last = usage?.lastCreate;
  return kind === "create" && last && now - last < PENDING_TTL && usage.retriedFor !== last ? last : null;
}

/**
 * Worst-case cost of a request before it's sent: its text (about 4
 * characters a token), its photos (up to about 1,600 tokens each), what
 * web_fetch may read, and every output token it may use.
 */
export function estimateCost(body) {
  const m = APP_MODELS[body?.model];
  if (!m) return 0;
  let tokens = 0;
  const text = (t) => (tokens += Math.ceil(String(t ?? "").length / 4));
  const block = (b) => {
    if (typeof b === "string") return text(b);
    if (b?.type === "image") return (tokens += 1600);
    if (b?.type === "document") return (tokens += 3000);
    text(b?.text ?? "");
  };
  const content = (c) => (Array.isArray(c) ? c.forEach(block) : block(c));
  content(body.system);
  for (const msg of body.messages ?? []) content(msg?.content);
  for (const t of body.tools ?? []) tokens += (t.max_uses ?? 1) * (t.max_content_tokens ?? 0);
  if (body.output_config?.format) text(JSON.stringify(body.output_config.format));
  return (tokens * m.inPerM + (body.max_tokens ?? 0) * m.outPerM) / 1_000_000;
}

// ---------- what may be passed on ----------
/** Request fields the app sends. Anything else is refused. */
const BODY_KEYS = new Set(["model", "max_tokens", "messages", "system", "output_config", "tools"]);
const OUTPUT_KEYS = new Set(["effort", "format"]);
/** Beta features the app uses. */
const BETA = /^structured-outputs-\d{4}-\d{2}-\d{2}$/;
/** The anthropic-beta header to pass on (null for none), or false if it asks for anything else. */
export function allowedBeta(header) {
  if (!header) return null;
  const parts = String(header).split(",").map((x) => x.trim()).filter(Boolean);
  return parts.length > 0 && parts.length <= 2 && parts.every((x) => BETA.test(x)) ? parts.join(",") : false;
}

/** Accounts made from this time on need a confirmed email for testing-period or gifted Plus (older ones are kept as they are). */
export const VERIFY_PLUS_FROM = Date.UTC(2026, 10, 15, 17, 0);
export const plusEmailOk = (verified, createdAt) => !!verified || (createdAt > 0 && createdAt < VERIFY_PLUS_FROM);

/** Plus or Family, from the subscription's price (Family prices' lookup keys start "cardamix_family"). */
export const tierOf = (sub) => (/^cardamix_family/.test(sub?.items?.data?.[0]?.price?.lookup_key ?? "") ? "family" : "plus");

/** Plus or Family if a subscription is active (past_due keeps access while Stripe retries the card); Family wins over Plus. */
export function planFromSubscriptions(subs) {
  const liveAll = (subs ?? []).filter((s) => ["active", "trialing", "past_due"].includes(s.status));
  const live = liveAll.find((s) => tierOf(s) === "family") ?? liveAll[0];
  return live
    ? { plan: tierOf(live), source: "stripe", subscription: live.id, status: live.status, interval: live.items?.data?.[0]?.price?.recurring?.interval ?? live.plan?.interval ?? null, renews: live.cancel_at_period_end ? null : (live.current_period_end ?? live.items?.data?.[0]?.current_period_end ?? null) * 1000 || null, cancelsAt: live.cancel_at_period_end ? (live.cancel_at ?? null) * 1000 || null : null }
    : { plan: "free", source: "stripe", status: subs?.[0]?.status ?? "none", renews: null, cancelsAt: null };
}

const compList = (list) => (list ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
/** Comma-separated email list (e.g. the owner's) that always gets Plus. */
export const isComp = (email, list) => !!email && compList(list).includes(email.toLowerCase());
/** "*" in the list: a testing period where every account gets Plus. */
export const isBeta = (list) => compList(list).includes("*");

/** Where Stripe may send people back to. */
export function allowedOrigin(origin) {
  return /^https:\/\/(www\.)?cardamix\.com$/.test(origin ?? "") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? "")
    ? origin
    : "https://cardamix.com";
}
