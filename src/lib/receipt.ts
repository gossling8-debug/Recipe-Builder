import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { describeApiError, makeClient, requestOptions, ScanError } from "./claude";
import { getModel } from "./models";
import { recordUsage } from "./usage";

/**
 * Reading a grocery receipt (paper photo or order screenshots) so prices
 * don't have to be typed. Claude turns store abbreviations into plain names
 * and sizes, and says which line matches which item already on the list.
 */
export const ReceiptSchema = z.object({
  store: z.string().nullable().describe('Store name if shown, e.g. "Walmart". null if not shown.'),
  date: z.string().nullable().describe('Purchase or order date as YYYY-MM-DD if shown, else null.'),
  items: z.array(
    z.object({
      receipt_text: z.string().describe("The line as printed, e.g. \"GV 2% MLK GAL\"."),
      item_code: z
        .string()
        .nullable()
        .describe("The item number or UPC printed next to this line (digits only), if the receipt shows one; otherwise null."),
      name: z.string().describe('Plain, generic name a recipe would use, lowercase, no brand, e.g. "2% milk", "eggs", "ground beef".'),
      size: z
        .string()
        .nullable()
        .describe(
          'Total amount bought, starting with the total, then the pack in parentheses when it is a pack: e.g. "1 gallon", "2 lb", "12 eggs", "174 oz (12 × 14.5 oz cans)". For 2 × 16 oz say "32 oz (2 × 16 oz)". If the receipt does not show it, give the usual package size of this product at this store and set size_estimated. null only if you cannot tell at all.',
        ),
      size_estimated: z.boolean().describe("true if the size is not printed on the receipt and you gave the usual package size instead."),
      count: z.number().describe("How many of this item the line is for (e.g. 2 for \"2 @ 0.98\"); 1 if one."),
      price: z.number().describe("What was paid for this line in dollars, after any line discount (the line total, not the unit price)."),
      is_food: z.boolean().describe("true for anything you eat or drink (meat, dairy, produce, snacks, pouches, candy, drinks); false only for household, paper goods, toiletries, bags, fees."),
      storage: z
        .enum(["fresh", "frozen", "canned", "dry"])
        .nullable()
        .describe('How it is kept: "fresh" (refrigerated or produce, bakery, dairy, meat), "frozen" (bought frozen), "canned" (cans and jars), "dry" (shelf-stable boxes and bags: flour, pasta, cereal, chips). null if not food.'),
      matches: z
        .string()
        .nullable()
        .describe("If this is the same thing as one of the shopping-list names given, that name EXACTLY as given; otherwise null."),
    }),
  ),
  tax: z.number().nullable().describe("Sales tax in dollars if shown, else null."),
  total: z.number().nullable().describe("Order or receipt total in dollars if shown, else null."),
  warnings: z.array(z.string()).describe("Short notes on anything cut off, blurry or guessed. Empty if none."),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

const SYSTEM = `You read grocery receipts and online order screenshots (Walmart, Kroger, Target, etc.) and list what was bought.

The images may be several overlapping pieces of one long screenshot, or several screenshots of one order: list each purchased line ONCE (skip lines repeated in an overlap). Skip subtotals, savings summaries, payment lines, and "substituted"/"out of stock" items that were not received; for a substitution, list what was actually received.

For each line give a plain generic name a recipe would use (expand abbreviations: "GV" = Great Value, "MLK" = milk, "BNLS SKNLS CHKN BRST" = boneless skinless chicken breast), the total amount bought, and the line price after discounts. Only household items are not food: anything eaten or drunk is food (meat, dairy, produce, snacks, fruit pouches, cheese sticks, candy, drinks). Say how each food is kept: fresh, frozen (bought frozen), canned (cans and jars) or dry (shelf-stable boxes and bags).

Sizes matter for comparing prices. Use the size printed on the line when there is one. Warehouse stores (Costco, Sam's Club) and many receipts leave it off: then give the usual package size of that product at that store — from the description, the item or barcode number and the price (e.g. Costco "KS CUT GRN BEANS" is typically 12 × 14.5 oz cans, so "174 oz (12 × 14.5 oz cans)") and mark it estimated.

You are given the names on the cook's shopping list. Set "matches" to one of those names, exactly as written, only when it is clearly the same ingredient (e.g. "2% milk" matches "milk"; "shredded cheddar" matches "cheddar cheese"); otherwise null.

If something is unreadable, give your best reading and add a short warning.`;

/**
 * Saved without asking: everything on the shopping list and all other food, so
 * every ingredient's price is known for meal costs. Household items are left
 * off. The cook can still tick or untick each line before saving.
 */
export const keepByDefault = (item: { is_food: boolean }, onList: boolean) => onList || item.is_food;

export async function readReceipt(apiKey: string, images: string[], knownNames: string[]): Promise<Receipt> {
  const client = await makeClient(apiKey);
  const m = getModel();
  const content = [
    ...images.flatMap((p) => {
      const mm = p.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      return mm ? [{ type: "image" as const, source: { type: "base64" as const, media_type: mm[1] as "image/jpeg", data: mm[2] } }] : [];
    }),
    {
      type: "text" as const,
      text: `Names on the cook's shopping list:\n${knownNames.length ? knownNames.map((n) => `- ${n}`).join("\n") : "(none)"}\n\nList what was bought on this receipt.`,
    },
  ];
  let response;
  try {
    response = await client.beta.messages.parse({
      ...requestOptions(m),
      max_tokens: 12000,
      output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    throw new ScanError(describeApiError(err));
  }
  recordUsage("receipt", m.id, response.usage);
  if (response.stop_reason === "refusal") throw new ScanError("Claude couldn't read this. Try a clearer photo or screenshot.");
  if (response.stop_reason === "max_tokens") throw new ScanError("This receipt is very long. Try importing it in two parts.");
  if (!response.parsed_output) throw new ScanError("Claude's answer couldn't be read. Please try again.");
  const out = response.parsed_output;
  // Only keep matches to names that really are on the list.
  const known = new Set(knownNames);
  return { ...out, items: out.items.map((it) => ({ ...it, matches: it.matches && known.has(it.matches) ? it.matches : null })) };
}

// ---------- not importing the same receipt twice ----------
const SEEN_KEY = "recipe-builder.receipts";
export const receiptId = (r: Pick<Receipt, "store" | "date" | "total" | "items">) =>
  [r.store ?? "", r.date ?? "", r.total ?? r.items.reduce((s, i) => s + i.price, 0).toFixed(2), r.items.length].join("|");

export function alreadyImported(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}
export function rememberImported(id: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, id].slice(-200)));
  } catch {
    /* ignore */
  }
}

/** The receipt's date as a time (noon that day), or now. */
export function receiptTime(date: string | null, now = Date.now()): number {
  const m = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return now;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime();
  return t > now || now - t > 400 * 86400000 ? now : t; // ignore odd dates
}
