import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { recordUsage } from "./usage";
import { recipeToText } from "./share";
import type { ScannedRecipe } from "./schema";

export const NutritionSchema = z.object({
  source: z
    .enum(["card", "estimate"])
    .describe('"card" if the recipe itself lists nutrition facts (calories etc. per serving); otherwise "estimate".'),
  servings: z.number().describe("How many servings the numbers are divided by: the recipe's own yield, or a sensible guess if it gives none."),
  servings_note: z.string().describe('Where the servings number came from, e.g. "From the card: serves 6" or "The card doesn\'t say; assumed 8 slices".'),
  serving_size: z.object({
    measure: z
      .string()
      .describe('One serving in everyday kitchen terms, as served (cooked), e.g. "about 1½ cups", "1 slice (⅛ of the pie)", "2 enchiladas", "about ½ cup dip".'),
    weight_g: z.number().describe("Approximate weight of one serving as served, in grams."),
  }),
  per_serving: z.object({
    calories: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    saturated_fat_g: z.number(),
    fiber_g: z.number(),
    sugar_g: z.number(),
    sodium_mg: z.number(),
  }),
  confidence: z.enum(["Fairly close", "Rough", "Very rough"]).describe("How close the estimate is likely to be, given vague amounts like 'to taste' or unknown brands."),
  caveats: z.string().describe("One or two short sentences on what most affects accuracy (e.g. how much oil is absorbed, brand of sausage)."),
  healthier: z
    .array(
      z.object({
        ingredient_index: z.number().int().describe("The [number] of the ingredient this swap replaces."),
        ingredient: z.string().describe("The ingredient as written in the recipe."),
        substitute: z.string().describe('What to use instead, e.g. "Plain Greek yogurt (2%)".'),
        short_name: z.string().describe('How the recipe should name it in the steps, lowercase, no brands, e.g. "greek yogurt".'),
        amount: z.string().describe('Amount for the recipe as written, starting with a number, e.g. "1 cup". No extra words.'),
        calories_change: z.number().describe("Change in calories PER SERVING (negative = fewer)."),
        benefit: z.string().describe('The main health gain in a few words, e.g. "less saturated fat, more protein".'),
        what_changes: z.string().describe("Honest description of how taste or texture changes."),
      }),
    )
    .describe("0–4 swaps that make a real difference without ruining the dish. Skip trivial ones. Empty if the recipe is already light."),
  tips: z.array(z.string()).describe("0–3 short method tips (e.g. bake instead of fry, smaller portions with a side salad). Empty if none."),
});
/** Estimates saved before serving sizes were added don't have one. */
type Full = z.infer<typeof NutritionSchema>;
export type Nutrition = Omit<Full, "serving_size" | "source"> & { serving_size?: Full["serving_size"]; source?: Full["source"] };

const SYSTEM = `You are a careful nutrition estimator and practical home cook. Estimate nutrition per serving for the recipe as written, using standard values (USDA-style) for each ingredient and typical products where brands aren't given. Count only what ends up eaten: for deep frying, estimate absorbed oil; for marinades that are discarded, count only a part.

If the recipe itself lists nutrition facts (often in the notes, e.g. "Per serving: 437 kcal, 31 g protein"), use the recipe's own numbers exactly, set source to "card", and its servings and serving size if given. Only estimate values the recipe doesn't list, and say which ones in caveats. Calories changes for swaps are still your estimates.

Also say how big one serving is: a kitchen measure the cook can dish up with (cups, slices, pieces) and its weight, both for the food as served — cooked and with its sauce. The total of all servings should roughly match the finished dish (water cooks off, pasta absorbs it).

Be honest about uncertainty. Don't round to look precise — calories to the nearest 10, grams to whole numbers, sodium to the nearest 10 mg.

Then suggest a few healthier swaps that keep the dish recognisably itself. Be candid about how each changes the taste or texture; don't oversell. Give amounts for the recipe as written. If the recipe is already a light dish, say so with an empty list. Never give medical advice.`;

export async function estimateNutrition(apiKey: string, recipe: ScannedRecipe, avoidLabels: string[]): Promise<Nutrition> {
  const client = makeClient(apiKey);
  const m = getModel();
  const list = recipe.ingredients.map((ing, i) => `[${i}] ${[ing.quantity, ing.unit, ing.name, ing.preparation].filter(Boolean).join(" ")}`);
  const prompt = [
    avoidLabels.length ? `The cook avoids: ${avoidLabels.join(", ")}. Don't suggest swaps that contain these.\n` : "",
    "Ingredients (numbered):",
    ...list,
    "",
    "Full recipe:",
    recipeToText(recipe, 1),
  ].join("\n");

  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 6000,
      output_config: { effort: "medium", format: betaZodOutputFormat(NutritionSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  recordUsage("nutrition", m.id, response.usage);
  if (response.stop_reason === "refusal") throw new ScanError("Claude couldn't answer this one. Try again later.");
  if (!response.parsed_output) throw new ScanError("Claude's answer couldn't be read. Please try again.");
  const out = response.parsed_output;
  // Drop swaps that point at an ingredient that doesn't exist.
  return { ...out, healthier: out.healthier.filter((h) => h.ingredient_index >= 0 && h.ingredient_index < recipe.ingredients.length) };
}

/** Calories per serving once the chosen healthier swaps are in. */
export function caloriesWithSwaps(n: Nutrition, chosen: (h: Nutrition["healthier"][number]) => boolean): number {
  return Math.max(0, n.per_serving.calories + n.healthier.filter(chosen).reduce((s, h) => s + h.calories_change, 0));
}
