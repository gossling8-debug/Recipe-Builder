import { describe, expect, it } from "vitest";
import { homeCooking, rescuedValue, storeSavings } from "./savings";
import type { PriceEntry } from "./prices";
import type { SavedRecipe } from "./schema";

const DAY = 86_400_000;
const T = new Date(2026, 10, 15).getTime();
const price = (key: string, store: string, price: number, oz: number, at: number, extra: Partial<PriceEntry> = {}): PriceEntry => ({
  id: `${key}-${store}-${at}`, key, name: key, qty: { kind: "weight", g: oz * 28.3495 }, price, at, store, ...extra,
});
const month = [new Date(2026, 10, 1).getTime(), new Date(2026, 11, 1).getTime()] as const;

describe("cheaper store", () => {
  it("counts what you saved against the cheapest other store, per unit", () => {
    const prices = [price("cheese", "H-E-B", 4, 16, T - 20 * DAY), price("cheese", "Kroger", 5, 16, T - 10 * DAY), price("cheese", "Walmart", 3, 16, T)];
    const s = storeSavings(prices, ...month);
    expect(s).toEqual([{ name: "cheese", store: "Walmart", vs: "H-E-B", saving: 1 }]);
  });
  it("adjusts for size, and counts nothing when you paid more", () => {
    const bigger = [price("rice", "Aldi", 5, 64, T), price("rice", "Kroger", 2, 16, T - DAY)]; // 7.8¢/oz vs 12.5¢/oz
    expect(storeSavings(bigger, ...month)[0].saving).toBeCloseTo(3, 2);
    const dearer = [price("rice", "Aldi", 3, 16, T), price("rice", "Kroger", 2, 16, T - 20 * DAY)]; // Kroger was last month
    expect(storeSavings(dearer, ...month)).toEqual([]);
  });
  it("doesn't compare fresh with canned, or prices months apart", () => {
    const p = [price("beans", "A", 1, 16, T, { storage: "canned" }), price("beans", "B", 3, 16, T - DAY, { storage: "fresh" }), price("beans", "C", 5, 16, T - 200 * DAY)];
    expect(storeSavings(p, ...month)).toEqual([]);
  });
});

describe("used before its date", () => {
  it("values the food at what you paid for it", () => {
    const prices = [price("spinach", "A", 4, 10, T - 5 * DAY)];
    const v = rescuedValue([{ key: "spinach", name: "spinach", qty: { kind: "weight", g: 5 * 28.3495 }, at: T }], prices, ...month);
    expect(v).toEqual([{ name: "spinach", value: 2 }]);
  });
});

describe("cooked at home", () => {
  const seg = { text: "Cook.", ingredient_index: null, amount: null };
  const dinner = (id: string, made: number[]): SavedRecipe => ({
    id, title: id, servings: "Serves 4", time: null, ingredients: [], steps: [{ segments: [seg] }], notes: null, tags: ["Dinner"], warnings: [], createdAt: 0, photos: [], madeOn: made,
  });
  const out = (amount: number) => ({ id: String(amount), amount, place: null, at: T });
  it("compares each dinner with your average eating-out trip", () => {
    const r = homeCooking([dinner("a", [T, T + DAY]), dinner("b", [T - 40 * DAY])], [out(20), out(25), out(30)], ...month, () => 10);
    expect(r).toMatchObject({ dinners: 2, counted: 2, homeEach: 10, outEach: 25, saving: 30 });
  });
  it("needs a few eating-out trips, and skips dinners with no known cost", () => {
    expect(homeCooking([dinner("a", [T])], [out(20)], ...month, () => 10)).toBeNull();
    expect(homeCooking([dinner("a", [T])], [out(20), out(20), out(20)], ...month, () => null)).toMatchObject({ dinners: 1, counted: 0, saving: 0 });
  });
  it("still counts a dinner you cooked but marked \"Wouldn't make again\"", () => {
    const r = homeCooking([{ ...dinner("a", [T]), makeAgain: false }], [out(20), out(20), out(20)], ...month, () => 10);
    expect(r).toMatchObject({ dinners: 1, counted: 1, saving: 10 });
  });
});
