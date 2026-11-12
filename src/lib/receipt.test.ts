import { describe, expect, it } from "vitest";
import { keepByDefault } from "./receipt";

describe("what a receipt saves without asking", () => {
  it("shopping-list items, and other food", () => {
    expect(keepByDefault({ is_food: true, is_candy: false }, true)).toBe(true);
    expect(keepByDefault({ is_food: true, is_candy: false }, false)).toBe(true);
  });
  it("not candy, unless a recipe put it on the list", () => {
    expect(keepByDefault({ is_food: true, is_candy: true }, false)).toBe(false);
    expect(keepByDefault({ is_food: true, is_candy: true }, true)).toBe(true);
  });
  it("not household items", () => {
    expect(keepByDefault({ is_food: false, is_candy: false }, false)).toBe(false);
  });
});
