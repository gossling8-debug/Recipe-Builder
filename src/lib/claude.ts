import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { RecipeSchema, sanitizeRecipe, type ScannedRecipe } from "./schema";

export const MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You turn photos of recipe cards (handwritten or printed) into a structured recipe that is easy to cook from.

Transcribe faithfully. Keep the cook's own wording, amounts and units; do not convert units, "improve" the recipe, or add ingredients or steps that are not on the card. If several photos are given they are parts of the same recipe (for example the front and back of one card).

Ingredients: list them in the order they appear on the card. Split each into quantity, unit, name and preparation.

Steps: use the card's own steps. If the instructions are one paragraph, split them into short steps at natural breaks (one main action each). Each step is a list of segments whose texts, joined in order, reproduce the step's wording. Whenever the step adds or uses an ingredient from the list, put the words that name it (for example "the flour" or "eggs") in their own segment with that ingredient's ingredient_index and the amount used in that step. The amount is the point of the app: the cook reads it in the step instead of looking back at the list.
- If the step uses the whole amount, give the full amount from the list, e.g. "2 cups".
- If an ingredient is divided across steps, give the portion for each step when the card states it or it is clear (e.g. "1/2 cup (half of the 1 cup)"), and "remaining" for the last use. If the split is not stated, give "part of 1 cup" and add a warning.
- If the step only refers back to something already added ("stir the batter"), it is plain text, not an ingredient segment.
- If a step uses an ingredient that is not in the list (for example "salt to taste"), add it to the ingredient list with an empty quantity and reference it.

Tags: give 1–3 short categories that would help find this recipe later (meal or course, and a method like "Slow cooker" or an occasion like "Holiday" only if obvious).

If anything is unreadable or you had to guess, make your best reading and add a short warning that says what you guessed. If the photo is not a recipe, return an empty ingredient and step list and explain in warnings.`;

export class ScanError extends Error {}

export function makeClient(apiKey: string): Anthropic {
  // The key is the user's own and lives only on their phone. The SDK refuses
  // browser use unless told this is intentional.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** photos: base64 JPEG strings (no data: prefix). */
export async function scanRecipe(apiKey: string, photos: string[]): Promise<ScannedRecipe> {
  const client = makeClient(apiKey);
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Opus 5.5 defaults to medium effort; reading messy handwriting and
      // tracking divided ingredients benefits from a bit more.
      output_config: { effort: "high", format: betaZodOutputFormat(RecipeSchema) },
      // If a safety classifier ever declines a request (unlikely for recipes),
      // the API retries it on a fallback model instead of failing the scan.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((data) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
            })),
            { type: "text", text: "Here is the recipe card. Convert it." },
          ],
        },
      ],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }

  if (response.stop_reason === "refusal") {
    throw new ScanError("Claude declined to read this photo. Try a clearer photo of just the recipe card.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ScanError("This recipe was too long to finish in one scan. Try scanning one card side at a time.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ScanError("Claude's answer couldn't be read. Please try scanning again.");
  return sanitizeRecipe(parsed);
}

function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use this model. Check your Anthropic Console.";
  if (err instanceof Anthropic.RateLimitError) return "Too many scans at once (or your API credit ran out). Wait a minute, and check your balance in the Anthropic Console.";
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) return "Your Anthropic account is out of credit. Add credit in the Anthropic Console.";
    return `The scan request was rejected: ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) return "Claude is having trouble right now. Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `Scan failed: ${err.message}`;
  return err instanceof Error ? err.message : "Scan failed.";
}
