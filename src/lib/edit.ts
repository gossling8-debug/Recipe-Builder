import type { Ingredient, Segment, Step } from "./schema";
import { fixPlurals, parseNumber, scaleAmount, splitAmount } from "./quantity";

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

// ---------- keeping step amounts in step with the ingredient list ----------
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const unitWord = (u: string) => norm(u).replace(/\.$/, "").replace(/(es|s)$/, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The amount a step should show after an ingredient's amount changed from
 * `before` to `after` in the list:
 *  - the whole amount ("1 cup") becomes the new amount;
 *  - a mention of it ("half of the 1 cup") gets the new amount in place;
 *  - a portion in the same unit ("1/2 cup" of 1 cup → of 2 cups) is scaled to match;
 *  - anything else (e.g. "remaining", or a change of unit) is left alone.
 */
export function updatedMentionAmount(mentionAmount: string, before: string, after: string): string {
  const b = norm(before);
  const a = after.trim();
  if (!mentionAmount.trim() || !b || !a || b === norm(after)) return mentionAmount;
  if (norm(mentionAmount) === b) return a;
  const inside = new RegExp(`(^|[^\\d/.])${escapeRe(b).replace(/ /g, "\\s+")}(?![a-z\\d])`, "i");
  if (inside.test(mentionAmount)) return mentionAmount.replace(inside, (_m, pre: string) => pre + a);
  const B = splitAmount(before);
  const A = splitAmount(after);
  if (B.quantity && A.quantity && unitWord(B.unit) === unitWord(A.unit)) {
    const ratio = parseNumber(A.quantity) / parseNumber(B.quantity);
    if (Number.isFinite(ratio) && ratio > 0 && ratio !== 1) return fixPlurals(scaleAmount(mentionAmount, ratio));
  }
  return mentionAmount;
}

/** Rewrites the steps' [ingredient: amount] tags for ingredient `index` after its amount changed. */
export function updateStepsForAmount(stepTexts: string[], ingredients: Ingredient[], index: number, before: string, after: string): string[] {
  return stepTexts.map((t) =>
    t.replace(MENTION, (whole: string, mention: string, amount: string | undefined) => {
      if (amount === undefined || !amount.trim() || matchIngredient(mention.trim(), ingredients) !== index) return whole;
      const next = updatedMentionAmount(amount.trim(), before, after);
      return next === amount.trim() ? whole : `[${mention.trim()}: ${next}]`;
    }),
  );
}
