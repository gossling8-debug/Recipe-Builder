import { useEffect, useMemo, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { listRecipes } from "../lib/db";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import { shareText } from "../lib/share";
import { applySwaps } from "../lib/swaps";
import { walmartSearchUrl } from "../lib/shopping";
import { combine, loadShopping, saveShopping, shoppingToText, type ShoppingState } from "../lib/shopping";

const scaleLabel = (s: number) => (s === 1 ? "" : ` · ×${s === 0.5 ? "½" : s === 1.5 ? "1½" : s}`);

export default function ShoppingList() {
  const [state, setState] = useState<ShoppingState>(loadShopping);
  const [all, setAll] = useState<SavedRecipe[] | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    listRecipes().then(setAll, () => setAll([]));
  }, []);

  const update = (next: ShoppingState) => {
    setState(next);
    saveShopping(next);
  };

  // Recipes on the list that still exist, with their chosen size.
  const entries = useMemo(
    () =>
      (all ?? []).length
        ? state.recipes
            .map(({ id, scale }) => {
              const r = all!.find((x) => x.id === id);
              return { recipe: r && { ...r, ...applySwaps(r) }, scale };
            })
            .filter((e): e is { recipe: SavedRecipe; scale: number } => !!e.recipe)
        : [],
    [all, state.recipes],
  );
  const items = useMemo(() => combine(entries), [entries]);
  const checked = new Set(state.checked);
  const remaining = items.filter((i) => !checked.has(i.key));
  const got = items.filter((i) => checked.has(i.key));

  const toggle = (key: string) =>
    update({ ...state, checked: checked.has(key) ? state.checked.filter((k) => k !== key) : [...state.checked, key] });

  async function share() {
    const r = await shareText("Shopping list", shoppingToText(items, checked));
    if (r === "copied") showToast("List copied — paste it anywhere");
    if (r === "failed") showToast("Sharing isn't available in this browser");
  }

  const opened = new Set(state.opened ?? []);
  const row = (it: (typeof items)[number]) => (
    <li key={it.key} className="shop-row">
      <label className={checked.has(it.key) ? "checked" : ""}>
        <input type="checkbox" checked={checked.has(it.key)} onChange={() => toggle(it.key)} />
        <span>
          {it.amount && <span className="shop-amount">{it.amount} </span>}
          {it.name}
          {entries.length > 1 && <span className="shop-for">{it.recipes.join(", ")}</span>}
        </span>
      </label>
      {!checked.has(it.key) && (
        <a
          className={opened.has(it.key) ? "store-btn opened" : "store-btn"}
          href={walmartSearchUrl(it.name)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Find ${it.name} at Walmart`}
          onClick={() => update({ ...state, opened: [...new Set([...(state.opened ?? []), it.key])] })}
        >
          {opened.has(it.key) && <Icon name="check" size={14} />} Walmart
        </a>
      )}
    </li>
  );

  return (
    <>
      <Header
        title="Shopping list"
        back={href({ name: "library" })}
        actions={
          items.length > 0 ? (
            <button className="icon-btn" onClick={share} aria-label="Share shopping list">
              <Icon name="share" />
            </button>
          ) : null
        }
      />
      <main className="page recipe">
        {all === null && <p className="muted">Loading…</p>}
        {all !== null && entries.length === 0 && (
          <div className="empty">
            <p className="empty-title">Your shopping list is empty.</p>
            <p className="muted">Open a recipe and tap “Add to shopping list”. Ingredients from several recipes are combined here.</p>
          </div>
        )}

        {entries.length > 0 && (
          <>
            <h3>For</h3>
            <ul className="shop-recipes">
              {entries.map(({ recipe, scale }) => (
                <li key={recipe.id}>
                  <a href={href({ name: "recipe", id: recipe.id })}>{recipe.title}</a>
                  <span className="muted small">{scaleLabel(scale)}</span>
                  <button
                    className="icon-btn small-btn"
                    aria-label={`Remove ${recipe.title} from the list`}
                    onClick={() => update({ ...state, recipes: state.recipes.filter((r) => r.id !== recipe.id) })}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>

            <h3>To buy · {remaining.length}</h3>
            {remaining.length > 0 && (
              <p className="muted small">
                Tap <strong>Walmart</strong> to find an item in the Walmart app (signed into your Walmart+ account), add
                it to your cart, then come back and tick it off.
              </p>
            )}
            {remaining.length === 0 ? <p className="muted">All done.</p> : <ul className="ingredients">{remaining.map(row)}</ul>}

            {got.length > 0 && (
              <>
                <h3>In the cart · {got.length}</h3>
                <ul className="ingredients">{got.map(row)}</ul>
              </>
            )}

            <div className="button-row">
              <button
                className="btn"
                onClick={() => {
                  if (confirm("Clear the whole shopping list?")) update({ recipes: [], checked: [], opened: [] });
                }}
              >
                Clear list
              </button>
            </div>
          </>
        )}
      </main>
      {toast}
    </>
  );
}
