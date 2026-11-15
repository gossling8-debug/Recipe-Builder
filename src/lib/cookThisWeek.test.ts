import { describe, expect, it } from "vitest";
import { cookThisWeek, loved } from "./cookThisWeek";
import type { SavedRecipe } from "./schema";

const NOW = new Date(2026, 10, 15, 12).getTime();
const DAY = 86_400_000;
const seg = { text: "Cook.", ingredient_index: null, amount: null };
const mk = (id: string, extra: Partial<SavedRecipe> = {}): SavedRecipe => ({
  id, title: id, servings: "Serves 4", time: null, ingredients: [], steps: [{ segments: [seg] }], notes: null, tags: [], warnings: [], createdAt: 0, photos: [], ...extra,
});
const ids = (s: { recipe: SavedRecipe }[]) => s.map((x) => x.recipe.id);
const key = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

describe("cook this week", () => {
  it("only suggests recipes you loved", () => {
    expect(loved(mk("a", { rating: 4 }))).toBe(true);
    expect(loved(mk("b", { makeAgain: true }))).toBe(true);
    expect(loved(mk("c", { favorite: true }))).toBe(true);
    expect(loved(mk("d", { rating: 3 }))).toBe(false);
    expect(loved(mk("e"))).toBe(false);
    expect(loved(mk("f", { rating: 5, makeAgain: false }))).toBe(false); // "wouldn't make again" wins
    expect(loved(mk("g", { rating: 5, steps: [] }))).toBe(false); // nothing to cook (a web link only)
  });

  it("skips what was made or planned in the last 14 days", () => {
    const s = cookThisWeek({
      recipes: [
        mk("recent", { rating: 5, madeOn: [NOW - 3 * DAY] }),
        mk("planned", { rating: 5, madeOn: [NOW - 60 * DAY] }),
        mk("old", { rating: 5, madeOn: [NOW - 60 * DAY] }),
      ],
      planned: [{ [key(NOW + 2 * DAY)]: [{ id: "planned", scale: 1 }] }],
      now: NOW,
    });
    expect(ids(s)).toEqual(["old"]);
    expect(s[0].last).toBe(NOW - 60 * DAY);
  });

  it("puts the most loved first, then the longest since it was made, at most 3", () => {
    const s = cookThisWeek({
      recipes: [
        mk("four-old", { rating: 4, madeOn: [NOW - 200 * DAY] }),
        mk("five-recent", { rating: 5, madeOn: [NOW - 20 * DAY] }),
        mk("five-old", { rating: 5, madeOn: [NOW - 100 * DAY] }),
        mk("fav", { favorite: true }),
        mk("again", { makeAgain: true, madeOn: [NOW - 40 * DAY] }),
      ],
      planned: [],
      now: NOW,
    });
    expect(ids(s)).toEqual(["five-old", "five-recent", "four-old"]);
  });

  it("leaves out the ones hidden for this week", () => {
    const s = cookThisWeek({ recipes: [mk("a", { rating: 5 }), mk("b", { rating: 4 })], planned: [], hidden: new Set(["a"]), now: NOW });
    expect(ids(s)).toEqual(["b"]);
  });

  it("returns nothing when nothing is loved", () => {
    expect(cookThisWeek({ recipes: [mk("a"), mk("b", { rating: 2 })], planned: [], now: NOW })).toEqual([]);
  });
});
