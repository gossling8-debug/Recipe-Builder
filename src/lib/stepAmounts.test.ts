import { describe, expect, it } from "vitest";
import { amountsFromSteps } from "./stepAmounts";

const ing = (name: string, quantity = "", unit = "") => ({ quantity, unit, name, preparation: null, section: null });
const seg = (text: string, ingredient_index: number | null = null, amount: string | null = null) => ({ text, ingredient_index, amount });

// The magazine page: salt, pepper and olive oil listed with no amounts; the steps give them.
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
  it("collects each ingredient's amounts in order", () => {
    expect(amountsFromSteps(recipe, 0)).toEqual(["2 Tbsp", "1 tsp"]); // "to taste" isn't an amount
    expect(amountsFromSteps(recipe, 1)).toEqual(["1 tsp"]);
    expect(amountsFromSteps(recipe, 2)).toEqual(["1½ Tbsp"]);
  });

  it("leaves list lines that have their own amount alone", () => {
    expect(amountsFromSteps(recipe, 3)).toEqual([]);
  });

  it("counts the same amount used in two steps twice, but once when one step names it twice", () => {
    const twoSteps = { ...recipe, steps: [...recipe.steps, { segments: [seg("more salt", 0, "1 tsp")] }] };
    expect(amountsFromSteps(twoSteps, 0)).toEqual(["2 Tbsp", "1 tsp", "1 tsp"]);
    const oneStep = { ...recipe, steps: [{ segments: [seg("Add "), seg("the oil", 2, "1 Tbsp"), seg(", swirling the "), seg("oil", 2, "1 Tbsp")] }] };
    expect(amountsFromSteps(oneStep, 2)).toEqual(["1 Tbsp"]);
    expect(amountsFromSteps(recipe, 9)).toEqual([]);
  });
});
