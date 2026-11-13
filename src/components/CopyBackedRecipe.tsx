import { useEffect, useState, type ReactNode } from "react";
import Header from "./Header";
import Icon from "./Icon";
import RecipeView from "./RecipeView";
import CookMode, { clearCookStart, cookStart } from "./CookMode";
import PlanMeal from "./PlanMeal";
import MyNotes from "./MyNotes";
import AddToWeek from "./AddToWeek";
import Substitutes from "./Substitutes";
import NutritionSection from "./NutritionSection";
import FreezeHalf from "./FreezeHalf";
import ThawNote from "./ThawNote";
import { TimerBar, useTimers } from "./Timers";
import { useToast } from "./Toast";
import { deleteRecipe, listRecipes, newId, saveRecipe } from "../lib/db";
import { feature } from "../lib/features";
import { freezeHalfIfPlanned } from "../lib/leftovers";
import { recipeLink } from "../lib/link";
import { markMade, unmarkMadeToday } from "../lib/made";
import { restore, useForRecipe, type PantryItem } from "../lib/pantry";
import { loadProgress, saveProgress } from "../lib/progress";
import { href, navigate } from "../lib/route";
import type { SavedRecipe, ScannedRecipe } from "../lib/schema";
import { recipeToText, shareText } from "../lib/share";
import { addToShopping, loadShopping } from "../lib/shopping";
import { makeVariant } from "../lib/variants";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A recipe that isn't in your recipes — one in a cookbook or in The Mix — with
 * the same features as your own recipes. Cooking features (sizes, units,
 * check-offs, tips, cost, cooking mode, share) work on it directly. Personal
 * features (favorites, the shopping list, meal time and the week, thaw, freeze
 * half, notes and photos, "made it" with the pantry, substitutes, nutrition,
 * print, my own version) use your own copy; without one, the actions that
 * need it save one first (keeping the size and check-offs) and say so.
 *
 * Used by both pages so they can't drift apart.
 */
export default function CopyBackedRecipe(props: {
  recipe: ScannedRecipe;
  /** Progress key for check-offs and size until you have a copy, e.g. "cookbook-…" or "mix-…". */
  progressKey: string;
  /** Finds your copy among your recipes. */
  findCopy: (all: SavedRecipe[]) => SavedRecipe | null;
  /** Kept on a saved copy (e.g. the web page a Mix recipe came from). */
  copySource?: string;
  title: string;
  back: string;
  /** More header buttons after star / shopping list / share (e.g. edit). */
  headerExtra?: ReactNode;
  /** Shown before the recipe (who shared it, ratings…). */
  before?: ReactNode;
  /** More buttons at the bottom (remove from cookbook, report…). */
  buttons?: ReactNode;
  /** Show the big "Save to my recipes" button when you have no copy. */
  offerSave: boolean;
  /** Bumps when the recipe itself changes (after an edit), to redraw it. */
  version?: number;
  /** Sheets etc. drawn over the page. */
  children?: ReactNode;
}) {
  const { recipe, progressKey, findCopy } = props;
  const [myCopy, setMyCopy] = useState<SavedRecipe | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, showToast] = useToast();
  const timers = useTimers();
  const [cooking, setCooking] = useState(false);
  const [viewKey, setViewKey] = useState(0);

  useEffect(() => {
    listRecipes().then((all) => setMyCopy(findCopy(all)), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe]);

  // Check-offs and size: your copy's, or this recipe's own until you save it.
  const progressId = myCopy?.id ?? progressKey;
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    recipeLink(recipe).then(setLink, () => setLink(""));
  }, [recipe]);
  const [onList, setOnList] = useState(() => loadShopping().recipes.length);
  useEffect(() => {
    const update = () => setOnList(loadShopping().recipes.length);
    window.addEventListener("shopping-changed", update);
    return () => window.removeEventListener("shopping-changed", update);
  }, []);

  const run = (fn: () => Promise<void>) => () => fn().catch((e) => setError(errText(e)));
  /** Saves this recipe to your recipes (keeping your check-offs and size), and returns it. */
  async function saveCopy(extra: Partial<SavedRecipe> = {}): Promise<SavedRecipe> {
    const saved: SavedRecipe = { ...recipe, id: newId(), createdAt: Date.now(), photos: [], ...(props.copySource ? { source: props.copySource } : {}), ...extra };
    await saveRecipe(saved);
    saveProgress(saved.id, loadProgress(progressId));
    setMyCopy(saved);
    setViewKey((k) => k + 1);
    return saved;
  }
  async function updateCopy(updated: SavedRecipe) {
    setMyCopy(updated);
    await saveRecipe(updated);
  }
  const save = run(async () => {
    setSaving(true);
    try {
      const saved = await saveCopy();
      navigate({ name: "recipe", id: saved.id });
    } finally {
      setSaving(false);
    }
  });
  const toggleFavorite = run(async () => {
    if (myCopy) {
      await updateCopy({ ...myCopy, favorite: !myCopy.favorite });
      showToast(myCopy.favorite ? "Removed from Favorites" : "Added to Favorites");
    } else {
      await saveCopy({ favorite: true });
      showToast("Saved to your recipes and Favorites");
    }
  });
  const share = run(async () => {
    const r = link
      ? await shareText(recipe.title, `${recipe.title}\nOpen the recipe in Cardamix:`, link)
      : await shareText(recipe.title, recipeToText(recipe, loadProgress(progressId).scale));
    if (r === "copied") showToast("Link copied — paste it in a message");
    if (r === "failed") showToast("Sharing isn't available in this browser");
  });

  // "I made this": subtracts it from the pantry, marks your copy made, and puts half in the freezer
  // if you doubled it to freeze half. The pantry snapshot is kept 12 h for Undo.
  const madeKey = (rid: string) => `recipe-builder.made.${rid}`;
  const [made, setMade] = useState<{ at: number; undo: Record<string, PantryItem | null> } | null>(null);
  useEffect(() => {
    if (!myCopy) return setMade(null);
    try {
      const m = JSON.parse(localStorage.getItem(madeKey(myCopy.id)) ?? "null") as typeof made;
      setMade(m && Date.now() - m.at < 12 * 3600_000 ? m : null);
    } catch {
      setMade(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCopy?.id]);
  const rememberMade = (rid: string, m: typeof made) => {
    setMade(m);
    try {
      if (m) localStorage.setItem(madeKey(rid), JSON.stringify(m));
      else localStorage.removeItem(madeKey(rid));
    } catch {
      /* ignore */
    }
  };
  function freezeHalf(copy: SavedRecipe): boolean {
    const done = freezeHalfIfPlanned(copy.id, copy.title, loadProgress(copy.id), (p) => saveProgress(copy.id, { ...loadProgress(copy.id), ...p }));
    if (done) setViewKey((k) => k + 1);
    return done;
  }
  const madeIt = run(async () => {
    if (made) return;
    const copy = myCopy ?? (await saveCopy());
    const { changes, undo } = useForRecipe(recipe, loadProgress(copy.id).scale);
    rememberMade(copy.id, { at: Date.now(), undo });
    const updated = markMade(copy);
    if (updated !== copy) await updateCopy(updated);
    const froze = freezeHalf(copy);
    showToast(
      (myCopy ? "" : "Saved to your recipes. ") +
        (changes.length ? `Pantry: ${changes.map((c) => `${c.name} ${c.left}`).join("; ")}` : "Nothing in your pantry matched this recipe.") +
        (froze ? " · Half is on your freezer list." : ""),
    );
  });
  const undoMade = run(async () => {
    if (!made || !myCopy) return;
    restore(made.undo);
    rememberMade(myCopy.id, null);
    await updateCopy(unmarkMadeToday(myCopy));
    showToast("Pantry change undone");
  });
  const makeMyVersion = run(async () => {
    const base = myCopy ?? (await saveCopy());
    const copy = makeVariant(base, newId());
    await saveRecipe(copy);
    try {
      sessionStorage.setItem("recipe-builder.editAfterCopy", copy.id);
    } catch {
      /* it just opens normally */
    }
    navigate({ name: "recipe", id: copy.id });
  });
  const deleteMyCopy = run(async () => {
    if (!myCopy || !confirm(`Delete your copy of “${myCopy.title}” from your recipes? This recipe stays where it is.`)) return;
    await deleteRecipe(myCopy.id);
    setMyCopy(null);
    setViewKey((k) => k + 1);
    showToast("Your copy was deleted.");
  });

  return (
    <>
      <Header
        title={props.title}
        back={props.back}
        returnToPrevious
        actions={
          <>
            <button
              className={myCopy?.favorite ? "icon-btn starred" : "icon-btn"}
              onClick={toggleFavorite}
              aria-label={myCopy?.favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={!!myCopy?.favorite}
            >
              <Icon name="star" filled={!!myCopy?.favorite} />
            </button>
            <a className="icon-btn badge-host" href={href({ name: "shopping" })} aria-label={`Shopping list${onList ? `, ${onList} recipes` : ""}`}>
              <Icon name="bag" />
              {onList > 0 && <span className="badge">{onList}</span>}
            </a>
            <button className="icon-btn" onClick={share} aria-label="Share recipe">
              <Icon name="share" />
            </button>
            {props.headerExtra}
          </>
        }
      />
      <main className="page">
        {props.before && <div className="no-print">{props.before}</div>}
        <TimerBar {...timers} />
        <RecipeView
          key={`${progressId}-${viewKey}-${props.version ?? 0}`}
          recipe={recipe}
          recipeId={progressId}
          onStartCooking={feature("cookMode") ? () => (cookStart(progressId), setCooking(true)) : undefined}
          onMade={feature("pantry") ? madeIt : undefined}
          made={made && myCopy ? { at: made.at, onUndo: undoMade } : undefined}
          listRow={
            myCopy ? undefined : (
              <div className="list-row">
                <button
                  className="btn"
                  onClick={run(async () => {
                    const saved = await saveCopy();
                    const p = loadProgress(saved.id);
                    addToShopping(saved.id, p.scale, p.have.filter((i) => i < saved.ingredients.length));
                    showToast("Saved to your recipes and added to your shopping list");
                  })}
                >
                  <Icon name="bag" size={18} /> Add to shopping list
                </button>
              </div>
            )
          }
          top={
            myCopy ? (
              <>
                {feature("mealTime") && <PlanMeal recipe={{ ...recipe, cookLog: myCopy.cookLog }} recipeId={myCopy.id} />}
                {feature("weekPlanner") && <AddToWeek recipeId={myCopy.id} />}
                {feature("thaw") && <ThawNote key={`thaw-${viewKey}`} recipe={recipe} saved={myCopy} scale={loadProgress(myCopy.id).scale} />}
                {feature("freezeHalf") && <FreezeHalf key={viewKey} recipeId={myCopy.id} onChange={() => setViewKey((k) => k + 1)} />}
              </>
            ) : (
              <div className="callout small make-it-yours">
                Planning it for the week, thaw reminders, freezing half, your notes and photos use your own copy.{" "}
                <button className="link-btn small" onClick={save} disabled={saving}>
                  Save to my recipes
                </button>
              </div>
            )
          }
          myNotes={
            myCopy && feature("notes") ? (
              <>
                <p className="muted small">
                  Your notes and history, kept with your copy: <a href={href({ name: "recipe", id: myCopy.id })}>“{myCopy.title}”</a>
                </p>
                <MyNotes key={myCopy.id} recipe={myCopy} hideRating onSaved={updateCopy} />
              </>
            ) : undefined
          }
          extra={
            myCopy ? (
              <>
                {feature("avoid") && <Substitutes recipe={myCopy} onSaved={updateCopy} />}
                {feature("nutrition") && <NutritionSection recipe={myCopy} onSaved={updateCopy} />}
              </>
            ) : undefined
          }
        />
        <div className="button-row print-link no-print">
          {feature("print") && myCopy && (
            <a className="btn" href={href({ name: "print", id: myCopy.id })}>
              <Icon name="download" size={18} /> Print or save as PDF
            </a>
          )}
          {feature("versions") && (
            <button className="btn" onClick={makeMyVersion}>
              <Icon name="plus" size={18} /> Make my own version
            </button>
          )}
          {myCopy && (
            <button className="btn" onClick={deleteMyCopy}>
              <Icon name="trash" size={18} /> Delete my copy
            </button>
          )}
          {props.buttons}
        </div>
        {error && <div className="callout error">{error}</div>}
      </main>
      {props.offerSave && !myCopy && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save to my recipes"}
          </button>
        </div>
      )}
      {cooking && (
        <CookMode
          recipe={recipe}
          recipeId={progressId}
          timers={timers}
          onMade={feature("pantry") ? madeIt : undefined}
          onLog={async (minutes) => {
            if (myCopy) await updateCopy({ ...myCopy, cookLog: [...(myCopy.cookLog ?? []), { at: Date.now(), minutes, scale: loadProgress(progressId).scale }] });
            clearCookStart(progressId);
          }}
          onClose={() => {
            setCooking(false);
            setViewKey((k) => k + 1);
          }}
        />
      )}
      {props.children}
      {toast}
    </>
  );
}
