import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { recordUsage, type UsageEntry } from "./usage";
import { RecipeSchema, sanitizeRecipe, type ScannedRecipe } from "./schema";
import type { PantryItem } from "./pantry";
import { formatQty } from "./qty";
import { freshness } from "./shelfLife";

/**
 * "Cook with what I have": Claude invents a new recipe from what's in the
 * pantry, using up what's about to go off first and never anything past its
 * date or on the avoid list.
 */
export const PantryRecipeSchema = z.object({
  recipe: RecipeSchema,
  uses_up: z.array(z.string()).describe("Pantry items marked USE SOON that the recipe uses, as named in the pantry list. Empty if none."),
  not_in_pantry: z
    .array(z.string())
    .describe("Ingredients the recipe needs that are NOT in the pantry list, besides salt, pepper, water and cooking oil. At most 2."),
});

const SYSTEM = `You are a practical home cook. Invent one good, realistic recipe from what the cook already has.

Rules:
- Build the dish mainly from the pantry list. Use items marked USE SOON when they fit — that's the point — but never force in something that would make the dish worse.
- Never use an item marked PAST DATE.
- Never use anything the cook avoids, even as an optional garnish.
- Salt, pepper, water and a little cooking oil can be assumed. Anything else not in the pantry goes in not_in_pantry; use at most 2 such items, and none if you can.
- Use realistic amounts that the pantry actually has. Size it for the number of people given, and put that in servings, e.g. "Serves 4".
- Keep it doable on a weeknight unless the cook asks for something else. Put total time (and oven temperature if any) in time.
- Write clear, short steps, one main action each. Each step is a list of segments whose texts, joined in order, read as the step. Whenever a step adds or uses an ingredient, put the words naming it in their own segment with that ingredient's ingredient_index and the amount used in that step (e.g. "2 cups"; "half of the 1 cup" and then "remaining" if it's divided).
- notes: one or two short serving or storage tips. tags: 1–3 categories like "Dinner", "Side", "Breakfast".
- warnings: leave empty unless something genuinely needs the cook's attention (e.g. "check the chicken is fully thawed").
- Don't repeat a recipe the cook already has (titles given).`;

export interface PantryPromptInput {
  items: PantryItem[];
  avoid: string[]; // labels, e.g. ["Dairy", "cilantro"]
  people: number;
  request: string;
  existingTitles: string[];
  now?: number;
}

/** The message sent to Claude: the pantry with freshness marks, plus the cook's limits. */
export function pantryPrompt(i: PantryPromptInput): string {
  const now = i.now ?? Date.now();
  const lines = [...i.items]
    .sort((a, b) => (a.useBy ?? Infinity) - (b.useBy ?? Infinity) || a.name.localeCompare(b.name))
    .map((it) => {
      const f = it.useBy !== undefined ? freshness(it.useBy, now) : "ok";
      const mark = f === "past" ? " — PAST DATE, don't use" : f === "today" || f === "soon" ? " — USE SOON" : "";
      return `- ${it.name}${it.qty ? ` (${formatQty(it.qty)})` : ""}${mark}`;
    });
  return [
    "My pantry:",
    ...lines,
    "",
    `Cooking for: ${i.people} ${i.people === 1 ? "person" : "people"}`,
    i.avoid.length ? `I avoid: ${i.avoid.join(", ")}` : "",
    i.request.trim() ? `What I'd like: ${i.request.trim()}` : "What I'd like: anything good",
    i.existingTitles.length ? `Recipes I already have: ${i.existingTitles.slice(0, 150).join("; ")}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export interface PantryRecipeResult {
  recipe: ScannedRecipe;
  usesUp: string[];
  notInPantry: string[];
  usage: UsageEntry;
}

export async function cookWithWhatIHave(apiKey: string, input: PantryPromptInput): Promise<PantryRecipeResult> {
  const client = makeClient(apiKey);
  const m = getModel();
  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 12000,
      output_config: { effort: "medium", format: betaZodOutputFormat(PantryRecipeSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: pantryPrompt(input) }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  const usage = recordUsage("pantryRecipe", m.id, response.usage);
  if (response.stop_reason === "refusal") throw new ScanError("Claude couldn't make a recipe from this. Try a different request.");
  if (response.stop_reason === "max_tokens") throw new ScanError("The recipe ran too long. Please try again.");
  const out = response.parsed_output;
  if (!out || out.recipe.ingredients.length === 0) throw new ScanError("Claude's answer couldn't be read. Please try again.");
  return { recipe: sanitizeRecipe(out.recipe), usesUp: out.uses_up, notInPantry: out.not_in_pantry.slice(0, 4), usage };
}

/** The line saved in the recipe's notes, so it's clear where it came from. */
export function originNote(usesUp: string[], notInPantry: string[]): string {
  return [
    "Made from your pantry.",
    usesUp.length ? `Uses up: ${usesUp.join(", ")}.` : "",
    notInPantry.length ? `You'll also need: ${notInPantry.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
