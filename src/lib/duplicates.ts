import { ingredientName, isTapWater, nameKey } from "./shopping";

/**
 * Spotting the same recipe saved twice (in your recipes, or in a family
 * cookbook). Only flags; never deletes. Your own "my version" copies are
 * intentional and never count, nor do pairs marked "not duplicates".
 */
export interface Comparable {
  id?: string;
  title: string;
  ingredients: { name: string; preparation: string | null }[];
  source?: string;
  variantOf?: string;
}

const STOP = new Set(["the", "a", "an", "recipe", "and", "with", "my", "version"]);
const titleWords = (t: string) =>
  t
    .toLowerCase()
    .replace(/\(my version\)/g, " ")
    .replace(/['’]s\b/g, "") // "Mom's" → "Mom"
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w))
    .filter(Boolean);
const ALWAYS_THERE = new Set(["salt", "pepper", "black pepper", "salt and pepper"]);
const ingredientKeys = (r: Comparable) =>
  new Set(r.ingredients.filter((i) => i.name.trim() && !isTapWater(i.name)).map((i) => nameKey(ingredientName(i))).filter((k) => !ALWAYS_THERE.has(k)));
const jaccard = <T,>(a: Set<T>, b: Set<T>) => {
  if (!a.size && !b.size) return 1;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
};
const cleanUrl = (u?: string) => (u ? u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "") : "");

export type DuplicateReason = "same web page" | "same title" | "same ingredients";

/** Why two recipes look like the same one, or null if they don't. */
export function duplicateReason(a: Comparable, b: Comparable): DuplicateReason | null {
  if (a.id && b.id && a.id === b.id) return null;
  // Your own versions of a recipe are meant to be copies.
  const rootA = a.variantOf ?? a.id;
  const rootB = b.variantOf ?? b.id;
  if (rootA && rootB && rootA === rootB) return null;
  if (cleanUrl(a.source) && cleanUrl(a.source) === cleanUrl(b.source)) return "same web page";
  const ta = titleWords(a.title);
  const tb = titleWords(b.title);
  const sameTitle = ta.length > 0 && ta.join(" ") === tb.join(" ");
  const titleSim = jaccard(new Set(ta), new Set(tb));
  const ia = ingredientKeys(a);
  const ib = ingredientKeys(b);
  const ingSim = jaccard(ia, ib);
  if (sameTitle && (ingSim >= 0.5 || Math.min(ia.size, ib.size) === 0)) return "same title";
  // Nearly the same ingredients and at least one word of the name in common
  // (so pancakes and waffles, with similar ingredients, aren't flagged).
  if (ingSim >= 0.85 && Math.min(ia.size, ib.size) >= 4 && titleSim > 0) return "same ingredients";
  return null;
}

/** Recipes in `others` that look like `r`. */
export function duplicatesOf<T extends Comparable>(r: Comparable, others: T[], ignored: Set<string> = new Set()): { recipe: T; reason: DuplicateReason }[] {
  const out: { recipe: T; reason: DuplicateReason }[] = [];
  for (const o of others) {
    if (r.id && o.id && ignored.has(pairKey(r.id, o.id))) continue;
    const reason = duplicateReason(r, o);
    if (reason) out.push({ recipe: o, reason });
  }
  return out;
}

/** Every pair that looks like a duplicate, oldest recipe first in each pair. */
export function duplicatePairs<T extends Comparable & { id: string; createdAt: number }>(all: T[], ignored: Set<string> = new Set()) {
  const pairs: { a: T; b: T; reason: DuplicateReason }[] = [];
  const sorted = [...all].sort((x, y) => x.createdAt - y.createdAt);
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      if (ignored.has(pairKey(sorted[i].id, sorted[j].id))) continue;
      const reason = duplicateReason(sorted[i], sorted[j]);
      if (reason) pairs.push({ a: sorted[i], b: sorted[j], reason });
    }
  return pairs;
}

// ---------- "Not duplicates" (synced, so it holds on every device) ----------
const KEY = "recipe-builder.notDuplicates";
export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
export function notDuplicates(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function markNotDuplicates(x: string, y: string): void {
  const s = notDuplicates();
  s.add(pairKey(x, y));
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("duplicates-changed"));
}
