import { add, compare, formatQty, isEmpty, parseQty, subtract, type Qty } from "./qty";
import { scaleAmount } from "./quantity";
import { nameKey } from "./shopping";
import type { ScannedRecipe } from "./schema";

/**
 * The pantry: roughly how much of each ingredient should be on hand.
 * Purchases (ticking items on the shopping list) add to it; making a recipe
 * subtracts what it used. Amounts are estimates — the cook can correct them.
 */
export interface PantryItem {
  key: string; // nameKey(name), shared with the shopping list
  name: string;
  qty: Qty | null; // null = "have some, amount unknown"
  boughtAt?: number;
  updatedAt: number;
}

export type Pantry = Record<string, PantryItem>;

const KEY = "recipe-builder.pantry";
let memory: Pantry = {};

export function loadPantry(): Pantry {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as Pantry;
  } catch {
    /* blocked */
  }
  return memory;
}

export function savePantry(p: Pantry): void {
  memory = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* session only */
  }
}

/** Sets one item (or removes it with null). Returns the previous value, for undo. */
export function setItem(key: string, item: PantryItem | null): PantryItem | null {
  const p = { ...loadPantry() };
  const before = p[key] ?? null;
  if (item) p[key] = item;
  else delete p[key];
  savePantry(p);
  return before;
}

/** Adds a purchase. Returns what the item was before, so unticking can undo it. */
export function recordPurchase(name: string, amountText: string): PantryItem | null {
  const key = nameKey(name);
  const bought = parseQty(amountText, name);
  const prev = loadPantry()[key];
  // Add to what's there if the units can be combined; otherwise the purchase replaces it.
  const qty = prev?.qty && bought ? (add(prev.qty, bought, name) ?? bought) : bought;
  return setItem(key, { key, name: prev?.name ?? name, qty, boughtAt: Date.now(), updatedAt: Date.now() });
}

export interface UseResult {
  name: string;
  left: string; // "≈ 3 lb left" or "used up"
}

/**
 * Subtracts a recipe's ingredients (at the size made) from the pantry.
 * Returns what changed plus a snapshot to undo it.
 */
export function useForRecipe(recipe: ScannedRecipe, scale: number): { changes: UseResult[]; undo: Record<string, PantryItem | null> } {
  const pantry = { ...loadPantry() };
  const changes: UseResult[] = [];
  const undo: Record<string, PantryItem | null> = {};
  for (const ing of recipe.ingredients) {
    const key = nameKey(ing.name);
    const item = pantry[key];
    if (!item?.qty) continue;
    const used = parseQty(scaleAmount([ing.quantity, ing.unit].filter(Boolean).join(" "), scale), ing.name);
    if (!used) continue;
    const left = subtract(item.qty, used, ing.name);
    if (!left) continue; // can't compare (e.g. pounds vs cups of something with no known weight)
    if (!(key in undo)) undo[key] = item;
    if (isEmpty(left)) {
      delete pantry[key];
      changes.push({ name: item.name, left: "used up" });
    } else {
      pantry[key] = { ...item, qty: left, updatedAt: Date.now() };
      changes.push({ name: item.name, left: `≈ ${formatQty(left)} left` });
    }
  }
  savePantry(pantry);
  return { changes, undo };
}

export function restore(undo: Record<string, PantryItem | null>): void {
  const p = { ...loadPantry() };
  for (const [k, v] of Object.entries(undo)) {
    if (v) p[k] = v;
    else delete p[k];
  }
  savePantry(p);
}

export type PantryStatus =
  | { kind: "none" }
  | { kind: "unknown"; item: PantryItem } // have some, can't tell how much vs. what's needed
  | { kind: "enough"; item: PantryItem }
  | { kind: "some"; item: PantryItem; short: Qty };

/** How the pantry compares with what a shopping-list item needs. */
export function statusFor(key: string, name: string, need: Qty | null): PantryStatus {
  const item = loadPantry()[key];
  if (!item) return { kind: "none" };
  if (!item.qty || !need) return { kind: "unknown", item };
  const c = compare(item.qty, need, name);
  if (!c) return { kind: "unknown", item };
  return c.status === "enough" ? { kind: "enough", item } : { kind: "some", item, short: c.short };
}

export const boughtWhen = (item: PantryItem) =>
  item.boughtAt ? new Date(item.boughtAt).toLocaleDateString([], { month: "short", day: "numeric" }) : null;
