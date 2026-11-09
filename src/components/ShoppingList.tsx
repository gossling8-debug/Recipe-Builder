import { useEffect, useMemo, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { listRecipes } from "../lib/db";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import { shareText } from "../lib/share";
import { applySwaps } from "../lib/swaps";
import { boughtWhen, recordPurchase, setItem, statusFor } from "../lib/pantry";
import { legacyNameKey } from "../lib/shopping";
import { formatQty } from "../lib/qty";
import { convertText, useUnits } from "../lib/units";
import { useByLabel } from "../lib/shelfLife";
import WarnIcon from "./WarnIcon";
import { walmartSearchUrl } from "../lib/shopping";
import { combine, loadShopping, saveShopping, shoppingToText, type ShoppingItem, type ShoppingState } from "../lib/shopping";
import { buyText, loadStaples, staplesToBuy, statusText } from "../lib/staples";
import { loadPantry } from "../lib/pantry";

const ALWAYS_KEEP = "Always keep";

/** Staples to buy (or already ticked this trip), as shopping-list items. */
function staplesToBuyOrTicked(checked: string[], onListAlready: Set<string>): ShoppingItem[] {
  const need = new Map(staplesToBuy().map((s) => [s.staple.key, s]));
  const pantry = loadPantry();
  return loadStaples()
    .filter((st) => !onListAlready.has(st.key) && (need.has(st.key) || checked.includes(st.key)))
    .map((st) => {
      const n = need.get(st.key);
      return {
        key: st.key,
        name: st.name,
        amount: n ? buyText(n) : "",
        recipes: [n ? `${ALWAYS_KEEP} · ${statusText[n.status].toLowerCase()}` : ALWAYS_KEEP],
        need: n?.buy ?? pantry[st.key]?.lastBought ?? null,
      };
    });
}

const scaleLabel = (s: number) => (s === 1 ? "" : ` · ×${s === 0.5 ? "½" : s === 1.5 ? "1½" : s}`);

export default function ShoppingList() {
  const [state, setState] = useState<ShoppingState>(loadShopping);
  const [all, setAll] = useState<SavedRecipe[] | null>(null);
  const [toast, showToast] = useToast();
  const [units] = useUnits();

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
  const recipeItems = useMemo(() => combine(entries), [entries]);
  // "Always keep" staples that are out or low join the list by themselves. Once
  // ticked they stay (in the cart) until the list is cleared, so ticking can be undone.
  const stapleItems = staplesToBuyOrTicked(state.checked, new Set(recipeItems.map((i) => i.key)));
  const items = [...recipeItems, ...stapleItems];
  const checked = new Set(state.checked);
  // Ticks saved under the older matching rule move to the current item keys.
  useEffect(() => {
    const map = new Map(items.map((i) => [legacyNameKey(i.name), i.key]));
    const move = (k: string) => map.get(k) ?? k;
    const moved = (list?: string[]) => list && [...new Set(list.map(move))];
    const checkedNow = moved(state.checked)!;
    if (checkedNow.join() === state.checked.join() && (moved(state.opened) ?? []).join() === (state.opened ?? []).join()) return;
    const bought = Object.fromEntries(Object.entries(state.bought ?? {}).map(([k, v]) => [move(k), v]));
    update({ ...state, checked: checkedNow, opened: moved(state.opened), bought });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeItems]);

  const notChecked = items.filter((i) => !checked.has(i.key));
  const status = new Map(notChecked.map((i) => [i.key, statusFor(i.key, i.name, i.need)]));
  // Enough already on hand → its own section, so the list to buy stays short.
  const inPantry = notChecked.filter((i) => status.get(i.key)?.kind === "enough");
  const remaining = notChecked.filter((i) => status.get(i.key)?.kind !== "enough");
  const got = items.filter((i) => checked.has(i.key));
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const defaultBought = (it: (typeof items)[number]) => (it.need ? formatQty(it.need) : it.amount);

  // Ticking = bought: it goes into the pantry. Unticking undoes that.
  const toggle = (key: string) => {
    const it = items.find((i) => i.key === key)!;
    const bought = { ...(state.bought ?? {}) };
    if (checked.has(key)) {
      if (bought[key]) setItem(key, bought[key].before);
      delete bought[key];
      update({ ...state, checked: state.checked.filter((k) => k !== key), bought });
    } else {
      const text = defaultBought(it);
      bought[key] = { text, before: recordPurchase(it.name, text) };
      update({ ...state, checked: [...state.checked, key], bought });
    }
  };

  const changeBought = (key: string, text: string) => {
    const it = items.find((i) => i.key === key)!;
    const prev = state.bought?.[key];
    if (!prev || !text.trim()) return setEditing(null);
    setItem(key, prev.before); // undo the first guess, then record what was really bought
    recordPurchase(it.name, text.trim());
    update({ ...state, bought: { ...state.bought, [key]: { text: text.trim(), before: prev.before } } });
    setEditing(null);
  };

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
          {it.amount && <span className="shop-amount">{convertText(it.amount, units, it.name)} </span>}
          {it.name}
          {(entries.length > 1 || it.recipes[0]?.startsWith(ALWAYS_KEEP)) && <span className="shop-for">{it.recipes.join(", ")}</span>}
          {!checked.has(it.key) && <PantryNote status={status.get(it.key)} />}
        </span>
      </label>
      {!checked.has(it.key) && opened.has(it.key) && (
        // Tapping the ✓ clears it ("not added yet") without opening Walmart again.
        <button
          className="store-undo"
          aria-label={`Mark ${it.name} as not added to the Walmart cart yet`}
          onClick={() => update({ ...state, opened: (state.opened ?? []).filter((k) => k !== it.key) })}
        >
          <Icon name="check" size={14} />
        </button>
      )}
      {!checked.has(it.key) && (
        <a
          className={opened.has(it.key) ? "store-btn opened" : "store-btn"}
          href={walmartSearchUrl(it.name)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Find ${it.name} at Walmart`}
          onClick={() => update({ ...state, opened: [...new Set([...(state.opened ?? []), it.key])] })}
        >
          Walmart
        </a>
      )}
      {checked.has(it.key) && state.bought?.[it.key] && (
        <div className="bought-line">
          {editing?.key === it.key ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                changeBought(it.key, editing.text);
              }}
            >
              <input
                className="text-input"
                autoFocus
                aria-label={`How much ${it.name} did you buy?`}
                placeholder="e.g. 4 lb bag, 16 oz, 2 cans"
                value={editing.text}
                onChange={(e) => setEditing({ key: it.key, text: e.target.value })}
              />
              <button className="btn" type="submit">
                Save
              </button>
            </form>
          ) : (
            <span className="small muted">
              Bought {state.bought[it.key].text} ·{" "}
              <button className="link-btn small" onClick={() => setEditing({ key: it.key, text: state.bought![it.key].text })}>
                Change
              </button>
            </span>
          )}
        </div>
      )}
    </li>
  );

  return (
    <>
      <Header
        title="Shopping list"
        back={href({ name: "library" })}
        returnToPrevious
        actions={
          <>
            <a className="icon-btn" href={href({ name: "pantry" })} aria-label="Pantry">
              <Icon name="jar" />
            </a>
            {items.length > 0 && (
              <button className="icon-btn" onClick={share} aria-label="Share shopping list">
                <Icon name="share" />
              </button>
            )}
          </>
        }
      />
      <main className="page recipe">
        {all === null && <p className="muted">Loading…</p>}
        {all !== null && entries.length === 0 && stapleItems.length === 0 && (
          <div className="empty">
            <p className="empty-title">Your shopping list is empty.</p>
            <p className="muted">Open a recipe and tap “Add to shopping list”. Ingredients from several recipes are combined here.</p>
          </div>
        )}

        {(entries.length > 0 || stapleItems.length > 0) && (
          <>
            {entries.length > 0 && <h3>For</h3>}
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
              <>
                <p className="muted small">
                  Tap <strong>Walmart</strong> to find an item in the Walmart app and add it to your cart, then tick it off
                  here. Tap the ✓ to clear it if you didn't add it. (If it opens the website instead: in DuckDuckGo, turn on
                  Settings → General → Open Links in Associated Apps.)
                </p>
              </>
            )}
            {remaining.length === 0 ? <p className="muted">All done.</p> : <ul className="ingredients">{remaining.map(row)}</ul>}

            {inPantry.length > 0 && (
              <>
                <h3>Already in your pantry · {inPantry.length}</h3>
                <p className="muted small">
                  Left over from earlier shopping, so you shouldn't need to buy these. Tick one if you buy more anyway.
                </p>
                <ul className="ingredients">{inPantry.map(row)}</ul>
              </>
            )}

            {got.length > 0 && (
              <>
                <h3>In the cart · {got.length}</h3>
                <p className="muted small">Ticked items go into your pantry. Tap “Change” to enter the size you actually bought.</p>
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

/** "You should have ≈ ½ cup left from Nov 7 — buy ≈ ½ cup more." */
function PantryNote({ status }: { status: ReturnType<typeof statusFor> | undefined }) {
  if (!status || status.kind === "none") return null;
  const when = boughtWhen(status.item);
  const from = when ? ` from ${when}` : "";
  if (status.kind === "expired")
    return (
      <span className="pantry-note expired-note">
        <WarnIcon size={15} />
        The one in your pantry is {useByLabel(status.item.useBy!).toLowerCase()} — buy fresh
      </span>
    );
  if (status.kind === "enough")
    return <span className="pantry-note ok">Pantry: ≈ {formatQty(status.item.qty!)} left{from} — enough</span>;
  if (status.kind === "some")
    return (
      <span className="pantry-note">
        Pantry: ≈ {formatQty(status.item.qty!)} left{from} — buy ≈ {formatQty(status.short)} more
      </span>
    );
  return (
    <span className="pantry-note">
      Pantry: you should have {status.item.qty ? `≈ ${formatQty(status.item.qty)}` : "some"}
      {from} — check before buying
    </span>
  );
}
