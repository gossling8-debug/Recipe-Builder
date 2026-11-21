/**
 * Who likes what (Family plan): the people you cook for, and for each recipe who
 * loves it and who won't eat it. Plans skip dinners someone won't eat; the recipe
 * list can show only what everyone eats. Names live on this account (synced), and
 * each recipe keeps its own marks, so kids without an account count too.
 */
import { feature } from "./features";
import type { SavedRecipe } from "./schema";

export type Taste = "love" | "no";
const KEY = "recipe-builder.eaters";
let memory: string[] = [];

export function getEaters(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return memory; // storage blocked: this visit's copy
  }
}

/** Saves the names (trimmed, no repeats, in the order given). */
export function setEaters(names: string[]): string[] {
  const seen = new Set<string>();
  const clean = names
    .map((n) => n.trim().slice(0, 30))
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .slice(0, 12);
  memory = clean;
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* this visit only */
  }
  window.dispatchEvent(new Event("eaters-changed"));
  return clean;
}

/** Who-likes-what is on (Family plan, switched on, and some names given). */
export const tastesOn = () => feature("tastes") && getEaters().length > 0;

/** The marks for people still on the list (a removed name's marks are ignored). */
export function tastesOf(r: Pick<SavedRecipe, "tastes">, eaters = getEaters()): Record<string, Taste> {
  const out: Record<string, Taste> = {};
  for (const name of eaters) {
    const t = r.tastes?.[name];
    if (t === "love" || t === "no") out[name] = t;
  }
  return out;
}

/** Who won't eat it. */
export const refusedBy = (r: Pick<SavedRecipe, "tastes">, eaters = getEaters()) =>
  Object.entries(tastesOf(r, eaters)).filter(([, t]) => t === "no").map(([n]) => n);

/** For planning: false if someone you cook for won't eat it (only when who-likes-what is on). */
export const everyoneEats = (r: Pick<SavedRecipe, "tastes">) => !tastesOn() || refusedBy(r).length === 0;

/** The next mark when a name is tapped: none → loves → won't eat → none. */
export const nextTaste = (t: Taste | undefined): Taste | undefined => (t === undefined ? "love" : t === "love" ? "no" : undefined);

/** The recipe with one person's mark changed. */
export function withTaste<T extends Pick<SavedRecipe, "tastes">>(r: T, name: string, t: Taste | undefined): T {
  const tastes = { ...(r.tastes ?? {}) };
  if (t) tastes[name] = t;
  else delete tastes[name];
  return { ...r, tastes: Object.keys(tastes).length ? tastes : undefined };
}
