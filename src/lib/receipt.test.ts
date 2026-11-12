import { describe, expect, it } from "vitest";
import { keepByDefault } from "./receipt";

describe("what a receipt saves without asking", () => {
  it("shopping-list items and all other food, candy included", () => {
    expect(keepByDefault({ is_food: true }, true)).toBe(true);
    expect(keepByDefault({ is_food: true }, false)).toBe(true);
  });
  it("not household items", () => {
    expect(keepByDefault({ is_food: false }, false)).toBe(false);
  });
});
