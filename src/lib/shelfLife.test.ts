import { describe, expect, it } from "vitest";
import { estimateUseBy, freshness, useByLabel, useByText } from "./shelfLife";

const NOW = new Date(2026, 10, 8, 12, 0).getTime(); // Nov 8, noon
const days = (name: string) => {
  const t = estimateUseBy(name, NOW);
  return t === null ? null : Math.round((t - NOW) / 86_400_000);
};

describe("estimateUseBy", () => {
  it.each([
    ["boneless, skinless chicken breasts", 2],
    ["ground beef", 2],
    ["milk", 7],
    ["heavy cream", 7],
    ["cream cheese", 14],
    ["shredded cheddar", 21],
    ["large eggs", 28],
    ["unsalted butter", 30],
    ["bacon", 7],
    ["fresh spinach", 5],
    ["strawberries", 4],
    ["green onions", 6],
    ["bell pepper", 9],
    ["lemons", 14],
    ["yellow onion", 30],
  ])("%s ≈ %s days", (name, d) => expect(days(name)).toBe(d));

  it.each(["sugar", "all-purpose flour", "garlic powder", "chicken broth", "dried dill", "onion powder", "crushed red pepper flakes", "canned tomatoes", "bread crumbs", "salt", "cream of tartar", "evaporated milk", "ground cinnamon", "ground ginger"])(
    "%s has no use-by date",
    (name) => expect(days(name)).toBeNull(),
  );
});

describe("freshness", () => {
  const at = (d: number, h = 23) => new Date(2026, 10, 8 + d, h, 59).getTime();
  it.each([
    [at(-2), "past", "2 days ago"],
    [at(-1), "past", "yesterday"],
    [at(0), "today", "today"],
    [at(1), "soon", "tomorrow"],
    [at(3), "soon", "in 3 days"],
    [at(5), "ok", "in 5 days"],
  ])("%s", (t, f, text) => {
    expect(freshness(t as number, NOW)).toBe(f);
    expect(useByText(t as number, NOW)).toBe(text);
  });
});

describe("useByLabel", () => {
  const at = (d: number) => new Date(2026, 10, 8 + d, 23, 59).getTime();
  it.each([[-1, "Past its date (yesterday)"], [0, "Use today"], [1, "Use by tomorrow"], [3, "Use within 3 days"], [14, "Use by Nov 22"]])(
    "%s days → %s",
    (d, label) => expect(useByLabel(at(d as number), NOW)).toBe(label),
  );
});
