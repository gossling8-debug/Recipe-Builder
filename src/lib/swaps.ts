import { splitAmount } from "./quantity";
import type { SavedRecipe, ScannedRecipe } from "./schema";

/**
 * A substitute the cook chose for one ingredient. Swaps sit on top of the
 * recipe (the original stays saved), so they can be undone at any time.
 */
export interface Swap {
  name: string; // "dairy-free cream cheese"
  amount: string; // "16 oz" — for the recipe at its original size
  closeness: string; // "Close"
  original: string; // "cream cheese"
}

export interface Swaps {
  ingredientsKey: string; // swaps are dropped if the ingredient list is edited
  byIndex: Record<string, Swap>;
}

export const ingredientsKey = (r: ScannedRecipe) => JSON.stringify(r.ingredients.map((i) => [i.quantity, i.unit, i.name]));

/** Active swaps by ingredient index (empty if the recipe was edited since). */
export function activeSwaps(r: SavedRecipe): Map<number, Swap> {
  const s = r.swaps;
  if (!s || s.ingredientsKey !== ingredientsKey(r)) return new Map();
  return new Map(Object.entries(s.byIndex).map(([i, sw]) => [Number(i), sw]));
}

/** "Dairy-free cream cheese (e.g. Kite Hill)" → "dairy-free cream cheese" */
export function shortName(substitute: string): string {
  const s = substitute.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** The recipe as it should be cooked: chosen substitutes in the list and in the steps. */
export function applySwaps(r: SavedRecipe): ScannedRecipe {
  const swaps = activeSwaps(r);
  if (swaps.size === 0) return r;
  const mentions = new Map<number, number>();
  for (const st of r.steps) for (const sg of st.segments) if (sg.ingredient_index !== null) mentions.set(sg.ingredient_index, (mentions.get(sg.ingredient_index) ?? 0) + 1);

  return {
    ...r,
    ingredients: r.ingredients.map((ing, i) => {
      const sw = swaps.get(i);
      if (!sw) return ing;
      const { quantity, unit } = splitAmount(sw.amount);
      // Keep the prep note ("softened") unless the substitute already says it ("shreds" ~ "shredded").
      const prep = ing.preparation;
      const keepPrep = prep && !sw.name.toLowerCase().includes(prep.toLowerCase().slice(0, 5));
      return { ...ing, quantity, unit, name: sw.name, preparation: keepPrep ? prep : null };
    }),
    steps: r.steps.map((st) => ({
      segments: st.segments.map((sg) => {
        const sw = sg.ingredient_index === null ? undefined : swaps.get(sg.ingredient_index);
        if (!sw) return sg;
        const the = /^the\s/i.test(sg.text) ? sg.text.slice(0, 4) : "";
        // Used in one step: give the substitute's amount. Used in several:
        // keep each step's share (the list shows the substitute's total).
        const amount = mentions.get(sg.ingredient_index!) === 1 ? sw.amount : sg.amount;
        return { ...sg, text: the + sw.name, amount };
      }),
    })),
  };
}
