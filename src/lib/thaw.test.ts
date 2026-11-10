import { beforeEach, describe, expect, it } from "vitest";
import { dueNow, loadNotFrozen, markNotFrozen, markThawed, thawItems, thawReminders, unmarkNotFrozen, whenText } from "./thaw";
import type { ScannedRecipe } from "./schema";

const recipe = (...ings: [string, string, string, string?][]): ScannedRecipe => ({
  title: "R", servings: null, time: null, notes: null, tags: [], warnings: [], steps: [],
  ingredients: ings.map(([q, u, n, p]) => ({ quantity: q, unit: u, name: n, preparation: p ?? null, section: null })),
});

describe("what needs thawing", () => {
  it("finds meat and seafood, and anything the recipe says to thaw", () => {
    const r = recipe(["2", "lbs", "boneless", "skinless chicken breasts"], ["1", "lb", "shrimp"], ["10", "oz", "frozen spinach", "thawed"], ["2", "cups", "chicken broth"], ["1", "tsp", "garlic powder"], ["4", "slices", "bacon"]);
    expect(thawItems(r).map((i) => [i.name, i.days])).toEqual([["boneless skinless chicken breasts", 1], ["shrimp", 1], ["frozen spinach", 1]]);
  });
  it("big items take about a day per 4–5 lb", () => {
    expect(thawItems(recipe(["1", "", "turkey"]))[0].days).toBe(3); // typical 12 lb assumed → 3 days
    expect(thawItems(recipe(["1", "", "turkey (18 lb)"]))[0].days).toBe(4); // weight in the name
    expect(thawItems(recipe(["14", "lb", "whole turkey"]))[0].days).toBe(4);
    expect(thawItems(recipe(["3", "lb", "beef chuck roast"]))[0].days).toBe(1);
    expect(thawItems(recipe(["1", "", "whole chicken"]))[0].days).toBe(2);
  });
});

describe("reminders for planned meals", () => {
  const now = new Date(2026, 10, 10, 9).getTime(); // Tue 9 am
  const wed = new Date(2026, 10, 11, 18).getTime();
  const sat = new Date(2026, 10, 14, 18).getTime();
  beforeEach(() => loadNotFrozen().forEach(unmarkNotFrozen));

  it("says when to move each item to the fridge", () => {
    const list = thawReminders(
      [
        { recipeId: "t", title: "Tacos", recipe: recipe(["1", "lb", "ground beef"]), scale: 1, at: wed },
        { recipeId: "g", title: "Turkey", recipe: recipe(["14", "lb", "whole turkey"]), scale: 1, at: sat },
      ],
      now,
    );
    expect(list.map((r) => [r.title, new Date(r.moveBy).getDate(), new Date(r.moveBy).getHours()])).toEqual([
      ["Tacos", 10, 19], // Tuesday evening for Wednesday dinner
      ["Turkey", 10, 19], // 4 days before Saturday
    ]);
    expect(whenText(list[0].moveBy, now)).toBe("today");
    expect(dueNow(list, now)).toHaveLength(2);
  });

  it("is late after the evening passes, and gone once the meal has passed", () => {
    const meal = [{ recipeId: "t", title: "Tacos", recipe: recipe(["1", "lb", "ground beef"]), scale: 1, at: wed }];
    expect(whenText(thawReminders(meal, now)[0].moveBy, new Date(2026, 10, 11, 8).getTime())).toBe("late");
    expect(thawReminders(meal, wed + 1000)).toEqual([]);
  });

  it("forgets ingredients marked not frozen, and reminders marked done", () => {
    const meal = [{ recipeId: "t", title: "Tacos", recipe: recipe(["1", "lb", "ground beef"], ["1", "lb", "shrimp"]), scale: 1, at: wed }];
    markNotFrozen(thawReminders(meal, now)[0].item.key);
    expect(thawReminders(meal, now).map((r) => r.item.name)).toEqual(["shrimp"]);
    markThawed(thawReminders(meal, now)[0].id);
    expect(thawReminders(meal, now)).toEqual([]);
  });
});

describe("thaw calendar", () => {
  it("has one alert per reminder", async () => {
    const { thawIcs } = await import("./thaw");
    const r = { id: "t|2026-11-11|ground beef", recipeId: "t", title: "Tacos", item: { key: "ground beef", name: "ground beef", days: 1 }, moveBy: new Date(2026, 10, 10, 19).getTime(), mealAt: new Date(2026, 10, 11, 18).getTime() };
    const ics = thawIcs([r, { ...r, id: "x" }], () => "https://x");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Thaw: move ground beef to the fridge");
  });
});
