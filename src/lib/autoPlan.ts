import { madeDays } from "./made";
import type { Leftover } from "./leftovers";
import type { SavedRecipe } from "./schema";
import { dayKey, type PlannedMeal, type WeekState } from "./week";

/**
 * "Fill my week": picks dinners for the empty days.
 * - Never the same recipe within 14 days of when it was last made or planned
 *   (past plans, recipes made, and the days ahead all count).
 * - A meal that makes more than one dinner's worth is followed by 1–2
 *   leftovers nights (from its servings and how many people you cook for).
 * - Leftovers already in the fridge are eaten first.
 * - Favors recipes you rated highly or would make again; skips ones you
 *   wouldn't, and desserts, sides, drinks and the like.
 * Days you planned yourself are left alone.
 */
export const NO_REPEAT_DAYS = 14;
const NOT_A_DINNER = /\b(desserts?|sides?|side dish|drinks?|beverages?|appetizers?|snacks?|breakfast|brunch|baking|breads?|sauces?|dips?|dressings?|condiments?|cookies?|cakes?|pies?|candy|treats?)\b/i;
const SWEET_TITLE = /\b(cookies?|cakes?|cupcakes?|brownies?|muffins?|fudge|frosting|icing|dip|dressing|sauce|smoothie|lemonade|punch)\b/i;

const DINNER_TAG = /\b(dinner|supper|main|main dish|entr[eé]e|lunch)\b/i;

/** A dinner tag always counts (e.g. "Dinner" + "Baking"); otherwise desserts, sides and the like are skipped. */
export const isDinner = (r: SavedRecipe) =>
  r.makeAgain !== false &&
  r.steps.length > 0 &&
  ((r.tags ?? []).some((t) => DINNER_TAG.test(t)) || (!(r.tags ?? []).some((t) => NOT_A_DINNER.test(t)) && !SWEET_TITLE.test(r.title)));

/** "Serves 6", "6-8 servings", "Makes 4 bowls" → 6 / 6 / 4; null if it doesn't say. */
export function servingsCount(servings: string | null): number | null {
  const m = servings?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** How many leftovers nights after cooking this for `people` (0–2). Unknown servings count as 4. */
export function leftoverNights(r: SavedRecipe, people: number, scale = 1): number {
  const s = (servingsCount(r.servings) ?? 4) * scale;
  return Math.max(0, Math.min(2, Math.floor(s / Math.max(1, people)) - 1));
}

const weight = (r: SavedRecipe) =>
  Math.max(0.3, 1 + (r.rating ? (r.rating - 3) * 0.5 : 0)) + (r.makeAgain ? 0.5 : 0) + (r.favorite ? 0.3 : 0);

function pick<T>(items: T[], w: (t: T) => number, random: () => number): T | undefined {
  const total = items.reduce((s, x) => s + w(x), 0);
  let r = random() * total;
  for (const x of items) {
    r -= w(x);
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

export interface FillResult {
  week: WeekState;
  cooked: number; // new dinners picked
  leftovers: number; // leftovers nights
  short: number; // days left empty (not enough different recipes)
}

export function fillWeek(opts: {
  week: WeekState; // today onwards
  past: WeekState["days"];
  recipes: SavedRecipe[];
  fridge: Leftover[];
  people: number;
  days: string[]; // the day keys to fill, in order
  random?: () => number;
  now?: Date;
}): FillResult {
  const { recipes, people, days, random = Math.random } = opts;
  const now = opts.now ?? new Date();
  const dayIndex = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const a = new Date(y, m - 1, d, 12);
    const t = new Date(now);
    t.setHours(12, 0, 0, 0);
    return Math.round((a.getTime() - t.getTime()) / 86400000);
  };
  const msIndex = (ms: number) => dayIndex(dayKey(new Date(ms)));

  // Start over on the days "Fill my week" picked before; keep the cook's own choices.
  const plan: Record<string, PlannedMeal[]> = {};
  for (const [k, v] of Object.entries(opts.week.days)) {
    const own = v.filter((m) => !m.auto);
    if (own.length) plan[k] = own;
  }

  // When each recipe was (or will be) eaten, as day numbers from today.
  const when = new Map<string, number[]>();
  const note = (id: string, i: number) => when.set(id, [...(when.get(id) ?? []), i]);
  for (const r of recipes) for (const ms of madeDays(r)) note(r.id, msIndex(ms));
  for (const [k, v] of Object.entries(opts.past)) for (const m of v) if (!m.leftover) note(m.id, dayIndex(k));
  for (const [k, v] of Object.entries(plan)) for (const m of v) if (!m.leftover) note(m.id, dayIndex(k));
  const free = (id: string, i: number) => (when.get(id) ?? []).every((j) => Math.abs(j - i) >= NO_REPEAT_DAYS);

  let cooked = 0, leftovers = 0, short = 0;
  const empty = (k: string) => !(plan[k]?.length);

  // Leftovers already in the fridge go first, one night each, before they're past their date.
  const fridge = opts.fridge.filter((l) => !l.frozen && l.eatBy >= now.getTime()).sort((a, b) => a.eatBy - b.eatBy);
  for (const l of fridge) {
    const k = days.find((d) => empty(d) && dayIndex(d) <= msIndex(l.eatBy));
    if (!k || !recipes.some((r) => r.id === l.id)) continue;
    plan[k] = [{ id: l.id, scale: 1, auto: true, leftover: true }];
    note(l.id, msIndex(l.madeAt)); // it was just cooked: don't plan it again soon
    note(l.id, dayIndex(k));
    leftovers++;
  }

  const dinners = recipes.filter(isDinner);
  for (let n = 0; n < days.length; n++) {
    const k = days[n];
    if (!empty(k)) continue;
    const i = dayIndex(k);
    const choice = pick(dinners.filter((r) => free(r.id, i)), weight, random);
    if (!choice) {
      short++;
      continue;
    }
    plan[k] = [{ id: choice.id, scale: 1, auto: true }];
    note(choice.id, i);
    cooked++;
    // Leftovers nights straight after, on days that are still free.
    let left = leftoverNights(choice, people);
    for (let j = n + 1; j < days.length && left > 0 && empty(days[j]); j++, left--) {
      plan[days[j]] = [{ id: choice.id, scale: 1, auto: true, leftover: true }];
      leftovers++;
    }
  }
  return { week: { days: plan }, cooked, leftovers, short };
}

// ---------- how many people ----------
const PEOPLE_KEY = "recipe-builder.people";
export function getPeople(): number {
  try {
    const n = Number(localStorage.getItem(PEOPLE_KEY));
    if (n >= 1 && n <= 20) return n;
  } catch {
    /* blocked */
  }
  return 4;
}
export function setPeople(n: number): void {
  try {
    localStorage.setItem(PEOPLE_KEY, String(n));
  } catch {
    /* session only */
  }
}

/**
 * One dinner idea for a day: a dinner recipe not made or planned within 14
 * days, favoring ones rated well. Undefined if there's none.
 */
export function suggestDinner(opts: {
  recipes: SavedRecipe[];
  past: WeekState["days"];
  week: WeekState;
  skip?: Set<string>;
  random?: () => number;
  now?: Date;
}): SavedRecipe | undefined {
  const { recipes, skip = new Set(), random = Math.random } = opts;
  const now = opts.now ?? new Date();
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const daysFrom = (ms: number) => Math.round((new Date(new Date(ms).setHours(12, 0, 0, 0)).getTime() - today.getTime()) / 86400000);
  const keyDays = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return daysFrom(new Date(y, m - 1, d, 12).getTime());
  };
  const recent = new Set<string>();
  for (const r of recipes) if (madeDays(r).some((ms) => Math.abs(daysFrom(ms)) < NO_REPEAT_DAYS)) recent.add(r.id);
  for (const days of [opts.past, opts.week.days])
    for (const [k, v] of Object.entries(days)) for (const m of v) if (!m.leftover && Math.abs(keyDays(k)) < NO_REPEAT_DAYS) recent.add(m.id);
  return pick(recipes.filter((r) => isDinner(r) && !recent.has(r.id) && !skip.has(r.id)), weight, random);
}
