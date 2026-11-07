import { findTimers } from "./timers";
import type { SavedRecipe, ScannedRecipe } from "./schema";

/**
 * Meal planning: "I want to eat at 6:00" → "start by 5:15".
 *
 * The estimate prefers, in order: the cook's own confirmed times for this
 * recipe, the total/prep/cook time stated on the recipe, and finally a rough
 * guess from the timed steps plus prep time per ingredient.
 */
export interface Estimate {
  minutes: number; // total to allow, rounded up to 5
  basis: "history" | "stated" | "guess";
  detail: string; // plain-language explanation
}

const SETUP = 5; // minutes to get out pans and ingredients

const roundUp5 = (m: number) => Math.max(5, Math.ceil(m / 5) * 5);
const sumMax = (text: string) => findTimers(text).reduce((s, t) => s + t.maxSeconds, 0) / 60;

/** Pulls total / prep / cook minutes out of the recipe's time line, e.g. "Prep: 5 mins; Cook: 20 mins". */
export function statedTimes(time: string | null): { total?: number; prep?: number; cook?: number; other?: number } {
  if (!time) return {};
  const out: { total?: number; prep?: number; cook?: number; other?: number } = {};
  for (const part of time.split(/[;·|\n]|,(?=\s*[A-Za-z]+\s*time)/i)) {
    const mins = sumMax(part);
    if (!mins) continue;
    if (/total|ready in/i.test(part)) out.total = mins;
    else if (/prep/i.test(part)) out.prep = (out.prep ?? 0) + mins;
    else if (/cook|bake|roast|simmer|chill|rest|grill|fry/i.test(part)) out.cook = (out.cook ?? 0) + mins;
    else out.other = (out.other ?? 0) + mins;
  }
  return out;
}

export function estimate(recipe: ScannedRecipe & { cookLog?: SavedRecipe["cookLog"] }): Estimate {
  const log = recipe.cookLog ?? [];
  if (log.length) {
    const recent = log.slice(-3);
    const avg = recent.reduce((s, l) => s + l.minutes, 0) / recent.length;
    return {
      minutes: roundUp5(avg),
      basis: "history",
      detail:
        recent.length === 1
          ? `Based on last time you made it (${Math.round(avg)} min).`
          : `Based on your last ${recent.length} times (about ${Math.round(avg)} min on average).`,
    };
  }

  const stated = statedTimes(recipe.time);
  const stepMinutes = recipe.steps.reduce((s, st) => s + sumMax(st.segments.map((g) => g.text).join("")), 0);
  // Rough hands-on time: measuring and chopping, plus moving between steps.
  const prepGuess = Math.min(30, recipe.ingredients.length * 1.5 + recipe.steps.length);

  if (stated.total) {
    return {
      minutes: roundUp5(stated.total + SETUP),
      basis: "stated",
      detail: `The recipe says ${Math.round(stated.total)} min in total, plus ${SETUP} min to get set up.`,
    };
  }
  if (stated.prep || stated.cook) {
    const prep = stated.prep ?? prepGuess;
    const cook = stated.cook ?? stepMinutes;
    return {
      minutes: roundUp5(prep + cook + SETUP),
      basis: "stated",
      detail: `${stated.prep ? `Prep ${Math.round(prep)} min (from the recipe)` : `About ${Math.round(prep)} min of prep`} + ${
        stated.cook ? `cooking ${Math.round(cook)} min (from the recipe)` : `about ${Math.round(cook)} min of timed steps`
      } + ${SETUP} min to get set up.`,
    };
  }
  const cook = Math.max(stepMinutes, stated.other ?? 0);
  return {
    minutes: roundUp5(prepGuess + cook + SETUP),
    basis: "guess",
    detail: `A rough guess: about ${Math.round(prepGuess)} min of prep${cook ? ` + ${Math.round(cook)} min of timed steps` : ""} + ${SETUP} min to get set up. After you cook it once, your real time is used.`,
  };
}

// ---------- saved plans ----------
export interface Plan {
  recipeId: string;
  title: string;
  eatAt: number; // ms
  startAt: number; // ms
  minutes: number;
  alerted?: boolean;
}

const KEY = "recipe-builder.plans";
let memory: Record<string, Plan> = {};

export function loadPlans(): Record<string, Plan> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as Record<string, Plan>;
  } catch {
    /* blocked */
  }
  // Forget plans whose meal time is more than 3 hours past.
  const cutoff = Date.now() - 3 * 3600_000;
  return Object.fromEntries(Object.entries(memory).filter(([, p]) => p.eatAt > cutoff));
}

function savePlans(p: Record<string, Plan>): void {
  memory = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* session only */
  }
}

export const getPlan = (id: string): Plan | undefined => loadPlans()[id];
export const setPlan = (p: Plan) => savePlans({ ...loadPlans(), [p.recipeId]: p });
export function clearPlan(id: string): void {
  const all = loadPlans();
  delete all[id];
  savePlans(all);
}
export const markAlerted = (id: string) => {
  const p = getPlan(id);
  if (p) setPlan({ ...p, alerted: true });
};

/** "18:30" today, or tomorrow if that time has already passed. */
export function nextOccurrence(hhmm: string, now = new Date()): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export function dayOf(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return diff === 0 ? "today" : diff === 1 ? "tomorrow" : d.toLocaleDateString([], { weekday: "long" });
}
export function untilText(ms: number, now = Date.now()): string {
  const mins = Math.round((ms - now) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return `in ${h} h${r ? ` ${r} min` : ""}`;
}

// ---------- calendar reminder ----------
const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

/** A calendar event at the start time with alerts 15 min before and at the start. */
export function reminderIcs(p: Plan, link: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Recipe Builder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${p.recipeId}-${p.eatAt}@recipe-builder`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(p.startAt)}`,
    `DTEND:${icsDate(p.eatAt)}`,
    `SUMMARY:${icsText(`Start cooking: ${p.title}`)}`,
    `DESCRIPTION:${icsText(`Start now to eat at ${timeOf(p.eatAt)} (allow about ${p.minutes} min).\nOpen the recipe: ${link}`)}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(`Start cooking ${p.title} in 15 minutes`)}`,
    "TRIGGER:-PT15M",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(`Time to start cooking ${p.title}`)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function googleCalendarUrl(p: Plan, link: string): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Start cooking: ${p.title}`,
    dates: `${icsDate(p.startAt)}/${icsDate(p.eatAt)}`,
    details: `Start now to eat at ${timeOf(p.eatAt)}. Open the recipe: ${link}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
