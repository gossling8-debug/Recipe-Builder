import type { Ingredient, Segment, Step } from "./schema";
import { splitAmount } from "./quantity";

/**
 * Steps are edited as plain text, with ingredients in square brackets and the
 * amount after a colon:  "Add [the flour: 2 cups] and stir."
 */
export function stepToText(step: Step): string {
  return step.segments
    .map((s) => (s.ingredient_index === null ? s.text : s.amount ? `[${s.text}: ${s.amount}]` : `[${s.text}]`))
    .join("");
}

const MENTION = /\[([^\]:]+?)(?::\s*([^\]]*?))?\s*\]/g;

/**
 * Turns edited text back into segments. Each bracketed ingredient is linked to
 * the ingredient list by name; if nothing matches, it's kept as plain text with
 * its amount in parentheses so nothing the cook typed is lost.
 */
export function textToStep(text: string, ingredients: Ingredient[]): Step {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION)) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), ingredient_index: null, amount: null });
    const mention = m[1].trim();
    const amount = m[2]?.trim() || null;
    const index = matchIngredient(mention, ingredients);
    segments.push(
      index === null
        ? { text: amount ? `${mention} (${amount})` : mention, ingredient_index: null, amount: null }
        : { text: mention, ingredient_index: index, amount },
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), ingredient_index: null, amount: null });
  return { segments };
}

const STOP = new Set(["the", "a", "an", "of", "and", "rest", "remaining", "some", "half", "your", "fresh", "chopped"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(es|s)$/, ""));

/** Best ingredient for a mention like "the rest of the sugar". */
export function matchIngredient(mention: string, ingredients: Ingredient[]): number | null {
  const m = mention.toLowerCase().trim();
  const exact = ingredients.findIndex((i) => i.name.toLowerCase().trim() === m);
  if (exact >= 0) return exact;
  const mw = words(mention);
  let best: number | null = null;
  let bestScore = 0;
  ingredients.forEach((ing, i) => {
    const iw = words(ing.name);
    const score = iw.filter((w) => mw.includes(w)).length / Math.max(iw.length, 1);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore > 0 ? best : null;
}

/** "2 cups" + "flour, sifted" ⇄ ingredient fields, for the editor's two boxes. */
export function ingredientToFields(ing: Ingredient): { amount: string; name: string } {
  return {
    amount: [ing.quantity, ing.unit].filter(Boolean).join(" "),
    name: ing.preparation ? `${ing.name}, ${ing.preparation}` : ing.name,
  };
}

export function fieldsToIngredient(amount: string, name: string, section: string | null): Ingredient {
  const { quantity, unit } = splitAmount(amount);
  const comma = name.indexOf(",");
  return {
    quantity,
    unit,
    name: (comma >= 0 ? name.slice(0, comma) : name).trim(),
    preparation: comma >= 0 ? name.slice(comma + 1).trim() || null : null,
    section,
  };
}
