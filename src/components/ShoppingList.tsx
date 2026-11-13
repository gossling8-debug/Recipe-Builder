import { feature } from "../lib/features";
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
import { getStore, setStore, STORES, storeName, storeSearchUrl, type Store } from "../lib/shopping";
import { combine, loadShopping, saveShopping, shoppingToText, type ShoppingState } from "../lib/shopping";
import { staplesToBuyOrTicked } from "../lib/shoppingItems";
import { addPrice, deletePrice, dollars, parsePrice } from "../lib/prices";
import SpendingEditor from "./SpendingEditor";

import { ALWAYS_KEEP } from "../lib/shoppingItems";

const scaleLabel = (s: number) => (s === 1 ? "" : ` · ×${s === 0.5 ? "½" : s === 1.5 ? "1½" : s}`);

export default function ShoppingList() {
  const [state, setState] = useState<ShoppingState>(loadShopping);
  const [all, setAll] = useState<SavedRecipe[] | null>(null);
  const [toast, showToast] = useToast();
  const [units] = useUnits();
  // A message left by the receipt import, shown once.
  const [receiptDone] = useState(() => {
    try {
      const m = sessionStorage.getItem("recipe-builder.receiptDone");
      sessionStorage.removeItem("recipe-builder.receiptDone");
      return m;
    } catch {
      return null;
    }
  });

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
            .map(({ id, scale, skip }) => {
              const r = all!.find((x) => x.id === id);
              return { recipe: r && { ...r, ...applySwaps(r) }, scale, skip };
            })
            .filter((e): e is { recipe: SavedRecipe; scale: number; skip: number[] | undefined } => !!e.recipe)
        : [],
    [all, state.recipes],
  );
  const recipeItems = useMemo(() => combine(entries), [entries]);
  // "Always keep" staples that are out or low join the list by themselves. Once
  // ticked they stay (in the cart) until the list is cleared, so ticking can be undone.
  const stapleItems = feature("pantry") ? staplesToBuyOrTicked(state.checked, new Set(recipeItems.map((i) => i.key))) : [];
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
  // With the pantry off, nothing is "already in your pantry".
  const status = new Map(notChecked.map((i) => [i.key, feature("pantry") ? statusFor(i.key, i.name, i.need) : ({ kind: "none" } as const)]));
  // Enough already on hand → its own section, so the list to buy stays short.
  const inPantry = notChecked.filter((i) => status.get(i.key)?.kind === "enough");
  const remaining = notChecked.filter((i) => status.get(i.key)?.kind !== "enough");
  const got = items.filter((i) => checked.has(i.key));
  const [editing, setEditing] = useState<{ key: string; text: string; price: string } | null>(null);
  const defaultBought = (it: (typeof items)[number]) => (it.need ? formatQty(it.need) : it.amount);

  // Ticking = bought: it goes into the pantry. Unticking undoes that.
  const toggle = (key: string) => {
    const it = items.find((i) => i.key === key)!;
    const bought = { ...(state.bought ?? {}) };
    if (checked.has(key)) {
      if (bought[key]) setItem(key, bought[key].before);
      if (bought[key]?.priceId) deletePrice(bought[key].priceId!);
      delete bought[key];
      update({ ...state, checked: state.checked.filter((k) => k !== key), bought });
    } else {
      const text = defaultBought(it);
      bought[key] = { text, before: recordPurchase(it.name, text) };
      update({ ...state, checked: [...state.checked, key], bought });
    }
  };

  // "Change": what was really bought, and (optionally) what it cost.
  const changeBought = (key: string, text: string, priceText: string) => {
    const it = items.find((i) => i.key === key)!;
    const prev = state.bought?.[key];
    if (!prev || !text.trim()) return setEditing(null);
    setItem(key, prev.before); // undo the first guess, then record what was really bought
    recordPurchase(it.name, text.trim());
    if (prev.priceId) deletePrice(prev.priceId);
    const price = parsePrice(priceText);
    const priceId = price !== null ? addPrice(it.name, text.trim(), price) : undefined;
    update({ ...state, bought: { ...state.bought, [key]: { text: text.trim(), before: prev.before, price: price ?? undefined, priceId } } });
    setEditing(null);
  };

  async function share() {
    const r = await shareText("Shopping list", shoppingToText(items, checked));
    if (r === "copied") showToast("List copied — paste it anywhere");
    if (r === "failed") showToast("Sharing isn't available in this browser");
  }

  const opened = new Set(state.opened ?? []);
  const [store, pickStore] = useState<Store>(getStore);
  const shop = storeName(store);
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
      {feature("walmart") && !checked.has(it.key) && opened.has(it.key) && (
        // Tapping the ✓ clears it ("not added yet") without opening the store again.
        <button
          className="store-undo"
          aria-label={`Mark ${it.name} as not added to the ${shop} cart yet`}
          onClick={() => update({ ...state, opened: (state.opened ?? []).filter((k) => k !== it.key) })}
        >
          <Icon name="check" size={14} />
        </button>
      )}
      {feature("walmart") && !checked.has(it.key) && (
        <a
          className={opened.has(it.key) ? "store-btn opened" : "store-btn"}
          href={storeSearchUrl(store, it.name)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Find ${it.name} at ${shop}`}
          onClick={() => update({ ...state, opened: [...new Set([...(state.opened ?? []), it.key])] })}
        >
          {shop}
        </a>
      )}
      {checked.has(it.key) && state.bought?.[it.key] && (
        <div className="bought-line">
          {editing?.key === it.key ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                changeBought(it.key, editing.text, editing.price);
              }}
            >
              <input
                className="text-input"
                autoFocus
                aria-label={`How much ${it.name} did you buy?`}
                placeholder="e.g. 4 lb bag, 16 oz, 2 cans"
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
              {feature("budget") && <input
                className="text-input price-input"
                inputMode="decimal"
                aria-label={`What did ${it.name} cost?`}
                placeholder="$ price"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: e.target.value })}
              />}
              <button className="btn" type="submit">
                Save
              </button>
            </form>
          ) : (
            <span className="small muted">
              Bought {state.bought[it.key].text}
              {state.bought[it.key].price !== undefined && ` · ${dollars(state.bought[it.key].price!)}`} ·{" "}
              <button
                className="link-btn small"
                onClick={() =>
                  setEditing({
                    key: it.key,
                    text: state.bought![it.key].text,
                    price: state.bought![it.key].price !== undefined ? String(state.bought![it.key].price) : "",
                  })
                }
              >
                {state.bought[it.key].price === undefined && feature("budget") ? "Change or add price" : "Change"}
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
            {feature("pantry") && (
              <a className="icon-btn" href={href({ name: "pantry" })} aria-label="Pantry">
                <Icon name="jar" />
              </a>
            )}
            {items.length > 0 && (
              <button className="icon-btn" onClick={share} aria-label="Share shopping list">
                <Icon name="share" />
              </button>
            )}
          </>
        }
      />
      <main className="page recipe">
        {receiptDone && <div className="callout small">{receiptDone}</div>}
        {feature("budget") && (
          <a className="btn receipt-btn" href={href({ name: "receipt" })}>
            <Icon name="camera" size={18} /> Import a receipt
          </a>
        )}
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

            {feature("budget") && <SpendingEditor state={state} update={update} />}
            <h3>To buy · {remaining.length}</h3>
            {remaining.length > 0 && feature("walmart") && (
              <>
                <div className="segmented store-switch" role="radiogroup" aria-label="Store">
                  {STORES.map((st) => (
                    <button
                      key={st.id}
                      role="radio"
                      aria-checked={store === st.id}
                      className={store === st.id ? "chip active" : "chip"}
                      onClick={() => {
                        setStore(st.id);
                        pickStore(st.id);
                      }}
                    >
                      {st.name}
                    </button>
                  ))}
                </div>
                <p className="muted small">
                  Tap <strong>{shop}</strong> to find an item in the {shop} app and add it to your cart, then tick it off
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
                <p className="muted small">
                  {feature("pantry") ? "Ticked items go into your pantry. " : ""}Tap “Change” to enter the size you bought
                  {feature("budget") ? " and what you paid — prices add up your spending and show what recipes cost" : ""}.
                </p>
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
