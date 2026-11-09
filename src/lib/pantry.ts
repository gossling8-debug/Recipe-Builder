import { add, compare, formatQty, isEmpty, parseQty, subtract, type Qty } from "./qty";
import { scaleAmount } from "./quantity";
import { ingredientName, nameKey } from "./shopping";
import { estimateUseBy, freshness } from "./shelfLife";
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
  /** Use-by time (ms). Estimated from typical shelf life unless the cook set it. */
  useBy?: number;
  useByEstimated?: boolean;
  /** The cook chose "No date" — don't estimate one again. */
  noUseBy?: boolean;
  /** How much was bought last time (to tell when an "always keep" staple is running low). */
  lastBought?: Qty;
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
  return fillDates(rekey(memory));
}

/**
 * Perishables saved without a date (e.g. bought before use-by dates existed)
 * get an estimate from when they were bought — the cook never has to say what's
 * perishable. Items the cook set to "No date" are left alone.
 */
function fillDates(p: Pantry): Pantry {
  let changed = false;
  const out: Pantry = {};
  for (const [k, it] of Object.entries(p)) {
    if (it.useBy === undefined && !it.noUseBy) {
      const est = estimateUseBy(it.name, it.boughtAt ?? it.updatedAt);
      if (est !== null) {
        out[k] = { ...it, useBy: est, useByEstimated: true };
        changed = true;
        continue;
      }
    }
    out[k] = it;
  }
  if (!changed) return p;
  savePantry(out);
  return out;
}

/**
 * Items saved under an older matching rule are moved to the current key, and
 * merged if two now mean the same thing ("all-purpose flour" + "flour").
 */
function rekey(p: Pantry): Pantry {
  if (Object.values(p).every((it) => it.key === nameKey(it.name))) return p;
  const out: Pantry = {};
  for (const it of Object.values(p)) {
    const key = nameKey(it.name);
    const prev = out[key];
    if (!prev) out[key] = { ...it, key };
    else {
      const merged = prev.qty && it.qty ? add(prev.qty, it.qty, it.name) : null;
      const useBy = Math.min(prev.useBy ?? Infinity, it.useBy ?? Infinity);
      out[key] = merged
        ? {
            ...prev,
            qty: merged,
            boughtAt: Math.max(prev.boughtAt ?? 0, it.boughtAt ?? 0) || undefined,
            updatedAt: Date.now(),
            useBy: Number.isFinite(useBy) ? useBy : undefined,
          }
        : it.updatedAt > prev.updatedAt
          ? { ...it, key }
          : prev;
    }
  }
  savePantry(out);
  return out;
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
  // Perishables get an estimated use-by date. Adding to what's already there
  // keeps the earlier date — the older portion goes bad first.
  const estimate = estimateUseBy(name);
  const useBy = prev?.useBy ?? estimate ?? undefined;
  const useByEstimated = prev?.useBy ? prev.useByEstimated : estimate !== null;
  return setItem(key, {
    key,
    name: prev?.name ?? name,
    qty,
    boughtAt: Date.now(),
    updatedAt: Date.now(),
    useBy,
    useByEstimated,
    lastBought: bought ?? prev?.lastBought,
  });
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
    const key = nameKey(ingredientName(ing));
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
  | { kind: "expired"; item: PantryItem } // in the pantry but past its use-by date — doesn't count
  | { kind: "enough"; item: PantryItem }
  | { kind: "some"; item: PantryItem; short: Qty };

/** How the pantry compares with what a shopping-list item needs. */
export function statusFor(key: string, name: string, need: Qty | null): PantryStatus {
  const item = loadPantry()[key];
  if (!item) return { kind: "none" };
  if (item.useBy !== undefined && freshness(item.useBy) === "past") return { kind: "expired", item };
  if (!item.qty || !need) return { kind: "unknown", item };
  const c = compare(item.qty, need, name);
  if (!c) return { kind: "unknown", item };
  return c.status === "enough" ? { kind: "enough", item } : { kind: "some", item, short: c.short };
}

export const boughtWhen = (item: PantryItem) =>
  item.boughtAt ? new Date(item.boughtAt).toLocaleDateString([], { month: "short", day: "numeric" }) : null;

export interface UseSoon {
  item: PantryItem;
  recipes: { id: string; title: string }[];
}

/** Pantry items past their date or within 3 days, soonest first, with recipes that use them. */
export function useSoon(recipes: { id: string; title: string; ingredients: { name: string }[] }[], now = Date.now()): UseSoon[] {
  const soon = Object.values(loadPantry())
    .filter((it) => it.useBy !== undefined && freshness(it.useBy, now) !== "ok")
    .sort((a, b) => a.useBy! - b.useBy!);
  return soon.map((item) => ({
    item,
    recipes: recipes.filter((r) => r.ingredients.some((i) => nameKey(i.name) === item.key)).map((r) => ({ id: r.id, title: r.title })),
  }));
}
