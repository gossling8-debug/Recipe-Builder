import * as z from "zod/v4";
import { RecipeSchema, sanitizeRecipe, type ScannedRecipe } from "./schema";

/**
 * Share links carry the whole recipe inside the link (after the #), so no
 * server is needed and the recipe never passes through one. Photos and
 * double-check notes are left out to keep links short.
 *
 * Format: "z" + base64url(deflate(JSON)), or "j" + base64url(JSON) where the
 * browser can't compress.
 */
const MAX_LINK_DATA = 200_000;
const DAMAGED = "This recipe link is incomplete or damaged — some apps cut long links short. Ask for it to be shared again.";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeRecipe(r: ScannedRecipe): Promise<string> {
  const payload = {
    title: r.title,
    servings: r.servings,
    time: r.time,
    ingredients: r.ingredients,
    steps: r.steps,
    notes: r.notes,
    tags: r.tags ?? [],
    warnings: [],
  } satisfies ScannedRecipe;
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== "undefined") {
    try {
      return "z" + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
    } catch {
      /* fall back to uncompressed */
    }
  }
  return "j" + toBase64Url(json);
}

const SharedSchema = RecipeSchema.extend({ tags: z.array(z.string()).optional() });

export async function decodeRecipe(data: string): Promise<ScannedRecipe> {
  if (!data || data.length > MAX_LINK_DATA) throw new Error("This link is damaged or too long.");
  if (data[0] !== "z" && data[0] !== "j") throw new Error("This link isn't a Cardamix recipe.");
  let json: unknown;
  try {
    let bytes = fromBase64Url(data.slice(1));
    if (data[0] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(DAMAGED);
  }
  const parsed = SharedSchema.safeParse(json);
  if (!parsed.success) throw new Error(DAMAGED);
  return sanitizeRecipe({ ...parsed.data, tags: parsed.data.tags ?? [] });
}

/** The full link, e.g. https://…/Recipe-Builder/#/import/z… */
export async function recipeLink(r: ScannedRecipe): Promise<string> {
  const base = location.origin + location.pathname;
  return `${base}#/import/${await encodeRecipe(r)}`;
}
