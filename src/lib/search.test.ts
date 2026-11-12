import { describe, expect, it } from "vitest";
import { searchRecipe } from "./search";

const ing = (quantity: string, unit: string, name: string, preparation: string | null = null) => ({ quantity, unit, name, preparation });
const bread = { title: "Grandma's Glorious Banana Bread", tags: ["Baking"], ingredients: [ing("3", "", "ripe bananas"), ing("2", "cups", "flour"), ing("1", "tsp", "baking soda")] };
const pasta = { title: "Garlic Shrimp Pasta", tags: ["Dinner"], ingredients: [ing("4", "cloves", "garlic", "minced"), ing("1", "lb", "shrimp"), ing("8", "oz", "spaghetti")] };
const oats = { title: "Breakfast Cookies", tags: [], ingredients: [ing("2", "cups", "rolled oats"), ing("1", "cup", "oatmeal"), ing("2", "", "bananas", "mashed")] };

describe("recipe search", () => {
  it("finds a recipe by any part of its name, in any order", () => {
    for (const q of ["bread", "banana", "bananas", "glorious bread", "bread grandma", "grandmas", "ban"]) expect(searchRecipe(bread, q, "name").match, q).toBe(true);
    expect(searchRecipe(bread, "muffins", "name").match).toBe(false);
  });
  it("by ingredient: every recipe that has it, with the matching line", () => {
    expect(searchRecipe(pasta, "garlic", "ingredient")).toEqual({ match: true, ingredientHits: ["4 cloves garlic, minced"] });
    expect(searchRecipe(bread, "bananas", "ingredient").match).toBe(true);
    expect(searchRecipe(oats, "banana", "ingredient").ingredientHits).toEqual(["2 bananas, mashed"]);
    expect(searchRecipe(oats, "oatmeal", "ingredient").match).toBe(true);
    expect(searchRecipe(oats, "oatmeal", "ingredient").ingredientHits).toContain("2 cups rolled oats");
    expect(searchRecipe({ title: "Salsa", ingredients: [ing("1", "bunch", "fresh coriander")] }, "cilantro", "ingredient").match).toBe(true);
    expect(searchRecipe({ title: "Stir fry", ingredients: [ing("2", "", "green onions")] }, "scallions", "ingredient").match).toBe(true);
    expect(searchRecipe(pasta, "bananas", "ingredient").match).toBe(false);
  });
  it("several ingredients: needs all of them", () => {
    expect(searchRecipe(pasta, "garlic shrimp", "ingredient").match).toBe(true);
    expect(searchRecipe(pasta, "garlic bananas", "ingredient").match).toBe(false);
  });
  it("name search doesn't look at ingredients, and vice versa", () => {
    expect(searchRecipe(oats, "banana", "name").match).toBe(false);
    expect(searchRecipe(pasta, "pasta", "ingredient").match).toBe(false);
  });
  it("'all' looks at both, plus labels", () => {
    expect(searchRecipe(oats, "banana", "all").match).toBe(true);
    expect(searchRecipe(pasta, "dinner", "all").match).toBe(true);
    expect(searchRecipe(pasta, "", "all").match).toBe(true);
  });
});
