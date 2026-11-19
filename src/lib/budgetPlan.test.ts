import { describe, expect, it } from "vitest";
import { fillWeek } from "./autoPlan";
import { budgetChooser, DEFAULT_ITEM, mentions, shoppingCost, skipWords, type CostCtx, type PackPrice } from "./budgetPlan";
import { parseQty } from "./qty";
import type { SavedRecipe } from "./schema";
import { upcomingDays } from "./week";

const ing = (quantity: string, unit: string, name: string) => ({ quantity, unit, name, preparation: null, section: null });
const seg = { text: "Cook.", ingredient_index: null, amount: null };
const mk = (id: string, ingredients: ReturnType<typeof ing>[], extra: Partial<SavedRecipe> = {}): SavedRecipe => ({
  id, title: id, servings: "Serves 2", time: null, ingredients, steps: [{ segments: [seg] }], notes: null, tags: ["Dinner"], warnings: [], createdAt: 0, photos: [], ...extra,
});
const pack = (price: number, size: string | null, guess = false): PackPrice => ({ price, qty: size ? parseQty(size, "") : null, guess });
const ctx = (prices: Record<string, PackPrice>, have: string[] = []): CostCtx => ({
  have: (key) => have.includes(key),
  price: (key) => prices[key] ?? null,
});

describe("shopping cost", () => {
  const prices = { "chicken breast": pack(8, "2 lb"), rice: pack(3, "2 lb"), onion: pack(1.5, "3 count") };
  it("counts whole packages, and skips what's at home and kitchen basics", () => {
    const r = mk("a", [ing("1", "lb", "chicken breast"), ing("1", "cup", "rice"), ing("1", "", "onion"), ing("1", "tsp", "salt")]);
    expect(shoppingCost([{ recipe: r, scale: 1 }], ctx(prices)).total).toBe(12.5);
    expect(shoppingCost([{ recipe: r, scale: 1 }], ctx(prices, ["rice"])).total).toBe(9.5);
  });
  it("buys a shared ingredient once, and more packs when one isn't enough", () => {
    const a = mk("a", [ing("1.5", "lb", "chicken breast")]);
    const b = mk("b", [ing("1.5", "lb", "chicken breast")]);
    const c = shoppingCost([{ recipe: a, scale: 1 }, { recipe: b, scale: 1 }], ctx(prices));
    expect(c.items).toHaveLength(1);
    expect(c.items[0].packs).toBe(2);
    expect(c.total).toBe(16);
  });
  it("counts something with no price at all as a few dollars, not free", () => {
    const c = shoppingCost([{ recipe: mk("a", [ing("1", "", "saffron")]), scale: 1 }], ctx({}));
    expect(c.total).toBe(DEFAULT_ITEM);
    expect(c.items[0].unpriced).toBe(true);
  });
});

describe("leave out", () => {
  it("matches words in the title, labels or ingredients", () => {
    const r = mk("Spicy tacos", [ing("1", "lb", "ground pork")]);
    expect(skipWords("spicy, pork ; x")).toEqual(["spicy", "pork"]);
    expect(mentions(r, ["pork"])).toBe(true);
    expect(mentions(mk("Spicy tacos", []), ["spicy"])).toBe(true);
    expect(mentions(mk("Tacos", []), ["spicy"])).toBe(false);
  });
});

describe("budget chooser", () => {
  const now = new Date(2026, 10, 9, 10);
  const days = upcomingDays(3, now).map((d) => d.key);
  const prices = { steak: pack(20, "1 lb"), beans: pack(1, "15 oz"), rice: pack(3, "2 lb"), salmon: pack(15, "1 lb") };
  const recipes = [
    mk("steak night", [ing("1", "lb", "steak")]),
    mk("beans and rice", [ing("15", "oz", "beans"), ing("1", "cup", "rice")]),
    mk("rice bowl", [ing("1", "cup", "rice")]), // rice already bought → nearly free
    mk("salmon", [ing("1", "lb", "salmon")]),
  ];
  it("picks the dinners that cost least to shop for, sharing ingredients", () => {
    const ch = budgetChooser({ ctx: ctx(prices), cooked: (r) => r, leaveOut: () => false, random: () => 0 });
    const r = fillWeek({ week: { days: {} }, past: {}, recipes, fridge: [], people: 2, days, now, choose: ch.choose });
    expect(r.cooked).toBe(3);
    expect(ch.chosen.map((x) => x.id).slice(0, 2).sort()).toEqual(["beans and rice", "rice bowl"]);
    expect(ch.chosen.map((x) => x.id)).not.toContain("steak night");
  });
  it("leaves out what you asked it to", () => {
    const ch = budgetChooser({ ctx: ctx(prices), cooked: (r) => r, leaveOut: (r) => r.id === "rice bowl", random: () => 0 });
    fillWeek({ week: { days: {} }, past: {}, recipes, fridge: [], people: 2, days, now, choose: ch.choose });
    expect(ch.chosen.map((x) => x.id)).not.toContain("rice bowl");
  });
});

describe("budget chooser — variety", () => {
  it("only varies between dinners that cost about the same", () => {
    const now = new Date(2026, 10, 9, 10);
    const days = upcomingDays(1, now).map((d) => d.key);
    const prices = { steak: pack(18, "1 lb"), salmon: pack(15, "1 lb") };
    const recipes = [mk("steak", [ing("1", "lb", "steak")]), mk("salmon", [ing("1", "lb", "salmon")])];
    for (const r of [0, 0.5, 0.99]) {
      const ch = budgetChooser({ ctx: ctx(prices), cooked: (x) => x, leaveOut: () => false, random: () => r });
      fillWeek({ week: { days: {} }, past: {}, recipes, fridge: [], people: 2, days, now, choose: ch.choose });
      expect(ch.chosen[0].id).toBe("salmon");
    }
  });
});
