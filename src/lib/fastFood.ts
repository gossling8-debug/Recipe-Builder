/**
 * Fast food spending, kept apart from groceries: its own list and totals,
 * never part of the grocery budget, grocery totals or price comparisons.
 * Synced with the account like the rest of the budget.
 */
export interface FastFoodEntry {
  id: string;
  /** Dollars. */
  amount: number;
  /** Where ("Chick-fil-A"), when given. */
  place: string | null;
  at: number;
}

const KEY = "recipe-builder.fastFood";
let memory: FastFoodEntry[] = [];

export function loadFastFood(): FastFoodEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return memory;
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v.filter((e) => e && typeof e.amount === "number" && typeof e.at === "number") as FastFoodEntry[]) : [];
  } catch {
    return memory;
  }
}
function save(all: FastFoodEntry[]) {
  memory = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* kept for this visit */
  }
}

/** Adds a fast food purchase. Returns it, or null for an amount that isn't a positive number. */
export function addFastFood(amount: number, place: string | null, at = Date.now()): FastFoodEntry | null {
  if (!(amount > 0) || !Number.isFinite(amount)) return null;
  const e: FastFoodEntry = {
    id: `${at}-${Math.random().toString(36).slice(2, 8)}`,
    amount: Math.round(amount * 100) / 100,
    place: place?.trim().slice(0, 60) || null,
    at,
  };
  save([...loadFastFood(), e]);
  return e;
}

export function deleteFastFood(id: string): void {
  save(loadFastFood().filter((e) => e.id !== id));
}

/** Purchases since `from`, newest first. */
export const fastFoodSince = (from: number, all = loadFastFood()) => all.filter((e) => e.at >= from).sort((a, b) => b.at - a.at);

export const fastFoodTotal = (from: number, all = loadFastFood()) => fastFoodSince(from, all).reduce((s, e) => s + e.amount, 0);

/** Places used before, most used first (for suggestions). */
export function fastFoodPlaces(all = loadFastFood()): string[] {
  const n = new Map<string, number>();
  for (const e of all) if (e.place) n.set(e.place, (n.get(e.place) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p);
}
