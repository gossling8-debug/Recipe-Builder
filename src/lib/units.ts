import { useEffect, useState } from "react";
import { formatNumber, parseNumber, splitAmount } from "./quantity";
import type { ScannedRecipe } from "./schema";

/**
 * Showing a recipe in US or metric units.
 *
 * Converted: cups / fl oz / pints / quarts / gallons ↔ mL / L, oz / lb ↔ g / kg,
 * °F ↔ °C, inches ↔ cm. Teaspoons and tablespoons are left alone: they're
 * used the same way in metric kitchens. When the card already gives both
 * ("2 lbs (910 g)"), the card's own figure is used. Cups of staples whose
 * weight per cup is well known (flour, sugar, butter…) become grams in metric,
 * and grams become cups in US — marked ≈ because it's a typical weight.
 */
export type UnitSystem = "original" | "us" | "metric";

const KEY = "recipe-builder.units";
let memory: UnitSystem = "original";

export function getUnits(): UnitSystem {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "us" || v === "metric" || v === "original") return v;
  } catch {
    /* blocked */
  }
  return memory;
}

export function setUnits(u: UnitSystem): void {
  memory = u;
  try {
    localStorage.setItem(KEY, u);
  } catch {
    /* session only */
  }
  window.dispatchEvent(new Event("units-changed"));
}

export function useUnits(): [UnitSystem, (u: UnitSystem) => void] {
  const [u, set] = useState(getUnits);
  useEffect(() => {
    const on = () => set(getUnits());
    window.addEventListener("units-changed", on);
    return () => window.removeEventListener("units-changed", on);
  }, []);
  return [u, setUnits];
}

// ---------- the conversion ----------
const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d*\s?[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?`;
const AMOUNT = String.raw`(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?`;

const US_VOLUME_ML: [RegExp, number][] = [
  [/^(?:fl\.?\s*oz\.?|fluid\s+ounces?)$/i, 29.57],
  [/^(?:cups?|c\.?)$/i, 236.6],
  [/^(?:pints?|pts?\.?)$/i, 473.2],
  [/^(?:quarts?|qts?\.?)$/i, 946.4],
  [/^(?:gallons?|gal\.?)$/i, 3785],
];
const US_WEIGHT_G: [RegExp, number][] = [
  [/^(?:oz\.?|ounces?)$/i, 28.35],
  [/^(?:lbs?\.?|pounds?)$/i, 453.6],
];
const METRIC_VOLUME_ML: [RegExp, number][] = [
  [/^(?:ml|millilit(?:er|re)s?)$/i, 1],
  [/^(?:cl)$/i, 10],
  [/^(?:dl)$/i, 100],
  [/^(?:l|lit(?:er|re)s?)$/i, 1000],
];
const METRIC_WEIGHT_G: [RegExp, number][] = [
  [/^(?:g|grams?|gr)$/i, 1],
  [/^(?:kg|kilograms?|kilos?)$/i, 1000],
];
const UNIT_WORDS =
  String.raw`fl\.?\s*oz\.?|fluid\s+ounces?|cups?|c\.|pints?|pts?\.?|quarts?|qts?\.?|gallons?|gal\.?|oz\.?|ounces?|lbs?\.?|pounds?|` +
  String.raw`ml|millilit(?:er|re)s?|cl|dl|lit(?:er|re)s?|l|grams?|gr|g|kg|kilograms?|kilos?`;

const find = (table: [RegExp, number][], unit: string) => table.find(([re]) => re.test(unit.trim()))?.[1];

/** Typical grams per cup for staples, so "250 g flour" can read "≈ 2 cups". */
const GRAMS_PER_CUP: [RegExp, number][] = [
  [/powdered sugar|confectioner|icing sugar/i, 120],
  [/brown sugar/i, 220],
  [/sugar/i, 200],
  [/bread flour/i, 130],
  [/almond flour/i, 96],
  [/flour/i, 125],
  [/\boats\b/i, 90],
  [/cocoa/i, 85],
  [/\brice\b/i, 185],
];
/** For metric: staples that metric recipes weigh rather than measure. */
const WEIGH_IN_METRIC: [RegExp, number][] = [...GRAMS_PER_CUP, [/\bbutter\b(?!milk)/i, 227], [/chocolate chips/i, 170]];

const round = (n: number, step: number) => Math.round(n / step) * step;
const trim = (n: number) => String(Math.round(n * 100) / 100);

function metricVolume(ml: number): string {
  if (ml >= 1000) return `${trim(round(ml / 1000, 0.05))} L`;
  return `${ml < 20 ? Math.round(ml) : ml < 100 ? round(ml, 5) : round(ml, 10)} mL`;
}
function metricWeight(g: number): string {
  if (g >= 1000) return `${trim(round(g / 1000, 0.05))} kg`;
  return `${g < 20 ? Math.round(g) : g < 250 ? round(g, 5) : round(g, 10)} g`;
}
function usVolume(ml: number): string {
  const tsp = ml / 4.929;
  if (tsp >= 12) {
    const cups = tsp / 48;
    if (cups >= 8) return `${formatNumber(cups / 4)} quarts`;
    return `${formatNumber(cups)} ${cups > 1.06 ? "cups" : "cup"}`;
  }
  if (tsp >= 3) return `${formatNumber(round(tsp / 3, 0.5))} tbsp`;
  return `${formatNumber(tsp)} tsp`;
}
function usWeight(g: number, name: string): string {
  const gpc = GRAMS_PER_CUP.find(([re]) => re.test(name))?.[1];
  if (gpc) {
    const cups = g / gpc;
    if (cups >= 0.25) return `≈ ${formatNumber(cups)} ${cups > 1.06 ? "cups" : "cup"}`;
    return `≈ ${formatNumber(round((cups * 48) / 3, 0.5))} tbsp`;
  }
  const oz = g / 28.35;
  if (oz >= 16) return `${trim(round(oz / 16, 0.1))} lb`;
  return `${oz < 4 ? trim(round(oz, 0.5)) : Math.round(oz)} oz`;
}

function convertOne(n: number, unit: string, to: "us" | "metric", name: string): string | null {
  if (to === "metric") {
    const v = find(US_VOLUME_ML, unit);
    const gpc = WEIGH_IN_METRIC.find(([re]) => re.test(name))?.[1];
    if (v && gpc && /cup/i.test(unit)) return `≈ ${metricWeight(n * gpc)}`;
    if (v) return metricVolume(n * v);
    const w = find(US_WEIGHT_G, unit);
    if (w) return metricWeight(n * w);
  } else {
    const v = find(METRIC_VOLUME_ML, unit);
    if (v) return usVolume(n * v);
    const w = find(METRIC_WEIGHT_G, unit);
    if (w) return usWeight(n * w, name);
  }
  return null;
}

const isTarget = (unit: string, to: "us" | "metric") =>
  to === "metric"
    ? !!(find(METRIC_VOLUME_ML, unit) || find(METRIC_WEIGHT_G, unit))
    : !!(find(US_VOLUME_ML, unit) || find(US_WEIGHT_G, unit));

/** Converts every amount, temperature and size in a piece of text. */
export function convertText(text: string, to: UnitSystem, name = ""): string {
  if (to === "original" || !text) return text;
  let out = text;

  // "2 lbs (910 g)" → "910 g": the card's own conversion beats ours.
  out = out.replace(
    new RegExp(String.raw`(?:${AMOUNT})\s*(${UNIT_WORDS})\s*\(\s*((?:${NUM})(?:\s*(?:-|–|to)\s*(?:${NUM}))?\s*(${UNIT_WORDS}))\s*\)`, "gi"),
    (all, _a, _b, unit: string, inner: string, innerUnit: string) =>
      !isTarget(unit, to) && isTarget(innerUnit, to) ? inner.trim() : all,
  );

  // Amounts: "1½ cups", "2-3 lbs", "(8 oz)", "500 g".
  out = out.replace(
    new RegExp(String.raw`(^|[^\w/.])(?:${AMOUNT})\s*(${UNIT_WORDS})(?![\w])`, "gi"),
    (all, pre: string, a: string, b: string | undefined, unit: string) => {
      const sys = to as "us" | "metric";
      const lo = convertOne(parseNumber(a), unit, sys, name);
      if (!lo) return all;
      if (!b) return pre + lo;
      // "2-3 lbs" → "910 g–1.35 kg", or "1–1½ cups" style when the unit matches.
      const hi = convertOne(parseNumber(b), unit, sys, name)!;
      const split = (t: string) => t.replace(/^≈ /, "").match(/^(\S+)\s(.+)$/)!;
      const [, loN, loU] = split(lo);
      return loU === split(hi)[2] ? `${pre}${lo.startsWith("≈") ? "≈ " : ""}${loN}–${hi.replace(/^≈ /, "")}` : `${pre}${lo}–${hi.replace(/^≈ /, "")}`;
    },
  );

  // Temperatures: "350°F", "350 degrees F", "180 °C".
  out = out.replace(/(\d{2,3})\s*(?:°\s*|degrees?\s*)([FC])\b/gi, (all, deg: string, scale: string) => {
    const d = Number(deg);
    if (to === "metric" && /f/i.test(scale)) return `${round(((d - 32) * 5) / 9, 5)}°C`;
    if (to === "us" && /c/i.test(scale)) return `${(d * 9) / 5 + 32 >= 250 ? round((d * 9) / 5 + 32, 25) : round((d * 9) / 5 + 32, 5)}°F`;
    return all;
  });
  // "350 degrees" or "350°" with no F: oven temperatures on US cards.
  if (to === "metric") out = out.replace(/\b([23]\d{2}|4[0-5]\d)\s*(?:°|degrees?\b)(?!\s*[FC]\b)/gi, (_m, d: string) => `${round(((Number(d) - 32) * 5) / 9, 5)}°C`);

  // Sizes: "9x13-inch", "8 inch", "1-inch pieces", "2 cm".
  const cm = (inch: number) => (inch * 2.54 < 3 ? trim(round(inch * 2.54, 0.5)) : String(Math.round(inch * 2.54)));
  const inch = (c: number) => formatNumber(round(c / 2.54, 0.5));
  if (to === "metric") {
    out = out.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?[\s-]*(?:inch(?:es)?|in\.|")/gi, (_m, a, b, c) =>
      [a, b, c].filter(Boolean).map((x) => cm(Number(x))).join("×") + " cm",
    );
    out = out.replace(new RegExp(String.raw`(${NUM})[\s-]*(?:inch(?:es)?\b|in\.|")`, "gi"), (_m, a: string) => `${cm(parseNumber(a))} cm`);
  } else if (to === "us") {
    out = out.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?\s*cm\b/gi, (_m, a, b, c) =>
      [a, b, c].filter(Boolean).map((x) => inch(Number(x))).join("×") + " inch",
    );
    out = out.replace(/(\d+(?:\.\d+)?)\s*(?:-\s*)?cm\b/gi, (_m, a: string) => `${inch(Number(a))} inch`);
  }
  return out;
}

/** The recipe with its amounts, temperatures and sizes in the chosen units. */
export function convertRecipe<T extends ScannedRecipe>(r: T, to: UnitSystem): T {
  if (to === "original") return r;
  return {
    ...r,
    time: r.time && convertText(r.time, to),
    ingredients: r.ingredients.map((ing) => {
      const text = [ing.quantity, ing.unit].map((s) => s.trim()).filter(Boolean).join(" ");
      const conv = convertText(text, to, ing.name);
      if (conv === text) return { ...ing, preparation: ing.preparation && convertText(ing.preparation, to) };
      const { quantity, unit } = splitAmount(conv.replace(/^≈\s*/, ""));
      return { ...ing, quantity: conv.startsWith("≈") ? `≈ ${quantity}` : quantity, unit, preparation: ing.preparation && convertText(ing.preparation, to) };
    }),
    steps: r.steps.map((st) => ({
      segments: st.segments.map((sg) => {
        const name = sg.ingredient_index === null ? "" : (r.ingredients[sg.ingredient_index]?.name ?? "");
        return { ...sg, text: convertText(sg.text, to), amount: sg.amount && convertText(sg.amount, to, name) };
      }),
    })),
    notes: r.notes && convertText(r.notes, to),
  };
}
