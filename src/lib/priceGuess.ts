import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { describeApiError, makeClient, ScanError } from "./claude";
import { MODELS } from "./models";
import { parseQty, type Qty } from "./qty";
import { recordUsage } from "./usage";

/**
 * Typical store prices for ingredients you've never bought through the app,
 * so a budget plan has something to go on. Clearly marked as estimates; a
 * price you pay always takes over. Kept on this phone for 90 days.
 */
export interface PriceGuess {
  price: number;
  size: string; // the typical package, e.g. "1 lb", "16 oz can"
  at: number;
}
const KEY = "recipe-builder.priceGuesses";
const KEEP = 90 * 86_400_000;

export function loadGuesses(now = Date.now()): Record<string, PriceGuess> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, PriceGuess>;
    return Object.fromEntries(Object.entries(all).filter(([, g]) => now - g.at < KEEP && g.price > 0));
  } catch {
    return {};
  }
}
function saveGuesses(g: Record<string, PriceGuess>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* this visit only */
  }
}
export const guessQty = (g: PriceGuess, name: string): Qty | null => parseQty(g.size, name);

const Schema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().describe("The [number] of the ingredient."),
      package: z
        .string()
        .describe('The usual smallest package a home cook buys, as a quantity with a unit, e.g. "1 lb", "16 oz", "1 dozen", "3 lb bag", "1 bunch", "1 head", "32 fl oz".'),
      price_usd: z.number().describe("Typical price of that package at a mid-priced US supermarket, in dollars."),
    }),
  ),
});

/** Estimates prices for these ingredients (only ones not already estimated). */
export async function guessPrices(apiKey: string, names: { key: string; name: string }[]): Promise<number> {
  const have = loadGuesses();
  const todo = names.filter((n) => !have[n.key]).slice(0, 80);
  if (!todo.length) return 0;
  const m = MODELS.find((x) => x.id === "claude-haiku-5-5") ?? MODELS[MODELS.length - 1];
  const client = await makeClient(apiKey, "prices");
  let response;
  try {
    response = await client.beta.messages.parse({
      model: m.id,
      max_tokens: 4000,
      output_config: { format: betaZodOutputFormat(Schema) },
      system:
        "You estimate everyday US grocery prices for a meal-budget app. For each ingredient, give the usual smallest package a home cook would buy and a typical current price for it at a mid-priced supermarket (not a warehouse club, not organic unless named). Round to the cent. If an ingredient is vague, assume the most common kind.",
      messages: [{ role: "user", content: todo.map((n, i) => `[${i}] ${n.name}`).join("\n") }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  recordUsage("prices", m.id, response.usage);
  const out = response.parsed_output?.items ?? [];
  const now = Date.now();
  const next = { ...have };
  for (const it of out) {
    const n = todo[it.index];
    if (n && it.price_usd > 0 && it.price_usd < 200) next[n.key] = { price: Math.round(it.price_usd * 100) / 100, size: it.package.slice(0, 40), at: now };
  }
  saveGuesses(next);
  return out.length;
}
