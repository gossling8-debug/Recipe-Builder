import { applySwaps } from "./swaps";
import type { SavedRecipe } from "./schema";

/**
 * Recipe variations: "Make a copy" creates your own version (e.g. a keto
 * version) linked to the original, which stays as it was.
 */
export function makeVariant(r: SavedRecipe, id: string, now = Date.now()): SavedRecipe {
  // The copy starts as the recipe is cooked now (chosen substitutes built in),
  // with its own fresh history, rating and notes.
  const c = applySwaps(r);
  return {
    title: `${r.title} (my version)`,
    servings: c.servings,
    time: c.time,
    ingredients: c.ingredients,
    steps: c.steps,
    notes: c.notes,
    warnings: c.warnings,
    id,
    tags: r.tags ?? [],
    createdAt: now,
    photos: r.photos,
    source: r.source,
    variantOf: r.variantOf ?? r.id, // versions of a version all link to the first original
  };
}

/** The original and all its versions, original first. */
export function family(r: SavedRecipe, all: SavedRecipe[]): SavedRecipe[] {
  const root = r.variantOf ?? r.id;
  const members = all.filter((x) => x.id === root || x.variantOf === root);
  return members.sort((a, b) => (a.id === root ? -1 : b.id === root ? 1 : a.createdAt - b.createdAt));
}
