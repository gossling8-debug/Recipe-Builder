import { add, parseQty, type Qty } from "./qty";
import type { PantryItem } from "./pantry";
import { fixPlurals, formatNumber, parseNumber, scaleAmount } from "./quantity";
import type { SavedRecipe } from "./schema";

/** Recipes on the shopping list (each at the size chosen when added) and items ticked off. */
export interface ShoppingState {
  /** skip: ingredients crossed off on the recipe when it was added (already have them). */
  recipes: { id: string; scale: number; skip?: number[] }[];
  checked: string[];
  /** Items already opened at the store (so the cook can see what's been looked up). */
  opened?: string[];
  /** What was bought when each item was ticked, and the pantry before, so unticking can undo it. */
  bought?: Record<string, { text: string; before: PantryItem | null; price?: number; priceId?: string }>;
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

/** Puts a recipe on the list; `skip` = ingredient numbers crossed off on the recipe (not needed). */
export function addToShopping(id: string, scale: number, skip: number[] = []): void {
  const s = loadShopping();
  const entry = skip.length ? { id, scale, skip: [...skip].sort((a, b) => a - b) } : { id, scale };
  saveShopping({ ...s, recipes: [...s.recipes.filter((r) => r.id !== id), entry] });
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

/**
 * The name to shop and match by. When the card split "boneless, skinless
 * chicken breasts" into name "boneless" and a note "skinless chicken breasts",
 * the note is joined back on so it names the actual thing.
 */
export function ingredientName(ing: { name: string; preparation: string | null }): string {
  const name = ing.name.trim();
  const words = name.toLowerCase().split(/[\s,-]+/).filter(Boolean);
  const onlyDescribes = words.length > 0 && words.every((w) => DESCRIPTORS.has(w.replace(/[^a-z]/g, "")));
  return onlyDescribes && ing.preparation?.trim() ? `${name} ${ing.preparation.trim()}` : name;
}

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
    // Fat percentages and lean ratios don't change what it is: "2% milk" = milk, "80/20 ground beef" = ground beef.
    .replace(/\b\d+(?:\.\d+)?\s*%(?:\s*(?:milkfat|milk fat|lean|fat))?/g, " ")
    .replace(/\b\d{2}\s*\/\s*\d{1,2}\b/g, " ")
    .replace(/\b(?:reduced|low|non)[- ]?fat\b|\bfat[- ]free\b/g, " ")
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
export function combine(entries: { recipe: SavedRecipe; scale: number; skip?: number[] }[]): ShoppingItem[] {
  const groups = new Map<
    string,
    { name: string; recipes: string[]; sums: Map<string, { total: number; display: string }>; other: string[]; need?: Qty | null }
  >();
  for (const { recipe, scale, skip } of entries) {
    const crossedOff = new Set(skip ?? []);
    for (const [index, ing] of recipe.ingredients.entries()) {
      if (!ing.name.trim() || crossedOff.has(index)) continue;
      const fullName = ingredientName(ing);
      const key = nameKey(fullName);
      let g = groups.get(key);
      if (!g) {
        g = { name: fullName, recipes: [], sums: new Map(), other: [] };
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
 * A Walmart search for one shopping-list item. The phone opens it in the
 * Walmart app when the app is installed and the browser allows it (in
 * DuckDuckGo: Settings → General → Open Links in Associated Apps), otherwise
 * on walmart.com — the same cart either way. Only the ingredient name is
 * searched; the cook picks the brand and package size.
 */
export function walmartSearchUrl(name: string): string {
  return `https://www.walmart.com/search?q=${encodeURIComponent(walmartQuery(name))}`;
}

function walmartQuery(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(for (serving|topping|garnish)|to taste|optional|divided)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
