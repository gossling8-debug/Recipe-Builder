import { statusFor } from "./pantry";
import { formatQty, parseQty } from "./qty";
import { nameKey } from "./shopping";
import { applySwaps } from "./swaps";
import type { SavedRecipe } from "./schema";

/** Assumed to be in every kitchen, so they never count as missing. */
const BASICS = new Set(["salt", "black pepper", "pepper", "water", "ice", "ice water", "hot water", "cold water", "salt and pepper"]);
export const isBasic = (name: string) => BASICS.has(nameKey(name));

export interface CanMake {
  recipe: SavedRecipe;
  have: number; // ingredients covered by the pantry (or basics)
  total: number;
  missing: string[]; // not in the pantry at all
  short: string[]; // in the pantry but not enough, e.g. "sugar (≈ ½ cup more)"
  check: string[]; // in the pantry, but the amounts can't be compared
}

/**
 * How well the pantry covers each recipe (as it'll be cooked, with chosen
 * substitutes), best first. Only recipes missing at most `maxMissing` things.
 */
export function whatCanIMake(recipes: SavedRecipe[], maxMissing = 2): CanMake[] {
  const out: CanMake[] = [];
  for (const saved of recipes) {
    const recipe = applySwaps(saved);
    const res: CanMake = { recipe: saved, have: 0, total: 0, missing: [], short: [], check: [] };
    for (const ing of recipe.ingredients) {
      if (!ing.name.trim()) continue;
      res.total++;
      if (isBasic(ing.name)) {
        res.have++;
        continue;
      }
      const need = parseQty([ing.quantity, ing.unit].filter(Boolean).join(" "), ing.name);
      const s = statusFor(nameKey(ing.name), ing.name, need);
      if (s.kind === "enough") res.have++;
      else if (s.kind === "unknown") {
        res.have++;
        res.check.push(ing.name);
      } else if (s.kind === "some") res.short.push(`${ing.name} (≈ ${formatQty(s.short)} more)`);
      else res.missing.push(ing.name);
    }
    const gaps = res.missing.length + res.short.length;
    if (res.total > 0 && res.have > 0 && gaps <= maxMissing) out.push(res);
  }
  return out.sort(
    (a, b) =>
      a.missing.length + a.short.length - (b.missing.length + b.short.length) || b.have / b.total - a.have / a.total,
  );
}
