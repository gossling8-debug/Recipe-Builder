import { useThawReminders } from "./ThawList";
import { dueNow, whenText } from "../lib/thaw";
import type { Route } from "../lib/route";
import { feature } from "../lib/features";
import { useEffect, useMemo, useState } from "react";
import { saveRecipe } from "../lib/db";
import { loadShopping } from "../lib/shopping";
import { findAvoided, isActive, loadAvoid } from "../lib/avoid";
import { activeSwaps } from "../lib/swaps";
import { loadPlans, timeOf, untilText } from "../lib/plan";
import { whatCanIMake } from "../lib/canMake";
import { loadPantry, useSoon } from "../lib/pantry";
import { freshness, useByText } from "../lib/shelfLife";
import WarnIcon from "./WarnIcon";
import { agoText, lastMade } from "../lib/made";
import { dayKey, loadWeek } from "../lib/week";
import { cloudState, subscribeCloud } from "../lib/cloud";
import { eatByLabel, leftoverPast, useLeftovers } from "../lib/leftovers";
import { aYearAgo } from "../lib/history";
import Header from "./Header";
import RecipeActions, { HoldLink } from "./RecipeActions";
import { duplicatePairs, notDuplicates } from "../lib/duplicates";
import { searchRecipe, type SearchScope } from "../lib/search";
import SearchBox from "./SearchBox";
import { useToast } from "./Toast";
import { deleteRecipe } from "../lib/db";
import { addToShopping, removeFromShopping } from "../lib/shopping";
import Welcome from "./Welcome";
import { welcomeDone } from "../lib/welcome";
import Icon from "./Icon";
import { listRecipes, storageErrorMessage, storageMode, STORAGE_MODE_TEXT, type StorageMode } from "../lib/db";
import { href } from "../lib/route";
import { aiReady } from "../lib/settings";
import type { SavedRecipe } from "../lib/schema";

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
  const thawNow = dueNow(useThawReminders(recipes));
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  const familyOn = cloud.status !== "off" && cloud.status !== "signed-out";
  const [showWelcome, setShowWelcome] = useState(() => !welcomeDone());
  // A new phone downloads its recipes on the first sync — only then do we know the box is really empty.
  const [syncedOnce, setSyncedOnce] = useState(false);
  useEffect(() => {
    if (!cloud.lastSync || syncedOnce) return;
    listRecipes().then((rs) => (setRecipes(rs), setSyncedOnce(true)), () => setSyncedOnce(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.lastSync]);
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

  // Press-and-hold menu, and "Deleted · Undo".
  const [menuFor, setMenuFor] = useState<SavedRecipe | null>(null);
  const [toast, showToast] = useToast();
  const [deleted, setDeleted] = useState<{ recipe: SavedRecipe; listed?: { id: string; scale: number; skip?: number[] } } | null>(null);
  const [holdTip, setHoldTip] = useState(() => {
    try {
      return !localStorage.getItem("recipe-builder.holdTip");
    } catch {
      return false;
    }
  });
  const dismissHoldTip = () => {
    setHoldTip(false);
    try {
      localStorage.setItem("recipe-builder.holdTip", "1");
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (!deleted) return;
    const t = window.setTimeout(() => setDeleted(null), 6000);
    return () => window.clearTimeout(t);
  }, [deleted]);
  async function removeRecipe(r: SavedRecipe) {
    const listed = loadShopping().recipes.find((x) => x.id === r.id);
    setRecipes((rs) => rs && rs.filter((x) => x.id !== r.id));
    await deleteRecipe(r.id);
    removeFromShopping(r.id);
    setDeleted({ recipe: r, listed });
  }
  async function undoDelete() {
    if (!deleted) return;
    const { recipe: r, listed } = deleted;
    setDeleted(null);
    await saveRecipe(r);
    if (listed) addToShopping(listed.id, listed.scale, listed.skip);
    setRecipes((rs) => rs && [r, ...rs.filter((x) => x.id !== r.id)]);
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
    storageMode().then(setMode, () => {});
    return () => window.removeEventListener("recipes-synced", load);
  }, []);

  const all = recipes ?? [];
  const tags = [...new Set(all.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b));
  const hasFavorites = all.some((r) => r.favorite);
  const avoid = loadAvoid();
  const avoiding = feature("avoid") && isActive(avoid);
  const hasPantry = feature("pantry") && Object.keys(loadPantry()).length > 0;
  const canMakeNow = new Set(
    hasPantry ? whatCanIMake(all, 0).filter((c) => c.missing.length + c.short.length + c.expired.length === 0).map((c) => c.recipe.id) : [],
  );
  const avoidReasons = (r: SavedRecipe) => [
    ...new Set(findAvoided(r.ingredients, avoid, new Set(activeSwaps(r).keys())).flatMap((m) => m.reasons)),
  ];
  // A remembered filter for a tag that no longer exists falls back to All.
  const activeFilter =
    filter === "favorites" ? (hasFavorites ? filter : "all")
    : filter === "safe" ? (avoiding ? filter : "all")
    : filter === "canmake" ? (hasPantry ? filter : "all")
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

  // On the plain "All" view, favorites are pinned in their own section at the top.
  const pinFavorites = activeFilter === "all" && !q && hasFavorites;
  const favorites = pinFavorites ? shown.filter((r) => r.favorite) : [];
  const rest = pinFavorites ? shown.filter((r) => !r.favorite) : shown;

  const row = (r: SavedRecipe) => (
    <li key={r.id} className="recipe-row">
      <HoldLink href={href({ name: "recipe", id: r.id })} className="recipe-card" onHold={() => (setMenuFor(r), dismissHoldTip())}>
        {r.dishPhoto || r.photos[0] ? <img src={r.dishPhoto ?? r.photos[0]} alt="" /> : <div className="thumb-placeholder" />}
        <div>
          <div className="recipe-card-title">{r.title}</div>
          <div className="muted small">
            {(r.tags ?? []).length ? (r.tags ?? []).join(" · ") : `${plural(r.ingredients.length, "ingredient")} · ${plural(r.steps.length, "step")}`}
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
    </li>
  );

  // First open on a phone with no recipes (and nobody signed in): quick setup.
  if (showWelcome && !welcomeDone() && recipes && recipes.length === 0 && (cloud.status === "off" || syncedOnce))
    return <Welcome onDone={() => setShowWelcome(false)} />;

  return (
    <>
      <Header
        title=""
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
        {thawNow.length > 0 && (
          <a className="plan-strip use-soon-strip" href={href({ name: thawNow.length === 1 ? "recipe" : "week", id: thawNow[0].recipeId } as Route)}>
            {whenText(thawNow[0].moveBy) === "late" ? <WarnIcon /> : <Icon name="timer" size={18} />}
            <span>
              <strong>
                {whenText(thawNow[0].moveBy) === "late" ? "Thaw now" : "Thaw tonight"}: {thawNow[0].item.name}
              </strong>
              <span className="muted small">
                {" "}
                · for {thawNow[0].title}
                {thawNow.length > 1 ? ` · +${thawNow.length - 1} more` : ""}
              </span>
            </span>
          </a>
        )}
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
        {(() => {
          const today = (feature("weekPlanner") ? (loadWeek().days[dayKey(new Date())] ?? []) : [])
            .map((m) => {
              const r = all.find((x) => x.id === m.id);
              return r && { title: m.leftover ? `leftover ${r.title}` : r.title };
            })
            .filter(Boolean);
          if (!today.length) return null;
          return (
            <a className="plan-strip" href={href({ name: "week" })}>
              <Icon name="calendar" size={18} />
              <span>
                <strong>Today: {today.map((r) => r!.title).join(", ")}</strong>
                <span className="muted small"> · see the week</span>
              </span>
            </a>
          );
        })()}
        {Object.values(feature("mealTime") ? loadPlans() : {})
          .sort((a, b) => a.startAt - b.startAt)
          .map((p) => (
            <a key={p.recipeId} className="plan-strip" href={href({ name: "recipe", id: p.recipeId })}>
              <Icon name="timer" size={18} />
              <span>
                <strong>{p.startAt <= Date.now() ? `Start ${p.title} now` : `Start ${p.title} by ${timeOf(p.startAt)}`}</strong>
                <span className="muted small">
                  {" "}
                  {p.startAt > Date.now() && `${untilText(p.startAt)} · `}eat at {timeOf(p.eatAt)}
                </span>
              </span>
            </a>
          ))}
        {!aiReady() && !error && (
          <div className="callout">
            <strong>Welcome!</strong> To scan cards, add your Anthropic API key first.{" "}
            <a href={href({ name: "settings" })}>Open Settings</a>
          </div>
        )}
        {error && <div className="callout error">{error}</div>}
        {mode === "memory" && <div className="callout error">{STORAGE_MODE_TEXT.memory}</div>}
        {mode === "local" && <div className="callout warn small">{STORAGE_MODE_TEXT.local}</div>}
        {recipes && recipes.length > 0 && (
          <SearchBox query={query} scope={scope} onQuery={setQuery} onScope={setScope} />
        )}
        {recipes === null && !error && <p className="muted">Loading…</p>}
        {recipes?.length === 0 && (
          <div className="empty">
            <p className="empty-title">Your recipe box is empty.</p>
            <p className="muted">Add your first recipe: scan a card, paste a website link, or paste the text.</p>
          </div>
        )}
        {all.length > 0 && (hasFavorites || tags.length > 0 || avoiding || hasPantry) && (
          <div className="filters" role="group" aria-label="Show">
            {[
              ["all", "All"],
              ...(hasFavorites ? [["favorites", "Favorites"]] : []),
              ...(hasPantry ? [["canmake", "Can make now"]] : []),
              ...(avoiding ? [["safe", "Fits my avoid list"]] : []),
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
        {favorites.length > 0 && (
          <>
            <h2 className="list-heading">Favorites</h2>
            <ul className="recipe-list">{favorites.map(row)}</ul>
            {rest.length > 0 && <h2 className="list-heading">All recipes</h2>}
          </>
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
        {holdTip && all.length > 0 && (
          <p className="muted small hold-tip">
            Tip: press and hold a recipe for more options, like delete or share.{" "}
            <button className="link-btn small" onClick={dismissHoldTip}>
              Got it
            </button>
          </p>
        )}
        {familyOn && feature("family") && (
          <a className="plan-strip family-link" href={href({ name: "family" })}>
            <Icon name="book" size={18} />
            <span>
              <strong>Family cookbooks</strong>
              <span className="muted small"> · recipes shared with you</span>
            </span>
          </a>
        )}
      </main>
      {menuFor && (
        <RecipeActions
          recipe={menuFor}
          onClose={() => setMenuFor(null)}
          onFavorite={toggleFavorite}
          onDelete={removeRecipe}
          onMessage={showToast}
        />
      )}
      {deleted ? (
        <div className="toast undo-toast" role="status">
          Deleted “{deleted.recipe.title}”
          <button className="link-btn" onClick={undoDelete}>
            Undo
          </button>
        </div>
      ) : (
        toast
      )}
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
