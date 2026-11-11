import { ingredientName, nameKey } from "./shopping";
import { parseQty } from "./qty";
import { scaleAmount } from "./quantity";
import type { ScannedRecipe } from "./schema";

/**
 * Thaw reminders: frozen ingredients need to move from the freezer to the
 * fridge ahead of time. Times follow USDA fridge-thawing guidance: about a
 * day for most cuts and seafood, and about a day per 4–5 lb for big items
 * like a whole turkey or a roast.
 *
 * Meat and seafood are often bought fresh, so each ingredient can be marked
 * "Not frozen" and isn't mentioned again.
 */
export interface ThawItem {
  key: string; // nameKey — what "Not frozen" remembers
  name: string;
  days: number; // days in the fridge
}

const NOT_MEAT = /\b(broth|stock|bouillon|powder|gravy|sauce|seasoning|bits|jerky|canned|deli|lunch meat|rotisserie|cooked|smoked salmon|anchov|bacon|hot dogs?|pepperoni|salami)\b/;
const BIG_ITEM = /\b(whole turkey|turkey(?! breast| thigh| leg| wing| tender| cutlet| ground|bacon|sausage)|roast|brisket|\bham\b|leg of lamb|pork shoulder|pork butt|prime rib|whole chicken|roasting chicken)\b/;
const MEAT_OR_SEAFOOD =
  /\b(chicken|turkey|beef|steaks?|pork|lamb|veal|sausages?|ground (beef|turkey|pork|chicken)|hamburger|meatballs?|ribs?|chops?|tenderloin|fish|salmon|tilapia|cod|halibut|tuna steak|shrimp|prawns?|scallops?|crab|lobster|mussels?|clams?)\b/;

/** Ingredients in a recipe that may need thawing, and how many days in the fridge. */
export function thawItems(recipe: ScannedRecipe, scale = 1): ThawItem[] {
  const out = new Map<string, ThawItem>();
  for (const ing of recipe.ingredients) {
    const name = ingredientName(ing);
    const text = `${name} ${ing.preparation ?? ""}`.toLowerCase();
    if (!name.trim()) continue;
    const saysThawed = /\b(thawed|defrosted)\b/.test(text);
    const isMeat = MEAT_OR_SEAFOOD.test(text) && !NOT_MEAT.test(text);
    if (!saysThawed && !isMeat) continue;

    let days = 1;
    if (isMeat && BIG_ITEM.test(text)) {
      // About a day per 4–5 lb; assume a typical size when the card doesn't say.
      const q = parseQty(scaleAmount([ing.quantity, ing.unit].filter(Boolean).join(" "), scale), name);
      // …or a weight in the name, like "turkey (14 lb)".
      const inName = name.match(/\(([^)]*\b(?:lbs?|pounds?|kg)\b[^)]*)\)/i);
      const q2 = inName ? parseQty(inName[1], name) : null;
      const lb = q?.kind === "weight" ? q.g / 453.6 : q2?.kind === "weight" ? (q2.g / 453.6) * (q?.kind === "count" ? q.n * scale : scale) : null;
      const typical = /turkey/.test(text) ? 12 : /chicken/.test(text) ? 5 : 4;
      days = Math.max(1, Math.ceil((lb ?? typical) / 4.5));
    }
    const key = nameKey(name);
    const prev = out.get(key);
    if (!prev || prev.days < days) out.set(key, { key, name: name.toLowerCase(), days });
  }
  return [...out.values()];
}

// ---------- reminders for planned meals ----------
export interface PlannedThawMeal {
  recipeId: string;
  title: string;
  recipe: ScannedRecipe;
  scale: number;
  at: number; // when it's eaten (ms)
}

export interface ThawReminder {
  id: string; // recipe + meal day + ingredient
  recipeId: string;
  title: string;
  item: ThawItem;
  moveBy: number; // move it to the fridge by this time (ms)
  mealAt: number;
}

const DAY = 86_400_000;
const eveningOf = (ms: number) => {
  const d = new Date(ms);
  d.setHours(19, 0, 0, 0);
  return d.getTime();
};
const dayKeyOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/**
 * One reminder per frozen ingredient per planned meal: move it to the fridge
 * on the evening `days` days before the meal. Skips ingredients marked "Not
 * frozen", reminders already done, and meals that have passed.
 */
export function thawReminders(meals: PlannedThawMeal[], now = Date.now()): ThawReminder[] {
  const notFrozen = new Set(loadNotFrozen());
  const done = new Set(loadDone());
  const out: ThawReminder[] = [];
  for (const m of meals) {
    if (m.at <= now) continue;
    for (const item of thawItems(m.recipe, m.scale)) {
      if (notFrozen.has(item.key)) continue;
      const id = `${m.recipeId}|${dayKeyOf(m.at)}|${item.key}`;
      if (done.has(id)) continue;
      out.push({ id, recipeId: m.recipeId, title: m.title, item, moveBy: eveningOf(m.at - item.days * DAY), mealAt: m.at });
    }
  }
  return out.sort((a, b) => a.moveBy - b.moveBy || a.title.localeCompare(b.title));
}

/** "now" (late), "today", "tomorrow", "Wednesday" — when to move it to the fridge. */
export function whenText(moveBy: number, now = Date.now()): "late" | "today" | "tomorrow" | string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((moveBy - start.getTime()) / DAY);
  if (moveBy < now && days < 0) return "late";
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return new Date(moveBy).toLocaleDateString([], { weekday: "long" });
}

/** Thawing that should happen today, or already should have (the meal is still ahead). */
export const dueNow = (list: ThawReminder[], now = Date.now()) => list.filter((r) => ["late", "today"].includes(whenText(r.moveBy, now)));

/** USDA cold-water thawing: about 30 minutes per pound, then cook right away. */
export const COLD_WATER_TIP = "Running late? Thaw it sealed in cold water, changing the water every 30 minutes (about 30 minutes per pound), then cook it right away.";

// ---------- remembered choices ----------
const NOT_FROZEN_KEY = "recipe-builder.thaw.notFrozen";
const DONE_KEY = "recipe-builder.thaw.done";
const memory: Record<string, string[]> = {};
function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* blocked */
  }
  return memory[key] ?? [];
}
function write(key: string, list: string[]) {
  memory[key] = list;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* session only */
  }
  if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event("thaw-changed")));
}

export const loadNotFrozen = () => read(NOT_FROZEN_KEY);
export const markNotFrozen = (key: string) => write(NOT_FROZEN_KEY, [...new Set([...loadNotFrozen(), key])]);
export const unmarkNotFrozen = (key: string) => write(NOT_FROZEN_KEY, loadNotFrozen().filter((k) => k !== key));
export const loadDone = () => read(DONE_KEY);
export const markThawed = (id: string) => write(DONE_KEY, [...loadDone(), id].slice(-300));

// ---------- calendar ----------
const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

/** One calendar file with an alert at each "move it to the fridge" time. */
export function thawIcs(list: ThawReminder[], link: (r: ThawReminder) => string, now = Date.now()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cardamix//EN", "CALSCALE:GREGORIAN"];
  for (const r of list) {
    const meal = new Date(r.mealAt).toLocaleDateString([], { weekday: "long" });
    lines.push(
      "BEGIN:VEVENT",
      `UID:thaw-${r.id.replace(/[^a-z0-9]/gi, "-")}@recipe-builder`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(r.moveBy)}`,
      `DTEND:${icsDate(r.moveBy + 15 * 60000)}`,
      `SUMMARY:${icsText(`Thaw: move ${r.item.name} to the fridge`)}`,
      `DESCRIPTION:${icsText(`For ${r.title} on ${meal}. Thawing in the fridge takes about ${r.item.days} ${r.item.days === 1 ? "day" : "days"}.\nOpen the recipe: ${link(r)}`)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(`Move ${r.item.name} from the freezer to the fridge`)}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
