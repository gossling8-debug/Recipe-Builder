import { describe, expect, it } from "vitest";
import { combineAmounts, stepTotals, stepTotalsText } from "./stepAmounts";

const ing = (name: string, quantity = "", unit = "") => ({ quantity, unit, name, preparation: null, section: null });
const seg = (text: string, ingredient_index: number | null = null, amount: string | null = null) => ({ text, ingredient_index, amount });
const text = (r: Parameters<typeof stepTotals>[0], i: number, scale = 1) => stepTotalsText(stepTotals(r, i, scale));

// The magazine page, read with salt and pepper split (new readings).
const recipe = {
  ingredients: [ing("kosher salt"), ing("black pepper"), ing("olive oil"), ing("ground sirloin", "½", "lb")],
  steps: [
    { segments: [seg("Bring a large pot of water with "), seg("salt", 0, "2 Tbsp"), seg(" to a boil.")] },
    { segments: [seg("Heat "), seg("olive oil", 2, "1½ Tbsp"), seg(". Add "), seg("the ground beef", 3, "½ lb")] },
    { segments: [seg("Stir in "), seg("salt", 0, "1 tsp"), seg(" and "), seg("black pepper", 1, "1 tsp")] },
    { segments: [seg("Serve sprinkled with "), seg("salt", 0, "to taste")] },
  ],
};

describe("amounts from the steps, for list lines without one", () => {
  it("shows what the steps use, different units side by side", () => {
    expect(text(recipe, 0)).toBe("2 Tbsp + 1 tsp"); // "to taste" isn't an amount
    expect(text(recipe, 1)).toBe("1 tsp");
    expect(text(recipe, 2)).toBe("1½ Tbsp");
  });

  it("adds up amounts in the same unit, however it's spelled", () => {
    expect(combineAmounts(["1 tsp", "1 tsp"])).toBe("2 tsp");
    expect(combineAmounts(["1 Tbsp", "1/2 tablespoon", "1 tsp"])).toBe("1½ Tbsp + 1 tsp");
    expect(combineAmounts(["a pinch", "1 tsp"])).toBe("a pinch + 1 tsp");
  });

  it("counts every addition: two steps (or one step) using 1 tsp each need 2 tsp", () => {
    const twice = { ...recipe, steps: [{ segments: [seg("Add "), seg("salt", 0, "1 tsp"), seg(" to the onions, then "), seg("salt", 0, "1 tsp"), seg(" to finish")] }] };
    expect(text(twice, 0)).toBe("2 tsp");
  });

  it("scales with the servings", () => {
    expect(text(recipe, 0, 2)).toBe("4 Tbsp + 2 tsp");
    expect(text(recipe, 2, 2)).toBe("3 Tbsp");
  });

  it("an old combined line (salt and pepper) is shown per thing, never added together", () => {
    const old = {
      ingredients: [ing("Kosher salt and freshly ground black pepper"), ing("olive oil")],
      steps: [
        { segments: [seg("Water with "), seg("salt", 0, "2 Tbsp")] },
        { segments: [seg("Stir in "), seg("salt", 0, "1 tsp"), seg(" and "), seg("black pepper", 0, "1 tsp")] },
      ],
    };
    expect(text(old, 0)).toBe("salt 2 Tbsp + 1 tsp, black pepper 1 tsp");
  });

  it("leaves list lines that have their own amount alone, and handles a missing ingredient", () => {
    expect(stepTotals(recipe, 3)).toEqual([]);
    expect(stepTotals(recipe, 9)).toEqual([]);
  });
});
