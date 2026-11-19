import type { Qty } from "./qty";

/**
 * Pantry food that was about to go bad (due today or within 3 days) and got
 * used in a recipe you made — for "You saved $X" (savings.ts).
 */
const DAY = 86_400_000;

export interface Rescued {
  key: string;
  name: string;
  qty: Qty;
  at: number;
}
const RESCUED_KEY = "recipe-builder.rescued";
export function loadRescued(): Rescued[] {
  try {
    const v = JSON.parse(localStorage.getItem(RESCUED_KEY) ?? "[]");
    return Array.isArray(v) ? (v as Rescued[]) : [];
  } catch {
    return [];
  }
}
function saveRescued(list: Rescued[]) {
  try {
    localStorage.setItem(RESCUED_KEY, JSON.stringify(list.slice(-400)));
  } catch {
    /* this visit only */
  }
}
/** Making a recipe used up pantry food that was about to go bad. */
export function noteRescued(items: Omit<Rescued, "at">[], now = Date.now()): void {
  if (items.length) saveRescued([...loadRescued(), ...items.map((i) => ({ ...i, at: now }))]);
}
/** "Made it" was undone: take back what it noted today for these items. */
export function forgetRescued(keys: string[], now = Date.now()): void {
  const k = new Set(keys);
  saveRescued(loadRescued().filter((r) => !(k.has(r.key) && now - r.at < DAY)));
}

