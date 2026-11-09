import { isBasic } from "./canMake";
import { convert, parseQty, type Qty } from "./qty";
import { scaleAmount } from "./quantity";
import { nameKey } from "./shopping";
import type { ScannedRecipe } from "./schema";

/**
 * What the cook actually paid, typed in when ticking items off the shopping
 * list. Used for weekly spending and a rough cost per recipe and serving.
 * Store prices can't be looked up reliably, so only the cook's own prices count.
 */
export interface PriceEntry {
  id: string;
  key: string; // nameKey
  name: string;
  qty: Qty | null; // how much was bought for that price
  price: number; // dollars
  at: number;
}

const KEY = "recipe-builder.prices";
let memory: PriceEntry[] = [];

export function loadPrices(): PriceEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as PriceEntry[];
  } catch {
    /* blocked */
  }
  return memory;
}

function save(list: PriceEntry[]) {
  memory = list.slice(-1000);
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* session only */
  }
}

/** "$3.48", "3.48", "3" → 3.48 / 3; null if it isn't a price. */
export function parsePrice(text: string): number | null {
  const m = text.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d{1,2})?)$/);
  return m ? Number(m[1]) : null;
}

export function addPrice(name: string, amountText: string, price: number, at = Date.now()): string {
  const id = `${at}-${Math.random().toString(36).slice(2, 8)}`;
  save([...loadPrices(), { id, key: nameKey(name), name, qty: parseQty(amountText, name), price, at }]);
  return id;
}

export function deletePrice(id: string): void {
  save(loadPrices().filter((p) => p.id !== id));
}

export const spentSince = (from: number) => loadPrices().filter((p) => p.at >= from).reduce((s, p) => s + p.price, 0);

/** Start of this week (Sunday) and of this month. */
export function periodStarts(now = new Date()): { week: number; month: number } {
  const w = new Date(now);
  w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() - w.getDay());
  const m = new Date(now.getFullYear(), now.getMonth(), 1);
  return { week: w.getTime(), month: m.getTime() };
}

const amount = (q: Qty) => (q.kind === "volume" ? q.tsp : q.kind === "weight" ? q.g : q.n);

export interface RecipeCost {
  total: number; // dollars, for the ingredients that have a price
  priced: number; // ingredients with a price
  of: number; // ingredients that cost something (salt, water etc. left out)
}

/** Rough cost of a recipe at a size, from the latest price paid for each ingredient. */
export function recipeCost(r: ScannedRecipe, scale: number, prices = loadPrices()): RecipeCost {
  const latest = new Map<string, PriceEntry>();
  for (const p of prices) if (p.qty && (!latest.has(p.key) || latest.get(p.key)!.at <= p.at)) latest.set(p.key, p);
  let total = 0;
  let priced = 0;
  let of = 0;
  for (const ing of r.ingredients) {
    if (!ing.name.trim() || isBasic(ing.name)) continue;
    of++;
    const p = latest.get(nameKey(ing.name));
    const need = parseQty(scaleAmount([ing.quantity, ing.unit].filter(Boolean).join(" "), scale), ing.name);
    if (!p?.qty || !need) continue;
    const same = convert(need, p.qty, ing.name);
    if (!same || amount(p.qty) <= 0) continue;
    total += p.price * (amount(same) / amount(p.qty));
    priced++;
  }
  return { total, priced, of };
}

export const dollars = (n: number) => `$${n.toFixed(2)}`;
