import * as z from "zod/v4";

/**
 * The shape Claude returns for a scanned recipe card.
 *
 * The key idea: each instruction step is split into "segments". Plain text
 * segments have no ingredient. When the instructions mention an ingredient,
 * that segment points back at the ingredient list (ingredient_index) and
 * carries the amount used *in that step* — so the cook never has to scroll
 * back up to the ingredient list.
 */
export const IngredientSchema = z.object({
  quantity: z
    .string()
    .describe('Amount as written, e.g. "2", "1 1/2", "½". Empty string if none (e.g. "salt to taste").'),
  unit: z.string().describe('Unit as written, e.g. "cups", "tbsp", "oz". Empty string if none.'),
  name: z.string().describe('Ingredient name, e.g. "all-purpose flour".'),
  preparation: z
    .string()
    .nullable()
    .describe('Prep or note from the card, e.g. "softened", "divided", "chopped". null if none.'),
  section: z
    .string()
    .nullable()
    .describe('Sub-heading the ingredient is listed under, e.g. "Frosting". null if the card has no sub-headings.'),
});

export const SegmentSchema = z.object({
  text: z.string().describe("A run of the step's text, copied faithfully."),
  ingredient_index: z
    .number()
    .int()
    .nullable()
    .describe("0-based index into ingredients when this segment names an ingredient; otherwise null."),
  amount: z
    .string()
    .nullable()
    .describe(
      'Amount of that ingredient used in THIS step, e.g. "2 cups", "1/2 cup (half of the 1 cup)", "remaining". null for plain text segments.',
    ),
});

export const StepSchema = z.object({
  segments: z.array(SegmentSchema),
});

export const RecipeSchema = z.object({
  title: z.string(),
  servings: z.string().nullable().describe('Yield or servings as written, e.g. "24 cookies". null if not on the card.'),
  time: z.string().nullable().describe('Prep/cook/bake time and temperature summary if on the card. null otherwise.'),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
  notes: z.string().nullable().describe("Any tips, sources or notes on the card that aren't steps. null if none."),
  tags: z
    .array(z.string())
    .describe('1–3 short categories for finding this recipe later, e.g. "Dinner", "Dessert", "Baking", "Breakfast", "Side", "Appetizer", "Soup", "Drink", "Holiday", "Slow cooker". Title Case.'),
  warnings: z
    .array(z.string())
    .describe("Short notes about anything unreadable, guessed, or missing (e.g. an ingredient with no amount). Empty if none."),
});

export type Ingredient = z.infer<typeof IngredientSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Step = z.infer<typeof StepSchema>;
export type ScannedRecipe = z.infer<typeof RecipeSchema>;

/** A recipe as stored in the library on this device. */
export interface SavedRecipe extends ScannedRecipe {
  id: string;
  createdAt: number;
  /** Compressed copies of the original card photos, as data: URLs. */
  photos: string[];
  /** Starred by the cook; shown in the Favorites section. */
  favorite?: boolean;
  /** Web page the recipe was imported from. */
  source?: string;
  /** Estimated cost (US dollars) of reading this recipe with Claude. */
  importCost?: number;
  /** Last change on any device (ms). Used by cloud sync to keep the newest version. */
  updatedAt?: number;
  /** How long it actually took each time it was cooked (confirmed by the cook). */
  cookLog?: { at: number; minutes: number; scale: number }[];
  /** Claude's substitute suggestions for the avoid list, saved so they're only paid for once. */
  substitutions?: {
    avoidKey: string; // which avoid list they were made for
    ingredientsKey: string; // which ingredients (so edits mark them out of date)
    createdAt: number;
    result: import("./substitutes").Substitutions;
  };
  /** Claude's nutrition estimate and healthier swaps, saved so they're only paid for once. */
  nutrition?: {
    ingredientsKey: string; // which ingredients (so edits mark it out of date)
    createdAt: number;
    result: import("./nutrition").Nutrition;
  };
  /** The cook's own photo of the finished dish (data: URL); shown in the library instead of the card. */
  dishPhoto?: string;
  /** The cook's rating, 1–5 stars. */
  rating?: number;
  /** "Would make again" (true) or "Wouldn't" (false). */
  makeAgain?: boolean;
  /** The cook's own notes ("used less sugar — perfect"). */
  myNotes?: string;
  /** Days it was made (ms), from "I made this" or "Made it today". Cooking mode adds to cookLog instead. */
  madeOn?: number[];
  /** Substitutes the cook chose ("Use this"), applied on top of the original recipe. */
  swaps?: import("./swaps").Swaps;
}

/** Formats an ingredient line for the ingredient list, e.g. "2 cups flour, sifted". */
export function formatIngredient(ing: Ingredient): string {
  const head = [ing.quantity, ing.unit, ing.name].map((s) => s.trim()).filter(Boolean).join(" ");
  return ing.preparation ? `${head}, ${ing.preparation}` : head;
}

/**
 * Cleans up what the model returned so the UI can trust it:
 * - an ingredient_index that points outside the list is dropped (the text is kept)
 * - an amount with no ingredient is dropped
 * - empty steps are removed
 */
export function sanitizeRecipe(r: ScannedRecipe): ScannedRecipe {
  const count = r.ingredients.length;
  const steps = r.steps
    .map((step) => ({
      segments: step.segments
        .map((seg) => {
          const valid =
            seg.ingredient_index !== null && Number.isInteger(seg.ingredient_index) &&
            seg.ingredient_index >= 0 && seg.ingredient_index < count;
          return valid
            ? { ...seg, amount: seg.amount?.trim() || null }
            : { text: seg.text, ingredient_index: null, amount: null };
        })
        .filter((seg) => seg.text.length > 0),
    }))
    .filter((step) => step.segments.some((s) => s.text.trim().length > 0));
  return { ...r, title: r.title.trim() || "Untitled recipe", steps, tags: cleanTags(r.tags ?? []) };
}

/** Indexes of ingredients that never show up in any step — worth flagging to the cook. */
export function unusedIngredients(r: ScannedRecipe): number[] {
  const used = new Set<number>();
  for (const step of r.steps) for (const seg of step.segments) if (seg.ingredient_index !== null) used.add(seg.ingredient_index);
  return r.ingredients.map((_, i) => i).filter((i) => !used.has(i));
}

/** Trims, Title-Cases and de-duplicates tags ("dinner ", "Dinner" → "Dinner"). */
export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const nice = t.replace(/\b\w/g, (c) => c.toUpperCase());
    const key = nice.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(nice);
    }
  }
  return out;
}
