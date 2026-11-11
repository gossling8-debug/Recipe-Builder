import * as z from "zod/v4";
import { RecipeSchema, sanitizeRecipe, type SavedRecipe } from "./schema";
import { listRecipes, newId, saveRecipe } from "./db";

const BackupSchema = z.object({
  app: z.literal("recipe-builder"),
  version: z.literal(1),
  exportedAt: z.string(),
  recipes: z.array(
    RecipeSchema.extend({
      id: z.string(),
      createdAt: z.number(),
      photos: z.array(z.string()),
      // Added in later versions; older backups won't have them.
      tags: z.array(z.string()).optional(),
      favorite: z.boolean().optional(),
      source: z.string().optional(),
    }),
  ),
});

/** Downloads every saved recipe (with photos) as one JSON file. */
export async function exportBackup(): Promise<number> {
  const recipes = await listRecipes();
  const backup = { app: "recipe-builder", version: 1, exportedAt: new Date().toISOString(), recipes };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recipes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return recipes.length;
}

/** Restores recipes from a backup file. Existing recipes with the same id are replaced; others are kept. */
export async function importBackup(file: File): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a Cardamix backup.");
  }
  const parsed = BackupSchema.safeParse(data);
  if (!parsed.success) throw new Error("That file isn't a Cardamix backup (or it's damaged).");
  for (const r of parsed.data.recipes) {
    const recipe: SavedRecipe = {
      ...sanitizeRecipe({ ...r, tags: r.tags ?? [] }),
      favorite: r.favorite ?? false,
      source: r.source && /^https?:\/\//.test(r.source) ? r.source : undefined,
      id: r.id || newId(),
      createdAt: r.createdAt,
      photos: r.photos.filter((p) => p.startsWith("data:image/")),
    };
    await saveRecipe(recipe);
  }
  return parsed.data.recipes.length;
}
