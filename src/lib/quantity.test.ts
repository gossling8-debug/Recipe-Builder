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
