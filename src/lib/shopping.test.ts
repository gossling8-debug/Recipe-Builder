import { describe, expect, it } from "vitest";
import { combine, isTapWater, nameKey } from "./shopping";
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
import { normalizeStore, storeSearchUrl } from "./stores";
const hebSearchUrl = (n: string) => storeSearchUrl("hebWeb", n);
describe("hebSearchUrl", () => {
  it("searches H-E-B for the cleaned-up name", () => {
    expect(hebSearchUrl("green onions (for topping)")).toBe("https://www.heb.com/search?q=green%20onions");
    expect(storeSearchUrl("hebWeb", "cream cheese")).toBe("https://www.heb.com/search?q=cream%20cheese");
    expect(storeSearchUrl("heb", "cream cheese")).toBe("https://www.heb.com/"); // the app: home page, name copied
    expect(storeSearchUrl("target", "green onions (for topping)")).toBe("https://www.target.com/s?searchTerm=green%20onions");
  });
  it("tidies store names from receipts", () => {
    expect(normalizeStore("WAL-MART SUPERCENTER #1234")).toBe("Walmart");
    expect(normalizeStore("H-E-B plus!")).toBe("H-E-B");
    expect(normalizeStore("HEB")).toBe("H-E-B");
    expect(normalizeStore("Joe's Market #12")).toBe("Joe's Market");
    expect(normalizeStore("")).toBeNull();
    expect(storeSearchUrl("walmart", "cream cheese")).toBe("https://www.walmart.com/search?q=cream%20cheese");
  });
});
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

describe("crossed-off ingredients", () => {
  it("are left off the shopping list", () => {
    const r = {
      id: "x", title: "Chili", createdAt: 0, photos: [], servings: null, time: null, notes: null, tags: [], warnings: [], steps: [],
      ingredients: [
        { quantity: "1", unit: "lb", name: "ground beef", preparation: null, section: null },
        { quantity: "1", unit: "can", name: "beans", preparation: null, section: null },
        { quantity: "1", unit: "tsp", name: "cumin", preparation: null, section: null },
      ],
    };
    expect(combine([{ recipe: r, scale: 1, skip: [1, 2] }]).map((i) => i.name)).toEqual(["ground beef"]);
    expect(combine([{ recipe: r, scale: 1 }]).length).toBe(3);
  });
});

describe("water from the tap", () => {
  it("is never a grocery", () => {
    for (const n of ["water", "warm water", "Cold Water", "boiling water", "ice water", "ice", "ice cubes", "lukewarm water, divided", "water (110°F)", "room temperature water", "filtered water"])
      expect(isTapWater(n), n).toBe(true);
  });
  it("but bottled kinds you buy still are", () => {
    for (const n of ["coconut water", "sparkling water", "tonic water", "rose water", "club soda", "watermelon", "water chestnuts", "ice cream"])
      expect(isTapWater(n), n).toBe(false);
  });
  it("stays off the shopping list", () => {
    const r = {
      id: "b", title: "Bread", createdAt: 0, photos: [], servings: null, time: null, notes: null, tags: [], warnings: [], steps: [],
      ingredients: [
        { quantity: "3", unit: "cups", name: "flour", preparation: null, section: null },
        { quantity: "1", unit: "cup", name: "warm water", preparation: null, section: null },
      ],
    };
    expect(combine([{ recipe: r, scale: 1 }]).map((i) => i.name)).toEqual(["flour"]);
  });
});
