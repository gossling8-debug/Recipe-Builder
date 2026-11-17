import { beforeEach, describe, expect, it } from "vitest";
import { addMeal, loadWeek, mealsToShop, removeMeal, saveWeek, upcomingDays } from "./week";

describe("week plan", () => {
  beforeEach(() => saveWeek({ days: {} }));
  it("lists 7 days starting today", () => {
    const days = upcomingDays(7, new Date(2026, 10, 8, 9));
    expect(days.map((d) => d.key)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(days[0].name).toBe("Today");
    expect(days[1].name).toBe("Tomorrow");
  });
  it("adds up a recipe planned twice for shopping", () => {
    const s = { days: { "2026-11-08": [{ id: "a", scale: 1 }], "2026-11-10": [{ id: "a", scale: 2 }, { id: "b", scale: 1 }] } };
    expect(mealsToShop(s, ["2026-11-08", "2026-11-10"])).toEqual([{ id: "a", scale: 3 }, { id: "b", scale: 1 }]);
  });
  it("drops past days", () => {
    saveWeek({ days: { "2020-01-01": [{ id: "a", scale: 1 }], "2999-01-01": [{ id: "b", scale: 1 }] } });
    expect(Object.keys(loadWeek().days)).toEqual(["2999-01-01"]);
  });
  it("adds and removes meals", () => {
    addMeal("2999-01-01", { id: "a", scale: 1 });
    addMeal("2999-01-01", { id: "b", scale: 1 });
    expect(removeMeal("2999-01-01", 0).days["2999-01-01"]).toEqual([{ id: "b", scale: 1 }]);
  });
});

describe("choosing a leftovers day", () => {
  it("offers what was cooked in the 3 days before, then the fridge and freezer", async () => {
    const { leftoverChoices, daysBetween } = await import("./week");
    expect(daysBetween("2026-11-30", "2026-12-02")).toBe(2);
    const plans = {
      "2026-11-12": [{ id: "old", scale: 1 }], // 4 days before: too old
      "2026-11-14": [{ id: "chili", scale: 1 }, { id: "chili", scale: 1, leftover: true }],
      "2026-11-15": [{ id: "soup", scale: 1 }],
      "2026-11-16": [{ id: "tacos", scale: 1 }], // the day itself
      "2026-11-17": [{ id: "later", scale: 1 }], // after: not yet cooked
    };
    const day = new Date(2026, 10, 16).getTime();
    const fridge = [
      { id: "stew", eatBy: day + 3_600_000 }, // still good that day
      { id: "pie", eatBy: day - 3_600_000 }, // past its date
      { id: "lasagna", eatBy: 0, frozen: true },
      { id: "soup", eatBy: day + 3_600_000 }, // already offered as cooked
    ];
    const out = leftoverChoices("2026-11-16", plans, fridge, (k) => k.slice(5));
    expect(out).toEqual([
      { id: "soup", from: "cooked 11-15" },
      { id: "chili", from: "cooked 11-14" },
      { id: "stew", from: "in your fridge" },
      { id: "lasagna", from: "in your freezer" },
    ]);
  });
  it("doesn't offer what's already planned that day", async () => {
    const { leftoverChoices } = await import("./week");
    const plans = { "2026-11-15": [{ id: "soup", scale: 1 }], "2026-11-16": [{ id: "soup", scale: 1, leftover: true }] };
    expect(leftoverChoices("2026-11-16", plans, [], (k) => k)).toEqual([]);
  });
});

describe("moving a meal to another day", () => {
  it("moves it and makes it your own choice", async () => {
    const { moveMeal, saveWeek, loadWeek, upcomingDays } = await import("./week");
    const [a, b] = upcomingDays(2).map((d) => d.key);
    saveWeek({ days: { [a]: [{ id: "x", scale: 2, auto: true }, { id: "y", scale: 1 }] } });
    moveMeal(a, 0, b);
    expect(loadWeek().days[a]).toEqual([{ id: "y", scale: 1 }]);
    expect(loadWeek().days[b]).toEqual([{ id: "x", scale: 2 }]);
  });
});

describe("dropping a meal on a day that has one", () => {
  it("swaps them", async () => {
    const { moveMeal, saveWeek, loadWeek, upcomingDays } = await import("./week");
    const [a, , c] = upcomingDays(3).map((d) => d.key);
    saveWeek({ days: { [a]: [{ id: "alfredo", scale: 1, auto: true }], [c]: [{ id: "soup", scale: 1, auto: true }] } });
    moveMeal(a, 0, c);
    expect(loadWeek().days[c]).toEqual([{ id: "alfredo", scale: 1 }]);
    expect(loadWeek().days[a]).toEqual([{ id: "soup", scale: 1 }]);
  });
});
