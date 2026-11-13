import { stepAmount } from "./quantity";
import type { Step } from "./schema";

// ---------- making recipe text sound natural ----------
const FRACTIONS: Record<string, string> = {
  "½": "a half", "¼": "a quarter", "¾": "three quarters", "⅓": "a third", "⅔": "two thirds",
  "⅛": "an eighth", "⅜": "three eighths", "⅝": "five eighths", "⅞": "seven eighths",
  "1/2": "a half", "1/4": "a quarter", "3/4": "three quarters", "1/3": "a third", "2/3": "two thirds", "1/8": "an eighth",
};
const UNITS: [RegExp, string, string][] = [
  [/\btsp\b/gi, "teaspoon", "teaspoons"],
  [/\btbsp\b|\btbs\b/gi, "tablespoon", "tablespoons"],
  [/\boz\b/gi, "ounce", "ounces"],
  [/\blbs?\b/gi, "pound", "pounds"],
  [/\bg\b(?=[\s,.;)]|$)/g, "gram", "grams"],
  [/\bml\b/gi, "milliliter", "milliliters"],
  [/\bmins?\b/gi, "minute", "minutes"],
  [/\bhrs?\b/gi, "hour", "hours"],
];

/** "1½ tsp" → "1 and a half teaspoons"; "350°F" → "350 degrees"; "2 (8 oz/227 g) blocks" → "2 blocks, 8 ounces each". */
export function speakable(text: string): string {
  let s = text
    .replace(/(\S+)\s*\(([^)/]+)(?:\/[^)]*)?\)\s+(\w+)/g, "$1 $3, $2 each") // package size
    .replace(/\s*\((\d[\d.,\s]*(g|ml|kg|l))\)/gi, "") // metric conversions in parentheses
    .replace(/°\s*F\b/g, " degrees").replace(/°\s*C\b/g, " degrees Celsius").replace(/°/g, " degrees")
    .replace(/(\d)\s*(?:-|–)\s*(\d)/g, "$1 to $2");
  // Mixed numbers and fractions.
  s = s.replace(/(\d+)\s*(½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞)/g, (_, w, f) => `${w} and ${FRACTIONS[f]}`);
  s = s.replace(/(\d+)\s+(1\/2|1\/4|3\/4|1\/3|2\/3|1\/8)\b/g, (_, w, f) => `${w} and ${FRACTIONS[f]}`);
  s = s.replace(/(½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞)|\b(1\/2|1\/4|3\/4|1\/3|2\/3|1\/8)\b/g, (m) => FRACTIONS[m]);
  // Units, singular after "1" or a fraction alone, plural otherwise.
  for (const [re, one, many] of UNITS) {
    s = s.replace(new RegExp(`(\\S+)(\\s*)${re.source}`, re.flags), (_m, before: string, space: string, offset: number, all: string) => {
      // "1 cup", "a half cup" — but "1 and a half cups".
      const pureFraction = /^(a|an|half|quarter|third|eighth)$/.test(before) && !/\band an?\s*$/.test(all.slice(0, offset).slice(-8));
      const singular = before === "1" || pureFraction;
      return `${before}${space || " "}${singular ? one : many}`;
    });
  }
  return s.replace(/\s+/g, " ").trim();
}

export interface Chunk {
  text: string; // what's said
  afterIngredient: boolean; // pause a little longer after it, to add the ingredient
}

/**
 * A step broken into what's read at once: each piece ends right after an
 * ingredient and its amount ("Add the chicken, 2 pounds,"), so there's a
 * pause to add it; long plain text is split into sentences.
 */
export function stepChunks(step: Step, scale: number, ingredients: { quantity: string; unit: string; preparation: string | null }[] = []): Chunk[] {
  const out: Chunk[] = [];
  let buf = "";
  const flushSentences = (text: string, last: boolean) => {
    const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
    parts.forEach((p, i) => {
      if (p.trim()) out.push({ text: speakable(p.trim()), afterIngredient: false });
      if (!last && i === parts.length - 1) return;
    });
  };
  for (const seg of step.segments) {
    if (seg.ingredient_index === null) {
      buf += seg.text;
      continue;
    }
    const amount = seg.amount ? `, ${stepAmount(seg.amount, ingredients[seg.ingredient_index], scale)}` : "";
    // Read earlier full sentences on their own, then the part leading into this ingredient.
    const lastStop = Math.max(buf.lastIndexOf(". "), buf.lastIndexOf("! "), buf.lastIndexOf("? "));
    if (lastStop >= 0) {
      flushSentences(buf.slice(0, lastStop + 1), false);
      buf = buf.slice(lastStop + 1);
    }
    out.push({ text: speakable(`${buf}${seg.text}${amount}`.trim()), afterIngredient: true });
    buf = "";
  }
  if (buf.trim()) flushSentences(buf, true);
  return out.filter((c) => c.text && /[a-z0-9]/i.test(c.text));
}

// ---------- voice commands ----------
export type Command = "pause" | "resume" | "next" | "back" | "repeat";

const COMMANDS: [Command, RegExp][] = [
  ["pause", /\b(pause|stop|wait|hold on|hang on)\b/],
  ["resume", /\b(continue|resume|go on|go ahead|keep going|play)\b/],
  ["repeat", /\b(repeat|again|say that again|what)\b/],
  ["back", /\b(go back|back|previous)\b/],
  ["next", /\b(next|next step)\b/],
];

/**
 * The command in what was heard, if any. Words that the phone itself is
 * saying right now ("…and wait 2 minutes") are ignored, so reading a recipe
 * aloud can't pause itself.
 */
export function parseCommand(heard: string, nowSpeaking = ""): Command | null {
  const h = heard.toLowerCase();
  const own = nowSpeaking.toLowerCase();
  // Prefer the last thing said.
  let best: { cmd: Command; at: number } | null = null;
  for (const [cmd, re] of COMMANDS) {
    const all = [...h.matchAll(new RegExp(re.source, "g"))];
    for (const m of all) {
      if (own && new RegExp(`\\b${m[0]}\\b`).test(own)) continue;
      if (!best || m.index! > best.at) best = { cmd, at: m.index! };
    }
  }
  return best?.cmd ?? null;
}
