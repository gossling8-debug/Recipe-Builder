import { isBasic } from "./canMake";
import { add, convert, parseQty, type Qty } from "./qty";
import { ingredientName, nameKey } from "./shopping";
import type { PriceEntry } from "./prices";
import type { ScannedRecipe, SavedRecipe } from "./schema";

/**
 * "Plan my week on a budget": picks dinners so that what you'd have to buy
 * for them stays as cheap as possible — using what's already in your pantry,
 * and recipes that share ingredients (one bag of onions for two dinners).
 *
 * Costs come from what you paid (your prices), or for things you've never
 * priced, an estimate (see priceGuess.ts). Whole packages are counted: a
 * recipe needing 1 cup of rice still means buying a bag if you have none.
 */

/** A package price: what it costs, and how much is in it (null: size unknown, counted as one). */
export interface PackPrice {
  price: number;
  qty: Qty | null;
  guess: boolean; // estimated, not a price you paid
}

export interface CostCtx {
  /** Is there enough at home already? (pantry; null need = amount unknown) */
  have: (key: string, name: string, need: Qty | null) => boolean;
  price: (key: string, name: string) => PackPrice | null;
}

export interface BuyItem {
  key: string;
  name: string;
  packs: number;
  cost: number;
  guess: boolean; // estimated price
  unpriced: boolean; // no price at all: counted at DEFAULT_ITEM
}
export interface Cost {
  total: number;
  items: BuyItem[];
}

/** Something with no price at all counts as this much, so it isn't "free". */
export const DEFAULT_ITEM = 3;

const amount = (q: Qty) => (q.kind === "volume" ? q.tsp : q.kind === "weight" ? q.g : q.n);

/** What you'd have to buy to cook these (combined), and roughly what it costs. */
export function shoppingCost(recipes: { recipe: ScannedRecipe; scale: number }[], ctx: CostCtx): Cost {
  // Everything needed, combined by ingredient.
  const need = new Map<string, { name: string; qty: Qty | null; unknown: boolean }>();
  for (const { recipe, scale } of recipes)
    for (const ing of recipe.ingredients) {
      if (!ing.name.trim() || isBasic(ing.name)) continue;
      const key = nameKey(ingredientName(ing));
      const q = parseQty([ing.quantity, ing.unit].filter(Boolean).join(" "), ing.name);
      const qs = q && scale !== 1 ? scaleQty(q, scale) : q;
      const cur = need.get(key);
      if (!cur) need.set(key, { name: ing.name, qty: qs, unknown: !qs });
      else if (cur.qty && qs) {
        const sum = add(cur.qty, qs, ing.name);
        if (sum) cur.qty = sum;
        else cur.unknown = true;
      } else cur.unknown = true;
    }
  const items: BuyItem[] = [];
  for (const [key, n] of need) {
    if (ctx.have(key, n.name, n.unknown ? null : n.qty)) continue;
    const p = ctx.price(key, n.name);
    if (!p) {
      items.push({ key, name: n.name, packs: 1, cost: DEFAULT_ITEM, guess: false, unpriced: true });
      continue;
    }
    let packs = 1;
    if (p.qty && n.qty && !n.unknown && amount(p.qty) > 0) {
      const same = convert(n.qty, p.qty, n.name);
      if (same) packs = Math.max(1, Math.min(6, Math.ceil(amount(same) / amount(p.qty) - 0.05)));
    }
    items.push({ key, name: n.name, packs, cost: packs * p.price, guess: p.guess, unpriced: false });
  }
  return { total: items.reduce((s, i) => s + i.cost, 0), items };
}

function scaleQty(q: Qty, f: number): Qty {
  if (q.kind === "volume") return { kind: "volume", tsp: q.tsp * f };
  if (q.kind === "weight") return { kind: "weight", g: q.g * f };
  return { ...q, n: q.n * f };
}

/** The latest price you paid for each ingredient (with a size). */
export function latestPrices(prices: PriceEntry[]): Map<string, PriceEntry> {
  const latest = new Map<string, PriceEntry>();
  for (const p of prices) if (!latest.has(p.key) || latest.get(p.key)!.at <= p.at) latest.set(p.key, p);
  return latest;
}

/** "spicy, pork" → recipes with those words in the title, labels or ingredients are left out. */
export function skipWords(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2)
    .slice(0, 12);
}
export function mentions(r: SavedRecipe, words: string[]): boolean {
  if (!words.length) return false;
  const hay = [r.title, ...(r.tags ?? []), ...r.ingredients.map((i) => i.name)].join(" \n ").toLowerCase();
  return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(hay));
}

/**
 * A chooser for fillWeek: each new dinner is the one that adds least to the
 * shopping (for how much you like it), picked at random among the best few so
 * "Try again" gives another cheap week.
 */
export function budgetChooser(opts: {
  ctx: CostCtx;
  /** As it'll be cooked (chosen substitutes). */
  cooked: (r: SavedRecipe) => ScannedRecipe;
  leaveOut: (r: SavedRecipe) => boolean;
  random?: () => number;
}): { choose: (candidates: SavedRecipe[]) => SavedRecipe | undefined; chosen: SavedRecipe[] } {
  const { ctx, cooked, leaveOut, random = Math.random } = opts;
  const chosen: SavedRecipe[] = [];
  const asCooked = new Map<string, ScannedRecipe>();
  const c = (r: SavedRecipe) => asCooked.get(r.id) ?? (asCooked.set(r.id, cooked(r)), asCooked.get(r.id)!);
  const choose = (candidates: SavedRecipe[]) => {
    const ok = candidates.filter((r) => !leaveOut(r));
    if (!ok.length) return undefined;
    const sofar = chosen.map((r) => ({ recipe: c(r), scale: 1 }));
    const base = shoppingCost(sofar, ctx).total;
    const scored = ok
      .map((r) => {
        const extra = shoppingCost([...sofar, { recipe: c(r), scale: 1 }], ctx).total - base;
        const like = Math.max(0.5, 1 + (r.rating ? (r.rating - 3) * 0.25 : 0) + (r.makeAgain ? 0.25 : 0));
        return { r, score: (extra + 1) / like };
      })
      .sort((a, b) => a.score - b.score);
    // Among the cheapest few that cost about the same as the best (within 15%, or 50¢), any one.
    const near = scored.filter((s, i) => i < 3 && s.score <= scored[0].score * 1.15 + 0.5);
    const pick = near[Math.min(near.length - 1, Math.floor(random() * near.length))].r;
    chosen.push(pick);
    return pick;
  };
  return { choose, chosen };
}
