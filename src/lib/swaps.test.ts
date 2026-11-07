import { describe, expect, it } from "vitest";
import { applySwaps, ingredientsKey, shortName } from "./swaps";
import type { SavedRecipe } from "./schema";

const seg = (text: string, ingredient_index: number | null = null, amount: string | null = null) => ({ text, ingredient_index, amount });
const base: SavedRecipe = {
  id: "r", createdAt: 0, photos: [], title: "Dip", servings: null, time: null, notes: null, tags: [], warnings: [],
  ingredients: [
    { quantity: "2", unit: "(8 oz) blocks", name: "cream cheese", preparation: "softened", section: null },
    { quantity: "1", unit: "cup", name: "butter", preparation: null, section: null },
  ],
  steps: [
    { segments: [seg("Beat "), seg("the cream cheese", 0, "2 (8 oz) blocks"), seg(" with "), seg("butter", 1, "½ cup"), seg(".")] },
    { segments: [seg("Fold in "), seg("the rest of the butter", 1, "½ cup"), seg(".")] },
  ],
};
const swapped = (byIndex: SavedRecipe["swaps"] extends infer S ? S extends { byIndex: infer B } ? B : never : never): SavedRecipe => ({
  ...base,
  swaps: { ingredientsKey: ingredientsKey(base), byIndex },
});

describe("applySwaps", () => {
  const r = applySwaps(swapped({ "0": { name: "dairy-free cream cheese", amount: "16 oz", closeness: "Close", original: "cream cheese" } }));
  it("replaces the ingredient", () =>
    expect(r.ingredients[0]).toEqual({ quantity: "16", unit: "oz", name: "dairy-free cream cheese", preparation: "softened", section: null }));
  it("drops a prep note the substitute already covers", () => {
    const c = applySwaps({ ...swapped({ "0": { name: "dairy-free cheddar shreds", amount: "½ cup", closeness: "Close", original: "cheddar" } }),
      ingredients: [{ ...base.ingredients[0], preparation: "shredded" }, base.ingredients[1]] } as SavedRecipe);
    expect(c.ingredients[0].preparation).toBeNull();
  });
  it("keeps a prep note the substitute doesn't cover", () =>
    expect(applySwaps(swapped({ "0": { name: "dairy-free cream cheese", amount: "16 oz", closeness: "Close", original: "cream cheese" } })).ingredients[0].preparation).toBe("softened"));
  it("replaces the mention in the step, keeping 'the'", () =>
    expect(r.steps[0].segments[1]).toEqual(seg("the dairy-free cream cheese", 0, "16 oz")));
  it("keeps each step's share when used in several steps", () => {
    const b = applySwaps(swapped({ "1": { name: "vegan butter", amount: "1 cup", closeness: "Nearly identical", original: "butter" } }));
    expect(b.steps[0].segments[3]).toEqual(seg("vegan butter", 1, "½ cup"));
    expect(b.steps[1].segments[1]).toEqual(seg("the vegan butter", 1, "½ cup"));
  });
  it("ignores swaps after the ingredients were edited", () => {
    const edited = { ...swapped({ "0": { name: "x", amount: "1", closeness: "Close", original: "cream cheese" } }), ingredients: [base.ingredients[1]] };
    expect(applySwaps(edited).ingredients).toEqual([base.ingredients[1]]);
  });
});

describe("shortName", () => {
  it("drops brands and capital", () => expect(shortName("Dairy-free cream cheese (e.g. Kite Hill, Violife)")).toBe("dairy-free cream cheese"));
});
