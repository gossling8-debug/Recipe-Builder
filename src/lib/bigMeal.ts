import { estimate, reminderIcs, type Plan } from "./plan";
import { findTimers } from "./timers";
import type { SavedRecipe } from "./schema";

/**
 * Several dishes ready at the same time: when to start each one, and where
 * two of them need the oven at different temperatures at the same time.
 * Times come from the same estimate as a single meal plan (your own past
 * times first, then the recipe's stated times, then a guess).
 */
export interface DishTiming {
  recipe: SavedRecipe;
  minutes: number;
  startAt: number;
  basis: "history" | "stated" | "guess";
  oven: { tempF: number; minutes: number } | null;
}

/** Oven temperature (°F) and roughly how long the dish is in the oven. */
export function ovenUse(r: SavedRecipe): { tempF: number; minutes: number } | null {
  const texts = [r.time ?? "", ...r.steps.map((s) => s.segments.map((g) => g.text).join(""))];
  let tempF: number | null = null;
  // The first oven-range temperature (skips food temperatures like "until 165°F").
  search: for (const t of texts)
    for (const m of t.matchAll(/(\d{3})\s*(?:°\s*|degrees?\s*)([FC])?\b/gi)) {
      const n = Number(m[1]);
      const f = m[2]?.toUpperCase() === "C" ? Math.round((n * 9) / 5 + 32) : n;
      if (f >= 200 && f <= 550) {
        tempF = f;
        break search;
      }
    }
  if (tempF === null) return null;
  // Time in the oven: timed steps that bake/roast, else the stated cook time.
  const ovenSteps = r.steps
    .map((s) => s.segments.map((g) => g.text).join(""))
    .filter((t) => /\b(bake|roast|oven|broil)\b/i.test(t) && !/preheat oven to \d+[^.]*\.?\s*$/i.test(t.trim()));
  let minutes = ovenSteps.reduce((sum, t) => sum + findTimers(t).reduce((s, x) => s + x.maxSeconds, 0) / 60, 0);
  if (!minutes) {
    const m = (r.time ?? "").match(/(?:bake|roast|cook)[^;·|\n]*/i);
    if (m) minutes = findTimers(m[0]).reduce((s, x) => s + x.maxSeconds, 0) / 60;
  }
  return minutes ? { tempF, minutes: Math.round(minutes) } : null;
}

export function timeline(recipes: SavedRecipe[], eatAt: number): DishTiming[] {
  return recipes
    .map((recipe) => {
      const e = estimate(recipe);
      return { recipe, minutes: e.minutes, basis: e.basis, startAt: eatAt - e.minutes * 60000, oven: ovenUse(recipe) };
    })
    .sort((a, b) => a.startAt - b.startAt || a.recipe.title.localeCompare(b.recipe.title));
}

export interface OvenClash {
  a: DishTiming;
  b: DishTiming;
  from: number; // when the overlap starts (ms)
}

/**
 * Dishes in the oven at the same time at temperatures more than 25°F apart.
 * Each dish is assumed to come out of the oven when it's time to eat.
 */
export function ovenClashes(dishes: DishTiming[], eatAt: number): OvenClash[] {
  const inOven = dishes.filter((d) => d.oven);
  const out: OvenClash[] = [];
  for (let i = 0; i < inOven.length; i++)
    for (let j = i + 1; j < inOven.length; j++) {
      const a = inOven[i], b = inOven[j];
      if (Math.abs(a.oven!.tempF - b.oven!.tempF) <= 25) continue;
      const from = eatAt - Math.min(a.oven!.minutes, b.oven!.minutes) * 60000;
      out.push({ a, b, from });
    }
  return out;
}

/** One calendar file with a start reminder for each dish. */
export function bigMealIcs(plans: Plan[], link: (p: Plan) => string): string {
  const events = plans.map((p) => {
    const ics = reminderIcs(p, link(p));
    return ics.slice(ics.indexOf("BEGIN:VEVENT"), ics.indexOf("END:VCALENDAR"));
  });
  const one = reminderIcs(plans[0], link(plans[0]));
  return one.slice(0, one.indexOf("BEGIN:VEVENT")) + events.join("") + "END:VCALENDAR\r\n";
}
