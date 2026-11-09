import { describe, expect, it } from "vitest";
import { aYearAgo, byMonth, cookedHistory, mostMade } from "./history";
import type { SavedRecipe } from "./schema";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 18).getTime();
const mk = (id: string, madeOn: number[], cookLog: SavedRecipe["cookLog"] = []): SavedRecipe => ({
  id, title: id, servings: null, time: null, ingredients: [], steps: [], notes: null, tags: [], warnings: [], createdAt: 0, photos: [], madeOn, cookLog,
});

const chili = mk("Chili", [at(2025, 11, 10), at(2026, 11, 2)]);
const tacos = mk("Tacos", [at(2026, 11, 4)], [{ at: at(2026, 10, 28), minutes: 30, scale: 1 }, { at: at(2026, 11, 4), minutes: 25, scale: 1 }]);

describe("meal history", () => {
  it("lists everything cooked, newest first, one entry per day", () => {
    expect(cookedHistory([chili, tacos]).map((c) => c.recipe.id)).toEqual(["Tacos", "Chili", "Tacos", "Chili"]);
  });
  it("groups by month", () => {
    const months = byMonth(cookedHistory([chili, tacos])).map((g) => [g.month.split(" ")[0], g.items.length]);
    expect(months).toEqual([["November", 2], ["October", 1], ["November", 1]]);
  });
  it("finds what you made around this date last year", () => {
    expect(aYearAgo([chili, tacos], at(2026, 11, 9)).map((c) => c.recipe.id)).toEqual(["Chili"]);
    expect(aYearAgo([chili, tacos], at(2026, 11, 20))).toEqual([]);
  });
  it("counts the most made", () => {
    expect(mostMade(cookedHistory([chili, tacos]), at(2026, 10, 1)).map((m) => [m.recipe.id, m.times])).toEqual([["Tacos", 2], ["Chili", 1]]);
  });
});
