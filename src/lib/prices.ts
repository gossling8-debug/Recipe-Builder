import { isBasic } from "./canMake";
import { convert, parseQty, type Qty } from "./qty";
import { scaleAmount } from "./quantity";
import { ingredientName, nameKey } from "./shopping";
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
  /** Where it was bought ("Walmart", "H-E-B"…), when known. */
  store?: string;
  /** The item number printed next to it on the receipt, when there is one (same store only). */
  code?: string;
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

export function addPrice(name: string, amountText: string, price: number, at = Date.now(), extra: { store?: string | null; code?: string | null } = {}): string {
  const id = `${at}-${Math.random().toString(36).slice(2, 8)}`;
  const all = loadPrices();
  const store = extra.store?.trim() || undefined;
  const code = extra.code?.replace(/[^0-9]/g, "") || undefined;
  // The same item number at the same store is the same product, even if the receipt words it differently.
  const same = code && store ? all.find((p) => p.code === code && p.store === store) : undefined;
  save([...all, { id, key: same?.key ?? nameKey(name), name: same?.name ?? name, qty: parseQty(amountText, name), price, at, store, code }]);
  return id;
}

export function deletePrice(id: string): void {
  save(loadPrices().filter((p) => p.id !== id));
}

// "Start spending over": totals count from this time; the prices themselves are
// kept, so recipe costs still work.
const RESET_KEY = "recipe-builder.spendingFrom";
let resetMemory = 0;
export function spendingFrom(): number {
  try {
    return Number(localStorage.getItem(RESET_KEY)) || resetMemory;
  } catch {
    return resetMemory;
  }
}
export function startSpendingOver(now = Date.now()): void {
  resetMemory = now;
  try {
    localStorage.setItem(RESET_KEY, String(now));
  } catch {
    /* ignore */
  }
}

/** Purchases that count toward spending since `from` (newest first). */
export const spendingEntries = (from: number) =>
  loadPrices()
    .filter((p) => p.at >= Math.max(from, spendingFrom()))
    .sort((a, b) => b.at - a.at);

export const spentSince = (from: number) => spendingEntries(from).reduce((s, p) => s + p.price, 0);

/** Corrects what was paid for one purchase. */
export function updatePrice(id: string, price: number): void {
  save(loadPrices().map((p) => (p.id === id ? { ...p, price } : p)));
}

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
    const p = latest.get(nameKey(ingredientName(ing)));
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

// ---------- weekly budget ----------
const BUDGET_KEY = "recipe-builder.budget";
let budgetMemory = 0;
/** The weekly grocery budget in dollars (0 = not set). */
export function getBudget(): number {
  try {
    return Number(localStorage.getItem(BUDGET_KEY)) || budgetMemory;
  } catch {
    return budgetMemory;
  }
}
export function setBudget(dollarsPerWeek: number): void {
  budgetMemory = dollarsPerWeek;
  try {
    localStorage.setItem(BUDGET_KEY, String(dollarsPerWeek));
  } catch {
    /* session only */
  }
}

// ---------- price tracking ----------

/** Price per oz (weight), per fl oz (volume) or per item (count), like a shelf tag — so sizes and stores compare. */
export interface UnitPrice {
  value: number;
  unit: string; // "oz", "fl oz", "each"
}
export function unitPrice(p: Pick<PriceEntry, "qty" | "price">): UnitPrice | null {
  const q = p.qty;
  if (!q || !(p.price > 0)) return null;
  if (q.kind === "weight" && q.g > 0) return { value: p.price / (q.g / 28.3495), unit: "oz" };
  if (q.kind === "volume" && q.tsp > 0) return { value: p.price / (q.tsp / 6), unit: "fl oz" };
  if (q.kind === "count" && q.n > 0) return { value: p.price / q.n, unit: "each" };
  return null;
}
export const unitText = (u: UnitPrice) => `${u.value < 0.1 ? `$${u.value.toFixed(3)}` : dollars(u.value)}/${u.unit}`;

const TAX_KEY = () => nameKey("Sales tax");

/** Every purchase of one item, newest first. Sales tax isn't an item. */
export const priceHistory = (key: string, prices = loadPrices()) =>
  prices.filter((p) => p.key === key && p.key !== TAX_KEY()).sort((a, b) => b.at - a.at);

/** Stores prices were recorded at, most used first. */
export function usedStores(prices = loadPrices()): string[] {
  const n = new Map<string, number>();
  for (const p of prices) if (p.store) n.set(p.store, (n.get(p.store) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

export interface ItemPrices {
  key: string;
  name: string;
  latest: PriceEntry;
  latestUnit: UnitPrice | null;
  /** Change in unit price since the purchase before (any store), e.g. 0.12 = 12% more. */
  change: number | null;
  /** The lowest unit price seen, and where. */
  best: { unit: UnitPrice; store: string | null; at: number } | null;
  /** Lowest unit price seen at each store, cheapest first. */
  byStore: { store: string; unit: UnitPrice; at: number }[];
  count: number;
}

/** Comparing two unit prices only makes sense in the same unit. */
const comparable = (a: UnitPrice | null, b: UnitPrice | null): a is UnitPrice => !!a && !!b && a.unit === b.unit;

export function itemPrices(key: string, prices = loadPrices()): ItemPrices | null {
  const h = priceHistory(key, prices);
  if (!h.length) return null;
  const latest = h[0];
  const latestUnit = unitPrice(latest);
  const prev = h.slice(1).find((p) => comparable(latestUnit, unitPrice(p)));
  const prevUnit = prev ? unitPrice(prev) : null;
  const change = latestUnit && prevUnit && prevUnit.value > 0 ? latestUnit.value / prevUnit.value - 1 : null;
  const unit = latestUnit?.unit;
  const stores = new Map<string, { store: string; unit: UnitPrice; at: number }>();
  let best: ItemPrices["best"] = null;
  for (const p of h) {
    const u = unitPrice(p);
    if (!u || u.unit !== unit) continue;
    if (!best || u.value < best.unit.value) best = { unit: u, store: p.store ?? null, at: p.at };
    if (p.store) {
      const cur = stores.get(p.store);
      if (!cur || u.value < cur.unit.value) stores.set(p.store, { store: p.store, unit: u, at: p.at });
    }
  }
  return {
    key,
    name: latest.name,
    latest,
    latestUnit,
    change,
    best,
    byStore: [...stores.values()].sort((a, b) => a.unit.value - b.unit.value),
    count: h.length,
  };
}

/** Every item with a price, for the price tracker. */
export function allItemPrices(prices = loadPrices()): ItemPrices[] {
  const keys = [...new Set(prices.map((p) => p.key))].filter((k) => k !== TAX_KEY());
  return keys.map((k) => itemPrices(k, prices)).filter((x): x is ItemPrices => !!x);
}

/**
 * How a price about to be saved compares: with what was paid last time (unit
 * price, any store) and with the cheapest other store it's been seen at.
 */
export function priceInsight(
  name: string,
  amountText: string,
  price: number,
  store: string | null,
  prices = loadPrices(),
): { change: number | null; since: number | null; cheaperAt: { store: string; unit: UnitPrice } | null; unit: UnitPrice | null } {
  const unit = unitPrice({ qty: parseQty(amountText, name), price });
  const h = priceHistory(nameKey(name), prices);
  const prev = h.find((p) => comparable(unit, unitPrice(p)));
  const prevUnit = prev ? unitPrice(prev) : null;
  const change = unit && prevUnit && prevUnit.value > 0 ? unit.value / prevUnit.value - 1 : null;
  let cheaperAt: { store: string; unit: UnitPrice } | null = null;
  for (const p of h) {
    const u = unitPrice(p);
    if (!p.store || p.store === store || !unit || !u || u.unit !== unit.unit) continue;
    if (u.value < unit.value * 0.97 && (!cheaperAt || u.value < cheaperAt.unit.value)) cheaperAt = { store: p.store, unit: u };
  }
  return { change, since: prev?.at ?? null, cheaperAt, unit };
}

/** What was spent at each store since `from` (most first). */
export function spendingByStore(from: number): { store: string; total: number }[] {
  const m = new Map<string, number>();
  for (const p of spendingEntries(from)) {
    if (p.key === TAX_KEY()) continue;
    const s = p.store ?? "Store not recorded";
    m.set(s, (m.get(s) ?? 0) + p.price);
  }
  return [...m.entries()].map(([store, total]) => ({ store, total })).sort((a, b) => b.total - a.total);
}
