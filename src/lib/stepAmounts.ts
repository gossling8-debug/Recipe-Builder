import type { ScannedRecipe } from "./schema";

/**
 * Amounts the steps give for an ingredient whose list line has none ("Good olive oil" in the
 * list, "heat 1½ Tbsp olive oil" in a step). One per step that uses it, in order (two steps
 * using "1 tsp" each need 2 tsp, so both count; the same amount twice in one step is one
 * addition named twice). Only real amounts (with a number): "to taste" or "the rest" aren't.
 */
export function amountsFromSteps(recipe: Pick<ScannedRecipe, "ingredients" | "steps">, index: number): string[] {
  const ing = recipe.ingredients[index];
  if (!ing || ing.quantity.trim() || ing.unit.trim()) return []; // the list has its own amount
  const out: string[] = [];
  for (const step of recipe.steps) {
    const inStep: string[] = [];
    for (const seg of step.segments) {
      const a = seg.ingredient_index === index ? seg.amount?.trim() : "";
      if (a && /[\d½⅓⅔¼¾⅛⅜⅝⅞]/.test(a) && !inStep.includes(a)) inStep.push(a);
    }
    out.push(...inStep);
  }
  return out;
}
