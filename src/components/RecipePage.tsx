import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import RecipeView from "./RecipeView";
import RecipeEditor from "./RecipeEditor";
import Substitutes from "./Substitutes";
import { clearProgress, loadProgress, saveProgress } from "../lib/progress";
import { deleteRecipe, getRecipe, saveRecipe } from "../lib/db";
import { href, navigate } from "../lib/route";
import { recipeToText, shareText } from "../lib/share";
import { recipeLink } from "../lib/link";
import { removeFromShopping } from "../lib/shopping";
import { useToast } from "./Toast";
import type { SavedRecipe } from "../lib/schema";

export default function RecipePage({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined);
  const [showPhotos, setShowPhotos] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, showToast] = useToast();
  // Built ahead of time: iPhones only allow the share sheet to open straight
  // after a tap, so nothing slow may happen between the tap and share().
  const [link, setLink] = useState("");

  useEffect(() => {
    setLink("");
    if (recipe) recipeLink(recipe).then(setLink, () => setLink(""));
  }, [recipe]);

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
    removeFromShopping(recipe.id);
    navigate({ name: "library" }, true);
  }

  async function toggleFavorite() {
    if (!recipe) return;
    const updated = { ...recipe, favorite: !recipe.favorite };
    setRecipe(updated);
    await saveRecipe(updated);
    showToast(updated.favorite ? "Added to Favorites" : "Removed from Favorites");
  }

  async function share() {
    if (!recipe) return;
    // A short message with a link that opens this recipe in the app. If the
    // link couldn't be made, send the full recipe as text instead.
    const result = link
      ? await shareText(recipe.title, `${recipe.title}\nOpen the recipe in Recipe Builder:`, link)
      : await shareText(recipe.title, recipeToText(recipe, loadProgress(recipe.id).scale));
    if (result === "copied") showToast("Link copied — paste it in a message");
    if (result === "failed") showToast("Sharing isn't available in this browser");
  }

  return (
    <>
      <Header
        title={editing ? "Edit recipe" : ""}
        back={editing ? undefined : href({ name: "library" })}
        actions={
          recipe && !editing ? (
            <>
              <button
                className={recipe.favorite ? "icon-btn starred" : "icon-btn"}
                onClick={toggleFavorite}
                aria-label={recipe.favorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={!!recipe.favorite}
              >
                <Icon name="star" filled={!!recipe.favorite} />
              </button>
              <button className="icon-btn" onClick={share} aria-label="Share recipe">
                <Icon name="share" />
              </button>
              <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit recipe">
                <Icon name="edit" />
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
            onDelete={remove}
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
            <RecipeView
              key={recipe.id}
              recipe={recipe}
              recipeId={recipe.id}
              extra={
                <Substitutes
                  recipe={recipe}
                  onSaved={async (updated) => {
                    await saveRecipe(updated);
                    setRecipe(updated);
                  }}
                />
              }
            />
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
      {toast}
    </>
  );
}
