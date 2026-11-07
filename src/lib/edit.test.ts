import { describe, expect, it } from "vitest";
import { fieldsToIngredient, ingredientToFields, matchIngredient, stepToText, textToStep } from "./edit";
import type { Ingredient } from "./schema";

const ing = (name: string, quantity = "1", unit = "cup", preparation: string | null = null): Ingredient => ({
  quantity, unit, name, preparation, section: null,
});
const list = [ing("all-purpose flour", "2"), ing("sugar", "1 1/2"), ing("cream cheese", "2", "blocks"), ing("eggs", "2", "")];

describe("step text round trip", () => {
  it("writes and reads brackets", () => {
    const step = {
      segments: [
        { text: "Mix ", ingredient_index: null, amount: null },
        { text: "the flour", ingredient_index: 0, amount: "2 cups" },
        { text: " and ", ingredient_index: null, amount: null },
        { text: "eggs", ingredient_index: 3, amount: null },
        { text: ".", ingredient_index: null, amount: null },
      ],
    };
    const text = stepToText(step);
    expect(text).toBe("Mix [the flour: 2 cups] and [eggs].");
    expect(textToStep(text, list)).toEqual(step);
  });

  it("keeps unmatched mentions as text", () => {
    expect(textToStep("Add [butter: 1 stick].", list).segments).toEqual([
      { text: "Add ", ingredient_index: null, amount: null },
      { text: "butter (1 stick)", ingredient_index: null, amount: null },
      { text: ".", ingredient_index: null, amount: null },
    ]);
  });
});

describe("matchIngredient", () => {
  it("matches partial names", () => expect(matchIngredient("the flour", list)).toBe(0));
  it("matches 'rest of the sugar'", () => expect(matchIngredient("the rest of the sugar", list)).toBe(1));
  it("matches singular/plural", () => expect(matchIngredient("egg", list)).toBe(3));
  it("returns null when nothing matches", () => expect(matchIngredient("butter", list)).toBeNull());
});

describe("ingredient fields", () => {
  it("round trips", () => {
    const i = ing("butter", "1", "cup", "softened");
    expect(ingredientToFields(i)).toEqual({ amount: "1 cup", name: "butter, softened" });
    expect(fieldsToIngredient("1 cup", "butter, softened", null)).toEqual(i);
  });
  it("handles no amount", () =>
    expect(fieldsToIngredient("", "salt", null)).toEqual({ quantity: "", unit: "", name: "salt", preparation: null, section: null }));
});
