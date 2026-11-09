import { describe, expect, it } from "vitest";
import { combine, nameKey } from "./shopping";
import type { Ingredient, SavedRecipe } from "./schema";

const ing = (quantity: string, unit: string, name: string, preparation: string | null = null): Ingredient => ({
  quantity, unit, name, preparation, section: null,
});
const recipe = (title: string, ingredients: Ingredient[]): SavedRecipe => ({
  id: title, createdAt: 0, photos: [], title, servings: null, time: null, notes: null, tags: [], warnings: [], steps: [], ingredients,
});

const cookies = recipe("Cookies", [ing("1", "cup", "sugar"), ing("2", "", "eggs"), ing("1", "tsp", "vanilla"), ing("", "", "salt")]);
const cake = recipe("Cake", [ing("2", "cups", "Sugar"), ing("3", "", "egg"), ing("1", "tablespoon", "vanilla"), ing("2", "lbs (910 g)", "chicken")]);

describe("combine", () => {
  const items = combine([{ recipe: cookies, scale: 1 }, { recipe: cake, scale: 1 }]);
  const find = (n: string) => items.find((i) => i.key === nameKey(n))!;
  it("adds the same unit", () => expect(find("sugar").amount).toBe("3 cups"));
  it("adds counts and merges egg/eggs", () => expect(find("eggs").amount).toBe("5"));
  it("lists different units side by side", () => expect(find("vanilla").amount).toBe("1 tsp + 1 tablespoon"));
  it("keeps items with no amount", () => expect(find("salt").amount).toBe(""));
  it("drops metric conversions when summing", () => expect(find("chicken").amount).toBe("2 lbs"));
  it("remembers which recipes need it", () => expect(find("sugar").recipes).toEqual(["Cookies", "Cake"]));
  it("applies each recipe's size", () => {
    const doubled = combine([{ recipe: cookies, scale: 2 }, { recipe: cake, scale: 1 }]);
    expect(doubled.find((i) => i.key === "sugar")!.amount).toBe("4 cups");
  });
});

import { walmartSearchUrl } from "./shopping";
describe("walmartSearchUrl", () => {
  it("searches just the ingredient name", () =>
    expect(walmartSearchUrl("cream cheese")).toBe("https://www.walmart.com/search?q=cream%20cheese"));
  it("drops notes and parentheses", () =>
    expect(walmartSearchUrl("green onions (for topping)")).toBe("https://www.walmart.com/search?q=green%20onions"));
  it("keeps substitutes intact", () =>
    expect(walmartSearchUrl("dairy-free cream cheese")).toBe("https://www.walmart.com/search?q=dairy-free%20cream%20cheese"));
});

describe("ingredient names split at a comma", () => {
  it("joins the note back on when the name only describes", async () => {
    const { ingredientName, nameKey } = await import("./shopping");
    expect(ingredientName({ name: "boneless", preparation: "skinless chicken breasts" })).toBe("boneless skinless chicken breasts");
    expect(nameKey(ingredientName({ name: "boneless", preparation: "skinless chicken breasts" }))).toBe(nameKey("chicken breasts"));
    expect(ingredientName({ name: "butter", preparation: "softened" })).toBe("butter");
    expect(ingredientName({ name: "large", preparation: null })).toBe("large");
  });
});
