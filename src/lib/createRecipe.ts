import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { recordUsage, type UsageEntry } from "./usage";
import { RecipeSchema, sanitizeRecipe, type ScannedRecipe } from "./schema";

/**
 * "Create a recipe": Claude writes a new, restaurant-quality recipe from a
 * request — a dish, an occasion, or a copycat of a restaurant favorite —
 * grounded in established cooking science.
 */
export const CreatedRecipeSchema = z.object({
  recipe: RecipeSchema,
  inspired_by: z
    .string()
    .nullable()
    .describe('For a copycat: the restaurant or brand it recreates, e.g. "Olive Garden". null otherwise.'),
  why_it_works: z
    .string()
    .describe("2–4 sentences on the cooking science behind the key choices (e.g. why the meat is dried and seared hot, why the butter is cold). Plain language."),
  chef_tips: z.array(z.string()).describe("2–4 short professional tips: doneness cues, make-ahead, common mistakes to avoid."),
  plating: z.string().describe("1–3 sentences on how a chef would plate and finish it to serve (vessel, placement, garnish, final touch)."),
});

const SYSTEM = `You are an award-winning professional chef and recipe developer who knows food science deeply. Write one recipe a professional chef would be proud to serve — good enough to win a cooking competition — that an average home cook can make successfully in an ordinary home kitchen.

The standard (what judges score):
- Flavor: deeply seasoned and balanced — salt, fat, acid, sweetness, heat and umami working together, with a clear star ingredient and nothing muddy. Build depth (browning, reductions, stocks, aromatics, toasted spices) and finish bright (acid, fresh herbs, zest, flaky salt).
- Texture: deliberate contrast — something crisp or crunchy against something tender or creamy.
- Technique: precise and visible — a proper sear, a glossy emulsified pan sauce, correctly cooked proteins and vegetables, nothing overcooked.
- Components: a complete dish, not a single element — e.g. the main, a sauce, and a garnish or side that adds contrast. Every component earns its place; no filler.
- Creativity with restraint: one or two thoughtful touches (a compound butter, a quick pickle, a gremolata, a brown-butter finish) rather than gimmicks.
- Presentation: describe the plating in plating.
- Achievable by an average home cook — this matters as much as the result:
  - Equipment: only what most kitchens have — stovetop, oven, skillet, saucepan, pot, sheet pan, baking dish, mixing bowls, whisk, a blender or hand mixer, an instant-read thermometer. No sous vide, smoker, deep fryer, stand-mixer-only steps, blowtorch, piping or specialty chemicals.
  - Ingredients: from a regular supermarket. If something special truly makes the dish, offer a common substitute in chef_tips.
  - Skills: everyday techniques done well (searing, sautéing, roasting, braising, simple pan sauces, basic doughs). Avoid techniques that take practice to pull off (tempering chocolate, laminated dough, hand-pulled pasta, butchery, flambé, sugar work); if one is essential to the dish, explain it step by step with what to look for.
  - Time: about 1 hour of hands-on work for most dishes (up to 2 for a special occasion); long unattended time like braising or resting is fine.
  - Steps: spell out anything a beginner might not know — what "medium-high" looks like, how to tell the oil is hot enough, how to know it's done — and say what to do if something goes wrong (sauce too thick, browning too fast).

Craft:
- Use proven technique, not shortcuts that cost flavor: pat proteins dry and sear in a hot pan for browning (Maillard reaction); bloom spices and aromatics in fat; deglaze the fond; build sauces in layers; season in stages and finish with acid, salt or fresh herbs to balance; rest meat after cooking; toast nuts and spices.
- Apply established cooking science and say so briefly in steps where it matters: correct emulsions (temperature, ratio, slow addition), starch gelatinization and thickening (simmer to activate, slurry when needed), gluten development (how much to mix or knead, resting dough), leavening (baking soda needs acid; correct amounts for the flour), sugar and fat ratios in baking, carryover cooking, salt and brining, protein coagulation for eggs and custards, and pasta-water starch for sauces.
- Baking must be precise: give weights in grams alongside cups for flour, sugar and butter; correct oven temperature and rack position; how to tell when it's done (internal temperature, color, toothpick).
- Food safety: safe internal temperatures (e.g. chicken 165°F / 74°C, ground beef 160°F / 71°C, pork 145°F / 63°C with a rest), cooling and storage where relevant.
- Give exact amounts, pan sizes, heat levels, and sensory doneness cues ("until deep golden and the edges pull away"), not just times.
- Before answering, judge your own recipe as a competition judge and a chef would: ratios that work, ingredient amounts that add up across the steps, cooking times that fit the cut and size, nothing missing from the ingredient list, balanced seasoning, real texture contrast, a finished plate worth winning with — and whether an average home cook with ordinary equipment could follow every step and succeed the first time. Fix anything that's off.

Copycats (when asked to recreate a restaurant or brand dish):
- Reconstruct it as faithfully as you can from what's publicly known about the dish: its flavors, texture, and look. Match the original first; then make it the best version of that dish, with chef technique, without changing its character. It's your best recreation, not the restaurant's actual recipe — never claim it's official, leaked or secret.
- Title it "<Dish> (inspired by <Restaurant>)", set inspired_by, and use no logos, slogans or menu descriptions copied word for word.

Format:
- Size it for the servings asked, and put that in servings, e.g. "Serves 4". Put total time and oven temperature in time.
- Write clear steps, one main action each. Each step is a list of segments whose texts, joined in order, read as the step. Whenever a step adds or uses an ingredient, put the words naming it in their own segment with that ingredient's ingredient_index and the amount used in that step (e.g. "2 cups"; "half of the 1 cup" and then "remaining" if it's divided).
- notes: null (the tips go in chef_tips). tags: 1–3 categories like "Dinner", "Dessert", "Baking", "Copycat".
- Never use anything the cook avoids, even as a garnish; use a good substitute instead and mention it in chef_tips.
- warnings: leave empty unless something genuinely needs the cook's attention.
- If the request isn't food, or can't be made safely, return a recipe with no ingredients and explain in warnings.`;

export interface CreateInput {
  request: string;
  people: number;
  avoid: string[];
  existingTitles: string[];
}

export function createPrompt(i: CreateInput): string {
  return [
    `What I'd like: ${i.request.trim()}`,
    `Servings: ${i.people}`,
    i.avoid.length ? `I avoid: ${i.avoid.join(", ")}` : "",
    i.existingTitles.length ? `Recipes I already have (don't just repeat one): ${i.existingTitles.slice(0, 150).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface CreatedRecipe {
  recipe: ScannedRecipe;
  inspiredBy: string | null;
  whyItWorks: string;
  chefTips: string[];
  plating: string;
  usage: UsageEntry;
}

export async function createRecipe(apiKey: string, input: CreateInput): Promise<CreatedRecipe> {
  const client = await makeClient(apiKey);
  const m = getModel();
  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 16000,
      output_config: { effort: "high", format: betaZodOutputFormat(CreatedRecipeSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: createPrompt(input) }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  const usage = recordUsage("create", m.id, response.usage);
  if (response.stop_reason === "refusal") throw new ScanError("Claude couldn't create that recipe. Try asking a different way.");
  if (response.stop_reason === "max_tokens") throw new ScanError("The recipe ran too long. Please try again.");
  const out = response.parsed_output;
  if (!out) throw new ScanError("Claude's answer couldn't be read. Please try again.");
  if (out.recipe.ingredients.length === 0) throw new ScanError(out.recipe.warnings[0] ?? "Claude couldn't make a recipe from that. Try describing a dish.");
  return { recipe: sanitizeRecipe(out.recipe), inspiredBy: out.inspired_by, whyItWorks: out.why_it_works.trim(), chefTips: out.chef_tips.slice(0, 4), plating: out.plating.trim(), usage };
}

/** The notes saved with a created recipe: that it's untested, why it works, and the chef's tips. */
export function createdNotes(r: Pick<CreatedRecipe, "inspiredBy" | "whyItWorks" | "chefTips"> & { plating?: string }): string {
  return [
    `Created by Claude${r.inspiredBy ? ` — a recreation inspired by ${r.inspiredBy}, not the official recipe` : ""}. Untested: rate it after you cook it.`,
    r.whyItWorks ? `Why this works: ${r.whyItWorks}` : "",
    r.chefTips.length ? `Chef's tips:\n${r.chefTips.map((t) => `• ${t}`).join("\n")}` : "",
    r.plating ? `To plate: ${r.plating}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
