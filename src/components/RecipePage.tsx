import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import RecipeView from "./RecipeView";
import RecipeEditor from "./RecipeEditor";
import Substitutes from "./Substitutes";
import CookMode, { clearCookStart, cookStart } from "./CookMode";
import PlanMeal from "./PlanMeal";
import MyNotes from "./MyNotes";
import AddToWeek from "./AddToWeek";
import NutritionSection from "./NutritionSection";
import { ShareToFamily } from "./Family";
import { markMade, unmarkMadeToday } from "../lib/made";
import { freezeHalfIfPlanned } from "../lib/leftovers";
import FreezeHalf from "./FreezeHalf";
import ThawNote from "./ThawNote";
import { clearPlan, getPlan } from "../lib/plan";
import { restore, useForRecipe, type PantryItem } from "../lib/pantry";
import { TimerBar, useTimers } from "./Timers";
import { activeSwaps, applySwaps } from "../lib/swaps";
import { clearProgress, loadProgress, saveProgress } from "../lib/progress";
import { deleteRecipe, getRecipe, listRecipes, newId, saveRecipe } from "../lib/db";
import { family, makeVariant } from "../lib/variants";
import { href, navigate } from "../lib/route";
import { recipeToText, shareText } from "../lib/share";
import { recipeLink } from "../lib/link";
import { money } from "../lib/usage";
import { loadShopping, removeFromShopping } from "../lib/shopping";
import { useToast } from "./Toast";
import { cleanTags, type SavedRecipe } from "../lib/schema";
import { feature } from "../lib/features";

export default function RecipePage({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<SavedRecipe | null | undefined>(undefined);
  const [showPhotos, setShowPhotos] = useState(false);
  const [editing, setEditing] = useState(() => {
    try {
      if (sessionStorage.getItem("recipe-builder.editAfterCopy") !== id) return false;
      sessionStorage.removeItem("recipe-builder.editAfterCopy");
      return true;
    } catch {
      return false;
    }
  });
  // "Start cooking" from the Tonight screen opens straight into cooking mode.
  const [cooking, setCooking] = useState(() => {
    try {
      if (sessionStorage.getItem("recipe-builder.cookOnOpen") !== id) return false;
      sessionStorage.removeItem("recipe-builder.cookOnOpen");
      cookStart(id);
      return true;
    } catch {
      return false;
    }
  });
  // Bumped when cooking mode closes, so the recipe view re-reads progress made there.
  const [viewKey, setViewKey] = useState(0);
  const timers = useTimers();
  // Shopping list count for the bag button; refreshes when the list changes.
  const [onList, setOnList] = useState(() => loadShopping().recipes.length);
  useEffect(() => {
    const update = () => setOnList(loadShopping().recipes.length);
    window.addEventListener("shopping-changed", update);
    return () => window.removeEventListener("shopping-changed", update);
  }, []);
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
    const updated = markMade(recipe);
    if (updated !== recipe) {
      setRecipe(updated);
      void saveRecipe(updated);
    }
    const froze = freezeHalf();
    showToast(
      (changes.length ? `Pantry: ${changes.map((c) => `${c.name} ${c.left}`).join("; ")}` : "Nothing in your pantry matched this recipe.") +
        (froze ? " · Half is on your freezer list." : ""),
    );
  }

  /** "Double it and freeze half": once made, half goes on the freezer list and the size goes back. */
  function freezeHalf(): boolean {
    if (!recipe) return false;
    const done = freezeHalfIfPlanned(recipe.id, recipe.title, loadProgress(recipe.id), (p) =>
      saveProgress(recipe.id, { ...loadProgress(recipe.id), ...p }),
    );
    if (done) setViewKey((k) => k + 1); // show the usual size again
    return done;
  }
  const [toast, showToast] = useToast();
  // The original and its versions ("my version"), for the line under the title.
  const [versions, setVersions] = useState<SavedRecipe[]>([]);
  useEffect(() => {
    if (recipe) listRecipes().then((all) => setVersions(family(recipe, all)), () => {});
  }, [recipe]);

  async function copyRecipe() {
    if (!recipe) return;
    const copy = makeVariant(recipe, newId());
    await saveRecipe(copy);
    // Open the copy straight in the editor, so it can be made your own.
    try {
      sessionStorage.setItem("recipe-builder.editAfterCopy", copy.id);
    } catch {
      /* it just opens normally */
    }
    navigate({ name: "recipe", id: copy.id });
  }
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
  // Let go of it while the camera is open (iPhones can show a black camera
  // screen while a page holds the screen awake), and take it back afterwards.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let paused = false;
    const acquire = () => {
      if (!paused && !lock && document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then(
          (l) => {
            lock = l;
            l.addEventListener("release", () => (lock = null));
          },
          () => {},
        );
      }
    };
    const pause = () => {
      paused = true;
      lock?.release().catch(() => {});
      lock = null;
    };
    const resume = () => {
      paused = false;
      acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    window.addEventListener("camera-opening", pause);
    window.addEventListener("camera-closed", resume);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      window.removeEventListener("camera-opening", pause);
      window.removeEventListener("camera-closed", resume);
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
              <a
                className="icon-btn badge-host"
                href={href({ name: "shopping" })}
                aria-label={`Shopping list${onList ? `, ${onList} recipes` : ""}`}
              >
                <Icon name="bag" />
                {onList > 0 && <span className="badge">{onList}</span>}
              </a>
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
              onStartCooking={
                feature("cookMode")
                  ? () => {
                      cookStart(recipe.id); // starts the clock for "how long did it take?"
                      setCooking(true);
                    }
                  : undefined
              }
              onMade={feature("pantry") ? madeIt : undefined}
              made={made && { at: made.at, onUndo: () => {
                  restore(made.undo);
                  rememberMade(null);
                  const updated = unmarkMadeToday(recipe);
                  setRecipe(updated);
                  void saveRecipe(updated);
                  showToast("Pantry change undone");
                } }}
              top={
                <>
                  {feature("mealTime") && <PlanMeal recipe={{ ...applySwaps(recipe), cookLog: recipe.cookLog }} recipeId={recipe.id} />}
                  {feature("weekPlanner") && <AddToWeek recipeId={recipe.id} />}
                  {feature("thaw") && <ThawNote key={`thaw-${viewKey}`} recipe={applySwaps(recipe)} saved={recipe} scale={loadProgress(recipe.id).scale} />}
                  {feature("freezeHalf") && <FreezeHalf key={viewKey} recipeId={recipe.id} onChange={() => setViewKey((k) => k + 1)} />}
                </>
              }
              recipe={applySwaps(recipe)}
              recipeId={recipe.id}
              photo={feature("notes") ? recipe.dishPhoto : undefined}
              versions={feature("versions") && versions.length > 1 ? versions.map((v) => ({ id: v.id, title: v.title, original: !v.variantOf })) : undefined}
              onTagsChange={async (tags) => {
                const updated = { ...recipe, tags: cleanTags(tags) };
                setRecipe(updated);
                await saveRecipe(updated);
              }}
              swaps={activeSwaps(recipe)}
              onUndoSwap={async (i) => {
                const byIndex = { ...recipe.swaps!.byIndex };
                delete byIndex[i];
                const updated = { ...recipe, swaps: { ...recipe.swaps!, byIndex } };
                setRecipe(updated);
                await saveRecipe(updated);
              }}
              myNotes={
                <>
                  {feature("notes") && <MyNotes
                    key={recipe.id}
                    recipe={recipe}
                    onMarkedMade={() => freezeHalf() && showToast("Half is on your freezer list.")}
                    onSaved={async (updated) => {
                      setRecipe(updated);
                      await saveRecipe(updated);
                    }}
                  />}
                </>
              }
              extra={
                <>
                  {feature("avoid") && <Substitutes
                    recipe={recipe}
                    onSaved={async (updated) => {
                      await saveRecipe(updated);
                      setRecipe(updated);
                    }}
                  />}
                  {feature("family") && <ShareToFamily recipe={recipe} />}
                  {feature("nutrition") && <NutritionSection
                    recipe={recipe}
                    onSaved={async (updated) => {
                      await saveRecipe(updated);
                      setRecipe(updated);
                    }}
                  />}
                </>
              }
            />
            <div className="button-row print-link">
              {feature("print") && (
                <a className="btn" href={href({ name: "print", id: recipe.id })}>
                  <Icon name="download" size={18} /> Print or save as PDF
                </a>
              )}
              {feature("versions") && (
                <button className="btn" onClick={copyRecipe}>
                  <Icon name="plus" size={18} /> Make my own version
                </button>
              )}
            </div>
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
          onMade={feature("pantry") ? madeIt : undefined}
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
