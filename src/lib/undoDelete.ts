import { deleteRecipe, saveRecipe } from "./db";
import { clearProgress, loadProgress, saveProgress, type Progress } from "./progress";
import { addToShopping, loadShopping, removeFromShopping } from "./shopping";
import type { SavedRecipe } from "./schema";

/**
 * Deleting a recipe happens right away, with a few seconds to undo it
 * (instead of an "Are you sure?" first). Undo puts back the recipe, its place on
 * the shopping list and its cooking progress; cloud sync uploads it again.
 */
export interface Deleted {
  recipe: SavedRecipe;
  listed?: { id: string; scale: number; skip?: number[] };
  progress: Progress;
  at: number;
}

export const UNDO_MS = 8000;
let last: Deleted | null = null;
let timer: number | undefined;
const changed = () => window.dispatchEvent(new Event("undo-delete-changed"));

export const lastDeleted = () => last;

export function forgetDeleted() {
  window.clearTimeout(timer);
  if (!last) return;
  last = null;
  changed();
}

export async function deleteWithUndo(r: SavedRecipe): Promise<void> {
  const listed = loadShopping().recipes.find((x) => x.id === r.id);
  const progress = loadProgress(r.id);
  await deleteRecipe(r.id);
  removeFromShopping(r.id);
  clearProgress(r.id);
  window.clearTimeout(timer);
  last = { recipe: r, listed, progress, at: Date.now() };
  timer = window.setTimeout(forgetDeleted, UNDO_MS);
  changed();
}

export async function undoDelete(): Promise<SavedRecipe | null> {
  const d = last;
  if (!d) return null;
  forgetDeleted();
  await saveRecipe(d.recipe);
  if (d.listed) addToShopping(d.listed.id, d.listed.scale, d.listed.skip);
  saveProgress(d.recipe.id, d.progress);
  window.dispatchEvent(new Event("recipes-changed"));
  return d.recipe;
}
