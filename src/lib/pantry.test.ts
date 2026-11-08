import { describe, expect, it } from "vitest";
import { loadPantry, savePantry, statusFor } from "./pantry";
import { formatQty, parseQty } from "./qty";
import { nameKey } from "./shopping";

describe("pantry", () => {
  it("moves old keys to the new matching and merges duplicates", () => {
    savePantry({
      "allpurpose flour": { key: "all-purpose flour", name: "all-purpose flour", qty: parseQty("2 cups"), updatedAt: 1 },
      flour: { key: "flour", name: "flour", qty: parseQty("1 cup"), updatedAt: 2 },
    });
    const p = loadPantry();
    expect(Object.keys(p)).toEqual(["flour"]);
    expect(formatQty(p.flour.qty!)).toBe("3 cups");
  });
  it("a recipe's 'large eggs' finds the pantry's 'eggs'", () => {
    savePantry({ egg: { key: "egg", name: "eggs", qty: parseQty("12", "eggs"), updatedAt: 1 } });
    expect(statusFor(nameKey("large eggs"), "large eggs", parseQty("3", "large eggs")).kind).toBe("enough");
  });
});
