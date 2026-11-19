import { isDinner } from "./autoPlan";
import { madeDays } from "./made";
import { convert, type Qty } from "./qty";
import { recipeCost, unitPrice, type PriceEntry } from "./prices";
import type { FastFoodEntry } from "./fastFood";
import type { Rescued } from "./rescued";
import type { ScannedRecipe, SavedRecipe } from "./schema";

/**
 * "You saved $X": money saved, counted only from your own records — never a
 * guess dressed up as a saving.
 *  - Cheaper store: bought something for less than its latest price at
 *    another store you've bought it at.
 *  - Used before its date: pantry food that was about to go bad, used in a
 *    recipe you made (at the price you paid for it).
 *  - Cooked at home: dinners you made, against your own average eating-out
 *    trip (only when you've logged a few, and only dinners with a known cost).
 */
export interface StoreSaving {
  name: string;
  store: string;
  vs: string;
  saving: number;
}

const DAY = 86_400_000;

/** Purchases in [from, to) that beat the latest price at another store (within 4 months), by how much. */
export function storeSavings(prices: PriceEntry[], from: number, to: number): StoreSaving[] {
  const out: StoreSaving[] = [];
  for (const p of prices) {
    if (p.at < from || p.at >= to || !p.store) continue;
    const mine = unitPrice(p);
    if (!mine) continue;
    // The latest price at each other store, around the same time.
    const latest = new Map<string, PriceEntry>();
    for (const q of prices) {
      if (q.key !== p.key || !q.store || q.store === p.store || (q.storage && p.storage && q.storage !== p.storage)) continue;
      if (Math.abs(q.at - p.at) > 120 * DAY) continue;
      if (!latest.has(q.store) || latest.get(q.store)!.at < q.at) latest.set(q.store, q);
    }
    let ref: { store: string; value: number } | null = null;
    for (const [store, q] of latest) {
      const u = unitPrice(q);
      if (!u || u.unit !== mine.unit) continue;
      // The cheapest other store: a saving only if you beat even that.
      if (!ref || u.value < ref.value) ref = { store, value: u.value };
    }
    if (!ref || ref.value <= mine.value) continue;
    const units = p.price / mine.value;
    const saving = Math.round((ref.value - mine.value) * units * 100) / 100;
    if (saving >= 0.01) out.push({ name: p.name, store: p.store, vs: ref.store, saving });
  }
  return out.sort((a, b) => b.saving - a.saving);
}

// ---------- food used before its date (recorded in rescued.ts) ----------
const qtyAmount = (q: Qty) => (q.kind === "volume" ? q.tsp : q.kind === "weight" ? q.g : q.n);

/** What the rescued food was worth, at the latest price you paid for each. */
export function rescuedValue(list: Rescued[], prices: PriceEntry[], from: number, to: number): { name: string; value: number }[] {
  const latest = new Map<string, PriceEntry>();
  for (const p of prices) if (p.qty && (!latest.has(p.key) || latest.get(p.key)!.at <= p.at)) latest.set(p.key, p);
  const out: { name: string; value: number }[] = [];
  for (const r of list) {
    if (r.at < from || r.at >= to) continue;
    const p = latest.get(r.key);
    if (!p?.qty || qtyAmount(p.qty) <= 0) continue;
    const same = convert(r.qty, p.qty, r.name);
    if (!same) continue;
    const value = Math.round(Math.min(p.price, (p.price * qtyAmount(same)) / qtyAmount(p.qty)) * 100) / 100;
    if (value >= 0.01) out.push({ name: r.name, value });
  }
  return out;
}

// ---------- cooked at home ----------
export const MIN_EATING_OUT = 3;

/** Dinners made in [from, to), each against your average eating-out trip. */
export function homeCooking(
  recipes: SavedRecipe[],
  fastFood: FastFoodEntry[],
  from: number,
  to: number,
  cost: (r: SavedRecipe) => number | null,
): { dinners: number; counted: number; homeEach: number; outEach: number; saving: number } | null {
  if (fastFood.length < MIN_EATING_OUT) return null;
  const outEach = fastFood.reduce((s, e) => s + e.amount, 0) / fastFood.length;
  let dinners = 0, counted = 0, homeTotal = 0, saving = 0;
  for (const r of recipes) {
    if (!isDinner(r)) continue;
    const times = madeDays(r).filter((d) => d >= from && d < to).length;
    if (!times) continue;
    dinners += times;
    const c = cost(r);
    if (c === null) continue;
    counted += times;
    homeTotal += c * times;
    saving += Math.max(0, outEach - c) * times;
  }
  if (!counted) return dinners ? { dinners, counted: 0, homeEach: 0, outEach, saving: 0 } : null;
  return { dinners, counted, homeEach: homeTotal / counted, outEach, saving: Math.round(saving * 100) / 100 };
}

/** A dinner's cost, if at least half its ingredients have a price (else too rough to count). */
export function knownCost(r: ScannedRecipe, prices: PriceEntry[]): number | null {
  const c = recipeCost(r, 1, prices);
  return c.of > 0 && c.priced / c.of >= 0.5 ? c.total : null;
}

/** The start of this month and last month. */
export function monthStarts(now = new Date()): { thisMonth: number; lastMonth: number } {
  return { thisMonth: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), lastMonth: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() };
}
