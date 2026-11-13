import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { RecipeSchema, sanitizeRecipe, type ScannedRecipe } from "./schema";
import { getModel, type ModelOption } from "./models";
import { getApiKey } from "./settings";
import { AI_URL } from "./firebaseConfig";
import { recordUsage, type UsageEntry } from "./usage";

const SYSTEM_PROMPT = `You turn recipes — photos of recipe cards (handwritten or printed), web pages, or pasted text — into a structured recipe that is easy to cook from.

Transcribe faithfully. Keep the cook's own wording, amounts and units; do not convert units, "improve" the recipe, or add ingredients or steps that are not in the source. If several photos are given they are parts of the same recipe (for example the front and back of one card). For a web page, use only the recipe itself: skip the life story, ads, comments and "jump to recipe" text.

Ingredients: list them in the order they appear. Split each into quantity, unit, name and preparation.

Steps: use the source's own steps. If the instructions are one paragraph, split them into short steps at natural breaks (one main action each). Each step is a list of segments whose texts, joined in order, reproduce the step's wording. Whenever the step adds or uses an ingredient from the list, put the words that name it (for example "the flour" or "eggs") in their own segment with that ingredient's ingredient_index and the amount used in that step. The amount is the point of the app: the cook reads it in the step instead of looking back at the list.
- If the step uses the whole amount, give the full amount from the list, e.g. "2 cups". If the list gives an alternative amount, keep it in the step too, e.g. "1 large jar (or 2 small jars)".
- Link every mention of a listed ingredient, even when the step uses a shorter or general name (for example "nuts" for "walnuts", "chips" for "chocolate chips"); keep the step's own words in the segment text.
- If an ingredient is divided across steps, give the portion for each step when the source states it or it is clear (e.g. "1/2 cup (half of the 1 cup)"), and "remaining" for the last use. If the split is not stated, give "part of 1 cup" and add a warning.
- If the step only refers back to something already added ("stir the batter"), it is plain text, not an ingredient segment.
- If a step uses an ingredient that is not in the list (for example "salt to taste"), add it to the ingredient list with an empty quantity and reference it.

Notes: copy any tips or notes from the source. If it lists nutrition facts or a serving size (e.g. "Serving size 1 cup · 437 kcal · 31 g protein"), copy them into notes exactly as written.

Tags: give 1–3 short categories that would help find this recipe later (meal or course, and a method like "Slow cooker" or an occasion like "Holiday" only if obvious).

If anything is unreadable or you had to guess, make your best reading and add a short warning that says what you guessed. If the source is not a recipe (or a web page couldn't be read), return an empty ingredient and step list and explain in warnings.`;

export class ScanError extends Error {}

/**
 * A Claude client. With your own key (advanced), requests go straight to
 * Anthropic. Otherwise they go through the app's AI relay, signed with your
 * account, which uses the app's key within your monthly allowance.
 */
export async function makeClient(apiKey: string): Promise<Anthropic> {
  // The SDK refuses browser use unless told this is intentional.
  if (apiKey) return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const { user } = await import("./cloud");
  const u = await user();
  if (!u) throw new ScanError("Sign in to use AI features.");
  return new Anthropic({ apiKey: null, authToken: await u.getIdToken(), baseURL: AI_URL, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

export type RecipeSource =
  | { kind: "photos"; photos: string[] } // base64 JPEG strings (no data: prefix)
  | { kind: "url"; url: string }
  | { kind: "text"; text: string };

export interface ImportResult {
  recipe: ScannedRecipe;
  usage: UsageEntry;
}

/** Shared request settings for the chosen model (refusal fallback only with your own key). */
export function requestOptions(m: ModelOption) {
  return {
    model: m.id,
    ...(m.fallbacks && getApiKey() ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

export async function importRecipe(apiKey: string, source: RecipeSource): Promise<ImportResult> {
  const client = await makeClient(apiKey);
  const m = getModel();

  let content: Anthropic.Beta.BetaContentBlockParam[];
  let tools: Anthropic.Beta.BetaToolUnion[] | undefined;
  if (source.kind === "photos") {
    content = [
      ...source.photos.map((data) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
      })),
      { type: "text", text: "Here is the recipe card. Convert it." },
    ];
  } else if (source.kind === "url") {
    content = [{ type: "text", text: `Fetch this page with web_fetch and convert the recipe on it:\n${source.url}` }];
    // Claude reads the page on Anthropic's side (websites block apps from
    // reading them directly). Capped so a huge page can't run up the bill.
    tools = [{ type: m.webFetch, name: "web_fetch", max_uses: 2, max_content_tokens: 30000 } as Anthropic.Beta.BetaToolUnion];
  } else {
    content = [{ type: "text", text: `Convert this recipe:\n\n${source.text}` }];
  }

  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 16000,
      output_config: { effort: m.effort, format: betaZodOutputFormat(RecipeSchema) },
      system: SYSTEM_PROMPT,
      ...(tools ? { tools } : {}),
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }

  const kind = source.kind === "photos" ? "scan" : source.kind === "url" ? "website" : "text";
  const usage = recordUsage(kind, m.id, response.usage);

  if (response.stop_reason === "refusal") {
    throw new ScanError("Claude declined to read this. Try a clearer photo of just the recipe, or another page.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ScanError("This recipe was too long to finish in one go. Try one card side at a time.");
  }
  if (response.stop_reason === "pause_turn") {
    throw new ScanError("Reading that page took too long. Try again, or copy the recipe text and use “Paste text”.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ScanError("Claude's answer couldn't be read. Please try again.");
  return { recipe: sanitizeRecipe(parsed), usage };
}

export function describeApiError(err: unknown): string {
  // Messages from the app's AI relay (allowance used up, sign in again…) are written for people already.
  const relay = !getApiKey() && err instanceof Anthropic.APIError ? (err.error as { error?: { message?: string } } | undefined)?.error?.message : undefined;
  if (relay && err instanceof Anthropic.APIError && [401, 413, 429, 503].includes(err.status ?? 0)) return relay;
  if (!getApiKey() && err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return "AI is having trouble right now. Try again in a minute.";
  // Can't reach the app's AI server: if the phone is online, it's the server, not their connection.
  if (!getApiKey() && err instanceof Anthropic.APIConnectionError)
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? "You're offline. Connect to the internet and try again."
      : "AI is temporarily unavailable. Please try again in a little while.";
  if (err instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use this model. Check your Anthropic Console.";
  if (err instanceof Anthropic.RateLimitError) return "Too many requests at once (or your API credit ran out). Wait a minute, and check your balance in the Anthropic Console.";
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) return "Your Anthropic account is out of credit. Add credit in the Anthropic Console.";
    return `The request was rejected: ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) return "Claude is having trouble right now. Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `Request failed: ${err.message}`;
  return err instanceof Error ? err.message : "Request failed.";
}
