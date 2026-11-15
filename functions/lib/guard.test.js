import { describe, expect, it } from "vitest";
import { addUsage, allowanceCheck, allowanceKey, allowedOrigin, checkRequest, costOf, freeCheck, FREE_LIMITS, isBeta, isComp, monthKey, planFromSubscriptions } from "./guard.js";

const ok = { model: "claude-sonnet-5-5", max_tokens: 6000, messages: [{ role: "user", content: "hi" }] };
const NOV = Date.UTC(2026, 10, 12, 10, 0);

describe("what the AI relay passes on", () => {
  it("allows the app's own requests", () => {
    expect(checkRequest(ok)).toBeNull();
    expect(checkRequest({ ...ok, model: "claude-haiku-5-5", tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 2, max_content_tokens: 30000 }] })).toBeNull();
  });
  it("refuses the expensive model, streaming, huge outputs and other tools", () => {
    expect(checkRequest({ ...ok, model: "claude-opus-5-5" })).toMatch(/model/);
    expect(checkRequest({ ...ok, stream: true })).toMatch(/Streaming/);
    expect(checkRequest({ ...ok, max_tokens: 64000 })).toMatch(/max_tokens/);
    expect(checkRequest({ ...ok, tools: [{ type: "bash_20250124", name: "bash" }] })).toMatch(/Tools/);
    expect(checkRequest({ ...ok, tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 50, max_content_tokens: 30000 }] })).toMatch(/max_uses/);
    expect(checkRequest({ ...ok, messages: [] })).toMatch(/messages/);
    expect(checkRequest(null)).toBe("Bad request.");
    expect(checkRequest({ ...ok, fallbacks: "default" })).toBe("Not allowed."); // could switch to a pricier model
  });
});

describe("monthly allowance", () => {
  it("counts list-price cost", () => {
    expect(costOf("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
    expect(costOf("claude-opus-5-5", { input_tokens: 1, output_tokens: 1 })).toBe(0);
  });
  it("free gets a small taste, Plus much more", () => {
    expect(allowanceCheck("free", { month: "2026-11", spent: 0.1 }, NOV)).toBeNull();
    expect(allowanceCheck("free", { month: "2026-11", spent: 0.4 }, NOV)?.type).toBe("allowance_exceeded");
    expect(allowanceCheck("plus_yearly", { month: "2026-11", spent: 2.25 }, NOV)?.message).toMatch(/resets/);
    expect(allowanceCheck("plus_yearly", { month: "2026-11", spent: 2.2 }, NOV)).toBeNull();
    expect(allowanceCheck("plus", { month: "2026-11", spent: 0.25 }, NOV)).toBeNull();
    expect(allowanceCheck("plus", { month: "2026-11", spent: 2.5 }, NOV)?.message).toMatch(/resets/);
  });
  it("resets each month", () => {
    expect(allowanceCheck("free", { month: "2026-10", spent: 5 }, NOV)).toBeNull();
    expect(monthKey(NOV)).toBe("2026-11");
    expect(addUsage({ month: "2026-10", spent: 5, uses: 9 }, 0.02, NOV)).toMatchObject({ month: "2026-11", spent: 0.02, uses: 1 });
  });
  it("limits bursts per minute", () => {
    let u;
    for (let i = 0; i < 12; i++) u = addUsage(u, 0.001, NOV);
    expect(allowanceCheck("plus", u, NOV)?.type).toBe("rate_limited");
    expect(allowanceCheck("plus", u, NOV + 61_000)).toBeNull();
  });
});

describe("plans", () => {
  it("Plus while a subscription is active, trialing or retrying payment", () => {
    expect(planFromSubscriptions([{ status: "active", cancel_at_period_end: false, current_period_end: 1800000000 }])).toMatchObject({ plan: "plus", renews: 1800000000000 });
    expect(planFromSubscriptions([{ status: "past_due" }]).plan).toBe("plus");
    expect(planFromSubscriptions([{ status: "canceled" }]).plan).toBe("free");
    expect(planFromSubscriptions([]).plan).toBe("free");
  });
  it("shows when a cancelled subscription ends", () => {
    expect(planFromSubscriptions([{ status: "active", cancel_at_period_end: true, cancel_at: 1800000000 }])).toMatchObject({ plan: "plus", renews: null, cancelsAt: 1800000000000 });
  });
  it("comp emails always get Plus", () => {
    expect(isComp("Owner@Example.com", "a@b.com, owner@example.com")).toBe(true);
    expect(isComp("x@y.com", "")).toBe(false);
  });
  it("'*' means a testing period: everyone gets Plus", () => {
    expect(isBeta("*")).toBe(true);
    expect(isBeta("owner@example.com, *")).toBe(true);
    expect(isBeta("owner@example.com")).toBe(false);
    expect(isBeta("none")).toBe(false);
  });
  it("only sends people back to Cardamix", () => {
    expect(allowedOrigin("https://cardamix.com")).toBe("https://cardamix.com");
    expect(allowedOrigin("https://www.cardamix.com")).toBe("https://www.cardamix.com");
    expect(allowedOrigin("https://evil.example")).toBe("https://cardamix.com");
  });
});

describe("free accounts and plan allowances", () => {
  const NOV2 = Date.UTC(2026, 10, 15);
  it("picks the allowance by plan and billing interval", () => {
    expect(allowanceKey("free", null)).toBe("free");
    expect(allowanceKey("plus", "month")).toBe("plus");
    expect(allowanceKey("plus", null)).toBe("plus");
    expect(allowanceKey("plus", "year")).toBe("plus_yearly");
  });
  it("lets free accounts add 5 recipes and create 3 a month, then stops", () => {
    expect(FREE_LIMITS).toEqual({ scan: 5, create: 3 });
    let u = null;
    for (let i = 0; i < 5; i++) {
      expect(freeCheck("scan", "claude-haiku-5-5", u, NOV2)).toBeNull();
      u = addUsage(u, 0.003, NOV2 + i * 61_000, "scan");
    }
    expect(freeCheck("scan", "claude-haiku-5-5", u, NOV2)).toMatchObject({ type: "free_limit", status: 429 });
    expect(freeCheck("scan", "claude-haiku-5-5", u, NOV2).message).toMatch(/5 free recipe adds/);
    for (let i = 0; i < 3; i++) {
      expect(freeCheck("create", "claude-sonnet-5-5", u, NOV2)).toBeNull();
      u = addUsage(u, 0.08, NOV2 + (10 + i) * 61_000, "create");
    }
    expect(freeCheck("create", "claude-sonnet-5-5", u, NOV2).message).toMatch(/3 free created recipes/);
    // The automatic retry of the last one (cut off) still goes through; the dollar backstop limits it.
    expect(freeCheck("create", "claude-sonnet-5-5", u, NOV2, true)).toBeNull();
    // A new month starts over.
    expect(freeCheck("create", "claude-sonnet-5-5", u, Date.UTC(2026, 11, 1))).toBeNull();
  });
  it("free scans must use the budget model; other AI is Plus only", () => {
    expect(freeCheck("scan", "claude-sonnet-5-5", null, NOV2)?.status).toBe(400);
    expect(freeCheck("nutrition", "claude-haiku-5-5", null, NOV2)).toMatchObject({ type: "plus_feature", status: 403 });
    expect(freeCheck("other", "claude-haiku-5-5", null, NOV2)?.type).toBe("plus_feature");
  });
  it("retries aren't counted (no kind), and counts start over each month", () => {
    const u = addUsage({ month: "2026-11", spent: 0, uses: 1, counts: { create: 1 } }, 0.05, NOV2, null);
    expect(u.counts).toEqual({ create: 1 });
    expect(addUsage({ month: "2026-10", counts: { scan: 5 } }, 0.01, NOV2, "scan").counts).toEqual({ scan: 1 });
  });
  it("records whether Plus is monthly or yearly", () => {
    expect(planFromSubscriptions([{ status: "active", items: { data: [{ price: { recurring: { interval: "year" } } }] } }]).interval).toBe("year");
    expect(planFromSubscriptions([{ status: "active", plan: { interval: "month" } }]).interval).toBe("month");
  });
});
