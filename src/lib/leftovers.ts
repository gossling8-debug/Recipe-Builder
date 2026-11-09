import { useEffect, useState } from "react";

/**
 * Leftovers from cooked recipes, with a "eat by" date. Cooked leftovers keep
 * 3–4 days in the fridge (USDA guidance), so the date is set 3 days out to be
 * safe; frozen, they're best within about 3 months (safe longer, but they dry out).
 */
export interface Leftover {
  id: string; // recipe id — one entry per recipe
  title: string;
  madeAt: number;
  eatBy: number; // end of day (ms)
  frozen?: boolean;
}

export const FRIDGE_DAYS = 3;
export const FREEZER_DAYS = 90;
const KEY = "recipe-builder.leftovers";
let memory: Leftover[] = [];

const endOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};
const day = 86_400_000;

export function loadLeftovers(): Leftover[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as Leftover[];
  } catch {
    /* blocked */
  }
  return [...memory].sort((a, b) => a.eatBy - b.eatBy);
}

function save(list: Leftover[]): void {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* session only */
  }
  if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event("leftovers-changed")));
}

/** Leftovers from today's cooking, in the fridge or straight into the freezer (replaces an earlier entry for the same recipe). */
export function addLeftover(id: string, title: string, now = Date.now(), frozen = false): void {
  save([
    ...loadLeftovers().filter((l) => l.id !== id),
    { id, title, madeAt: now, eatBy: endOfDay(now + (frozen ? FREEZER_DAYS : FRIDGE_DAYS) * day), ...(frozen ? { frozen: true } : {}) },
  ]);
}

/**
 * Called whenever a recipe is marked as made: if it was doubled to freeze
 * half, that half goes on the freezer list and the recipe goes back to its
 * usual size. Returns true if it did.
 */
export function freezeHalfIfPlanned(id: string, title: string, progress: { freezeHalf?: boolean; scale: number }, save: (p: { freezeHalf?: boolean; scale: number }) => void): boolean {
  if (!progress.freezeHalf) return false;
  addLeftover(id, title, Date.now(), true);
  save({ ...progress, freezeHalf: false, scale: progress.scale / 2 });
  return true;
}

export function freezeLeftover(id: string, now = Date.now()): void {
  save(loadLeftovers().map((l) => (l.id === id ? { ...l, frozen: true, eatBy: endOfDay(now + FREEZER_DAYS * day) } : l)));
}

export function removeLeftover(id: string): void {
  save(loadLeftovers().filter((l) => l.id !== id));
}

export function useLeftovers(): Leftover[] {
  const [list, set] = useState(loadLeftovers);
  useEffect(() => {
    const on = () => set(loadLeftovers());
    window.addEventListener("leftovers-changed", on);
    return () => window.removeEventListener("leftovers-changed", on);
  }, []);
  return list;
}

/** "Eat today", "Eat by tomorrow", "Eat within 3 days", "Past its date (yesterday)", "Frozen · best by Feb 6". */
export function eatByLabel(l: Leftover, now = Date.now()): string {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const days = Math.floor((l.eatBy - startToday.getTime()) / day);
  const date = new Date(l.eatBy).toLocaleDateString([], { month: "short", day: "numeric" });
  if (l.frozen) return days < 0 ? `Frozen · past best quality (${date})` : `Frozen · best by ${date}`;
  if (days < 0) return `Past its date (${days === -1 ? "yesterday" : `${-days} days ago`}) — throw out`;
  if (days === 0) return "Eat today";
  if (days === 1) return "Eat by tomorrow";
  return `Eat within ${days} days`;
}

export const leftoverPast = (l: Leftover, now = Date.now()) => !l.frozen && l.eatBy < now;
