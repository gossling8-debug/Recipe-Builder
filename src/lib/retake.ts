import type { Origin, SavedRecipe, ScannedRecipe } from "./schema";

/**
 * "Retake the photo": a new reading of the same card replaces the recipe's text,
 * but everything the cook added stays: the star, labels, own notes, dish photo, who
 * likes it, when it was made. Swaps switch themselves off if the ingredients changed
 * (swaps.ts). The old "double-check" notes go; the new reading brings its own.
 */
export function retakeInto(
  old: SavedRecipe,
  read: ScannedRecipe & { origin?: Origin },
  photos: string[],
  cost: number,
  now = Date.now(),
): SavedRecipe {
  return {
    ...old,
    ...read,
    id: old.id,
    createdAt: old.createdAt,
    tags: old.tags?.length ? old.tags : read.tags,
    photos,
    importCost: (old.importCost ?? 0) + cost,
    warningsChecked: undefined,
    updatedAt: now,
  };
}
