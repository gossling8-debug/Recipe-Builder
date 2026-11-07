import { describe, expect, it } from "vitest";
import { conversionsFor, volume } from "./conversions";
import type { Ingredient } from "./schema";

const ing = (quantity: string, unit: string, name: string, preparation: string | null = null): Ingredient => ({
  quantity, unit, name, preparation, section: null,
});
const one = (i: Ingredient, scale = 1) => conversionsFor([i], scale)[0];

describe("volume", () => {
  it.each([
    [0.75, "¾ tsp"], [3, "1 tbsp"], [4.5, "1½ tbsp"], [12, "¼ cup"], [48, "1 cup"], [1.25, "1¼ tsp"],
  ])("%s tsp → %s", (t, s) => expect(volume(t)).toBe(s));
});

describe("garlic", () => {
  it("garlic powder → fresh cloves, jarred", () => {
    const c = one(ing("1½", "teaspoons", "garlic powder"));
    expect(c.lines).toContain("Fresh garlic: ≈ 6–12 cloves, minced (about 1 tsp per clove)");
    expect(c.lines).toContain("Jarred minced garlic: ≈ 1–2 tbsp");
    expect(c.lines.some((l) => l.startsWith("Garlic powder"))).toBe(false);
  });
  it("cloves → jarred and powder", () => {
    const c = one(ing("4", "cloves", "garlic", "minced"));
    expect(c.lines).toEqual(["Jarred minced garlic: ≈ 2 tsp", "Garlic powder: ≈ ½–1 tsp"]);
  });
  it("tsp minced garlic → cloves, jarred, powder", () => {
    const c = one(ing("2", "tsp", "minced garlic"));
    expect(c.lines).toEqual(["Jarred minced garlic: ≈ 1 tsp", "Fresh cloves: ≈ 2 cloves", "Garlic powder: ≈ ¼–½ tsp"]);
  });
  it("respects the recipe size", () => {
    expect(one(ing("4", "cloves", "garlic"), 2).lines[0]).toBe("Jarred minced garlic: ≈ 4 tsp");
  });
  it("ignores garlic salt", () => expect(conversionsFor([ing("1", "tsp", "garlic salt")])).toEqual([]));
});

describe("onion", () => {
  it("onion powder → fresh and dried", () => {
    const c = one(ing("1½", "teaspoons", "onion powder"));
    expect(c.lines).toEqual(["Fresh onion: ≈ ½ medium (≈ ½ cup chopped)", "Dried minced onion: ≈ 2 tbsp"]);
  });
  it("1 medium onion → dried and powder", () => {
    expect(one(ing("1", "medium", "onion", "chopped")).lines).toEqual(["Dried minced onion: ≈ ¼ cup", "Onion powder: ≈ 1 tbsp"]);
  });
  it("ignores green onions", () => expect(conversionsFor([ing("2", "", "green onions")])).toEqual([]));
});

describe("herbs", () => {
  it("dried → fresh", () => expect(one(ing("1", "teaspoon", "dried dill")).lines).toEqual(["Fresh dill: ≈ 1 tbsp, chopped"]));
  it("fresh → dried", () => expect(one(ing("3", "tablespoons", "fresh parsley", "chopped")).lines).toEqual(["Dried parsley: ≈ 1 tbsp"]));
  it("unclear → ratio", () => expect(one(ing("1", "tbsp", "chives")).lines).toEqual(["1 tsp dried chives ≈ 1 tbsp fresh chives"]));
  it("capital T is tablespoon", () => expect(one(ing("1", "T", "dried dill")).lines).toEqual(["Fresh dill: ≈ 3 tbsp, chopped"]));
  it("ignores dill pickles", () => expect(conversionsFor([ing("2", "", "dill pickles")])).toEqual([]));
});

describe("other", () => {
  it("ground ginger → fresh", () => expect(one(ing("½", "tsp", "ground ginger")).lines).toEqual(["Fresh or jarred ginger: ≈ 2 tbsp, grated"]));
  it("lemon juice → lemons", () => expect(one(ing("3", "tablespoons", "lemon juice")).lines[0]).toBe("Fresh: about 1–1½ lemons"));
  it("unsalted butter", () =>
    expect(one(ing("½", "cup", "unsalted butter")).lines).toEqual(["Using salted butter: reduce the recipe's added salt by about ¼ tsp"]));
  it("plain butter has no conversion", () => expect(conversionsFor([ing("1", "cup", "butter")])).toEqual([]));
  it("buttermilk DIY", () =>
    expect(one(ing("1", "cup", "buttermilk")).lines).toEqual(["No buttermilk: 1 cup milk + 1 tbsp lemon juice or white vinegar, rest 5–10 minutes"]));
  it("peanut butter is not butter", () => expect(conversionsFor([ing("1", "cup", "salted peanut butter")])).toEqual([]));
});
