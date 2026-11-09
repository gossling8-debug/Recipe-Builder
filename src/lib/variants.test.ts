import { describe, expect, it } from "vitest";
import { family, makeVariant } from "./variants";
import type { SavedRecipe } from "./schema";

const ing = (name: string) => ({ quantity: "1", unit: "cup", name, preparation: null, section: null });
const orig: SavedRecipe = {
  id: "o", title: "Casserole", servings: null, time: null, ingredients: [ing("rice"), ing("cheese")],
  steps: [{ segments: [{ text: "the rice", ingredient_index: 0, amount: "1 cup" }] }], notes: null, tags: ["Dinner"], warnings: [],
  createdAt: 1, photos: ["p"], rating: 5, myNotes: "yum", madeOn: [5], favorite: true, dishPhoto: "d",
  swaps: { ingredientsKey: JSON.stringify([["1", "cup", "rice"], ["1", "cup", "cheese"]]), byIndex: { 0: { name: "cauliflower rice", amount: "2 cups", closeness: "Close", original: "rice" } } },
};

describe("variants", () => {
  it("copies the recipe as cooked, with a fresh history", () => {
    const v = makeVariant(orig, "v", 10);
    expect(v.title).toBe("Casserole (my version)");
    expect(v.variantOf).toBe("o");
    expect(v.ingredients[0].name).toBe("cauliflower rice");
    expect(v.steps[0].segments[0].text).toBe("the cauliflower rice");
    expect(v.photos).toEqual(["p"]);
    for (const k of ["rating", "myNotes", "madeOn", "favorite", "dishPhoto", "swaps", "nutrition", "cookLog"] as const) expect(v[k]).toBeUndefined();
  });
  it("groups the original with its versions", () => {
    const v1 = makeVariant(orig, "v1", 10);
    const v2 = makeVariant(v1, "v2", 20);
    expect(v2.variantOf).toBe("o");
    expect(family(v2, [v2, orig, v1, { ...orig, id: "x" }]).map((r) => r.id)).toEqual(["o", "v1", "v2"]);
  });
});
