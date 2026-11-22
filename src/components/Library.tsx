import { InvitesWaiting } from "./Invites";
import { useThawReminders } from "./ThawList";
import { dueNow, groupThaw } from "../lib/thaw";
import { feature } from "../lib/features";
import { useEffect, useMemo, useState } from "react";
import { saveRecipe } from "../lib/db";
import { loadShopping } from "../lib/shopping";
import { findAvoided, isActive, loadAvoid } from "../lib/avoid";
import { activeSwaps } from "../lib/swaps";
import { whatCanIMake } from "../lib/canMake";
import { loadPantry, useSoon } from "../lib/pantry";
import { freshness, useByText } from "../lib/shelfLife";
import WarnIcon from "./WarnIcon";
import { agoText, lastMade } from "../lib/made";
import { accountCreatedAt, cloudState, subscribeCloud } from "../lib/cloud";
import { eatByLabel, leftoverPast, useLeftovers } from "../lib/leftovers";
import { aYearAgo } from "../lib/history";
import Header from "./Header";
import RecipeActions, { HoldLink } from "./RecipeActions";
import { duplicatePairs, notDuplicates } from "../lib/duplicates";
import { searchRecipe, type SearchScope } from "../lib/search";
import SearchBox from "./SearchBox";
import { useToast } from "./Toast";
import { deleteWithUndo } from "../lib/undoDelete";
import { addSamples, isNewAccount, isSample, removeSamples } from "../lib/samples";
import { refusedBy, tastesOn } from "../lib/tastes";
import { noteStep } from "../lib/funnel";
import { removeFromShopping } from "../lib/shopping";
import Welcome from "./Welcome";
import { welcomeDone } from "../lib/welcome";
import Icon from "./Icon";
import CookThisWeek from "./CookThisWeek";
import Tour from "./Tour";
import UpNext from "./UpNext";
import UpgradeCard from "./UpgradeCard";
import StackNote from "./StackNote";
import { finishTour, queueAddTour, tourDone } from "../lib/tour";
import { listRecipes, storageErrorMessage, storageMode, STORAGE_MODE_TEXT, type StorageMode } from "../lib/db";
import { href, navigate } from "../lib/route";
import { aiReady } from "../lib/settings";
import type { SavedRecipe } from "../lib/schema";
import { Loading } from "./LogoLoader";

export default function Library() {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [mode, setMode] = useState<StorageMode | null>(null);
  const [filter, setFilter] = useState(() => remembered("filter", "all"));
  const [sort, setSort] = useState(() => remembered("sort", "newest"));
  const onList = loadShopping().recipes.length;
  const fridge = useLeftovers().filter((l) => !l.frozen);
  // One per recipe and day ("chicken breast and chicken thighs").
  const thawNow = groupThaw(dueNow(useThawReminders(recipes)));
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  const [showWelcome, setShowWelcome] = useState(() => !welcomeDone());
  const [tourClosed, setTourClosed] = useState(false);
  // A new phone downloads its recipes on the first sync — only then do we know the box is really empty.
  const [syncedOnce, setSyncedOnce] = useState(false);
  useEffect(() => {
    if (!cloud.lastSync || syncedOnce) return;
    listRecipes().then((rs) => (setRecipes(rs), setSyncedOnce(true)), () => setSyncedOnce(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.lastSync]);
  // Whether an empty list really means an empty box: only after this account's recipes have been
  // downloaded (a new phone or browser starts empty), or when there's no cloud to download from.
  const boxKnown = cloud.status === "off" || syncedOnce || cloud.status === "offline" || cloud.status === "error";
  // Sample recipes: only for new accounts (or with no accounts at all), never added to an existing one.
  const [newAccount, setNewAccount] = useState(false);
  useEffect(() => {
    if (cloud.status === "off") return void setNewAccount(true);
    if (!cloud.uid) return void setNewAccount(false);
    let stop = false;
    void accountCreatedAt().then((t) => !stop && setNewAccount(isNewAccount(t)));
    return () => void (stop = true);
  }, [cloud.uid, cloud.status]);
  // Re-render every 30 s so "start by … in 20 min" stays current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const choose = (kind: "filter" | "sort", value: string) => {
    remember(kind, value);
    (kind === "filter" ? setFilter : setSort)(value);
  };

  // Recipes that look like they were saved twice.
  const [dupIgnored, setDupIgnored] = useState(notDuplicates);
  useEffect(() => {
    const on = () => setDupIgnored(notDuplicates());
    window.addEventListener("duplicates-changed", on);
    window.addEventListener("state-synced", on);
    return () => {
      window.removeEventListener("duplicates-changed", on);
      window.removeEventListener("state-synced", on);
    };
  }, []);
  const dupCount = useMemo(() => (recipes ? duplicatePairs(recipes, dupIgnored).length : 0), [recipes, dupIgnored]);

  // The ⋯ / press-and-hold menu.
  const [menuFor, setMenuFor] = useState<SavedRecipe | null>(null);
  const [toast, showToast] = useToast();

  async function removeRecipe(r: SavedRecipe) {
    setRecipes((rs) => rs && rs.filter((x) => x.id !== r.id));
    await deleteWithUndo(r);
  }

  const [addingSamples, setAddingSamples] = useState(false);
  async function trySamples() {
    // Only into a box that's really empty: if recipes turn up after all (still syncing), add nothing.
    const now = await listRecipes().catch(() => null);
    const stillNew = cloud.status === "off" || isNewAccount(await accountCreatedAt());
    if (!now || now.length > 0 || !stillNew) {
      if (now) setRecipes(now);
      return;
    }
    setAddingSamples(true);
    void noteStep("samplesTried");
    await addSamples().catch(() => {});
    setRecipes(await listRecipes().catch(() => []));
    setAddingSamples(false);
  }
  async function clearSamples() {
    await removeSamples(all).catch(() => {});
    all.filter(isSample).forEach((r) => removeFromShopping(r.id));
    setRecipes(await listRecipes().catch(() => []));
  }

  async function toggleFavorite(r: SavedRecipe) {
    const updated = { ...r, favorite: !r.favorite };
    setRecipes((rs) => rs && rs.map((x) => (x.id === r.id ? updated : x)));
    await saveRecipe(updated).catch(() => {});
  }

  useEffect(() => {
    const load = () => listRecipes().then(setRecipes, (e) => setError(storageErrorMessage(e)));
    load();
    window.addEventListener("recipes-synced", load);
    window.addEventListener("recipes-changed", load); // e.g. a delete undone
    storageMode().then(setMode, () => {});
    return () => {
      window.removeEventListener("recipes-synced", load);
      window.removeEventListener("recipes-changed", load);
    };
  }, []);

  const all = recipes ?? [];
  const tags = [...new Set(all.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b));
  const hasFavorites = all.some((r) => r.favorite);
  const avoid = loadAvoid();
  const avoiding = feature("avoid") && isActive(avoid);
  const hasPantry = feature("pantry") && Object.keys(loadPantry()).length > 0;
  const canMakeNow = new Set(
    hasPantry ? whatCanIMake(all.filter((r) => r.makeAgain !== false), 0).filter((c) => c.missing.length + c.short.length + c.expired.length === 0).map((c) => c.recipe.id) : [],
  );
  const avoidReasons = (r: SavedRecipe) => [
    ...new Set(findAvoided(r.ingredients, avoid, new Set(activeSwaps(r).keys())).flatMap((m) => m.reasons)),
  ];
  // A remembered filter for a tag that no longer exists falls back to All.
  const tastes = tastesOn();
  const activeFilter =
    filter === "favorites" ? "all" // Favorites is the folder row now, not a filter
    : filter === "safe" ? (avoiding ? filter : "all")
    : filter === "canmake" ? (hasPantry ? filter : "all")
    : filter === "everyone" ? (tastes ? filter : "all")
    : filter !== "all" && !tags.includes(filter) ? "all" : filter;

  const q = query.trim().toLowerCase();
  // Search: every word must match, in any order; the matching ingredient lines are shown under each result.
  const found = new Map(q ? all.map((r) => [r.id, searchRecipe(r, q, scope)] as const) : []);
  const shown = all
    .filter((r) => !q || found.get(r.id)?.match)
    .filter((r) =>
      activeFilter === "all" ? true
      : activeFilter === "favorites" ? r.favorite
      : activeFilter === "safe" ? avoidReasons(r).length === 0
      : activeFilter === "canmake" ? canMakeNow.has(r.id)
      : activeFilter === "everyone" ? refusedBy(r).length === 0
      : (r.tags ?? []).includes(activeFilter),
    )
    .sort((a, b) =>
      sort === "az" ? a.title.localeCompare(b.title)
      // Longest since it was made first; never-made recipes after those, newest first.
      // Best rated first ("would make again" breaks ties); unrated last.
      : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) || Number(b.makeAgain ?? 0) - Number(a.makeAgain ?? 0) || a.title.localeCompare(b.title)
      : sort === "lastmade" ? (lastMade(a) ?? Infinity) - (lastMade(b) ?? Infinity) || b.createdAt - a.createdAt
      : b.createdAt - a.createdAt,
    );

  // On the plain "All" view, favorites are one row pinned at the top; tapping it shows them (only there).
  const pinFavorites = activeFilter === "all" && !q && hasFavorites;
  const favoriteCount = all.filter((r) => r.favorite).length;
  const [favOpen, setFavOpen] = useState(false);
  // Favorites live inside the Favorites row, not in the list below it as well.
  const rest = pinFavorites ? shown.filter((r) => !r.favorite) : shown;

  const row = (r: SavedRecipe) => (
    <li key={r.id} className="recipe-row">
      <HoldLink href={href({ name: "recipe", id: r.id })} className="recipe-card" onHold={() => setMenuFor(r)}>
        {r.dishPhoto || r.photos[0] ? <img src={r.dishPhoto ?? r.photos[0]} alt="" /> : <div className="thumb-placeholder" />}
        <div>
          <div className="recipe-card-title">{r.title}</div>
          <div className="muted small">
            {(r.tags ?? []).length ? (r.tags ?? []).join(" · ") : `${plural(r.ingredients.length, "ingredient")} · ${plural(r.steps.length, "step")}`}
            {r.makeAgain === false && <span className="no-again"> · Wouldn't make again</span>}
            {tastes && refusedBy(r).length > 0 && <span className="no-again"> · {refusedBy(r).join(", ")} won't eat</span>}
          </div>
          {feature("notes") && (r.rating || lastMade(r) !== undefined) && (
            <div className="muted small">
              {r.rating ? <span className="row-stars" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> : null}
              {r.rating && lastMade(r) !== undefined ? " · " : ""}
              {lastMade(r) !== undefined && `Last made ${agoText(lastMade(r)!)}`}
            </div>
          )}
          {q && (found.get(r.id)?.ingredientHits.length ?? 0) > 0 && (
            <div className="small search-hit">Has: {found.get(r.id)!.ingredientHits.slice(0, 3).join(" · ")}</div>
          )}
          {avoiding && avoidReasons(r).length > 0 && (
            <div className="small avoid-meta">Contains {avoidReasons(r).join(", ").toLowerCase()}</div>
          )}
        </div>
      </HoldLink>
      <button
        className={r.favorite ? "icon-btn star-btn starred" : "icon-btn star-btn"}
        aria-label={r.favorite ? `Remove ${r.title} from favorites` : `Add ${r.title} to favorites`}
        aria-pressed={!!r.favorite}
        onClick={() => toggleFavorite(r)}
      >
        <Icon name="star" size={20} filled={!!r.favorite} />
      </button>
      <button className="icon-btn more-btn" aria-label={`More options for ${r.title}`} aria-haspopup="dialog" onClick={() => setMenuFor(r)}>
        <Icon name="more" size={20} />
      </button>
    </li>
  );

  // First open on a phone with no recipes (and nobody signed in): quick setup.
  if (showWelcome && !welcomeDone() && recipes && recipes.length === 0 && (cloud.status === "off" || syncedOnce))
    return <Welcome onDone={() => setShowWelcome(false)} />;
  // The tour, once per account: after setup, and only once this phone has synced (so it knows if it was already seen).
  const tourReady = !tourDone() && recipes !== null && (cloud.status === "off" || syncedOnce);

  return (
    <>
      <Header
        title=""
        brand
        actions={
          <>
            {feature("weekPlanner") && (
              <a className="icon-btn" href={href({ name: "week" })} aria-label="This week's meals">
                <Icon name="calendar" />
              </a>
            )}
            {feature("pantry") && (
              <a className="icon-btn" href={href({ name: "pantry" })} aria-label="Pantry">
                <Icon name="jar" />
              </a>
            )}
            <a className="icon-btn badge-host" href={href({ name: "shopping" })} aria-label={`Shopping list${onList ? `, ${onList} recipes` : ""}`}>
              <Icon name="bag" />
              {onList > 0 && <span className="badge">{onList}</span>}
            </a>
            <a className="icon-btn" href={href({ name: "settings" })} aria-label="Settings">
              <Icon name="settings" />
            </a>
          </>
        }
      />
      <main className="page">
        <h1 className="page-title">Recipes</h1>
        <InvitesWaiting kinds={["shop", "book", "household"]} />
        {/* Today: what's up next, what to use soon, leftovers — one card instead of a stack of banners. */}
        <div className="today-card">
          <h2 className="today-title">Today</h2>
        {(() => {
          const soon = feature("pantry") ? useSoon(all) : [];
          if (!soon.length) return null;
          const first = soon[0];
          const more = soon.length - 1;
          return (
            <a className="plan-strip use-soon-strip" href={href({ name: "pantry" })}>
              {freshness(first.item.useBy!) === "past" ? <WarnIcon /> : <Icon name="jar" size={18} />}
              <span>
                <strong>
                  {freshness(first.item.useBy!) === "past"
                    ? `Past its date: ${first.item.name} (${useByText(first.item.useBy!)})`
                    : `Use soon: ${first.item.name} (${useByText(first.item.useBy!)})`}
                </strong>
                <span className="muted small">
                  {" "}
                  {first.recipes.length
                    ? `· ${first.recipes.length} ${first.recipes.length === 1 ? "recipe uses" : "recipes use"} it`
                    : ""}
                  {more > 0 ? ` · +${more} more` : ""}
                </span>
              </span>
            </a>
          );
        })()}
        {(() => {
          const ago = feature("history") ? aYearAgo(all) : [];
          if (!ago.length) return null;
          return (
            <a className="plan-strip" href={href({ name: "history" })}>
              <Icon name="calendar" size={18} />
              <span>
                <strong>A year ago this week: {ago.map((c) => c.recipe.title).join(", ")}</strong>
                <span className="muted small"> · make it again?</span>
              </span>
            </a>
          );
        })()}
        {feature("pantry") && fridge.length > 0 && (
          <a className="plan-strip use-soon-strip" href={href({ name: "pantry" })}>
            {leftoverPast(fridge[0]) ? <WarnIcon /> : <Icon name="jar" size={18} />}
            <span>
              <strong>
                Leftovers: {fridge[0].title} · {eatByLabel(fridge[0])}
              </strong>
              {fridge.length > 1 && <span className="muted small"> · +{fridge.length - 1} more</span>}
            </span>
          </a>
        )}
        {/* One line per recipe: on today's plan, when to start, what to thaw. */}
        <UpNext recipes={all} thaw={thawNow} />
        </div>
        {!aiReady() && !error && (
          <div className="callout">
            <strong>Welcome!</strong> To scan cards, add your Anthropic API key first.{" "}
            <a href={href({ name: "settings" })}>Open Settings</a>
          </div>
        )}
        {error && <div className="callout error">{error}</div>}
        {mode === "memory" && <div className="callout error">{STORAGE_MODE_TEXT.memory}</div>}
        {mode === "local" && <div className="callout warn small">{STORAGE_MODE_TEXT.local}</div>}
        <StackNote />
        <UpgradeCard show={!!cloud.uid && !!cloud.emailVerified && all.length > 0 && !(tourReady && !tourClosed)} />
        {recipes && recipes.length > 0 && (
          <SearchBox query={query} scope={scope} onQuery={setQuery} onScope={setScope} />
        )}
        {(recipes === null || (recipes.length === 0 && !boxKnown)) && !error && <Loading />}
        {recipes?.length === 0 && boxKnown && (
          <div className="empty">
            <p className="empty-title">Your recipe box is empty.</p>
            <p className="muted">Snap a photo of a recipe card, cookbook page or screenshot, and it becomes a recipe you can cook from, scale and shop for.</p>
            <div className="button-row empty-actions">
              <a className="btn primary" href={href({ name: "scan" })}>
                <Icon name="camera" size={20} /> Add your first recipe
              </a>
              {newAccount && (
                <button className="btn" disabled={addingSamples} onClick={() => void trySamples()}>
                  {addingSamples ? "Adding…" : "Try 3 sample recipes"}
                </button>
              )}
            </div>
          </div>
        )}
        {all.some(isSample) && (
          <p className="muted small samples-note">
            {all.every(isSample) ? (
              <>
                These are sample recipes to try things out: open one to cook, scale or add it to your shopping list. Add your own with{" "}
                <strong>Add Recipe</strong>.
              </>
            ) : (
              "Done with the sample recipes?"
            )}{" "}
            <button className="link-btn small" onClick={() => void clearSamples()}>
              Remove samples
            </button>
          </p>
        )}
        {all.length > 0 && (hasFavorites || tags.length > 0 || avoiding || hasPantry || tastes) && (
          <div className="filters" role="group" aria-label="Show">
            {[
              ["all", "All"],
              ...(hasPantry ? [["canmake", "Can make now"]] : []),
              ...(avoiding ? [["safe", "Fits my avoid list"]] : []),
              ...(tastes ? [["everyone", "Everyone eats"]] : []),
              ...tags.map((t) => [t, t]),
            ].map(([value, label]) => (
              <button
                key={value}
                className={activeFilter === value ? "tag on" : "tag"}
                aria-pressed={activeFilter === value}
                onClick={() => choose("filter", value)}
              >
                {value === "favorites" && <Icon name="star" size={13} filled />} {label}
              </button>
            ))}
          </div>
        )}
        {all.length > 1 && (
          <div className="list-toolbar">
            <span className="muted small">{plural(shown.length, "recipe")}</span>
            <label className="sort">
              <span className="muted small">Sort</span>
              <select value={sort} onChange={(e) => choose("sort", e.target.value)}>
                <option value="newest">Newest</option>
                <option value="az">A–Z</option>
                {feature("notes") && <option value="lastmade">Not made lately</option>}
                {feature("notes") && <option value="rating">Top rated</option>}
              </select>
            </label>
          </div>
        )}
        {pinFavorites && (
          <div className={favOpen ? "favorites-folder-wrap open" : "favorites-folder-wrap"}>
            {/* Like a folder: tap to open, tap the same bar to close. */}
            <button className="favorites-folder" aria-expanded={favOpen} onClick={() => setFavOpen(!favOpen)}>
              <Icon name="star" size={20} filled />
              <strong>Favorites</strong>
              <span className="muted">{favoriteCount}</span>
              <span className="favorites-folder-arrow" aria-hidden>›</span>
            </button>
            {favOpen && <ul className="recipe-list favorites-list">{shown.filter((r) => r.favorite).map(row)}</ul>}
          </div>
        )}
        {activeFilter === "all" && !q && feature("notes") && <CookThisWeek recipes={all} />}
        {rest.length > 0 && activeFilter === "all" && !q && (pinFavorites || (feature("notes") && all.length > 3)) && (
          <h2 className="list-heading list-heading-all">{pinFavorites ? "Other recipes" : "All recipes"}</h2>
        )}
        {rest.length > 0 && <ul className="recipe-list">{rest.map(row)}</ul>}
        {all.length > 0 && shown.length === 0 && <p className="muted">No matches.</p>}
        {dupCount > 0 && (
          <a className="plan-strip dup-strip" href={href({ name: "duplicates" })}>
            <Icon name="warning" size={18} />
            <span>
              <strong>
                {dupCount} possible {dupCount === 1 ? "duplicate" : "duplicates"}
              </strong>
              <span className="muted small"> · Review</span>
            </span>
          </a>
        )}
      </main>
      {tourReady && !tourClosed && (
        <Tour
          doneLabel="Next: add a recipe"
          onDone={(finished) => {
            finishTour();
            setTourClosed(true);
            // Finished (not skipped): the second tour, on Add Recipe.
            if (finished) {
              queueAddTour();
              navigate({ name: "scan" });
            }
          }}
        />
      )}
      {menuFor && (
        <RecipeActions
          recipe={menuFor}
          onClose={() => setMenuFor(null)}
          onFavorite={toggleFavorite}
          onDelete={removeRecipe}
          onMessage={showToast}
        />
      )}
      {toast}
    </>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The chosen filter and sort are a convenience: remembered on this device if possible.
function remembered(kind: string, fallback: string): string {
  try {
    return localStorage.getItem(`recipe-builder.library.${kind}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function remember(kind: string, value: string): void {
  try {
    localStorage.setItem(`recipe-builder.library.${kind}`, value);
  } catch {
    /* ignore */
  }
}
