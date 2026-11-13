import { formatNumber, parseNumber } from "./quantity";
import { volume } from "./conversions";

/**
 * Amounts the pantry can do arithmetic with. Everything is stored in a base
 * unit: teaspoons for volume, grams for weight, or a count of some thing
 * ("3 eggs", "2 cans"). Volume and weight can be compared for common staples
 * using typical kitchen weights (a cup of sugar ≈ 200 g); other mixes can't.
 */
export type Qty =
  | { kind: "volume"; tsp: number }
  | { kind: "weight"; g: number }
  | { kind: "count"; n: number; noun: string };

const VOLUME: Record<string, number> = {
  tsp: 1, teaspoon: 1, t: 1,
  tbsp: 3, tbs: 3, tbl: 3, tablespoon: 3,
  cup: 48, c: 48,
  "fl oz": 6, "fluid ounce": 6,
  pint: 96, pt: 96, quart: 192, qt: 192, gallon: 768, gal: 768,
  ml: 0.2029, milliliter: 0.2029, l: 202.88, liter: 202.88, litre: 202.88,
};
const WEIGHT: Record<string, number> = {
  oz: 28.35, ounce: 28.35, lb: 453.6, pound: 453.6, g: 1, gram: 1, kg: 1000, kilogram: 1000,
};
// Things sold by the piece whose size we know.
const PIECE_WEIGHT: Record<string, number> = { stick: 113 }; // a stick of butter

/** Typical grams per cup, for comparing cups with pounds. Approximate by nature. */
const GRAMS_PER_CUP: [RegExp, number][] = [
  [/powdered sugar|confectioner/, 120],
  [/brown sugar/, 220],
  [/sugar/, 200],
  [/bread flour/, 130],
  [/almond flour/, 96],
  [/flour/, 125],
  [/butter/, 227],
  [/rice/, 185],
  [/oats/, 90],
  [/cocoa/, 85],
  [/chocolate chips/, 170],
  [/honey|maple syrup/, 340],
  [/cream cheese/, 232],
  [/sour cream|yogurt/, 230],
  [/shredded|grated/, 113],
  [/parmesan/, 100],
  [/mayonnaise|mayo/, 220],
  [/milk|water|broth|stock|juice|buttermilk|cream/, 240],
  [/oil/, 218],
  [/salt/, 288],
  [/cornstarch/, 128],
  [/peanut butter/, 258],
];

const singular = (w: string) => w.replace(/(ches|shes|sses|xes)$/, (m) => m.slice(0, -2)).replace(/ies$/, "y").replace(/(?<!s)s$/, "");
const NUM = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\s?[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)/;

function unitFactor(word: string): { kind: "volume" | "weight"; f: number } | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  const cand = [w, singular(w)];
  for (const c of cand) {
    if (c in VOLUME) return { kind: "volume", f: VOLUME[c] };
    if (c in WEIGHT) return { kind: "weight", f: WEIGHT[c] };
  }
  return null;
}

/** "1½ cups", "4 lb", "2 (8 oz) blocks", "3 eggs", "16 oz" → Qty; null if there's no number. */
export function parseQty(text: string, name = ""): Qty | null {
  let t = text.trim().toLowerCase();
  // Pounds and ounces together: "10 lb 14 oz" = 174 oz.
  const lbOz = t.match(/^(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\.?,?\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/);
  if (lbOz) return { kind: "weight", g: Number(lbOz[1]) * 453.592 + Number(lbOz[2]) * 28.3495 };
  const m = t.match(NUM);
  if (!m) return null;
  const n = parseNumber(m[1]);
  if (!(n > 0)) return null;
  t = t.slice(m[0].length).replace(/^\s*(?:-|–|to)\s*[\d½¼¾⅓⅔⅛]+[^\s]*/, "").trim(); // ignore the top of a range

  // Package size in parentheses right after the count: "2 (8 oz) blocks".
  const pkg = t.match(/^\(([^)]*)\)\s*(.*)$/);
  if (pkg) {
    const each = parseQty(pkg[1].split("/")[0]);
    if (each && each.kind !== "count") return scale(each, n);
    t = pkg[2];
  }
  t = t.replace(/\(.*?\)/g, " ").trim(); // drop conversions like "(910 g)"

  const two = t.split(/\s+/).slice(0, 2).join(" ");
  const u2 = unitFactor(two);
  if (u2) return u2.kind === "volume" ? { kind: "volume", tsp: n * u2.f } : { kind: "weight", g: n * u2.f };
  const first = t.split(/\s+/)[0] ?? "";
  const u1 = unitFactor(first);
  if (u1) return u1.kind === "volume" ? { kind: "volume", tsp: n * u1.f } : { kind: "weight", g: n * u1.f };
  const piece = singular(first);
  // "2 sticks" means butter (or margarine); "24 sticks" of string cheese or celery stays a count.
  if (piece in PIECE_WEIGHT && /\b(butter|margarine)\b/i.test(name || "butter")) return { kind: "weight", g: n * PIECE_WEIGHT[piece] };
  // A count: "3" (eggs), "2 cans", "4 cloves".
  const fromName = /\beggs? (whites?|yolks?)\b/i.test(name) ? "egg" : singular((name.split(/\s+/).pop() ?? "").toLowerCase());
  return { kind: "count", n, noun: first ? piece : fromName };
}

function scale(q: Qty, f: number): Qty {
  if (q.kind === "volume") return { kind: "volume", tsp: q.tsp * f };
  if (q.kind === "weight") return { kind: "weight", g: q.g * f };
  return { ...q, n: q.n * f };
}

const gramsPerCup = (name: string) => GRAMS_PER_CUP.find(([re]) => re.test(name.toLowerCase()))?.[1];

/** Converts q into the same kind as `like`, or null if they can't be compared. */
export function convert(q: Qty, like: Qty, name: string): Qty | null {
  if (q.kind === like.kind) {
    if (q.kind === "count" && like.kind === "count" && q.noun !== like.noun && q.noun && like.noun) return null;
    return q;
  }
  const gpc = gramsPerCup(name);
  if (!gpc) return null;
  if (q.kind === "volume" && like.kind === "weight") return { kind: "weight", g: (q.tsp / 48) * gpc };
  if (q.kind === "weight" && like.kind === "volume") return { kind: "volume", tsp: (q.g / gpc) * 48 };
  return null;
}

const value = (q: Qty) => (q.kind === "volume" ? q.tsp : q.kind === "weight" ? q.g : q.n);
const withValue = (q: Qty, v: number): Qty =>
  q.kind === "volume" ? { kind: "volume", tsp: v } : q.kind === "weight" ? { kind: "weight", g: v } : { ...q, n: v };

/** a + b in a's units, or null if they can't be compared. */
export function add(a: Qty, b: Qty, name: string): Qty | null {
  const bb = convert(b, a, name);
  return bb ? withValue(a, value(a) + value(bb)) : null;
}

/** a − b (not below zero) in a's units, or null if they can't be compared. */
export function subtract(a: Qty, b: Qty, name: string): Qty | null {
  const bb = convert(b, a, name);
  return bb ? withValue(a, Math.max(0, value(a) - value(bb))) : null;
}

/** How much of `have` covers `need`: "enough", "some" (with the shortfall in need's units) or null if not comparable. */
export function compare(have: Qty, need: Qty, name: string): { status: "enough" } | { status: "some"; short: Qty } | null {
  const h = convert(have, need, name);
  if (!h) return null;
  const short = value(need) - value(h);
  // Within 5% counts as enough — pantry amounts are estimates.
  if (short <= value(need) * 0.05) return { status: "enough" };
  return { status: "some", short: withValue(need, short) };
}

export const isEmpty = (q: Qty) => value(q) <= 0.0001;

/** Friendly text: "1¼ cups", "2½ lb", "6 oz", "3 eggs". */
export function formatQty(q: Qty): string {
  if (q.kind === "volume") {
    const v = volume(q.tsp);
    return v.replace(/^(\S+) cup$/, (s, n) => (parseNumber(n) > 1 ? `${n} cups` : s));
  }
  if (q.kind === "weight") {
    const oz = q.g / 28.35;
    if (oz >= 16) return `${formatNumber(oz / 16)} lb`;
    return `${formatNumber(oz)} oz`;
  }
  const n = formatNumber(q.n);
  if (!q.noun) return n;
  const plural = q.n > 1 ? (/(ch|sh|s|x)$/.test(q.noun) ? `${q.noun}es` : q.noun.replace(/y$/, "ie") + "s") : q.noun;
  return `${n} ${plural}`;
}
