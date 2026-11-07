import { useEffect, useState } from "react";
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

  useEffect(() => {
    listRecipes().then(setRecipes, (e) => setError(storageErrorMessage(e)));
    storageMode().then(setMode, () => {});
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (recipes ?? []).filter(
    (r) => !q || r.title.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
  );

  return (
    <>
      <Header
        title=""
        actions={
          <a className="icon-btn" href={href({ name: "settings" })} aria-label="Settings">
            <Icon name="settings" />
          </a>
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
        <ul className="recipe-list">
          {shown.map((r) => (
            <li key={r.id}>
              <a href={href({ name: "recipe", id: r.id })} className="recipe-card">
                {r.photos[0] ? <img src={r.photos[0]} alt="" /> : <div className="thumb-placeholder" />}
                <div>
                  <div className="recipe-card-title">{r.title}</div>
                  <div className="muted small">
                    {plural(r.ingredients.length, "ingredient")} · {plural(r.steps.length, "step")}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
        {recipes && recipes.length > 0 && shown.length === 0 && <p className="muted">No matches.</p>}
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
