import { describe, expect, it } from "vitest";
import { retakeInto } from "./retake";
import type { SavedRecipe, ScannedRecipe } from "./schema";

const old = {
  id: "r1",
  createdAt: 100,
  title: "Biscits",
  servings: "8",
  time: null,
  ingredients: [{ quantity: "2", unit: "cups", name: "flowr", preparation: null }],
  steps: [{ segments: [{ text: "Mix.", ingredient_index: null, amount: null }] }],
  notes: null,
  tags: ["Breakfast"],
  warnings: ["The second line was hard to read; I guessed \"flowr\"."],
  warningsChecked: "old",
  photos: ["data:old"],
  favorite: true,
  myNotes: "Grandma's — use cold butter",
  dishPhoto: "data:dish",
  tastes: { Sam: "love" },
  madeOn: [5],
  importCost: 0.01,
} as unknown as SavedRecipe;

const reread = {
  title: "Biscuits",
  servings: "8",
  time: null,
  ingredients: [{ quantity: "2", unit: "cups", name: "flour", preparation: null }],
  steps: [{ segments: [{ text: "Mix.", ingredient_index: null, amount: null }] }],
  notes: null,
  tags: ["Bread"],
  warnings: [],
} as unknown as ScannedRecipe;

describe("retake the photo", () => {
  const r = retakeInto(old, reread, ["data:new"], 0.02, 999);

  it("replaces the reading and the card photos", () => {
    expect(r.title).toBe("Biscuits");
    expect(r.ingredients[0].name).toBe("flour");
    expect(r.warnings).toEqual([]);
    expect(r.photos).toEqual(["data:new"]);
  });

  it("keeps the same recipe and everything the cook added", () => {
    expect(r).toMatchObject({ id: "r1", createdAt: 100, favorite: true, myNotes: "Grandma's — use cold butter", dishPhoto: "data:dish", tastes: { Sam: "love" }, madeOn: [5] });
    expect(r.tags).toEqual(["Breakfast"]); // the cook's labels, not the new suggestions
  });

  it("adds up the reading cost, marks it changed, and forgets the old double-check", () => {
    expect(r.importCost).toBeCloseTo(0.03, 5);
    expect(r.updatedAt).toBe(999);
    expect(r.warningsChecked).toBeUndefined();
  });

  it("uses the new labels when the cook had none", () => {
    expect(retakeInto({ ...old, tags: [] }, reread, [], 0).tags).toEqual(["Bread"]);
  });
});
