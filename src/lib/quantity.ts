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

  // Protect a package-size parenthetical right after the leading count.
  let protectedRange: [number, number] | null = null;
  const pkg = text.match(new RegExp(`^\\s*(?:${NUMBER.source})\\s*(\\([^)]*\\))`));
  if (pkg) {
    const end = pkg[0].length;
    protectedRange = [end - pkg[1].length, end];
  }

  const scaled = text.replace(NUMBER, (token, offset: number) => {
    if (protectedRange && offset >= protectedRange[0] && offset < protectedRange[1]) return token;
    const leadingSpace = token.match(/^\s*/)![0];
    const value = parseNumber(token) * factor;
    return leadingSpace + formatNumber(value, /\./.test(token));
  });
  return fixPlurals(scaled);
}

// Units whose plural is just "+s". Abbreviations (tsp, oz, lb) don't change.
const UNITS = ["cup", "tablespoon", "teaspoon", "pound", "ounce", "clove", "can", "stick", "slice", "package", "block", "pint", "quart", "gallon", "jar", "bag", "box", "egg", "pinch", "dash"];
const UNIT_AFTER_NUMBER = new RegExp(`(${NUMBER.source})(\\s+)(${UNITS.join("|")})(e?s)?\\b`, "gi");

/** "2 cup" → "2 cups", "½ cups" → "½ cup" */
function fixPlurals(text: string): string {
  return text.replace(UNIT_AFTER_NUMBER, (_m, num: string, space: string, unit: string) => {
    const plural = parseNumber(num) > 1;
    const suffix = !plural ? "" : /(ch|sh)$/i.test(unit) || /box$/i.test(unit) ? "es" : "s";
    return `${num}${space}${unit}${suffix}`;
  });
}

/** Splits "1 1/2 cups" into quantity "1 1/2" and unit "cups" (for the recipe editor). */
export function splitAmount(text: string): { quantity: string; unit: string } {
  const m = text.trim().match(new RegExp(`^((?:(?:${NUMBER.source})\\s*(?:[-–]|to)?\\s*)+)(.*)$`));
  if (!m) return { quantity: "", unit: text.trim() };
  return { quantity: m[1].trim(), unit: m[2].trim() };
}
