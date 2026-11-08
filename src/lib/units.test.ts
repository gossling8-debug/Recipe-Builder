import { describe, expect, it } from "vitest";
import { convertRecipe, convertText } from "./units";
import type { ScannedRecipe } from "./schema";

describe("to metric", () => {
  it.each([
    ["1 cup", "240 mL"],
    ["½ cup", "120 mL"],
    ["1/3 cup", "80 mL"],
    ["4 cups", "950 mL"],
    ["2 quarts", "1.9 L"],
    ["8 oz", "225 g"],
    ["1 lb", "450 g"],
    ["2 lbs", "910 g"],
    ["3 pounds", "1.35 kg"],
    ["2 tbsp", "2 tbsp"], // spoons stay
    ["1 tsp", "1 tsp"],
    ["1 (14 oz) can", "1 (400 g) can"],
    ["2 lbs (910 g)", "910 g"],
    ["2-3 lbs", "910 g–1.35 kg"],
    ["1-2 cups", "240–470 mL"],
    ["3 eggs", "3 eggs"],
  ])("%s → %s", (a, b) => expect(convertText(a, "metric")).toBe(b));

  it("converts oven temperatures and pan sizes in steps", () => {
    expect(convertText("Bake at 350°F in a 9x13-inch pan.", "metric")).toBe("Bake at 175°C in a 23×33 cm pan.");
    expect(convertText("Preheat oven to 425 degrees.", "metric")).toBe("Preheat oven to 220°C.");
    expect(convertText("Cut into 1-inch pieces", "metric")).toBe("Cut into 2.5 cm pieces");
    expect(convertText("an 8 inch skillet", "metric")).toBe("an 20 cm skillet");
  });
  it("leaves words that only look like units alone", () => {
    expect(convertText("2 large eggs", "us")).toBe("2 large eggs");
    expect(convertText("2 garlic cloves", "us")).toBe("2 garlic cloves");
    expect(convertText("Bake 25 minutes", "metric")).toBe("Bake 25 minutes");
  });
});

describe("to US", () => {
  it.each([
    ["250 mL", "1 cup"],
    ["125 ml", "½ cup"],
    ["15 ml", "1 tbsp"],
    ["5 ml", "1 tsp"],
    ["1 L", "4¼ cups"],
    ["100 g", "3.5 oz"],
    ["500 g", "1.1 lb"],
    ["1 kg", "2.2 lb"],
  ])("%s → %s", (a, b) => expect(convertText(a, "us")).toBe(b));

  it("turns staples by weight into cups (approximate)", () => {
    expect(convertText("250 g", "us", "all-purpose flour")).toBe("≈ 2 cups");
    expect(convertText("100 g", "us", "sugar")).toBe("≈ ½ cup");
  });
  it("converts temperatures and sizes", () => {
    expect(convertText("Bake at 180°C", "us")).toBe("Bake at 350°F");
    expect(convertText("200 °C", "us")).toBe("400°F");
    expect(convertText("a 23 cm tin", "us")).toBe("a 9 inch tin");
  });
});

describe("convertRecipe", () => {
  const r: ScannedRecipe = {
    title: "Cake",
    servings: null,
    time: "Bake 30 min at 350°F",
    ingredients: [{ quantity: "2", unit: "cups", name: "milk", preparation: null, section: null }],
    steps: [{ segments: [{ text: "Add ", ingredient_index: null, amount: null }, { text: "the milk", ingredient_index: 0, amount: "2 cups" }] }],
    notes: null,
    tags: [],
    warnings: [],
  };
  it("converts the list, the step amounts and the time line", () => {
    const m = convertRecipe(r, "metric");
    expect(m.ingredients[0]).toMatchObject({ quantity: "470", unit: "mL" });
    expect(m.steps[0].segments[1].amount).toBe("470 mL");
    expect(m.time).toBe("Bake 30 min at 175°C");
  });
  it("as written changes nothing", () => expect(convertRecipe(r, "original")).toBe(r));
});
