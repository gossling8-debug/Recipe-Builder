import { describe, expect, it } from "vitest";
import { fillWeek, isDinner, leftoverNights, servingsCount } from "./autoPlan";
import type { SavedRecipe } from "./schema";
import { upcomingDays } from "./week";

const now = new Date(2026, 10, 9, 10);
const days = upcomingDays(7, now).map((d) => d.key);
const seg = { text: "Cook.", ingredient_index: null, amount: null };
const mk = (id: string, extra: Partial<SavedRecipe> = {}): SavedRecipe => ({
  id, title: id, servings: "Serves 4", time: null, ingredients: [], steps: [{ segments: [seg] }], notes: null, tags: ["Dinner"], warnings: [], createdAt: 0, photos: [], ...extra,
});
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const ids = (w: { days: Record<string, { id: string; leftover?: boolean }[]> }) =>
  days.map((d) => (w.days[d]?.[0] ? (w.days[d][0].leftover ? `L:${w.days[d][0].id}` : w.days[d][0].id) : "-"));

describe("fill my week", () => {
  const many = "abcdefghij".split("").map((x) => mk(x));

  it("fills every day with different dinners", () => {
    const r = fillWeek({ week: { days: {} }, past: {}, recipes: many, fridge: [], people: 4, days, now });
    const picked = ids(r.week);
    expect(picked.every((x) => x !== "-")).toBe(true);
    expect(new Set(picked).size).toBe(7);
    expect(r.cooked).toBe(7);
  });

  it("never repeats within 14 days of being made or planned", () => {
    const madeRecently = mk("a", { madeOn: [new Date(2026, 10, 3).getTime()] }); // 6 days ago → blocked all week
    const madeLongAgo = mk("b", { madeOn: [new Date(2026, 9, 20).getTime()] }); // 20 days ago → fine
    const r = fillWeek({ week: { days: {} }, past: { "2026-11-05": [{ id: "c", scale: 1 }] }, recipes: [madeRecently, madeLongAgo, mk("c"), mk("d")], fridge: [], people: 4, days, now });
    const picked = ids(r.week);
    expect(picked).not.toContain("a");
    expect(picked).not.toContain("c");
    expect(picked.filter((x) => x === "b")).toHaveLength(1);
    expect(r.short).toBe(5); // only b and d are allowed, once each
  });

  it("a recipe made 10 days ago is allowed again from day 14", () => {
    const r = mk("a", { madeOn: [new Date(2026, 9, 30).getTime()] }); // Oct 30 → allowed from Nov 13 (index 4)
    const res = fillWeek({ week: { days: {} }, past: {}, recipes: [r], fridge: [], people: 4, days, now });
    expect(ids(res.week)).toEqual(["-", "-", "-", "-", "a", "-", "-"]);
  });

  it("follows a big meal with leftovers nights", () => {
    const big = mk("big", { servings: "Serves 8" });
    expect(leftoverNights(big, 4)).toBe(1);
    expect(leftoverNights(big, 2)).toBe(2); // capped at 2
    expect(leftoverNights(mk("x", { servings: "Serves 4" }), 4)).toBe(0);
    const r = fillWeek({ week: { days: {} }, past: {}, recipes: [big, ...many.slice(0, 6)], fridge: [], people: 2, days, now, random: seq(0) });
    expect(ids(r.week).slice(0, 3)).toEqual(["big", "L:big", "L:big"]);
  });

  it("eats fridge leftovers first and keeps the cook's own picks", () => {
    const r = fillWeek({
      week: { days: { [days[2]]: [{ id: "mine", scale: 1 }] } },
      past: {},
      recipes: [mk("chili"), mk("mine"), ...many],
      fridge: [{ id: "chili", title: "Chili", madeAt: 0, eatBy: new Date(2026, 10, 10, 23, 59).getTime() }],
      people: 4, days, now,
    });
    const picked = ids(r.week);
    expect(picked[0]).toBe("L:chili");
    expect(picked[2]).toBe("mine");
    expect(picked).not.toContain("chili"); // not cooked again right after eating its leftovers
  });

  it("shuffling replaces only its own picks", () => {
    const first = fillWeek({ week: { days: { [days[0]]: [{ id: "mine", scale: 1 }] } }, past: {}, recipes: [mk("mine"), ...many], fridge: [], people: 4, days, now, random: seq(0.1) });
    const again = fillWeek({ week: first.week, past: {}, recipes: [mk("mine"), ...many], fridge: [], people: 4, days, now, random: seq(0.9) });
    expect(ids(again.week)[0]).toBe("mine");
    expect(ids(again.week).slice(1)).not.toEqual(ids(first.week).slice(1));
  });

  it("skips desserts, sides and recipes you wouldn't make again", () => {
    expect(isDinner(mk("Chocolate Chip Cookies", { tags: [] }))).toBe(false);
    expect(isDinner(mk("Mashed potatoes", { tags: ["Side"] }))).toBe(false);
    expect(isDinner(mk("Tacos", { makeAgain: false }))).toBe(false);
    expect(isDinner(mk("Chicken Pot Pie", { tags: ["Dinner"] }))).toBe(true);
    expect(isDinner(mk("Keto Baked Chicken", { tags: ["Dinner", "Baking", "Keto"] }))).toBe(true); // Dinner wins
    expect(isDinner(mk("Keto Fat Bombs", { tags: ["Dessert", "Keto"] }))).toBe(false);
    expect(isDinner(mk("Keto Chicken", { tags: ["Dinner"], makeAgain: false }))).toBe(false);
    expect(servingsCount("6-8 servings")).toBe(6);
  });
});
