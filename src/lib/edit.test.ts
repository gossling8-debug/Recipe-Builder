import { describe, expect, it } from "vitest";
import { fieldsToIngredient, ingredientToFields, matchIngredient, stepToText, textToStep, updatedMentionAmount, updateStepsForAmount } from "./edit";
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

describe("changing an amount in the ingredient list updates the steps", () => {
  it("the whole amount follows the new amount", () => {
    expect(updatedMentionAmount("2 cups", "2 cups", "3 cups")).toBe("3 cups");
    expect(updatedMentionAmount("1 lb", "1 lb", "500 g")).toBe("500 g");
  });
  it("a mention of the total is rewritten in place", () => {
    expect(updatedMentionAmount("half of the 1 cup", "1 cup", "2 cups")).toBe("half of the 2 cups");
    expect(updatedMentionAmount("part of 1 cup", "1 cup", "1 1/2 cups")).toBe("part of 1 1/2 cups");
  });
  it("a portion in the same unit is scaled to match", () => {
    expect(updatedMentionAmount("1/2 cup", "1 cup", "2 cups")).toBe("1 cup");
    expect(updatedMentionAmount("1 tbsp", "2 tbsp", "4 tbsp")).toBe("2 tbsp");
  });
  it("leaves alone what it can't safely change", () => {
    expect(updatedMentionAmount("remaining", "1 cup", "2 cups")).toBe("remaining");
    expect(updatedMentionAmount("1/2 cup", "1 cup", "200 g")).toBe("1/2 cup"); // unit changed: can't tell
    // "1 cup" inside "11 cups" isn't a mention of it (no "121 cups"); it's scaled like any portion instead.
    expect(updatedMentionAmount("11 cups", "1 cup", "2 cups")).toBe("22 cups");
  });
  it("only the changed ingredient's tags are touched", () => {
    const ings = [ing("flour", "3", "cups"), ing("sugar", "1", "cup")];
    const steps = ["Mix [the flour: 2 cups] and [the sugar: 1 cup].", "Add [the remaining flour: remaining]."];
    expect(updateStepsForAmount(steps, ings, 0, "2 cups", "3 cups")).toEqual(["Mix [the flour: 3 cups] and [the sugar: 1 cup].", "Add [the remaining flour: remaining]."]);
  });
});
