import { describe, expect, it } from "vitest";
import { estimate, nextOccurrence, reminderIcs, statedTimes, untilText } from "./plan";
import type { ScannedRecipe } from "./schema";

const seg = (text: string) => ({ segments: [{ text, ingredient_index: null, amount: null }] });
const base: ScannedRecipe = {
  title: "Dip", servings: null, time: null, notes: null, tags: [], warnings: [],
  ingredients: Array.from({ length: 6 }, (_, i) => ({ quantity: "1", unit: "", name: `i${i}`, preparation: null, section: null })),
  steps: [seg("Sauté 2 minutes."), seg("Pressure cook 15 minutes."), seg("Shred.")],
};

describe("statedTimes", () => {
  it("reads total/prep/cook", () =>
    expect(statedTimes("Prep time: 5 mins; Cook time: 20 mins; Total time: 25 mins")).toEqual({ prep: 5, cook: 20, total: 25 }));
  it("uses the upper end of ranges", () => expect(statedTimes("Bake 350°F for 8–10 min")).toEqual({ cook: 10 }));
});

describe("estimate", () => {
  it("uses the stated total plus setup", () => {
    const e = estimate({ ...base, time: "Prep time: 5 mins; Cook time: 20 mins; Total time: 25 mins" });
    expect(e).toMatchObject({ minutes: 30, basis: "stated" });
  });
  it("adds prep guess to a stated cook time", () => {
    // prep guess = 6×1.5 + 3 = 12; cook 30; setup 5 → 47 → 50
    expect(estimate({ ...base, time: "Bake 30 minutes" })).toMatchObject({ minutes: 50, basis: "stated" });
  });
  it("guesses from timed steps", () => {
    // prep 12 + steps 17 + setup 5 = 34 → 35
    expect(estimate(base)).toMatchObject({ minutes: 35, basis: "guess" });
  });
  it("prefers the cook's real times", () => {
    const e = estimate({ ...base, time: "Total time: 25 mins", cookLog: [{ at: 1, minutes: 50, scale: 1 }, { at: 2, minutes: 41, scale: 1 }] });
    expect(e).toMatchObject({ minutes: 50, basis: "history" });
    expect(e.detail).toContain("last 2 times");
  });
});

describe("times", () => {
  it("picks tomorrow if the time has passed", () => {
    const now = new Date(2026, 10, 7, 19, 0);
    expect(nextOccurrence("18:30", now).getDate()).toBe(8);
    expect(nextOccurrence("19:30", now).getDate()).toBe(7);
  });
  it("untilText", () => {
    expect(untilText(Date.now() + 25 * 60000 + 1000)).toBe("in 25 min");
    expect(untilText(Date.now() + 90 * 60000 + 1000)).toBe("in 1 h 30 min");
  });
});

describe("reminderIcs", () => {
  const ics = reminderIcs({ recipeId: "r1", title: "Crack Chicken, dip", eatAt: Date.UTC(2026, 10, 8, 1, 0), startAt: Date.UTC(2026, 10, 8, 0, 15), minutes: 45 }, "https://x/#/recipe/r1");
  it("has start, end, two alarms and escaped text", () => {
    expect(ics).toContain("DTSTART:20261108T001500Z");
    expect(ics).toContain("DTEND:20261108T010000Z");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Start cooking: Crack Chicken\\, dip");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
