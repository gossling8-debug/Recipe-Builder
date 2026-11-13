/**
 * Scaling amounts like "1 1/2 cups", "½ cup (120 ml)" or "2 lbs (910 g)".
 *
 * Every number in the amount is multiplied, with one exception: a
 * parenthetical that comes straight after the leading count, as in
 * "2 (8 oz) blocks", describes the package size, so doubling the recipe
 * means 4 blocks, still 8 oz each.
 */

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4,
  "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

// Mixed numbers first so "1 1/2" isn't read as "1" then "1/2".
const NUMBER = new RegExp(
  [
    `\\d+\\s+\\d+\\/\\d+`, // 1 1/2
    `\\d+\\/\\d+`, // 1/2
    `\\d*\\s?[${FRACTION_CHARS}]`, // 1½, 1 ½, ½
    `\\d+(?:\\.\\d+)?`, // 2, 0.5
  ].join("|"),
  "g",
);

export function parseNumber(token: string): number {
  const t = token.trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(new RegExp(`^(\\d*)\\s?([${FRACTION_CHARS}])$`));
  if (m) return (m[1] ? Number(m[1]) : 0) + UNICODE_FRACTIONS[m[2]];
  return Number(t);
}

const NICE_FRACTIONS: [number, string][] = [
  [0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""],
];

/** 1.5 → "1½", 0.333 → "⅓", 1365 → "1365", 2.5 (decimal style) → "2.5" */
export function formatNumber(value: number, decimalStyle = false): string {
  if (value >= 10) return String(Math.round(value));
  if (decimalStyle) return String(Math.round(value * 100) / 100);
  let whole = Math.floor(value);
  const frac = value - whole;
  let best = NICE_FRACTIONS[0];
  for (const f of NICE_FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  if (best[0] === 1) {
    whole += 1;
    best = NICE_FRACTIONS[0];
  }
  if (whole === 0 && best[1] === "") return value > 0 ? "⅛" : "0";
  return `${whole || ""}${best[1]}`;
}

export function scaleAmount(text: string, factor: number): string {
  if (factor === 1 || !text) return text;

  // Protect a package-size parenthetical right after the leading count ("1 (12 oz) can")
  // or after the package itself ("1 large bag (12 oz)"): that's the size of each package.
  let protectedRange: [number, number] | null = null;
  const before = text.match(new RegExp(`^\\s*(?:${NUMBER.source})\\s*(\\([^)]*\\))`));
  const after = before
    ? null
    : text.match(new RegExp(`^\\s*(?:${NUMBER.source})\\s+(?:(?:${SIZES.join("|")})\\s+){0,2}(?:${PACKAGES.join("|")})(?:e?s)?\\s*(\\([^)]*\\))`, "i"));
  const pkg = before ?? after;
  if (pkg) {
    const end = pkg[0].length;
    protectedRange = [end - pkg[1].length, end];
  }

  const scaled = text.replace(NUMBER, (token, offset: number) => {
    if (protectedRange && offset >= protectedRange[0] && offset < protectedRange[1]) return token;
    if (isNotAnAmount(text.slice(0, offset), text.slice(offset + token.length))) return token;
    const leadingSpace = token.match(/^\s*/)![0];
    const value = parseNumber(token) * factor;
    return leadingSpace + formatNumber(value, /\./.test(token));
  });
  const out = fixPlurals(scaled);
  // More than one package: say the size is for each ("2 large bags (12 oz each)").
  if (after) {
    const count = out.match(new RegExp(`^\\s*(${NUMBER.source})`));
    if (count && parseNumber(count[1]) > 1) return out.replace(/\(([^)]*?)\)/, (m, inner: string) => (/\beach\b/i.test(inner) ? m : `(${inner} each)`));
  }
  return out;
}

// Units whose plural is just "+s". Abbreviations (tsp, oz, lb) don't change.
const UNITS = [
  "cup", "tablespoon", "teaspoon", "pound", "ounce", "clove", "can", "stick", "slice", "package", "block", "pint", "quart",
  "gallon", "jar", "bag", "box", "egg", "pinch", "dash", "bar", "bottle", "carton", "container", "envelope", "packet", "bunch",
  "head", "sprig", "tub", "piece", "stalk", "sheet", "handful", "scoop", "drop", "square", "tube", "pouch", "loaf",
];
// Containers bought whole: a size after them, "1 large bag (12 oz)", is the size of each one.
const PACKAGES = ["can", "stick", "package", "block", "jar", "bag", "box", "bar", "bottle", "carton", "container", "envelope", "packet", "tub", "tube", "pouch", "loaf"];
// Size words that may sit between the number and the unit: "2 large jars", "4 small cans".
const SIZES = ["large", "small", "medium", "giant", "big", "jumbo", "extra-large", "extra large", "mini", "regular", "whole", "heaping", "level", "scant", "generous", "family-size", "family size", "king-size"];
const UNIT_AFTER_NUMBER = new RegExp(
  `(${NUMBER.source})(\\s+)((?:(?:${SIZES.join("|")})\\s+){0,2})(${UNITS.join("|")})(e?s|ves)?\\b`,
  "gi",
);

/** "2 cup" → "2 cups", "2 large jar" → "2 large jars", "½ cups" → "½ cup", "2 loaf" → "2 loaves" */
export function fixPlurals(text: string): string {
  return text.replace(UNIT_AFTER_NUMBER, (_m, num: string, space: string, size: string, unit: string) => {
    const plural = parseNumber(num) > 1;
    if (/^loaf$/i.test(unit)) return `${num}${space}${size}${plural ? unit.slice(0, -1) + "ves" : unit}`;
    const suffix = !plural ? "" : /(ch|sh)$/i.test(unit) || /box$/i.test(unit) ? "es" : "s";
    return `${num}${space}${size}${unit}${suffix}`;
  });
}

// Numbers that label something rather than measure it: "step 1", "#2",
// "15 minutes", "350°F", "9x13 pan", "8-inch". These never scale.
const LABEL_BEFORE = /\b(?:steps?|stage|part|no\.?|number)\s*$|#\s*$/i;
const NOT_AMOUNT_AFTER = /^\s*(?:°|degrees?\b|minutes?\b|mins?\b|hours?\b|hrs?\b|seconds?\b|secs?\b|-?\s?inch(?:es)?\b|in\.|"|\s*[x×]\s*\d)/i;
const NOT_AMOUNT_BEFORE = /\d\s*[x×]\s*$/i;

function isNotAnAmount(before: string, after: string): boolean {
  return LABEL_BEFORE.test(before) || NOT_AMOUNT_AFTER.test(after) || NOT_AMOUNT_BEFORE.test(before);
}

/** Splits "1 1/2 cups" into quantity "1 1/2" and unit "cups" (for the recipe editor). */
export function splitAmount(text: string): { quantity: string; unit: string } {
  const m = text.trim().match(new RegExp(`^((?:(?:${NUMBER.source})\\s*(?:[-–]|to)?\\s*)+)(.*)$`));
  if (!m) return { quantity: "", unit: text.trim() };
  return { quantity: m[1].trim(), unit: m[2].trim() };
}

type IngredientAmount = { quantity: string; unit: string; preparation: string | null };

/**
 * An ingredient's note at the chosen size. Notes that are themselves amounts
 * scale with the recipe ("or 2 small jars" → "or 4 small jars", "plus 2 tbsp",
 * "about 3 cups"); other notes ("chopped", "divided") stay as they are.
 */
export function scaleNote(note: string | null, factor: number): string | null {
  if (!note) return note;
  return /^\s*(or|plus|\+|about|approx\.?|approximately)\s/i.test(note) ? scaleAmount(note, factor) : note;
}

/** The list's alternative amount ("or 2 small jars"), if the ingredient has one. */
const alternativeOf = (ing: IngredientAmount | undefined) => {
  const alt = ing?.preparation?.trim() ?? "";
  return /^or\s/i.test(alt) ? alt : "";
};

/**
 * A step's amount at the chosen size. When the step uses the whole amount and
 * the list gives an alternative, the alternative shows (and scales) too:
 * "1 large jar" + "or 2 small jars", doubled → "2 large jars (or 4 small jars)".
 */
export function stepAmount(amount: string, ing: IngredientAmount | undefined, factor: number): string {
  const scaled = scaleAmount(amount, factor);
  const alt = alternativeOf(ing);
  if (!alt) return scaled;
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const full = norm([ing!.quantity, ing!.unit].filter((t) => t.trim()).join(" "));
  if (!full || norm(amount) !== full || norm(amount).includes(norm(alt))) return scaled;
  return `${scaled} (${scaleAmount(alt, factor)})`;
}

/** An ingredient-list line at the chosen size: "2 large jars marshmallow creme, or 4 small jars". */
export function ingredientText(ing: IngredientAmount & { name: string }, factor: number): string {
  const amount = scaleAmount([ing.quantity, ing.unit].map((t) => t.trim()).filter(Boolean).join(" "), factor);
  const head = [amount, ing.name.trim()].filter(Boolean).join(" ");
  const note = scaleNote(ing.preparation, factor);
  return note ? `${head}, ${note}` : head;
}
