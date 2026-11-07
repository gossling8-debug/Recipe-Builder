import { describe, expect, it } from "vitest";
import { formatIngredient, sanitizeRecipe, unusedIngredients, type ScannedRecipe } from "./schema";

const base: ScannedRecipe = {
  title: " Sugar Cookies ",
  servings: null,
  time: null,
  ingredients: [
    { quantity: "2", unit: "cups", name: "flour", preparation: null, section: null },
    { quantity: "1", unit: "cup", name: "sugar", preparation: "divided", section: null },
    { quantity: "", unit: "", name: "sprinkles", preparation: null, section: null },
  ],
  steps: [
    {
      segments: [
        { text: "Whisk ", ingredient_index: null, amount: null },
        { text: "the flour", ingredient_index: 0, amount: " 2 cups " },
        { text: " with ", ingredient_index: null, amount: null },
        { text: "half the sugar", ingredient_index: 1, amount: "1/2 cup" },
        { text: " and ", ingredient_index: null, amount: "oops" },
        { text: "butter", ingredient_index: 7, amount: "1 stick" },
      ],
    },
    { segments: [{ text: "   ", ingredient_index: null, amount: null }] },
  ],
  notes: null,
  tags: [" dinner", "Dinner", "slow cooker"],
  warnings: [],
};

describe("sanitizeRecipe", () => {
  const r = sanitizeRecipe(base);
  it("trims the title", () => expect(r.title).toBe("Sugar Cookies"));
  it("drops empty steps", () => expect(r.steps).toHaveLength(1));
  it("trims amounts on valid ingredient segments", () => expect(r.steps[0].segments[1].amount).toBe("2 cups"));
  it("drops stray amounts on plain text", () => expect(r.steps[0].segments[4].amount).toBeNull());
  it("keeps the text but drops an out-of-range ingredient reference", () => {
    expect(r.steps[0].segments[5]).toEqual({ text: "butter", ingredient_index: null, amount: null });
  });
  it("falls back to a default title", () => expect(sanitizeRecipe({ ...base, title: " " }).title).toBe("Untitled recipe"));
});

describe("formatIngredient", () => {
  it("joins the parts", () => expect(formatIngredient(base.ingredients[1])).toBe("1 cup sugar, divided"));
  it("handles missing quantity", () => expect(formatIngredient(base.ingredients[2])).toBe("sprinkles"));
});

describe("unusedIngredients", () => {
  it("lists ingredients no step mentions", () => expect(unusedIngredients(sanitizeRecipe(base))).toEqual([2]));
});

describe("tags", () => {
  it("are cleaned and de-duplicated", () => expect(sanitizeRecipe(base).tags).toEqual(["Dinner", "Slow Cooker"]));
});
