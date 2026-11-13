import { ingredientText, scaleAmount, stepAmount } from "./quantity";
import type { ScannedRecipe } from "./schema";

/** Plain-text version of a recipe for Messages, email or notes, at the chosen size. */
export function recipeToText(r: ScannedRecipe, scale = 1): string {
  const lines: string[] = [r.title];
  const meta = [r.servings && scaleAmount(r.servings, scale), r.time].filter(Boolean).join(" · ");
  if (meta) lines.push(meta);
  if (scale !== 1) lines.push(`(Amounts ×${scale})`);

  lines.push("", "INGREDIENTS");
  let section: string | null = null;
  for (const ing of r.ingredients) {
    if (ing.section && ing.section !== section) lines.push(`${ing.section}:`);
    section = ing.section;
    lines.push(`• ${ingredientText(ing, scale)}`);
  }

  lines.push("", "STEPS");
  r.steps.forEach((step, i) => {
    const text = step.segments
      .map((s) => (s.ingredient_index !== null && s.amount ? `${s.text} (${stepAmount(s.amount, r.ingredients[s.ingredient_index], scale)})` : s.text))
      .join("");
    lines.push(`${i + 1}. ${text}`);
  });

  if (r.notes) lines.push("", "NOTES", r.notes);
  return lines.join("\n");
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Opens the phone's share sheet; falls back to copying the text (and link). */
export async function shareText(title: string, text: string, url?: string): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(url ? { title, text, url } : { title, text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Otherwise fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return "copied";
  } catch {
    return "failed";
  }
}
