import { describe, expect, it } from "vitest";
import { bigMealIcs, ovenClashes, ovenUse, timeline } from "./bigMeal";
import type { SavedRecipe } from "./schema";

const seg = (text: string) => ({ text, ingredient_index: null, amount: null });
const mk = (id: string, time: string | null, steps: string[], cookLog?: SavedRecipe["cookLog"]): SavedRecipe => ({
  id, title: id, servings: null, time, ingredients: [], steps: steps.map((t) => ({ segments: [seg(t)] })), notes: null, tags: [], warnings: [], createdAt: 0, photos: [], cookLog,
});
const eat = new Date(2026, 10, 26, 17, 0).getTime();

describe("big meal", () => {
  const turkey = mk("Turkey", null, ["Preheat oven to 325°F.", "Roast 3 hours, until 165°F."], [{ at: 1, minutes: 230, scale: 1 }]);
  const rolls = mk("Rolls", "Prep: 10 mins; Bake: 15 mins", ["Bake at 400°F for 12-15 minutes."]);
  const salad = mk("Salad", "Total: 15 mins", ["Toss."]);

  it("finds the oven temperature and time", () => {
    expect(ovenUse(turkey)).toEqual({ tempF: 325, minutes: 180 });
    expect(ovenUse(rolls)).toEqual({ tempF: 400, minutes: 15 });
    expect(ovenUse(salad)).toBeNull();
    expect(ovenUse(mk("D", null, ["Cook to 165°F, then bake at 350°F for 10 minutes."]))).toEqual({ tempF: 350, minutes: 10 });
    expect(ovenUse(mk("C", null, ["Bake at 180°C for 20 minutes."]))).toEqual({ tempF: 356, minutes: 20 });
  });
  it("orders dishes by start time so all are ready together", () => {
    const t = timeline([salad, rolls, turkey], eat);
    expect(t.map((d) => d.recipe.title)).toEqual(["Turkey", "Rolls", "Salad"]);
    expect(t[0].startAt).toBe(eat - 230 * 60000); // your own time from last year
    expect(t.every((d) => d.startAt + d.minutes * 60000 === eat)).toBe(true);
  });
  it("warns when two dishes need the oven at different temperatures at once", () => {
    const c = ovenClashes(timeline([turkey, rolls, salad], eat), eat);
    expect(c).toHaveLength(1);
    expect(c[0].from).toBe(eat - 15 * 60000);
    const pie = mk("Pie", null, ["Bake at 335°F for 50 minutes."]);
    expect(ovenClashes(timeline([turkey, pie], eat), eat)).toHaveLength(0); // within 25°F
  });
  it("makes one calendar file with an event per dish", () => {
    const plans = timeline([turkey, rolls], eat).map((d) => ({ recipeId: d.recipe.id, title: d.recipe.title, eatAt: eat, startAt: d.startAt, minutes: d.minutes }));
    const ics = bigMealIcs(plans, () => "https://x");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });
});
