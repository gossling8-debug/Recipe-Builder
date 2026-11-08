import { describe, expect, it } from "vitest";
import { loadPantry, savePantry, statusFor } from "./pantry";
import { formatQty, parseQty } from "./qty";
import { nameKey } from "./shopping";

describe("pantry", () => {
  it("moves old keys to the new matching and merges duplicates", () => {
    savePantry({
      "allpurpose flour": { key: "all-purpose flour", name: "all-purpose flour", qty: parseQty("2 cups"), updatedAt: Date.now() },
      flour: { key: "flour", name: "flour", qty: parseQty("1 cup"), updatedAt: Date.now() },
    });
    const p = loadPantry();
    expect(Object.keys(p)).toEqual(["flour"]);
    expect(formatQty(p.flour.qty!)).toBe("3 cups");
  });
  it("a recipe's 'large eggs' finds the pantry's 'eggs'", () => {
    savePantry({ egg: { key: "egg", name: "eggs", qty: parseQty("12", "eggs"), updatedAt: Date.now() } });
    expect(statusFor(nameKey("large eggs"), "large eggs", parseQty("3", "large eggs")).kind).toBe("enough");
  });
});

import { recordPurchase, useSoon } from "./pantry";
describe("use-by dates", () => {
  it("perishables get an estimated date; staples don't", () => {
    savePantry({});
    recordPurchase("chicken breasts", "2 lbs");
    recordPurchase("sugar", "4 lb");
    const p = loadPantry();
    expect(p["chicken breast"].useBy).toBeGreaterThan(Date.now());
    expect(p["chicken breast"].useByEstimated).toBe(true);
    expect(p.sugar.useBy).toBeUndefined();
  });
  it("buying more keeps the earlier date", () => {
    const first = loadPantry()["chicken breast"].useBy!;
    recordPurchase("chicken breasts", "1 lb");
    expect(loadPantry()["chicken breast"].useBy).toBe(first);
  });
  it("lists what to use soon, with recipes that use it", () => {
    const r = useSoon([{ id: "a", title: "Crack Chicken", ingredients: [{ name: "boneless chicken breasts" }] }, { id: "b", title: "Cookies", ingredients: [{ name: "sugar" }] }]);
    expect(r.map((x) => [x.item.name, x.recipes.map((y) => y.title)])).toEqual([["chicken breasts", ["Crack Chicken"]]]);
  });
});

describe("existing items get dates automatically", () => {
  it("fills in an estimate from when it was bought, but respects 'No date'", () => {
    const bought = Date.now() - 86_400_000; // yesterday
    savePantry({
      milk: { key: "milk", name: "milk", qty: null, boughtAt: bought, updatedAt: bought },
      "cream cheese": { key: "cream cheese", name: "cream cheese", qty: null, updatedAt: bought, noUseBy: true },
      sugar: { key: "sugar", name: "sugar", qty: null, updatedAt: bought },
    });
    const p = loadPantry();
    expect(new Date(p.milk.useBy!).toDateString()).toBe(new Date(bought + 7 * 86_400_000).toDateString()); // 7 days after buying
    expect(p.milk.useByEstimated).toBe(true);
    expect(p["cream cheese"].useBy).toBeUndefined();
    expect(p.sugar.useBy).toBeUndefined();
  });
});
