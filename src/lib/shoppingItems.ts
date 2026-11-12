import { applySwaps } from "./swaps";
import { loadPantry } from "./pantry";
import { combine, type ShoppingItem, type ShoppingState } from "./shopping";
import { buyText, loadStaples, staplesToBuy, statusText } from "./staples";
import type { SavedRecipe } from "./schema";

export const ALWAYS_KEEP = "Always keep";

/** Staples to buy (or already ticked this trip), as shopping-list items. */
export function staplesToBuyOrTicked(checked: string[], onListAlready: Set<string>): ShoppingItem[] {
  const need = new Map(staplesToBuy().map((s) => [s.staple.key, s]));
  const pantry = loadPantry();
  return loadStaples()
    .filter((st) => !onListAlready.has(st.key) && (need.has(st.key) || checked.includes(st.key)))
    .map((st) => {
      const n = need.get(st.key);
      return {
        key: st.key,
        name: st.name,
        amount: n ? buyText(n) : "",
        recipes: [n ? `${ALWAYS_KEEP} · ${statusText[n.status].toLowerCase()}` : ALWAYS_KEEP],
        need: n?.buy ?? pantry[st.key]?.lastBought ?? null,
      };
    });
}


/** Everything on the shopping list right now: recipe ingredients plus staples to buy. */
export function shoppingItems(all: SavedRecipe[], state: ShoppingState): ShoppingItem[] {
  const entries = state.recipes
    .map(({ id, scale, skip }) => {
      const r = all.find((x) => x.id === id);
      return r && { recipe: { ...r, ...applySwaps(r) }, scale, skip };
    })
    .filter((e): e is { recipe: SavedRecipe; scale: number; skip: number[] | undefined } => !!e);
  const recipeItems = combine(entries);
  return [...recipeItems, ...staplesToBuyOrTicked(state.checked, new Set(recipeItems.map((i) => i.key)))];
}
