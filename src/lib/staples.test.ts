import { beforeEach, describe, expect, it } from "vitest";
import { addStaple, loadStaples, removeStaple, stapleStatus, staplesToBuy } from "./staples";
import { recordPurchase, savePantry, useForRecipe } from "./pantry";
import type { ScannedRecipe } from "./schema";

const recipe = (qty: string, unit: string, name: string): ScannedRecipe => ({
  title: "R", servings: null, time: null, notes: null, tags: [], warnings: [], steps: [],
  ingredients: [{ quantity: qty, unit, name, preparation: null, section: null }],
});

describe("always-keep staples", () => {
  beforeEach(() => {
    savePantry({});
    loadStaples().forEach((s) => removeStaple(s.key));
  });

  it("a staple that isn't in the pantry needs buying", () => {
    addStaple("Milk");
    expect(staplesToBuy().map((s) => [s.staple.name, s.status])).toEqual([["Milk", "out"]]);
  });
  it("is low at about a quarter of what was last bought", () => {
    addStaple("milk");
    recordPurchase("milk", "1 gallon");
    expect(staplesToBuy()).toHaveLength(0);
    useForRecipe(recipe("10", "cups", "milk"), 1); // 16 cups → 6 left (37%)
    expect(staplesToBuy()).toHaveLength(0);
    useForRecipe(recipe("2", "cups", "milk"), 1); // 4 left (25%)
    const [need] = staplesToBuy();
    expect(need.status).toBe("low");
    expect(need.buy).toEqual({ kind: "volume", tsp: 768 }); // buy a gallon again
  });
  it("used up counts as out", () => {
    addStaple("eggs");
    recordPurchase("eggs", "12 eggs");
    useForRecipe(recipe("12", "", "eggs"), 1);
    expect(staplesToBuy()[0].status).toBe("out");
  });
  it("an amount it can't judge isn't flagged", () => {
    expect(stapleStatus({ key: "salt", name: "salt", qty: null, updatedAt: 0 })).toBe("unknown");
  });
  it("doesn't add the same staple twice", () => {
    addStaple("Butter");
    addStaple("butter");
    expect(loadStaples()).toHaveLength(1);
  });
});
