import { useEffect, useState } from "react";
import { saveRecipe } from "../lib/db";
import { loadShopping } from "../lib/shopping";
import { findAvoided, isActive, loadAvoid } from "../lib/avoid";
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
    listRecipes().then(setRecipes, (e) => setError(storageErrorMessage(e)));
    storageMode().then(setMode, () => {});
  }, []);

  const all = recipes ?? [];
  const tags = [...new Set(all.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b));
  const hasFavorites = all.some((r) => r.favorite);
  const avoid = loadAvoid();
  const avoiding = isActive(avoid);
  const avoidReasons = (r: SavedRecipe) => [...new Set(findAvoided(r.ingredients, avoid).flatMap((m) => m.reasons))];
  // A remembered filter for a tag that no longer exists falls back to All.
  const activeFilter =
    filter === "favorites" ? (hasFavorites ? filter : "all")
    : filter === "safe" ? (avoiding ? filter : "all")
    : filter !== "all" && !tags.includes(filter) ? "all" : filter;

  const q = query.trim().toLowerCase();
  const shown = all
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q)) || (r.tags ?? []).some((t) => t.toLowerCase().includes(q)))
    .filter((r) =>
      activeFilter === "all" ? true
      : activeFilter === "favorites" ? r.favorite
      : activeFilter === "safe" ? avoidReasons(r).length === 0
      : (r.tags ?? []).includes(activeFilter),
    )
    .sort((a, b) => (sort === "az" ? a.title.localeCompare(b.title) : b.createdAt - a.createdAt));

  // On the plain "All" view, favorites are pinned in their own section at the top.
  const pinFavorites = activeFilter === "all" && !q && hasFavorites;
  const favorites = pinFavorites ? shown.filter((r) => r.favorite) : [];
  const rest = pinFavorites ? shown.filter((r) => !r.favorite) : shown;

  const row = (r: SavedRecipe) => (
    <li key={r.id} className="recipe-row">
      <a href={href({ name: "recipe", id: r.id })} className="recipe-card">
        {r.photos[0] ? <img src={r.photos[0]} alt="" /> : <div className="thumb-placeholder" />}
        <div>
          <div className="recipe-card-title">{r.title}</div>
          <div className="muted small">
            {(r.tags ?? []).length ? (r.tags ?? []).join(" · ") : `${plural(r.ingredients.length, "ingredient")} · ${plural(r.steps.length, "step")}`}
          </div>
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
            <p className="muted">Scan a recipe card to add your first recipe.</p>
          </div>
        )}
        {all.length > 0 && (hasFavorites || tags.length > 0 || avoiding) && (
          <div className="filters" role="group" aria-label="Show">
            {[
              ["all", "All"],
              ...(hasFavorites ? [["favorites", "Favorites"]] : []),
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
      </main>
      <div className="fab-bar">
        <a className="btn primary big" href={href({ name: "scan" })}>
          <Icon name="camera" /> Scan a recipe card
        </a>
      </div>
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
