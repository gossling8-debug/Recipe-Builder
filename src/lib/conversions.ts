import { formatNumber, parseNumber } from "./quantity";
import type { Ingredient } from "./schema";

/**
 * Swaps between forms of the same ingredient (fresh garlic ↔ jarred ↔
 * powder, fresh ↔ dried herbs …), worked out for the recipe's amount.
 *
 * Ratios are common kitchen guidelines, not exact science — garlic cloves
 * and onions vary in size — so amounts are shown as "≈" and powders as a
 * range where sources disagree.
 */
export interface Conversion {
  title: string; // "Garlic powder, 1½ tsp"
  lines: string[]; // "Fresh garlic: ≈ 6–12 cloves, minced"
  note: string; // honest note about how the result differs
}

// ---------- amounts ----------
const SINGLE = /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\s?[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*$/;

function qty(ing: Ingredient, scale: number): number | null {
  const q = ing.quantity.trim();
  // Ranges ("2-3") use the first number.
  const first = q.split(/\s*(?:-|–|to)\s*/)[0];
  if (!first || !SINGLE.test(first)) return null;
  return parseNumber(first) * scale;
}

/** Volume in teaspoons, or null if the unit isn't a volume. */
function teaspoons(amount: number, unit: string): number | null {
  const raw = unit.replace(/\(.*?\)/g, "").trim();
  if (/^T\b/.test(raw)) return amount * 3; // capital T = tablespoon
  const u = raw.toLowerCase();
  if (/^(tbsp|tbs|tbl|tablespoons?)\b/.test(u)) return amount * 3;
  if (/^(tsp|teaspoons?|t)\b/.test(u)) return amount;
  if (/^(cups?|c)\b/.test(u)) return amount * 48;
  return null;
}

/** 0.75 → "¾ tsp", 4.5 → "1½ tbsp", 60 → "1¼ cups" */
export function volume(tsp: number): string {
  if (tsp >= 48 * 0.25 && Math.abs(tsp / 48 - Math.round((tsp / 48) * 4) / 4) < 0.05)
    return `${formatNumber(tsp / 48)} ${tsp / 48 > 1 ? "cups" : "cup"}`;
  if (tsp >= 3 && Math.abs(tsp / 3 - Math.round((tsp / 3) * 2) / 2) < 0.05) return `${formatNumber(tsp / 3)} tbsp`;
  return `${formatNumber(tsp)} tsp`;
}

const range = (lo: number, hi: number, unit: (n: number) => string) =>
  formatNumber(lo) === formatNumber(hi) ? unit(lo) : `${formatNumber(lo)}–${unit(hi)}`;
const cloves = (n: number) => `${formatNumber(n)} ${n > 1 ? "cloves" : "clove"}`;
const describe = (ing: Ingredient, scale: number) => {
  const q = qty(ing, scale);
  const amount = [q === null ? ing.quantity : formatNumber(q), ing.unit].filter(Boolean).join(" ");
  return [cap(ing.name), amount].filter(Boolean).join(", ");
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- garlic ----------
// 1 clove ≈ 1 tsp fresh minced ≈ ½ tsp jarred minced ≈ ⅛–¼ tsp garlic powder ≈ ¼ tsp granulated.
function garlic(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.unit} ${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
  if (!/\bgarlic\b/.test(text) || /garlic (salt|bread|butter|sauce|oil)/.test(text)) return null;
  const q = qty(ing, scale);
  const tsp = q === null ? null : teaspoons(q, ing.unit);

  let form: "powder" | "granulated" | "jarred" | "minced" | "cloves" | "head";
  if (/garlic powder/.test(text)) form = "powder";
  else if (/granulated garlic/.test(text)) form = "granulated";
  else if (/\bjar(red)?\b/.test(text)) form = "jarred";
  else if (/\bheads?\b/.test(text)) form = "head";
  else if (tsp !== null) form = "minced";
  else form = "cloves";

  // Amount in cloves as [low, high].
  let c: [number, number] | null = null;
  if (q !== null) {
    if (form === "cloves") c = [q, q];
    else if (form === "head") c = [q * 10, q * 12];
    else if (tsp !== null) {
      if (form === "powder") c = [tsp / 0.25, tsp / 0.125];
      else if (form === "granulated") c = [tsp / 0.25, tsp / 0.25];
      else if (form === "jarred") c = [tsp / 0.5, tsp / 0.5];
      else c = [tsp, tsp]; // fresh minced
    }
  }

  const lines: string[] = [];
  if (c) {
    if (form !== "cloves" && form !== "minced") lines.push(`Fresh garlic: ≈ ${range(c[0], c[1], cloves)}, minced (about 1 tsp per clove)`);
    if (form !== "jarred") lines.push(`Jarred minced garlic: ≈ ${rangeVol(c[0] * 0.5, c[1] * 0.5)}`);
    if (form === "jarred" || form === "minced") lines.push(`Fresh cloves: ≈ ${range(c[0], c[1], cloves)}`);
    if (form !== "powder") lines.push(`Garlic powder: ≈ ${rangeVol(c[0] * 0.125, c[1] * 0.25)}`);
  } else {
    lines.push("1 clove ≈ 1 tsp fresh minced ≈ ½ tsp jarred minced ≈ ⅛–¼ tsp garlic powder");
  }
  const note =
    form === "powder" || form === "granulated"
      ? "Fresh or jarred garlic is sharper and more pungent than powder, and adds a little moisture and texture. In a creamy dip or sauce, start at the low end and taste — fresh garlic gets stronger as it sits."
      : "Jarred garlic is milder and slightly tangy from its brine, so you may want a bit more than the guide. Powder is mellower and toastier and blends smoothly, but has none of fresh garlic's bite.";
  return { title: describe(ing, scale), lines, note };
}

/** "1–2 tbsp", or "¾ tsp – 1½ tbsp" when the units differ. */
function rangeVol(lo: number, hi: number): string {
  const a = volume(lo);
  const b = volume(hi);
  if (a === b) return a;
  const [na, ua] = [a.slice(0, a.lastIndexOf(" ")), a.slice(a.lastIndexOf(" ") + 1)];
  const ub = b.slice(b.lastIndexOf(" ") + 1);
  return ua === ub || (ua === "cup" && ub === "cups") ? `${na}–${b}` : `${a} – ${b}`;
}

// ---------- onion ----------
// 1 medium onion ≈ 1 cup chopped ≈ ¼ cup dried minced onion ≈ 1 tbsp onion powder.
function onion(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.unit} ${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
  if (!/\bonions?\b/.test(text) || /(green|spring|pearl|french fried|fried)\s+onions?|scallion|onion soup|onion salt/.test(text)) return null;
  const q = qty(ing, scale);
  const tsp = q === null ? null : teaspoons(q, ing.unit);

  let form: "powder" | "dried" | "fresh";
  if (/onion powder/.test(text)) form = "powder";
  else if (/(dried|dehydrated|instant)\s+(minced\s+)?onion|onion flakes/.test(text)) form = "dried";
  else form = "fresh";

  let onions: number | null = null;
  if (q !== null) {
    if (form === "powder" && tsp !== null) onions = tsp / 3;
    else if (form === "dried" && tsp !== null) onions = tsp / 12;
    else if (form === "fresh") onions = tsp !== null ? tsp / 48 : q * (/\blarge\b/.test(text) ? 1.5 : /\bsmall\b/.test(text) ? 0.5 : 1);
  }

  const lines: string[] = [];
  if (onions !== null) {
    if (form !== "fresh") lines.push(`Fresh onion: ≈ ${formatNumber(onions)} medium (≈ ${volume(onions * 48)} chopped)`);
    if (form !== "dried") lines.push(`Dried minced onion: ≈ ${volume(onions * 12)}`);
    if (form !== "powder") lines.push(`Onion powder: ≈ ${volume(onions * 3)}`);
  } else {
    lines.push("1 medium onion ≈ 1 cup chopped ≈ ¼ cup dried minced onion ≈ 1 tbsp onion powder");
  }
  const note =
    form === "fresh"
      ? "Dried onion and powder give onion flavor but none of the texture, moisture or sweetness fresh onion gets from cooking down."
      : "Fresh onion adds moisture, bite and texture that powder doesn't. In a smooth dip, grate or very finely mince it; in cooked dishes, soften it first.";
  return { title: describe(ing, scale), lines, note };
}

// ---------- herbs ----------
// Dried herbs are about 3× stronger by volume: 1 tsp dried ≈ 1 tbsp fresh.
const HERBS: Record<string, string> = {
  dill: "Dried dill is decent in dips and dressings but loses fresh dill's grassy brightness.",
  chives: "Dried chives are much milder than fresh; they work stirred into dips, less so as a topping.",
  parsley: "Dried parsley adds color more than flavor — fresh is far better when parsley matters.",
  basil: "Dried basil tastes noticeably different (more like oregano); fresh is strongly preferred for finishing.",
  cilantro: "Dried cilantro has very little flavor — not a good stand-in for fresh.",
  oregano: "Dried oregano is often preferred in long-cooked sauces; it's stronger and earthier.",
  thyme: "Dried thyme holds up well in cooked dishes.",
  rosemary: "Crush dried rosemary well — the needles stay woody.",
  sage: "Dried (rubbed) sage is stronger and dustier; start with less.",
  tarragon: "Dried tarragon is milder and less anise-y than fresh.",
  mint: "Dried mint suits cooked dishes; fresh is better raw.",
  marjoram: "Dried marjoram works well in cooked dishes.",
};

function herb(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.unit} ${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
  const name = Object.keys(HERBS).find((h) => new RegExp(`\\b${h}\\b`).test(text));
  if (!name || /seeds?\b|pickle|weed|oil/.test(text)) return null;
  const dried = /\b(dried|dry|ground|rubbed|flakes)\b/.test(text);
  const fresh = /\b(fresh|sprigs?|bunch|leaves|chopped|snipped)\b/.test(text);
  const q = qty(ing, scale);
  const tsp = q === null ? null : teaspoons(q, ing.unit);

  const lines: string[] = [];
  if (tsp !== null && dried && !fresh) lines.push(`Fresh ${name}: ≈ ${volume(tsp * 3)}, chopped`);
  else if (tsp !== null && fresh && !dried) lines.push(`Dried ${name}: ≈ ${volume(tsp / 3)}`);
  else lines.push(`1 tsp dried ${name} ≈ 1 tbsp fresh ${name}`);
  return { title: describe(ing, scale), lines, note: HERBS[name] };
}

// ---------- ginger ----------
// 1 tbsp fresh grated ≈ 1 tbsp jarred minced ≈ ¼ tsp ground ginger; 1 inch ≈ 1 tbsp grated.
function ginger(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.unit} ${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
  if (!/\bginger\b/.test(text) || /ginger (ale|beer|snaps?)|gingerbread|candied|crystallized/.test(text)) return null;
  const q = qty(ing, scale);
  const tsp = q === null ? null : teaspoons(q, ing.unit);
  const ground = /\b(ground|powder|dried)\b/.test(text);

  let freshTbsp: number | null = null;
  if (q !== null) {
    if (/\binch(es)?\b/.test(text)) freshTbsp = q;
    else if (tsp !== null) freshTbsp = ground ? tsp * 4 : tsp / 3;
  }
  const lines: string[] = [];
  if (freshTbsp !== null) {
    if (ground) lines.push(`Fresh or jarred ginger: ≈ ${volume(freshTbsp * 3)}, grated`);
    else {
      lines.push(`Jarred minced ginger: ≈ ${volume(freshTbsp * 3)}`);
      lines.push(`Ground ginger: ≈ ${volume(freshTbsp * 0.25)}`);
    }
  } else lines.push("1 tbsp fresh grated ginger ≈ 1 tbsp jarred ≈ ¼ tsp ground ginger");
  return {
    title: describe(ing, scale),
    lines,
    note: "Ground ginger is warmer and less bright than fresh — fine in baking and rubs, noticeably flatter in stir-fries and dressings.",
  };
}

// ---------- citrus juice ----------
// 1 lemon ≈ 2–3 tbsp juice; 1 lime ≈ 1–2 tbsp.
function citrus(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.unit} ${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
  const fruit = /\blemon\b/.test(text) ? "lemon" : /\blime\b/.test(text) ? "lime" : null;
  if (!fruit || !/juice/.test(text)) return null;
  const q = qty(ing, scale);
  const tsp = q === null ? null : teaspoons(q, ing.unit);
  const [lo, hi] = fruit === "lemon" ? [6, 9] : [3, 6]; // tsp of juice per fruit
  const lines: string[] = [];
  if (tsp !== null) lines.push(`Fresh: about ${range(tsp / hi, tsp / lo, (n) => `${formatNumber(n)} ${n > 1 ? `${fruit}s` : fruit}`)}`);
  else if (q !== null) lines.push(`Bottled juice: ≈ ${volume(q * lo)}–${volume(q * hi)}`);
  lines.push(`Bottled ${fruit} juice: same amount`);
  return {
    title: describe(ing, scale),
    lines,
    note: "Bottled juice works but tastes flatter and slightly bitter; fresh is noticeably brighter in dressings, dips and anything not cooked.",
  };
}

// ---------- butter ----------
// Salted butter has about ¼ tsp salt per ½ cup (1 stick).
function butter(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.unit} ${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
  if (!/\bbutter\b/.test(text) || /(peanut|almond|cashew|nut|apple|cocoa|sunflower|seed)\s+butter|buttermilk/.test(text)) return null;
  const unsalted = /\bunsalted\b/.test(text);
  const salted = /\bsalted\b/.test(text) && !unsalted;
  if (!unsalted && !salted) return null;
  const q = qty(ing, scale);
  let sticks: number | null = null;
  if (q !== null) {
    if (/\bsticks?\b/.test(text)) sticks = q;
    else {
      const tsp = teaspoons(q, ing.unit);
      if (tsp !== null) sticks = tsp / 24;
    }
  }
  const salt = sticks === null ? "about ¼ tsp per stick (½ cup)" : `about ${volume(sticks * 0.25)}`;
  return {
    title: describe(ing, scale),
    lines: [unsalted ? `Using salted butter: reduce the recipe's added salt by ${salt}` : `Using unsalted butter: add ${salt} salt`],
    note: "Brands vary in saltiness. In baking this is nearly identical; in a sauce or dip, taste before adding the rest of the salt.",
  };
}

// ---------- buttermilk ----------
function buttermilk(ing: Ingredient, scale: number): Conversion | null {
  const text = `${ing.name}`.toLowerCase();
  if (!/\bbuttermilk\b/.test(text)) return null;
  const q = qty(ing, scale);
  const tsp = q === null ? null : teaspoons(q, ing.unit);
  const cups = tsp === null ? 1 : tsp / 48;
  return {
    title: describe(ing, scale),
    lines: [
      `No buttermilk: ${volume(cups * 48)} milk + ${volume(cups * 3)} lemon juice or white vinegar, rest 5–10 minutes`,
    ],
    note: "Works well in pancakes, biscuits and cakes (close to identical rise). It's thinner and less tangy than real buttermilk, so dressings and dips come out runnier.",
  };
}

const CONVERTERS = [garlic, onion, herb, ginger, citrus, butter, buttermilk];

/** One conversion per ingredient that has alternative forms, in recipe order. */
export function conversionsFor(ingredients: Ingredient[], scale = 1): Conversion[] {
  const out: Conversion[] = [];
  for (const ing of ingredients) {
    for (const convert of CONVERTERS) {
      const c = convert(ing, scale);
      if (c) {
        out.push(c);
        break;
      }
    }
  }
  return out;
}
