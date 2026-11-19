import { describe, expect, it } from "vitest";
import { entryAsRecipe, entryFor, reconcile } from "./sharedShopping";
import { combine, type ShoppingState } from "./shopping";
import type { SavedRecipe } from "./schema";

const ing = (quantity: string, unit: string, name: string) => ({ quantity, unit, name, preparation: null, section: null });
const recipe = {
  id: "r1",
  title: "Chili",
  servings: "4",
  time: null,
  notes: null,
  tags: [],
  warnings: [],
  steps: [],
  createdAt: 0,
  ingredients: [ing("1", "lb", "ground beef"), ing("1", "can", "kidney beans"), ing("1", "cup", "water")],
} as unknown as SavedRecipe;

describe("shared shopping list entries", () => {
  it("copies what to buy, leaving out what you crossed off", () => {
    const e = entryFor(recipe, 2, [1], "u1", "Sam", 5);
    expect(e).toMatchObject({ title: "Chili", scale: 2, sourceId: "r1", addedBy: "u1", addedByName: "Sam", at: 5 });
    expect(e.ingredients.map((i) => i.name)).toEqual(["ground beef", "water"]);
  });
  it("combines into the same shopping items as your own recipes", () => {
    const e = entryFor(recipe, 2, [], "u1", "Sam");
    const shared = combine([{ recipe: entryAsRecipe({ id: "u1_r1", ...e }), scale: e.scale }]);
    const own = combine([{ recipe, scale: 2 }]);
    expect(shared.map((i) => [i.key, i.amount])).toEqual(own.map((i) => [i.key, i.amount]));
  });
});

describe("reconcile", () => {
  const e = (sourceId: string, addedBy = "me", scale = 1) => ({ id: `${addedBy}_${sourceId}`, title: "T", scale, ingredients: [], sourceId, addedBy, addedByName: "Me", at: 0 });
  const st = (recipes: ShoppingState["recipes"]) => ({ recipes, checked: [] }) as unknown as ShoppingState;
  it("drops my recipe someone took off, and adds one I put on from another phone", () => {
    const next = reconcile([e("a"), e("c", "me", 2), e("x", "them")], "me", st([{ id: "a", scale: 1 }, { id: "b", scale: 1 }]));
    expect(next?.recipes).toEqual([{ id: "a", scale: 1 }, { id: "c", scale: 2 }]);
  });
  it("changes nothing when already in step", () => {
    expect(reconcile([e("a")], "me", st([{ id: "a", scale: 1 }]))).toBeNull();
  });
});
