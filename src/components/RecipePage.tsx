import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import RecipeView from "./RecipeView";
import RecipeEditor from "./RecipeEditor";
import Substitutes from "./Substitutes";
import CookMode, { clearCookStart, cookStart } from "./CookMode";
import PlanMeal from "./PlanMeal";
import { clearPlan, getPlan } from "../lib/plan";
import { restore, useForRecipe, type PantryItem } from "../lib/pantry";
import { TimerBar, useTimers } from "./Timers";
import { activeSwaps, applySwaps } from "../lib/swaps";
import { clearProgress, loadProgress, saveProgress } from "../lib/progress";
import { deleteRecipe, getRecipe, saveRecipe } from "../lib/db";
import { href, navigate } from "../lib/route";
import { recipeToText, shareText } from "../lib/share";
import { recipeLink } from "../lib/link";
import { money } from "../lib/usage";
import { removeFromShopping } from "../lib/shopping";
import { useToast } from "./Toast";
import type { SavedRecipe } from "../lib/schema";

export default function RecipePage({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined);
  const [showPhotos, setShowPhotos] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cooking, setCooking] = useState(false);
  // Bumped when cooking mode closes, so the recipe view re-reads progress made there.
  const [viewKey, setViewKey] = useState(0);
  const timers = useTimers();
  // "I made this": the pantry snapshot before subtracting, kept 12 h so it can be undone.
  const madeKey = `recipe-builder.made.${id}`;
  const [made, setMade] = useState<{ at: number; undo: Record<string, PantryItem | null> } | null>(() => {
    try {
      const m = JSON.parse(localStorage.getItem(madeKey) ?? "null") as { at: number; undo: Record<string, PantryItem | null> } | null;
      return m && Date.now() - m.at < 12 * 3600_000 ? m : null;
    } catch {
      return null;
    }
  });
  const rememberMade = (m: typeof made) => {
    setMade(m);
    try {
      if (m) localStorage.setItem(madeKey, JSON.stringify(m));
      else localStorage.removeItem(madeKey);
    } catch {
      /* ignore */
    }
  };
  function madeIt() {
    if (!recipe || made) return;
    const { changes, undo } = useForRecipe(applySwaps(recipe), loadProgress(recipe.id).scale);
    rememberMade({ at: Date.now(), undo });
    showToast(
      changes.length
        ? `Pantry: ${changes.map((c) => `${c.name} ${c.left}`).join("; ")}`
        : "Nothing in your pantry matched this recipe.",
    );
  }
  const [toast, showToast] = useToast();
  // Built ahead of time: iPhones only allow the share sheet to open straight
  // after a tap, so nothing slow may happen between the tap and share().
  const [link, setLink] = useState("");

  useEffect(() => {
    setLink("");
    // Share the version you cook: chosen substitutes included.
    if (recipe) recipeLink(applySwaps(recipe)).then(setLink, () => setLink(""));
  }, [recipe]);

  useEffect(() => {
    const load = () => getRecipe(id).then((r) => setRecipe(r ?? null), () => setRecipe(null));
    void load();
    window.addEventListener("recipes-synced", load);
    return () => window.removeEventListener("recipes-synced", load);
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
      ? await shareText(
          recipe.title,
          `${recipe.title}${activeSwaps(recipe).size ? " (my version, with substitutions)" : ""}\nOpen the recipe in Recipe Builder:`,
          link,
        )
      : await shareText(recipe.title, recipeToText(applySwaps(recipe), loadProgress(recipe.id).scale));
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
            <TimerBar {...timers} />
            <RecipeView
              key={`${recipe.id}-${viewKey}`}
              onStartCooking={() => {
                cookStart(recipe.id); // starts the clock for "how long did it take?"
                setCooking(true);
              }}
              onMade={madeIt}
              made={made && { at: made.at, onUndo: () => (restore(made.undo), rememberMade(null), showToast("Pantry change undone")) }}
              top={<PlanMeal recipe={{ ...applySwaps(recipe), cookLog: recipe.cookLog }} recipeId={recipe.id} />}
              recipe={applySwaps(recipe)}
              recipeId={recipe.id}
              swaps={activeSwaps(recipe)}
              onUndoSwap={async (i) => {
                const byIndex = { ...recipe.swaps!.byIndex };
                delete byIndex[i];
                const updated = { ...recipe, swaps: { ...recipe.swaps!, byIndex } };
                setRecipe(updated);
                await saveRecipe(updated);
              }}
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
            {(recipe.source || recipe.importCost !== undefined) && (
              <p className="muted small source-line">
                {recipe.source && (
                  <>
                    From{" "}
                    <a href={recipe.source} target="_blank" rel="noopener noreferrer">
                      {new URL(recipe.source).hostname.replace(/^www\./, "")}
                    </a>
                  </>
                )}
                {recipe.source && recipe.importCost !== undefined && " · "}
                {recipe.importCost !== undefined && <>Reading it cost ≈ {money(recipe.importCost)}</>}
              </p>
            )}
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
      {recipe && cooking && (
        <CookMode
          recipe={applySwaps(recipe)}
          recipeId={recipe.id}
          timers={timers}
          plannedMinutes={getPlan(recipe.id)?.minutes}
          onMade={madeIt}
          onLog={async (minutes) => {
            const scale = loadProgress(recipe.id).scale;
            const updated = { ...recipe, cookLog: [...(recipe.cookLog ?? []), { at: Date.now(), minutes, scale }] };
            setRecipe(updated);
            await saveRecipe(updated);
            clearPlan(recipe.id);
            clearCookStart(recipe.id);
          }}
          onClose={() => {
            setCooking(false);
            setViewKey((k) => k + 1);
          }}
        />
      )}
      {toast}
    </>
  );
}
