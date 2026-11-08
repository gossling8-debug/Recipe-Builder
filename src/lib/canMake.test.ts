import { describe, expect, it } from "vitest";
import { whatCanIMake } from "./canMake";
import { savePantry } from "./pantry";
import { parseQty } from "./qty";
import type { Ingredient, SavedRecipe } from "./schema";

const ing = (quantity: string, unit: string, name: string): Ingredient => ({ quantity, unit, name, preparation: null, section: null });
const recipe = (id: string, ingredients: Ingredient[]): SavedRecipe => ({
  id, title: id, createdAt: 0, photos: [], servings: null, time: null, notes: null, tags: [], warnings: [], steps: [], ingredients,
});

describe("whatCanIMake", () => {
  savePantry({
    sugar: { key: "sugar", name: "sugar", qty: parseQty("4 lb"), updatedAt: Date.now() },
    egg: { key: "egg", name: "eggs", qty: parseQty("10", "eggs"), updatedAt: Date.now() },
    butter: { key: "butter", name: "butter", qty: parseQty("½ cup"), updatedAt: Date.now() },
    vanilla: { key: "vanilla", name: "vanilla", qty: null, updatedAt: Date.now() },
  });
  const ready = recipe("Meringues", [ing("4", "", "egg whites"), ing("1", "cup", "granulated sugar"), ing("", "", "salt")]);
  const almost = recipe("Cookies", [ing("1", "cup", "sugar"), ing("1", "cup", "butter"), ing("2", "cups", "all-purpose flour"), ing("1", "tsp", "vanilla")]);
  const far = recipe("Lasagna", [ing("1", "lb", "ground beef"), ing("1", "box", "lasagna noodles"), ing("2", "cups", "ricotta")]);
  const r = whatCanIMake([far, almost, ready]);

  it("ranks by fewest things to buy and leaves out ones that need too much", () => {
    expect(r.map((x) => x.recipe.title)).toEqual(["Meringues", "Cookies"]);
    expect(r[0].missing).toEqual([]);
  });
  it("Cookies: needs flour, more butter, and vanilla amount can't be checked", () => {
    const c = r.find((x) => x.recipe.title === "Cookies")!;
    expect(c.missing).toEqual(["all-purpose flour"]);
    expect(c.short).toEqual(["butter (≈ ½ cup more)"]);
    expect(c.check).toEqual(["vanilla"]);
  });
  it("Lasagna isn't suggested", () => expect(r.some((x) => x.recipe.title === "Lasagna")).toBe(false));
});

describe("past-date items", () => {
  it("don't count as on hand, and are listed as expired", () => {
    savePantry({
      sugar: { key: "sugar", name: "sugar", qty: parseQty("4 lb"), updatedAt: Date.now() },
      egg: { key: "egg", name: "eggs", qty: parseQty("10", "eggs"), updatedAt: 1, useBy: Date.now() - 3 * 86_400_000 },
    });
    const [m] = whatCanIMake([recipe("Meringues", [ing("4", "", "egg whites"), ing("1", "cup", "sugar")])]);
    expect(m.expired).toEqual(["egg whites"]);
    expect(m.have).toBe(1);
  });
});
