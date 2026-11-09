import { useEffect, useState } from "react";
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
import Icon from "./Icon";
import { listRecipes, storageErrorMessage, storageMode, STORAGE_MODE_TEXT, type StorageMode } from "../lib/db";
import { href } from "../lib/route";
import { getApiKey } from "../lib/settings";
import type { SavedRecipe } from "../lib/schema";

export default function Library() {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<StorageMode | null>(null);
  const [filter, setFilter] = useState(() => remembered("filter", "all"));
  const [sort, setSort] = useState(() => remembered("sort", "newest"));
  const onList = loadShopping().recipes.length;
  const fridge = useLeftovers().filter((l) => !l.frozen);
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  const familyOn = cloud.status !== "off" && cloud.status !== "signed-out";
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
  const avoiding = isActive(avoid);
  const hasPantry = Object.keys(loadPantry()).length > 0;
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
  const shown = all
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q)) || (r.tags ?? []).some((t) => t.toLowerCase().includes(q)))
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
      <a href={href({ name: "recipe", id: r.id })} className="recipe-card">
        {r.dishPhoto || r.photos[0] ? <img src={r.dishPhoto ?? r.photos[0]} alt="" /> : <div className="thumb-placeholder" />}
        <div>
          <div className="recipe-card-title">{r.title}</div>
          <div className="muted small">
            {(r.tags ?? []).length ? (r.tags ?? []).join(" · ") : `${plural(r.ingredients.length, "ingredient")} · ${plural(r.steps.length, "step")}`}
          </div>
          {(r.rating || lastMade(r) !== undefined) && (
            <div className="muted small">
              {r.rating ? <span className="row-stars" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> : null}
              {r.rating && lastMade(r) !== undefined ? " · " : ""}
              {lastMade(r) !== undefined && `Last made ${agoText(lastMade(r)!)}`}
            </div>
          )}
          {avoiding && avoidReasons(r).length > 0 && (
            <div className="small avoid-meta">Contains {avoidReasons(r).join(", ").toLowerCase()}</div>
          )}
        </div>
      </a>
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

  return (
    <>
      <Header
        title=""
        actions={
          <>
            <a className="icon-btn" href={href({ name: "week" })} aria-label="This week's meals">
              <Icon name="calendar" />
            </a>
            <a className="icon-btn" href={href({ name: "pantry" })} aria-label="Pantry">
              <Icon name="jar" />
            </a>
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
          const soon = useSoon(all);
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
          const ago = aYearAgo(all);
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
        {fridge.length > 0 && (
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
          const today = (loadWeek().days[dayKey(new Date())] ?? [])
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
        {Object.values(loadPlans())
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
        {!getApiKey() && !error && (
          <div className="callout">
            <strong>Welcome!</strong> To scan cards, add your Anthropic API key first.{" "}
            <a href={href({ name: "settings" })}>Open Settings</a>
          </div>
        )}
        {error && <div className="callout error">{error}</div>}
        {mode === "memory" && <div className="callout error">{STORAGE_MODE_TEXT.memory}</div>}
        {mode === "local" && <div className="callout warn small">{STORAGE_MODE_TEXT.local}</div>}
        {recipes && recipes.length > 3 && (
          <input
            className="search"
            type="search"
            placeholder="Search recipes or ingredients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
                <option value="lastmade">Not made lately</option>
                <option value="rating">Top rated</option>
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
        {familyOn && (
          <a className="plan-strip family-link" href={href({ name: "family" })}>
            <Icon name="book" size={18} />
            <span>
              <strong>Family cookbooks</strong>
              <span className="muted small"> · recipes shared with you</span>
            </span>
          </a>
        )}
      </main>
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
