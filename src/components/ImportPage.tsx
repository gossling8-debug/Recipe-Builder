import { useEffect, useState } from "react";
import Header from "./Header";
import RecipeView from "./RecipeView";
import { decodeRecipe } from "../lib/link";
import { newId, saveRecipe, storageErrorMessage } from "../lib/db";
import { href, navigate } from "../lib/route";
import { clearProgress } from "../lib/progress";
import type { SavedRecipe, ScannedRecipe } from "../lib/schema";
import { AddToBooksPrompt } from "./AfterAdd";

/** Opened from a shared link: preview the recipe and save it to this phone. */
export default function ImportPage({ data }: { data: string }) {
  const [recipe, setRecipe] = useState<ScannedRecipe | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Start every shared preview fresh (no checkmarks left from a previous one).
  useState(() => clearProgress(PREVIEW_ID));

  useEffect(() => {
    decodeRecipe(data).then(setRecipe, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [data]);

  const [saved, setSaved] = useState<SavedRecipe | null>(null);
  async function save() {
    if (!recipe) return;
    setSaving(true);
    try {
      const id = newId();
      const saved = { ...recipe, id, createdAt: Date.now(), photos: [] };
      await saveRecipe(saved);
      setSaved(saved);
    } catch (e) {
      setError(storageErrorMessage(e));
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="Shared recipe" back={href({ name: "library" })} />
      {saved && <AddToBooksPrompt recipe={saved} onDone={() => navigate({ name: "recipe", id: saved.id }, true)} />}
      <main className="page">
        {error && <div className="callout error">{error}</div>}
        {!recipe && !error && <p className="muted">Opening recipe…</p>}
        {recipe && (
          <>
            <p className="muted small shared-note">
              Someone shared this recipe with you. Save it to keep it in your recipes.
            </p>
            <RecipeView recipe={recipe} recipeId={PREVIEW_ID} preview />
          </>
        )}
      </main>
      {recipe && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save to my recipes"}
          </button>
        </div>
      )}
    </>
  );
}

const PREVIEW_ID = "shared-preview";
