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

/** Monthly AI allowance, in dollars of Anthropic list price. */
export const ALLOWANCE = { free: 0.25, plus: 2.5 };
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
  const spent = usage?.month === month ? usage.spent ?? 0 : 0;
  const limit = ALLOWANCE[plan] ?? ALLOWANCE.free;
  if (spent >= limit)
    return {
      status: 429,
      type: "allowance_exceeded",
      message:
        plan === "plus"
          ? "You've used this month's AI allowance. It resets on the 1st."
          : "You've used this month's free AI. Upgrade to Plus for much more, or wait until the 1st.",
    };
  const minute = Math.floor(now / 60_000);
  if (usage?.minute === minute && (usage.minuteCount ?? 0) >= PER_MINUTE)
    return { status: 429, type: "rate_limited", message: "Too many requests at once. Wait a minute and try again." };
  return null;
}

/** The usage doc after one request that cost `cost` dollars. */
export function addUsage(usage, cost, now = Date.now()) {
  const month = monthKey(now);
  const minute = Math.floor(now / 60_000);
  const sameMonth = usage?.month === month;
  return {
    month,
    spent: (sameMonth ? usage.spent ?? 0 : 0) + cost,
    uses: (sameMonth ? usage.uses ?? 0 : 0) + 1,
    minute,
    minuteCount: (usage?.minute === minute ? usage.minuteCount ?? 0 : 0) + 1,
  };
}

/** Plus if a subscription is active (past_due keeps access while Stripe retries the card). */
export function planFromSubscriptions(subs) {
  const live = (subs ?? []).find((s) => ["active", "trialing", "past_due"].includes(s.status));
  return live
    ? { plan: "plus", source: "stripe", status: live.status, renews: live.cancel_at_period_end ? null : (live.current_period_end ?? live.items?.data?.[0]?.current_period_end ?? null) * 1000 || null, cancelsAt: live.cancel_at_period_end ? (live.cancel_at ?? null) * 1000 || null : null }
    : { plan: "free", source: "stripe", status: subs?.[0]?.status ?? "none", renews: null, cancelsAt: null };
}

/** Comma-separated email list (e.g. the owner's) that always gets Plus. */
export const isComp = (email, list) =>
  !!email && (list ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

/** Where Stripe may send people back to. */
export function allowedOrigin(origin) {
  return /^https:\/\/(www\.)?cardamix\.com$/.test(origin ?? "") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? "")
    ? origin
    : "https://cardamix.com";
}
