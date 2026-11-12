import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { recordUsage } from "./usage";
import { recipeToText } from "./share";
import type { ScannedRecipe } from "./schema";

export const SubstitutionsSchema = z.object({
  items: z.array(
    z.object({
      ingredient: z.string().describe('The ingredient as written in the recipe, e.g. "1/2 cup butter".'),
      ingredient_index: z.number().int().describe("The [number] of the flagged ingredient this is for, from the list given."),
      role: z.string().describe("What it does in THIS recipe, in one short sentence (e.g. adds richness and helps the dip set)."),
      options: z.array(
        z.object({
          substitute: z.string().describe('What to use, e.g. "Vegan butter sticks (e.g. Miyoko\'s, Country Crock Plant Butter)".'),
          short_name: z.string().describe('How the recipe should name it in the steps, lowercase, no brands, e.g. "vegan butter".'),
          amount: z.string().describe('Just the amount for this recipe as written, starting with a number, e.g. "1/2 cup" or "16 oz". No extra words.'),
          closeness: z.enum(["Nearly identical", "Close", "Noticeably different"]),
          what_changes: z.string().describe("Honest, specific description of how the result differs: taste, texture, browning, rise, spread, set."),
          tip: z.string().nullable().describe("One practical tip to get the best result, or null."),
        }),
      ),
      leave_it_out: z
        .string()
        .nullable()
        .describe("If simply leaving it out is reasonable (or the best choice), say what happens. null if it isn't."),
    }),
  ),
  label_check: z
    .array(z.string())
    .describe("Other ingredients in this recipe that often hide the avoided items in packaged versions (e.g. broth, sauces). Empty if none."),
});
/** Suggestions saved before ingredient_index / short_name existed lack them. */
type Fresh = z.infer<typeof SubstitutionsSchema>;
export type Substitutions = {
  items: (Omit<Fresh["items"][number], "ingredient_index" | "options"> & {
    ingredient_index?: number;
    options: (Omit<Fresh["items"][number]["options"][number], "short_name"> & { short_name?: string })[];
  })[];
  label_check: string[];
};

const SYSTEM = `You are a practical, honest home-cooking advisor. The cook needs to avoid certain ingredients (allergies, intolerances or preferences). For each flagged ingredient in the recipe, suggest 1–3 substitutes that suit the job that ingredient does in THIS recipe — butter that's creamed in cookies needs a different swap than butter melted into a dip.

Be candid. Rate each option "Nearly identical", "Close" or "Noticeably different", and say plainly what changes: taste, texture, browning, rise, spread, how it sets. Don't oversell. If there is no good substitute, say so, and say whether leaving it out works.

Rules:
- Never suggest anything that contains an item on the avoid list (for example, no ghee for dairy, no almond flour for tree nuts).
- Give amounts for the recipe as written.
- Name a common store-bought option when that's the closest match.
- Only list label checks that genuinely apply to ingredients in this recipe.`;

export async function suggestSubstitutes(
  apiKey: string,
  recipe: ScannedRecipe,
  flagged: { index: number; ingredient: string; reasons: string[] }[],
  avoidLabels: string[],
): Promise<Substitutions> {
  const client = await makeClient(apiKey);
  const m = getModel();
  const prompt = [
    `Avoid list: ${avoidLabels.join(", ")}`,
    "",
    "Flagged ingredients:",
    ...flagged.map((f) => `[${f.index}] ${f.ingredient} (matches: ${f.reasons.join(", ")})`),
    "",
    "Recipe:",
    recipeToText(recipe, 1),
  ].join("\n");

  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 8000,
      output_config: { effort: "medium", format: betaZodOutputFormat(SubstitutionsSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  recordUsage("substitutes", m.id, response.usage);
  if (response.stop_reason === "refusal") throw new ScanError("Claude couldn't answer this one. Try again later.");
  if (!response.parsed_output) throw new ScanError("Claude's answer couldn't be read. Please try again.");
  return response.parsed_output;
}
