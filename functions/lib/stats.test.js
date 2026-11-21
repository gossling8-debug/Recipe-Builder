import { describe, expect, it } from "vitest";
import { summarize } from "./stats.js";

const NOW = Date.UTC(2026, 10, 15, 12, 0);
const DAY = 86_400_000;
const base = { users: [], plans: [], usage: [], mix: [], cookbooks: 0, errors: [], now: NOW };

describe("owner dashboard summary", () => {
  it("counts accounts by sign-up and last activity", () => {
    const s = summarize({
      ...base,
      users: [
        { created: NOW - 2 * DAY, lastActive: NOW - DAY, verified: true },
        { created: NOW - 20 * DAY, lastActive: NOW - 10 * DAY, verified: false },
        { created: NOW - 90 * DAY, lastActive: NOW - 60 * DAY, verified: true },
      ],
    });
    expect(s.accounts).toEqual({ total: 3, verified: 2, new7: 1, new30: 2, active7: 1, active30: 2 });
  });

  it("separates paying Plus (monthly, yearly) from free gifts and the beta", () => {
    const s = summarize({
      ...base,
      plans: [
        { plan: "plus", source: "stripe", interval: "month" },
        { plan: "plus", source: "stripe", interval: "month" },
        { plan: "plus", source: "stripe", interval: "year" },
        { plan: "plus", source: "comp" },
        { plan: "plus", source: "beta" },
        { plan: "free", source: "none" },
      ],
    });
    expect(s.plus).toMatchObject({ monthly: 2, yearly: 1, comp: 1, beta: 1 });
    expect(s.plus.revenuePerMonth).toBe(11.9); // 2 × 4.49 + 34.99 / 12
  });

  it("adds up only this month's AI use", () => {
    const s = summarize({
      ...base,
      usage: [
        { month: "2026-11", spent: 0.5, uses: 10, counts: { scan: 4, create: 1 }, plan: "plus" },
        { month: "2026-11", spent: 0.12, uses: 3, counts: { scan: 3 }, plan: "free" },
        { month: "2026-10", spent: 9, uses: 99, counts: { scan: 50 }, plan: "plus" },
      ],
    });
    expect(s.ai).toMatchObject({ month: "2026-11", spent: 0.62, uses: 13, people: 2, byKind: { scan: 7, create: 1 }, byPlan: { plus: 0.5, free: 0.12 } });
    expect(s.ai.topSpends).toEqual([0.5, 0.12]);
  });

  it("counts reported and hidden Mix recipes", () => {
    const s = summarize({ ...base, cookbooks: 4, mix: [{ reporters: {} }, { reporters: { a: true } }, { reporters: { a: true, b: true, c: true } }, {}] });
    expect(s.content).toEqual({ mixRecipes: 4, mixReported: 2, mixHidden: 1, cookbooks: 4 });
  });

  it("groups error reports by message, most frequent first", () => {
    const s = summarize({
      ...base,
      errors: [
        { message: "B", screen: "recipe", app: "v2", at: NOW - DAY },
        { message: "A", screen: "home", app: "v1", at: NOW - 10 * DAY, stack: "at x" },
        { message: "B", screen: "scan", app: "v2", at: NOW - 2 * DAY },
      ],
    });
    expect(s.errors.total).toBe(3);
    expect(s.errors.last7).toBe(2);
    expect(s.errors.groups.map((g) => [g.message, g.count, g.screens])).toEqual([
      ["B", 2, ["recipe", "scan"]],
      ["A", 1, ["home"]],
    ]);
    expect(s.errors.groups[0].lastAt).toBe(NOW - DAY);
  });

  it("returns no emails or account ids", () => {
    const s = summarize({ ...base, users: [{ created: NOW, lastActive: NOW, verified: true, email: "x@example.com", uid: "u1" }] });
    expect(JSON.stringify(s)).not.toMatch(/example\.com|u1/);
  });
});

describe("Family and the steps toward upgrading", () => {
  const base2 = { users: [], usage: [], mix: [], cookbooks: 0, errors: [], now: Date.parse("2026-11-21T12:00:00Z") };
  it("counts paying Family in subscribers and revenue, and household members apart", () => {
    const s = summarize({
      ...base2,
      plans: [
        { plan: "plus", source: "stripe", interval: "month" },
        { plan: "family", source: "stripe", interval: "month" },
        { plan: "family", source: "stripe", interval: "year" },
        { plan: "family", source: "household" },
      ],
    });
    expect(s.plus).toMatchObject({ monthly: 1, yearly: 0, familyMonthly: 1, familyYearly: 1, household: 1 });
    expect(s.plus.revenuePerMonth).toBe(19.31); // 4.49 + 8.99 + 69.99 / 12
  });
  it("counts each step once per person, and how many of them pay now, without naming anyone", () => {
    const s = summarize({
      ...base2,
      plans: [
        { uid: "a", plan: "plus", source: "stripe", interval: "month" },
        { uid: "b", plan: "free", source: "none" },
        { uid: "c", plan: "family", source: "stripe", interval: "year" },
      ],
      funnel: [
        { uid: "a", cardSeen: 1, plansOpened: 2 },
        { uid: "b", cardSeen: 1, cardDismissed: 2, limitHit: 3 },
        { uid: "c", samplesTried: 1, plansOpened: 2 },
      ],
    });
    expect(s.upgrade).toEqual({
      cardSeen: { reached: 2, payNow: 1 },
      cardDismissed: { reached: 1, payNow: 0 },
      plansOpened: { reached: 2, payNow: 2 },
      limitHit: { reached: 1, payNow: 0 },
      samplesTried: { reached: 1, payNow: 1 },
      paying: 2,
    });
    expect(JSON.stringify(s)).not.toMatch(/"uid"|"a"|"b"|"c"/);
  });
});
