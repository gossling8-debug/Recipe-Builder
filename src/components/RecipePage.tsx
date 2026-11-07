import { useEffect, useState } from "react";
import Header from "./Header";
import RecipeView from "./RecipeView";
import RecipeEditor from "./RecipeEditor";
import { clearProgress, loadProgress, saveProgress } from "../lib/progress";
import { deleteRecipe, getRecipe, saveRecipe } from "../lib/db";
import { href, navigate } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";

export default function RecipePage({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined);
  const [showPhotos, setShowPhotos] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getRecipe(id).then((r) => setRecipe(r ?? null), () => setRecipe(null));
  }, [id]);

  // Keep the screen on while a recipe is open — no greasy-finger unlocking mid-recipe.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  async function remove() {
    if (!recipe || !confirm(`Delete “${recipe.title}”? This can't be undone.`)) return;
    await deleteRecipe(recipe.id);
    clearProgress(recipe.id);
    navigate({ name: "library" }, true);
  }

  return (
    <>
      <Header
        title={editing ? "Edit recipe" : ""}
        back={editing ? undefined : href({ name: "library" })}
        actions={
          recipe && !editing ? (
            <>
              <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit recipe">
                ✏️
              </button>
              <button className="icon-btn" onClick={remove} aria-label="Delete recipe">
                🗑
              </button>
            </>
          ) : null
        }
      />
      <main className="page">
        {recipe === undefined && <p className="muted">Loading…</p>}
        {recipe === null && <div className="callout error">That recipe wasn't found on this device.</div>}
        {recipe && editing && (
          <RecipeEditor
            recipe={recipe}
            onCancel={() => setEditing(false)}
            onSave={async (updated) => {
              await saveRecipe(updated);
              // Step and ingredient positions may have changed: keep only the chosen size.
              saveProgress(updated.id, { have: [], done: [], added: [], scale: loadProgress(updated.id).scale });
              setRecipe(updated);
              setEditing(false);
              window.scrollTo(0, 0);
            }}
          />
        )}
        {recipe && !editing && (
          <>
            <RecipeView recipe={recipe} recipeId={recipe.id} />
            {recipe.photos.length > 0 && (
              <section className="original">
                <button className="btn" onClick={() => setShowPhotos((s) => !s)}>
                  {showPhotos ? "Hide original card" : "Show original card"}
                </button>
                {showPhotos && recipe.photos.map((p, i) => <img key={i} src={p} alt={`Original card photo ${i + 1}`} />)}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
