import { beforeEach, describe, expect, it } from "vitest";
import { addPrice, deletePrice, loadPrices, parsePrice, periodStarts, recipeCost, spentSince } from "./prices";
import type { ScannedRecipe } from "./schema";

const r: ScannedRecipe = {
  title: "Chili",
  servings: "Serves 4",
  time: null,
  notes: null,
  tags: [],
  warnings: [],
  steps: [],
  ingredients: [
    { quantity: "1", unit: "lb", name: "ground beef", preparation: null, section: null },
    { quantity: "1", unit: "can", name: "kidney beans", preparation: null, section: null },
    { quantity: "1", unit: "tsp", name: "salt", preparation: null, section: null },
    { quantity: "1", unit: "tbsp", name: "chili powder", preparation: null, section: null },
  ],
};

describe("prices", () => {
  beforeEach(() => [...loadPrices()].forEach((p) => deletePrice(p.id)));

  it("reads prices", () => {
    expect(parsePrice("$3.48")).toBe(3.48);
    expect(parsePrice("12")).toBe(12);
    expect(parsePrice("abc")).toBeNull();
  });

  it("costs a recipe from what you paid, at its size", () => {
    addPrice("ground beef", "2 lb", 10); // $5/lb
    addPrice("kidney beans", "3 cans", 3); // $1/can
    const c = recipeCost(r, 1);
    expect(c.total).toBeCloseTo(6);
    expect(c.priced).toBe(2);
    expect(c.of).toBe(3); // salt doesn't count
    expect(recipeCost(r, 2).total).toBeCloseTo(12);
  });

  it("uses the latest price", () => {
    addPrice("ground beef", "1 lb", 4, 1);
    addPrice("ground beef", "1 lb", 6, 2);
    expect(recipeCost(r, 1).total).toBeCloseTo(6);
  });

  it("adds up spending for the week", () => {
    const { week } = periodStarts(new Date(2026, 10, 11)); // a Wednesday
    expect(new Date(week).getDay()).toBe(0);
    addPrice("milk", "1 gallon", 3.5, week + 1000);
    addPrice("eggs", "12", 4, week - 1000);
    expect(spentSince(week)).toBeCloseTo(3.5);
  });
});

describe("editing spending", () => {
  it("corrects a price, removes a purchase, and can start over without losing prices", async () => {
    const { addPrice, deletePrice, loadPrices, recipeCost, spentSince, startSpendingOver, updatePrice } = await import("./prices");
    [...loadPrices()].forEach((p) => deletePrice(p.id));
    const a = addPrice("ground beef", "1 lb", 5, 1000);
    const b = addPrice("paper towels", "", 7, 2000);
    expect(spentSince(0)).toBeCloseTo(12);
    updatePrice(a, 6);
    deletePrice(b);
    expect(spentSince(0)).toBeCloseTo(6);
    startSpendingOver(3000);
    expect(spentSince(0)).toBe(0);
    addPrice("milk", "1 gallon", 3, 4000);
    expect(spentSince(0)).toBeCloseTo(3);
    // the beef price still counts for recipe costs
    expect(recipeCost({ title: "", servings: null, time: null, notes: null, tags: [], warnings: [], steps: [], ingredients: [{ quantity: "1", unit: "lb", name: "ground beef", preparation: null, section: null }] }, 1).total).toBeCloseTo(6);
  });
});
