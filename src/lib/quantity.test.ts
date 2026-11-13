import { describe, expect, it } from "vitest";
import { formatNumber, parseNumber, scaleAmount, splitAmount } from "./quantity";

describe("parseNumber", () => {
  it.each([
    ["2", 2], ["0.5", 0.5], ["1/2", 0.5], ["1 1/2", 1.5], ["½", 0.5], ["1½", 1.5], ["1 ¼", 1.25],
  ])("%s", (s, v) => expect(parseNumber(s)).toBeCloseTo(v));
});

describe("formatNumber", () => {
  it.each([
    [1.5, "1½"], [0.5, "½"], [0.75, "¾"], [2, "2"], [1 / 3, "⅓"], [0.66, "⅔"], [0.99, "1"], [1365, "1365"], [0.01, "⅛"],
  ])("%s → %s", (v, s) => expect(formatNumber(v)).toBe(s));
  it("keeps decimal style", () => expect(formatNumber(1.25, true)).toBe("1.25"));
});

describe("scaleAmount", () => {
  it("is a no-op at 1×", () => expect(scaleAmount("1 1/2 cups", 1)).toBe("1 1/2 cups"));
  it("doubles a mixed number", () => expect(scaleAmount("1 1/2 cups", 2)).toBe("3 cups"));
  it("halves unicode fractions", () => expect(scaleAmount("1½ teaspoons", 0.5)).toBe("¾ teaspoon"));
  it("scales a metric conversion after the unit", () => expect(scaleAmount("2 lbs (910 g)", 2)).toBe("4 lbs (1820 g)"));
  it("scales ml conversion", () => expect(scaleAmount("½ cup (120 ml)", 3)).toBe("1½ cups (360 ml)"));
  it("keeps package size", () => expect(scaleAmount("2 (8 oz/227 g) blocks", 2)).toBe("4 (8 oz/227 g) blocks"));
  it("scales numbers after words", () => expect(scaleAmount("remaining 1/2 cup", 2)).toBe("remaining 1 cup"));
  it("scales the 'of the' total too", () =>
    expect(scaleAmount("1 cup (of the 1 1/2 cups)", 2)).toBe("2 cups (of the 3 cups)"));
  it("scales ranges", () => expect(scaleAmount("2-3 cloves", 2)).toBe("4-6 cloves"));
  it("singularizes", () => expect(scaleAmount("2 cups", 0.5)).toBe("1 cup"));
  it("pluralizes pinch", () => expect(scaleAmount("1 pinch", 2)).toBe("2 pinches"));
  it("leaves abbreviations", () => expect(scaleAmount("1 tsp", 2)).toBe("2 tsp"));
  it("doesn't scale step numbers", () =>
    expect(scaleAmount("all of the bacon cooked in step 1 (2 slices)", 1.5)).toBe("all of the bacon cooked in step 1 (3 slices)"));
  it("doesn't scale times or temperatures", () =>
    expect(scaleAmount("2 cups, simmered 15 minutes at 350°F", 2)).toBe("4 cups, simmered 15 minutes at 350°F"));
  it("doesn't scale pan sizes", () => expect(scaleAmount("1 9x13 pan", 2)).toBe("2 9x13 pan"));
  it("leaves text without numbers", () => expect(scaleAmount("to taste", 2)).toBe("to taste"));
});

describe("splitAmount", () => {
  it.each([
    ["2 cups", "2", "cups"], ["1 1/2 tsp", "1 1/2", "tsp"], ["½ cup (120 ml)", "½", "cup (120 ml)"],
    ["2-3", "2-3", ""], ["pinch", "", "pinch"], ["", "", ""],
  ])("%s", (s, q, u) => expect(splitAmount(s)).toEqual({ quantity: q, unit: u }));
});

describe("plurals with size words", () => {
  it("doubles packages with a size word in between", () => {
    expect(scaleAmount("1 large jar", 2)).toBe("2 large jars");
    expect(scaleAmount("1 large bag (12 oz)", 2)).toBe("2 large bags (12 oz each)");
    expect(scaleAmount("1 giant bar (8+ oz)", 2)).toBe("2 giant bars (8+ oz each)");
    expect(scaleAmount("or 2 small jars", 2)).toBe("or 4 small jars");
    expect(scaleAmount("1 medium head", 2)).toBe("2 medium heads");
    expect(scaleAmount("1 bunch", 3)).toBe("3 bunches");
    expect(scaleAmount("1 loaf", 2)).toBe("2 loaves");
  });
  it("halves back to singular", () => {
    expect(scaleAmount("2 large jars", 0.5)).toBe("1 large jar");
    expect(scaleAmount("1 large can (12 oz)", 0.5)).toBe("½ large can (12 oz)");
  });
});

import { ingredientText, scaleNote, stepAmount } from "./quantity";
describe("alternatives scale with the recipe", () => {
  const creme = { quantity: "1", unit: "large jar", name: "marshmallow creme", preparation: "or 2 small jars" };
  it("in the steps", () => {
    expect(stepAmount("1 large jar", creme, 1)).toBe("1 large jar (or 2 small jars)");
    expect(stepAmount("1 large jar", creme, 2)).toBe("2 large jars (or 4 small jars)");
    expect(stepAmount("half", creme, 2)).toBe("half");
  });
  it("in the ingredient list", () => {
    expect(ingredientText(creme, 2)).toBe("2 large jars marshmallow creme, or 4 small jars");
    expect(ingredientText({ quantity: "1", unit: "pound", name: "walnuts", preparation: "chopped, optional" }, 2)).toBe(
      "2 pounds walnuts, chopped, optional",
    );
  });
  it("notes that are amounts scale; others don't", () => {
    expect(scaleNote("plus 2 tbsp for topping", 2)).toBe("plus 4 tbsp for topping");
    expect(scaleNote("cut into 1-inch pieces", 2)).toBe("cut into 1-inch pieces");
  });
});
