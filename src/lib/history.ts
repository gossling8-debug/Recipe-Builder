import { madeDays } from "./made";
import type { SavedRecipe } from "./schema";

/** One day a recipe was made. */
export interface Cooked {
  at: number;
  recipe: SavedRecipe;
}

const DAY = 86_400_000;

/** Everything cooked, newest first (from "Made it today", "I made this" and cooking mode). */
export function cookedHistory(recipes: SavedRecipe[]): Cooked[] {
  return recipes.flatMap((recipe) => madeDays(recipe).map((at) => ({ at, recipe }))).sort((a, b) => b.at - a.at);
}

/** Grouped by month: "November 2026" → days, newest first. */
export function byMonth(list: Cooked[]): { month: string; items: Cooked[] }[] {
  const out: { month: string; items: Cooked[] }[] = [];
  for (const c of list) {
    const month = new Date(c.at).toLocaleDateString([], { month: "long", year: "numeric" });
    const last = out[out.length - 1];
    if (last && last.month === month) last.items.push(c);
    else out.push({ month, items: [c] });
  }
  return out;
}

/** What was cooked within 3 days of this date one year ago (one entry per recipe). */
export function aYearAgo(recipes: SavedRecipe[], now = Date.now()): Cooked[] {
  const center = new Date(now);
  center.setFullYear(center.getFullYear() - 1);
  const from = center.getTime() - 3 * DAY;
  const to = center.getTime() + 3 * DAY;
  const seen = new Set<string>();
  return cookedHistory(recipes).filter((c) => {
    if (c.at < from || c.at > to || seen.has(c.recipe.id)) return false;
    seen.add(c.recipe.id);
    return true;
  });
}

/** The most-cooked recipes in a period, most first. */
export function mostMade(list: Cooked[], from: number): { recipe: SavedRecipe; times: number }[] {
  const counts = new Map<string, { recipe: SavedRecipe; times: number }>();
  for (const c of list) if (c.at >= from) counts.set(c.recipe.id, { recipe: c.recipe, times: (counts.get(c.recipe.id)?.times ?? 0) + 1 });
  return [...counts.values()].sort((a, b) => b.times - a.times || a.recipe.title.localeCompare(b.recipe.title));
}
