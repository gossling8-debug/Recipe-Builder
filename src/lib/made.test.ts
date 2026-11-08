import { describe, expect, it } from "vitest";
import { agoText, lastMade, madeDays, madeToday, markMade, unmarkMadeToday } from "./made";
import type { SavedRecipe } from "./schema";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const base = { id: "r", title: "T", servings: null, time: null, ingredients: [], steps: [], notes: null, tags: [], warnings: [], createdAt: 0, photos: [] } as SavedRecipe;

describe("made", () => {
  it("counts each day once, from both sources", () => {
    const r = { ...base, madeOn: [at(2026, 11, 1, 9), at(2026, 11, 3)], cookLog: [{ at: at(2026, 11, 1, 18), minutes: 30, scale: 1 }] };
    expect(madeDays(r)).toEqual([at(2026, 11, 1, 9), at(2026, 11, 3)]);
    expect(lastMade(r)).toBe(at(2026, 11, 3));
  });
  it("marks today once and can undo it", () => {
    const now = at(2026, 11, 8);
    const once = markMade(base, now);
    expect(markMade(once, now + 1000).madeOn).toHaveLength(1);
    expect(madeToday(once, now)).toBe(true);
    expect(madeToday(unmarkMadeToday(once, now), now)).toBe(false);
  });
  it("describes how long ago", () => {
    const now = at(2026, 11, 8);
    expect(agoText(at(2026, 11, 8, 8), now)).toBe("today");
    expect(agoText(at(2026, 11, 7, 23), now)).toBe("yesterday");
    expect(agoText(at(2026, 11, 3), now)).toBe("5 days ago");
    expect(agoText(at(2026, 10, 25), now)).toBe("2 weeks ago");
    expect(agoText(at(2026, 3, 4), now)).toMatch(/Mar 4/);
    expect(agoText(at(2025, 3, 4), now)).toMatch(/2025/);
  });
});
