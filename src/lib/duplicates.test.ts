import { describe, expect, it } from "vitest";
import { duplicatePairs, duplicateReason, duplicatesOf, pairKey } from "./duplicates";

const ing = (name: string) => ({ name, preparation: null });
const r = (id: string, title: string, names: string[], extra: Record<string, unknown> = {}) => ({ id, title, createdAt: Number(id.replace(/\D/g, "")) || 0, ingredients: names.map(ing), ...extra });
const chili = ["ground beef", "kidney beans", "diced tomatoes", "onion", "chili powder", "cumin", "salt"];

describe("spotting duplicate recipes", () => {
  it("same title, mostly the same ingredients", () => {
    expect(duplicateReason(r("1", "Chili", chili), r("2", "The Chili Recipe!", chili.slice(0, 5)))).toBe("same title");
  });
  it("same ingredients under a similar title", () => {
    expect(duplicateReason(r("1", "Mom's Chili", chili), r("2", "Chili (Mom)", [...chili, "water"]))).toBe("same ingredients");
  });
  it("imported from the same web page", () => {
    expect(duplicateReason(r("1", "A", ["x"], { source: "https://www.site.com/chili?utm=1" }), r("2", "B", ["y"], { source: "http://site.com/chili/" }))).toBe("same web page");
  });
  it("names like \"Mom's Chili\" still match \"Chili\"", () => {
    expect(duplicateReason(r("1", "Mom's Chili", chili), r("2", "Chili", chili))).toBe("same ingredients");
  });
  it("not pancakes and waffles (similar ingredients, different dish)", () => {
    const batter = ["flour", "milk", "eggs", "sugar", "baking powder", "butter"];
    expect(duplicateReason(r("1", "Fluffy Pancakes", batter), r("2", "Belgian Waffles", batter))).toBeNull();
  });
  it("not different recipes that share a few ingredients", () => {
    expect(duplicateReason(r("1", "Chili", chili), r("2", "Tacos", ["ground beef", "onion", "tortillas", "cheddar", "lettuce"]))).toBeNull();
    expect(duplicateReason(r("1", "Chicken Soup", ["chicken", "carrot", "celery", "onion", "broth"]), r("2", "Chicken Pot Pie", ["chicken", "carrot", "celery", "onion", "broth", "pie crust"]))).toBeNull();
  });
  it("not your own versions of a recipe", () => {
    expect(duplicateReason(r("1", "Chili", chili), r("2", "Chili (my version)", chili, { variantOf: "1" }))).toBeNull();
  });
  it("lists pairs, skipping ones marked not duplicates", () => {
    const all = [r("1", "Chili", chili), r("2", "chili", chili), r("3", "Tacos", ["tortillas"])];
    expect(duplicatePairs(all).map((p) => [p.a.id, p.b.id])).toEqual([["1", "2"]]);
    expect(duplicatePairs(all, new Set([pairKey("2", "1")]))).toEqual([]);
    expect(duplicatesOf(all[0], all).map((d) => d.recipe.id)).toEqual(["2"]);
  });
});
