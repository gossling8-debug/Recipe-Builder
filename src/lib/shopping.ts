import { add, parseQty, type Qty } from "./qty";
import type { PantryItem } from "./pantry";
import { fixPlurals, formatNumber, parseNumber, scaleAmount } from "./quantity";
import type { SavedRecipe } from "./schema";

/** Recipes on the shopping list (each at the size chosen when added) and items ticked off. */
export interface ShoppingState {
  recipes: { id: string; scale: number }[];
  checked: string[];
  /** Items already opened at the store (so the cook can see what's been looked up). */
  opened?: string[];
  /** What was bought when each item was ticked, and the pantry before, so unticking can undo it. */
  bought?: Record<string, { text: string; before: PantryItem | null }>;
}

const KEY = "recipe-builder.shopping";
let memory: ShoppingState = { recipes: [], checked: [] };

export function loadShopping(): ShoppingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { recipes: [], checked: [], ...(JSON.parse(raw) as Partial<ShoppingState>) };
  } catch {
    /* blocked */
  }
  return memory;
}

export function saveShopping(s: ShoppingState): void {
  memory = s;
  queueMicrotask(() => window.dispatchEvent(new Event("shopping-changed")));
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* kept for this session */
  }
}

export function addToShopping(id: string, scale: number): void {
  const s = loadShopping();
  saveShopping({ ...s, recipes: [...s.recipes.filter((r) => r.id !== id), { id, scale }] });
}

export function removeFromShopping(id: string): void {
  const s = loadShopping();
  saveShopping({ ...s, recipes: s.recipes.filter((r) => r.id !== id) });
}

export interface ShoppingItem {
  key: string;
  name: string;
  amount: string;
  recipes: string[];
  /** Total needed as a measurable amount, or null if it can't be added up. */
  need: Qty | null;
}

const SINGLE_NUMBER = /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\s?[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*$/;

const UNIT_ALIASES: Record<string, string> = {
  cup: "cup", cups: "cup", c: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbs: "tbsp", tbl: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  ounce: "oz", ounces: "oz", oz: "oz",
  gram: "g", grams: "g", g: "g", kilogram: "kg", kilograms: "kg", kg: "kg",
  ml: "ml", milliliter: "ml", milliliters: "ml", liter: "l", liters: "l", l: "l",
};

/** "2 lbs (910 g)" → unit key "lb" and display "lbs"; a package like "(8 oz) blocks" stays as written. */
function unitKey(unit: string): { key: string; display: string } {
  const u = unit.trim();
  if (u.startsWith("(")) return { key: u.toLowerCase(), display: u };
  const base = u.replace(/\s*\(.*$/, "").trim(); // drop "(910 g)" conversions
  const lower = base.toLowerCase().replace(/\.$/, "");
  return { key: UNIT_ALIASES[lower] ?? lower, display: base };
}

/** The previous matching rule; kept only to move old saved data to the new keys. */
export function legacyNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 3 ? w.replace(/(oes|es|s)$/, (m) => (m === "oes" ? "o" : "")) : w))
    .join(" ");
}

// Words that describe how an ingredient is prepared or sized, not what to buy.
const DESCRIPTORS = new Set(
  (
    "fresh freshly large small medium extra jumbo organic boneless skinless chopped diced minced sliced " +
    "shredded grated softened melted cold warm packed lightly firmly finely coarsely roughly thinly whole raw " +
    "peeled uncooked cooked sharp mild plain salted unsalted lowsodium reducedsodium allpurpose divided optional " +
    "good quality homemade storebought"
  ).split(" "),
);

// Different names for the same thing (applied to the cleaned-up name).
const SYNONYMS: [RegExp, string][] = [
  [/\b(scallions?|spring onions?)\b/, "green onion"],
  [/\b(confectioners?|icing) sugar\b/, "powdered sugar"],
  [/\b(granulated|white|cane) sugar\b/, "sugar"],
  [/\b(plain|ap) flour\b/, "flour"],
  [/\bgarbanzo beans?\b/, "chickpea"],
  [/\b(cilantro|coriander) leaves\b/, "cilantro"],
  [/\b(heavy whipping|whipping|double) cream\b/, "heavy cream"],
  [/\bextra virgin olive oil\b|\bevoo\b/, "olive oil"],
  [/\b(kosher|sea|table) salt\b/, "salt"],
  [/\bground black pepper\b/, "black pepper"],
  [/\bcheddar cheese\b/, "cheddar"],
  [/\b(parmesan cheese|parmigiano reggiano)\b/, "parmesan"],
  [/\bmozzarella cheese\b/, "mozzarella"],
  [/\bcorn starch\b/, "cornstarch"],
  [/\beggs? (whites?|yolks?)\b/, "egg"], // whites and yolks come from eggs
];

const singularWord = (w: string) =>
  w.length > 3 && !/(ss|us|is|sses)$/.test(w) ? w.replace(/(oes|ies|es|s)$/, (m) => (m === "oes" ? "o" : m === "ies" ? "y" : m === "es" ? "e" : "")) : w;

/**
 * Matching key for an ingredient, shared by the shopping list and pantry:
 * "2 cups all-purpose flour" and "flour" match; so do "scallions" and
 * "green onions", or "large eggs" and "egg". Words that change what you'd buy
 * (brown sugar, dried dill, ground beef) are kept.
 */
export function nameKey(name: string): string {
  // Comma parts: keep the first one that names something ("boneless, skinless chicken" → "skinless
  // chicken"; "chicken, cut into pieces" → "chicken"; "onions, thinly sliced" → "onions").
  const parts = name.toLowerCase().replace(/\(.*?\)/g, " ").split(",");
  const named = parts.find((p) => p.split(/[\s-]+/).some((w) => w && !DESCRIPTORS.has(w.replace(/[^a-z]/g, "")))) ?? parts[0];
  let s = named
    .replace(/\b(at )?room temperature\b|\bto taste\b|\bfor (serving|garnish|topping)\b/g, " ")
    .replace(/\ball[- ]purpose\b/g, "allpurpose")
    .replace(/\b(low|reduced)[- ]sodium\b/g, (m) => m.replace(/[- ]/, ""))
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  const words = s.split(" ").filter((w) => w && !DESCRIPTORS.has(w));
  s = (words.length ? words : s.split(" ")).map(singularWord).join(" ");
  for (const [re, to] of SYNONYMS) s = s.replace(re, to); // again, after descriptors are gone
  return s || name.toLowerCase().trim();
}

/**
 * One combined list. Same ingredient + same unit is added up (1 cup + 2 cups
 * sugar → 3 cups); anything that can't be added is listed side by side
 * ("2 cups + 1 tbsp").
 */
export function combine(entries: { recipe: SavedRecipe; scale: number }[]): ShoppingItem[] {
  const groups = new Map<
    string,
    { name: string; recipes: string[]; sums: Map<string, { total: number; display: string }>; other: string[]; need?: Qty | null }
  >();
  for (const { recipe, scale } of entries) {
    for (const ing of recipe.ingredients) {
      if (!ing.name.trim()) continue;
      const key = nameKey(ing.name);
      let g = groups.get(key);
      if (!g) {
        g = { name: ing.name.trim(), recipes: [], sums: new Map(), other: [] };
        groups.set(key, g);
      }
      if (!g.recipes.includes(recipe.title)) g.recipes.push(recipe.title);

      // A measurable total for the pantry check (null once anything can't be added).
      const amountText = [ing.quantity.trim(), ing.unit.trim()].filter(Boolean).join(" ");
      if (amountText) {
        const parsed = parseQty(scaleAmount(amountText, scale), ing.name);
        g.need = !parsed || g.need === null ? null : g.need === undefined ? parsed : add(g.need, parsed, ing.name);
      }

      const q = ing.quantity.trim();
      if (q && SINGLE_NUMBER.test(q)) {
        const { key: uk, display } = unitKey(ing.unit);
        const prev = g.sums.get(uk);
        g.sums.set(uk, { total: (prev?.total ?? 0) + parseNumber(q) * scale, display: prev?.display ?? display });
      } else if (q || ing.unit.trim()) {
        g.other.push(scaleAmount([q, ing.unit.trim()].filter(Boolean).join(" "), scale));
      }
    }
  }
  return [...groups.entries()].map(([key, g]) => {
    const parts = [...g.sums.values()].map(({ total, display }) =>
      fixPlurals([formatNumber(total), display].filter(Boolean).join(" ")),
    );
    return { key, name: g.name, amount: [...parts, ...g.other].join(" + "), recipes: g.recipes, need: g.need ?? null };
  });
}

export function shoppingToText(items: ShoppingItem[], checked: Set<string>): string {
  const lines = ["Shopping list", ""];
  for (const it of items) if (!checked.has(it.key)) lines.push(`☐ ${[it.amount, it.name].filter(Boolean).join(" ")}`);
  return lines.join("\n");
}

/**
 * A Walmart search for one shopping-list item. Opens the Walmart app if it's
 * installed (signed into the cook's account, e.g. Walmart+), otherwise the site.
 * Only the ingredient name is searched — "4 cups sugar" would confuse the
 * search, and the cook picks the brand and package size.
 */
export function walmartSearchUrl(name: string, target: WalmartTarget = "website"): string {
  const q = walmartQuery(name);
  // The app's own link scheme lets the phone hand off to the Walmart app even
  // from inside another browser. Walmart doesn't document its in-app search
  // link, so this format is a best guess that the cook tests on their phone.
  if (target === "app") return `walmart://search?query=${encodeURIComponent(q)}`;
  return `https://www.walmart.com/search?q=${encodeURIComponent(q)}`;
}

export type WalmartTarget = "website" | "app";
const TARGET_KEY = "recipe-builder.walmartTarget";
export function getWalmartTarget(): WalmartTarget {
  try {
    return localStorage.getItem(TARGET_KEY) === "app" ? "app" : "website";
  } catch {
    return "website";
  }
}
export function setWalmartTarget(t: WalmartTarget): void {
  try {
    localStorage.setItem(TARGET_KEY, t);
  } catch {
    /* session only */
  }
}

function walmartQuery(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(for (serving|topping|garnish)|to taste|optional|divided)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
