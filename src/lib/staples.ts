import { useEffect, useState } from "react";
import { loadPantry, type PantryItem } from "./pantry";
import { formatQty, type Qty } from "./qty";
import { freshness } from "./shelfLife";
import { nameKey } from "./shopping";

/**
 * "Always keep" staples (milk, eggs, butter…). When the pantry thinks one is
 * out, past its date, or down to about a quarter of what was last bought, it
 * goes on the shopping list by itself.
 */
export interface Staple {
  key: string;
  name: string;
}
export type StapleStatus = "ok" | "low" | "out" | "past" | "unknown";

const KEY = "recipe-builder.staples";
let memory: Staple[] = [];

export function loadStaples(): Staple[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as Staple[];
  } catch {
    /* blocked */
  }
  return [...memory].sort((a, b) => a.name.localeCompare(b.name));
}

function save(list: Staple[]) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* session only */
  }
  if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event("staples-changed")));
}

export const isStaple = (key: string) => loadStaples().some((s) => s.key === key);
export function addStaple(name: string): void {
  const key = nameKey(name);
  if (!name.trim() || isStaple(key)) return;
  save([...loadStaples(), { key, name: name.trim() }]);
}
export const removeStaple = (key: string) => save(loadStaples().filter((s) => s.key !== key));

const amount = (q: Qty) => (q.kind === "volume" ? q.tsp : q.kind === "weight" ? q.g : q.n);

export function stapleStatus(item: PantryItem | undefined, now = Date.now()): StapleStatus {
  if (!item) return "out";
  if (item.useBy !== undefined && freshness(item.useBy, now) === "past") return "past";
  if (!item.qty) return "unknown";
  if (!item.lastBought || item.lastBought.kind !== item.qty.kind) return "unknown";
  return amount(item.qty) <= amount(item.lastBought) * 0.25 ? "low" : "ok";
}

export interface StapleNeed {
  staple: Staple;
  status: StapleStatus;
  /** What to buy: the amount bought last time, if known. */
  buy: Qty | null;
}

/** Staples to buy now (out, low or past their date). */
export function staplesToBuy(): StapleNeed[] {
  const pantry = loadPantry();
  return loadStaples()
    .map((staple) => {
      const item = pantry[staple.key];
      return { staple, status: stapleStatus(item), buy: item?.lastBought ?? null };
    })
    .filter((s) => s.status === "out" || s.status === "low" || s.status === "past");
}

export const statusText: Record<StapleStatus, string> = {
  ok: "Stocked",
  low: "Running low",
  out: "Out",
  past: "Past its date",
  unknown: "Have some",
};
export const buyText = (s: StapleNeed) => (s.buy ? formatQty(s.buy) : "");

export function useStaples(): Staple[] {
  const [list, set] = useState(loadStaples);
  useEffect(() => {
    const on = () => set(loadStaples());
    window.addEventListener("staples-changed", on);
    return () => window.removeEventListener("staples-changed", on);
  }, []);
  return list;
}
