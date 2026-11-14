import { describe, expect, it } from "vitest";
import { mergeLabels, removedLabels, sameLabels } from "./family";

describe("labels kept in step between your recipe and a cookbook", () => {
  it("adds what either side has", () => {
    expect(mergeLabels(["Dinner"], ["healthy", "Quick"], [])).toEqual(["Dinner", "Healthy", "Quick"]);
  });
  it("drops labels you just took off, even if the other side had them", () => {
    const before = ["Dinner", "Healthy"], after = ["Dinner"];
    expect(removedLabels(before, after)).toEqual(["Healthy"]);
    expect(mergeLabels(after, ["Healthy", "Soup"], removedLabels(before, after))).toEqual(["Dinner", "Soup"]);
  });
  it("ignores letter case", () => {
    expect(mergeLabels(["dinner"], ["Dinner"], [])).toEqual(["Dinner"]);
    expect(sameLabels(["Dinner", "Healthy"], ["healthy", "dinner"])).toBe(true);
    expect(sameLabels(["Dinner"], ["Dinner", "Soup"])).toBe(false);
  });
});
