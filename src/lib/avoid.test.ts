import { describe, expect, it } from "vitest";
import { findAvoided } from "./avoid";
import type { Ingredient } from "./schema";

const ing = (name: string, preparation: string | null = null): Ingredient => ({ quantity: "1", unit: "", name, preparation, section: null });
const hits = (names: string[], groups: string[], custom: string[] = []) =>
  findAvoided(names.map((n) => ing(n)), { groups, custom }).map((m) => names[m.index]);

describe("findAvoided", () => {
  it("finds dairy but not peanut butter, coconut milk or cream of tartar", () =>
    expect(hits(["butter", "cream cheese", "peanut butter", "coconut milk", "cream of tartar", "shredded cheddar"], ["dairy"])).toEqual([
      "butter", "cream cheese", "shredded cheddar",
    ]));
  it("eggs but not eggplant", () => expect(hits(["eggs", "eggplant", "mayonnaise"], ["eggs"])).toEqual(["eggs", "mayonnaise"]));
  it("tree nuts but not nutmeg, butternut or coconut", () =>
    expect(hits(["walnuts", "nutmeg", "butternut squash", "coconut", "pecans"], ["treenuts"])).toEqual(["walnuts", "pecans"]));
  it("gluten but not almond flour or tamari", () =>
    expect(hits(["all-purpose flour", "almond flour", "soy sauce", "tamari", "panko"], ["gluten"])).toEqual(["all-purpose flour", "soy sauce", "panko"]));
  it("worcestershire counts as fish", () => expect(hits(["Worcestershire sauce"], ["fish"])).toEqual(["Worcestershire sauce"]));
  it("custom words match whole words and plurals", () =>
    expect(hits(["butter", "buttermilk", "unsalted butter", "cilantro leaves"], [], ["butter", "cilantro"])).toEqual([
      "butter", "unsalted butter", "cilantro leaves",
    ]));
  it("reports reasons", () =>
    expect(findAvoided([ing("butter")], { groups: ["dairy"], custom: ["butter"] })[0].reasons).toEqual(["Dairy", "butter"]));
});
