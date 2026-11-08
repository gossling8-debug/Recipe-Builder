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
