import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { originLabel, RecipeSchema, sanitizeRecipe, type Origin, type ScannedRecipe } from "./schema";
import { recipeToText } from "./share";
import { recordUsage } from "./usage";

/**
 * Before a recipe from a published cookbook goes into The Mix: the method in
 * fresh wording (the same dish, amounts and technique — the writing is what's
 * protected, not the facts), credited to the book. Ingredients stay as they
 * are; a list of ingredients is facts.
 */
const SYSTEM = `You help a home cook share a recipe they found in a published cookbook, without copying the author's writing.

Rewrite the method in your own words: the same dish, technique, temperatures, times and amounts, but different wording and sentence structure. Be clear and concise, one action per step. Don't copy sentences or distinctive phrases. Leave out stories, introductions and tips that are the author's own writing.

Keep the ingredient list exactly as given (same order, amounts and names) — ingredients are facts. Link ingredient mentions in the steps to the list the usual way (ingredient_index and the amount used in that step).

Title: a plain descriptive name for the dish (titles aren't protected, but avoid a branded or very distinctive one). Notes: null. Tags: as given. Warnings: empty.`;

export async function rewriteForMix(apiKey: string, recipe: ScannedRecipe, origin: Origin | undefined): Promise<ScannedRecipe> {
  const client = await makeClient(apiKey, "rewrite");
  const m = getModel();
  const list = recipe.ingredients.map((ing, i) => `[${i}] ${[ing.quantity, ing.unit, ing.name, ing.preparation].filter(Boolean).join(" ")}`);
  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 12000,
      output_config: { effort: "medium", format: betaZodOutputFormat(RecipeSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: ["Ingredients (numbered, keep exactly):", ...list, "", "The recipe as written in the book:", recipeToText(recipe, 1)].join("\n") }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  recordUsage("rewrite", m.id, response.usage);
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new ScanError("Cardamix couldn't rewrite this one. Try again later.");
  const out = sanitizeRecipe(response.parsed_output);
  return {
    ...out,
    // The list as it was (facts), and credit to the book.
    ingredients: recipe.ingredients,
    tags: recipe.tags,
    notes: `Adapted from ${originLabel(origin)}.`,
    warnings: [],
  };
}
