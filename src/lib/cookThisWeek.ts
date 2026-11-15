import { lastMade } from "./made";
import { NO_REPEAT_DAYS } from "./autoPlan";
import type { SavedRecipe } from "./schema";
import type { WeekState } from "./week";

/**
 * "Cook this week": recipes you loved but haven't made in a while, to bring
 * back. No AI, only what's on the phone: your stars, "would make again",
 * favorites and when you last made each one.
 *
 * - Loved: rated 4 or 5 stars, "would make again", or a favorite. Never one
 *   marked "wouldn't make again".
 * - Not lately: not made, and not on the week plan, in the last 14 days.
 * - Order: the most loved first, then the longest since it was made. A
 *   recipe you've made before but not lately counts a little more than one
 *   that's only been starred.
 */
export interface Suggestion {
  recipe: SavedRecipe;
  /** When it was last made, if ever. */
  last?: number;
}

const DAY = 86_400_000;

export function loved(r: SavedRecipe): boolean {
  return r.makeAgain !== false && r.steps.length > 0 && ((r.rating ?? 0) >= 4 || r.makeAgain === true || !!r.favorite);
}

function score(r: SavedRecipe, now: number): number {
  const stars = r.rating ?? (r.makeAgain || r.favorite ? 3.5 : 3);
  const last = lastMade(r);
  // Up to +1 for time away, full after 90 days. Never made: +0.5.
  const away = last === undefined ? 0.5 : Math.min(1, (now - last) / (90 * DAY));
  return stars + away + (r.makeAgain ? 0.5 : 0) + (r.favorite ? 0.3 : 0);
}

export function cookThisWeek(opts: {
  recipes: SavedRecipe[];
  /** This week's plan and the last weeks' (from loadWeek / pastPlans). */
  planned: WeekState["days"][];
  /** "Not this week" on a suggestion. */
  hidden?: Set<string>;
  now?: number;
  max?: number;
}): Suggestion[] {
  const now = opts.now ?? Date.now();
  const hidden = opts.hidden ?? new Set<string>();
  const recentPlan = new Set<string>();
  for (const days of opts.planned)
    for (const [k, meals] of Object.entries(days)) {
      const [y, m, d] = k.split("-").map(Number);
      const at = new Date(y, m - 1, d, 12).getTime();
      if (Math.abs(at - now) < NO_REPEAT_DAYS * DAY) for (const meal of meals) recentPlan.add(meal.id);
    }
  return opts.recipes
    .filter((r) => loved(r) && !hidden.has(r.id) && !recentPlan.has(r.id))
    .filter((r) => {
      const last = lastMade(r);
      return last === undefined || now - last >= NO_REPEAT_DAYS * DAY;
    })
    .map((r) => ({ recipe: r, last: lastMade(r), s: score(r, now) }))
    .sort((a, b) => b.s - a.s || (a.last ?? 0) - (b.last ?? 0) || a.recipe.title.localeCompare(b.recipe.title))
    .slice(0, opts.max ?? 3)
    .map(({ recipe, last }) => ({ recipe, last }));
}

/** "Not this week": remembered on this phone until next Sunday. */
const HIDDEN = "cardamix-cook-this-week-hidden";
export function weekStart(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay());
  return d.toDateString();
}
export function loadHidden(now = new Date()): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN) || "{}") as { week?: string; ids?: string[] };
    return new Set(v.week === weekStart(now) ? (v.ids ?? []) : []);
  } catch {
    return new Set();
  }
}
export function hideThisWeek(id: string, now = new Date()): Set<string> {
  const ids = loadHidden(now).add(id);
  try {
    localStorage.setItem(HIDDEN, JSON.stringify({ week: weekStart(now), ids: [...ids] }));
  } catch {
    /* session only */
  }
  return ids;
}
