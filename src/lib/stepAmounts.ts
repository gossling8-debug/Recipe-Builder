import { formatNumber, parseNumber, scaleAmount } from "./quantity";
import type { ScannedRecipe } from "./schema";

/**
 * For a list line with no amount ("Good olive oil"), what the steps use ("heat 1½ Tbsp olive
 * oil"). Shown beside the line; the stored list stays exactly as the source printed it, so the
 * pantry, costs and shopping list read the same amounts as before (docs/DECISIONS.md).
 *
 * Each step mention with an amount is one addition (the reading rules give no amount to a
 * mention that only refers back). Amounts in the same unit are added up ("1 tsp" twice → "2 tsp");
 * different units stay side by side ("2 Tbsp + 1 tsp"), as a cook would say it. An old combined
 * line ("Kosher salt and freshly ground black pepper") is shown per thing named, never summed
 * together ("salt 2 Tbsp + 1 tsp, black pepper 1 tsp").
 */
export interface StepTotal {
  /** What the steps call it, when one list line covers more than one thing; otherwise null. */
  label: string | null;
  amount: string;
}

const NUMBER = /^\s*((?:\d+\s+)?\d+\s*\/\s*\d+|\d*[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*(.*)$/;
const UNIT_KEY: Record<string, string> = { tablespoon: "tbsp", tbs: "tbsp", tbl: "tbsp", teaspoon: "tsp", t: "tsp", c: "cup", pound: "lb", lbs: "lb", ounce: "oz" };
const unitKey = (u: string) => {
  const k = u.trim().toLowerCase().replace(/\.$/, "").replace(/s$/, "");
  return UNIT_KEY[k] ?? k;
};
const isAmount = (a: string) => /[\d½⅓⅔¼¾⅛⅜⅝⅞]/.test(a);
const nameKey = (t: string) => t.trim().toLowerCase().replace(/^the\s+/, "").replace(/[.,;:!]+$/, "");

/** "2 Tbsp" + "1 tsp" + "1 tsp" → "2 Tbsp + 2 tsp". Amounts that aren't "number unit" stay as written. */
export function combineAmounts(amounts: string[]): string {
  const parts: { key: string | null; value: number; unit: string; text: string }[] = [];
  for (const a of amounts) {
    const m = a.match(NUMBER);
    const value = m ? parseNumber(m[1].replace(/\s*\/\s*/, "/")) : NaN;
    if (!m || !(value > 0)) {
      parts.push({ key: null, value: 0, unit: "", text: a.trim() });
      continue;
    }
    const unit = m[2].trim();
    const same = parts.find((p) => p.key !== null && p.key === unitKey(unit));
    if (same) same.value += value;
    else parts.push({ key: unitKey(unit), value, unit, text: "" });
  }
  return parts.map((p) => (p.key === null ? p.text : `${formatNumber(p.value)}${p.unit ? ` ${p.unit}` : ""}`)).join(" + ");
}

/** The steps' amounts for list line `index`, scaled; empty if the line has its own amount or the steps give none. */
export function stepTotals(recipe: Pick<ScannedRecipe, "ingredients" | "steps">, index: number, scale = 1): StepTotal[] {
  const ing = recipe.ingredients[index];
  if (!ing || ing.quantity.trim() || ing.unit.trim()) return [];
  // One line naming two things ("salt and pepper") is split by what each step mention calls it.
  const combined = /\band\b|&/i.test(ing.name);
  const groups = new Map<string, { label: string; amounts: string[] }>();
  for (const step of recipe.steps)
    for (const seg of step.segments) {
      const a = seg.ingredient_index === index ? seg.amount?.trim() : "";
      if (!a || !isAmount(a)) continue;
      const key = combined ? nameKey(seg.text) : "";
      const g = groups.get(key) ?? { label: nameKey(seg.text), amounts: [] };
      g.amounts.push(scaleAmount(a, scale));
      groups.set(key, g);
    }
  const out = [...groups.values()].map((g) => ({ label: combined && groups.size > 1 ? g.label : null, amount: combineAmounts(g.amounts) }));
  return out;
}

/** One line of text: "2 Tbsp + 1 tsp" or "salt 2 Tbsp + 1 tsp, black pepper 1 tsp". */
export const stepTotalsText = (totals: StepTotal[]) => totals.map((t) => (t.label ? `${t.label} ${t.amount}` : t.amount)).join(", ");
