import { describe, expect, it } from "vitest";
import { addUsage, allowanceCheck, allowedOrigin, checkRequest, costOf, isBeta, isComp, monthKey, planFromSubscriptions } from "./guard.js";

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
    expect(allowanceCheck("free", { month: "2026-11", spent: 0.25 }, NOV)?.type).toBe("allowance_exceeded");
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
