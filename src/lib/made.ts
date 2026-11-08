import type { SavedRecipe } from "./schema";

/**
 * When a recipe was made: "I made this", "Made it today" and finishing in
 * cooking mode all count. Several on the same day count once.
 */
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** One timestamp per day it was made, oldest first. */
export function madeDays(r: Pick<SavedRecipe, "madeOn" | "cookLog">): number[] {
  const all = [...(r.madeOn ?? []), ...(r.cookLog ?? []).map((l) => l.at)].sort((a, b) => a - b);
  const seen = new Set<string>();
  return all.filter((ms) => {
    const k = dayKey(ms);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const lastMade = (r: Pick<SavedRecipe, "madeOn" | "cookLog">): number | undefined => madeDays(r).at(-1);
export const madeToday = (r: Pick<SavedRecipe, "madeOn" | "cookLog">, now = Date.now()) => {
  const last = lastMade(r);
  return last !== undefined && dayKey(last) === dayKey(now);
};

/** Adds today (unless it's already counted). */
export function markMade(r: SavedRecipe, now = Date.now()): SavedRecipe {
  return madeToday(r, now) ? r : { ...r, madeOn: [...(r.madeOn ?? []), now] };
}

/** Removes today's "made" mark (cooking-mode times are kept). */
export function unmarkMadeToday(r: SavedRecipe, now = Date.now()): SavedRecipe {
  return { ...r, madeOn: (r.madeOn ?? []).filter((ms) => dayKey(ms) !== dayKey(now)) };
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "Mar 4", "Mar 4, 2025" */
export function agoText(ms: number, now = Date.now()): string {
  const start = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((start(now) - start(ms)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 35) {
    const w = Math.round(days / 7);
    return `${w} ${w === 1 ? "week" : "weeks"} ago`;
  }
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}
