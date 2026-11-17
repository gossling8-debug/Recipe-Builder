import { describe, expect, it } from "vitest";
import { allLabels, hasLabel } from "./ListControls";

describe("label filters for cookbooks and The Mix", () => {
  it("lists each label once, whatever the capitals, A–Z", () => {
    expect(allLabels([["Dinner", "Instant Pot"], ["dinner", " Dessert "], undefined, ["", "Baking"]])).toEqual(["Baking", "Dessert", "Dinner", "Instant Pot"]);
  });
  it("matches a label ignoring capitals; All matches everything", () => {
    expect(hasLabel(["dinner"], "Dinner")).toBe(true);
    expect(hasLabel(["Dessert"], "Dinner")).toBe(false);
    expect(hasLabel(undefined, "Dinner")).toBe(false);
    expect(hasLabel(undefined, "all")).toBe(true);
  });
});
