import { fixPlurals, formatNumber, ingredientText, parseNumber, scaleAmount } from "./quantity";
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

const NUMBER = /^\s*((?:\d+\s+)?\d+\s*\/\s*\d+|\d*\s?[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*(.*)$/;
const RANGE = /[\d½⅓⅔¼¾⅛⅜⅝⅞]\s*(?:-|–|—|to)\s*[\d½⅓⅔¼¾⅛⅜⅝⅞]/i;
const UNIT_KEY: Record<string, string> = {
  tablespoon: "tbsp", tbs: "tbsp", tbl: "tbsp", tb: "tbsp", teaspoon: "tsp", ts: "tsp", c: "cup",
  pound: "lb", lb: "lb", ounce: "oz", gram: "g", gr: "g", milliliter: "ml", millilitre: "ml",
};
function unitKey(u: string): string {
  const raw = u.trim().replace(/\.$/, "");
  // Handwritten cards: "T" is a tablespoon, "t" a teaspoon.
  if (raw === "T") return "tbsp";
  if (raw === "t") return "tsp";
  const k = raw.toLowerCase();
  return UNIT_KEY[k] ?? UNIT_KEY[k.replace(/s$/, "")] ?? k.replace(/s$/, "");
}
const isAmount = (a: string) => /[\d½⅓⅔¼¾⅛⅜⅝⅞]/.test(a);
const nameKey = (t: string) => t.trim().toLowerCase().replace(/^the\s+/, "").replace(/[.,;:!]+$/, "");
/** "kosher salt" and "salt" are the same thing on a combined line: group by the last word. */
const thingKey = (t: string) => nameKey(t).split(/\s+/).pop() ?? "";

/**
 * "2 Tbsp" + "1 tsp" + "1 tsp" → "2 Tbsp + 2 tsp". Ranges ("1-2 tsp") and amounts that aren't
 * "number unit" stay as written; an estimate ("≈ ¼ cup") is added up and keeps its "≈".
 */
export function combineAmounts(amounts: string[]): string {
  const parts: { key: string | null; value: number; unit: string; text: string; approx: boolean }[] = [];
  for (const a of amounts) {
    const approx = /^\s*[≈~]/.test(a);
    const plain = a.replace(/^\s*[≈~]\s*/, "");
    const m = RANGE.test(plain) ? null : plain.match(NUMBER);
    const value = m ? parseNumber(m[1].replace(/\s*\/\s*/, "/")) : NaN;
    if (!m || !(value > 0)) {
      parts.push({ key: null, value: 0, unit: "", text: a.trim(), approx: false });
      continue;
    }
    const unit = m[2].trim();
    const same = parts.find((p) => p.key !== null && p.key === unitKey(unit));
    if (same) {
      same.value += value;
      same.approx ||= approx;
    } else parts.push({ key: unitKey(unit), value, unit, text: "", approx });
  }
  return parts
    .map((p) => (p.key === null ? p.text : `${p.approx ? "≈ " : ""}${fixPlurals(`${formatNumber(p.value)}${p.unit ? ` ${p.unit}` : ""}`)}`))
    .join(" + ");
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
      const key = combined ? thingKey(seg.text) : "";
      const g = groups.get(key) ?? { label: nameKey(seg.text), amounts: [] };
      g.amounts.push(scaleAmount(a, scale));
      groups.set(key, g);
    }
  // On a combined line, always say which thing an amount is for (even if only one has one).
  const out = [...groups.values()].map((g) => ({ label: combined ? g.label : null, amount: combineAmounts(g.amounts) }));
  return out;
}

/** One line of text: "2 Tbsp + 1 tsp" or "salt 2 Tbsp + 1 tsp, black pepper 1 tsp". */
export const stepTotalsText = (totals: StepTotal[]) => totals.map((t) => (t.label ? `${t.label} ${t.amount}` : t.amount)).join(", ");

/**
 * An ingredient-list line, with the steps' amount in front like every other line when the list
 * gives none ("2 Tbsp + 1 tsp kosher salt", note "from the steps"). An old combined line
 * ("Salt and pepper") can't take one amount in front, so it keeps its words and the note says
 * which amount is which ("salt 2 Tbsp + 1 tsp, pepper 1 tsp in the steps").
 */
export function listLine(recipe: Pick<ScannedRecipe, "ingredients" | "steps">, index: number, scale = 1): { text: string; note: string | null } {
  const ing = recipe.ingredients[index];
  const plain = ingredientText(ing, scale);
  const totals = stepTotals(recipe, index, scale);
  if (totals.length === 1 && !totals[0].label) return { text: `${totals[0].amount} ${plain}`, note: "from the steps" };
  if (totals.length) return { text: plain, note: `${stepTotalsText(totals)} in the steps` };
  return { text: plain, note: null };
}

/** The same as one piece of text, for print and sharing: "2 Tbsp + 1 tsp kosher salt (from the steps)". */
export function listLineText(recipe: Pick<ScannedRecipe, "ingredients" | "steps">, index: number, scale = 1): string {
  const { text, note } = listLine(recipe, index, scale);
  return note ? `${text} (${note})` : text;
}
