import { describe, expect, it } from "vitest";
import { decodeRecipe, encodeRecipe } from "./link";
import type { ScannedRecipe } from "./schema";

const recipe: ScannedRecipe = {
  title: "Grandma’s Cookies ✓",
  servings: "24",
  time: null,
  ingredients: [{ quantity: "1½", unit: "cups", name: "sugar", preparation: null, section: null }],
  steps: [{ segments: [{ text: "Add ", ingredient_index: null, amount: null }, { text: "sugar", ingredient_index: 0, amount: "1½ cups" }] }],
  notes: "Don't overbake.",
  tags: ["Baking"],
  warnings: ["should not be shared"],
};

describe("share links", () => {
  it("round-trips a recipe (compressed)", async () => {
    const data = await encodeRecipe(recipe);
    expect(data[0]).toBe("z");
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeRecipe(data);
    expect(back).toEqual({ ...recipe, warnings: [] });
  });
  it("rejects junk", async () => {
    await expect(decodeRecipe("zNOTVALID")).rejects.toThrow();
    await expect(decodeRecipe("x123")).rejects.toThrow();
  });
});
