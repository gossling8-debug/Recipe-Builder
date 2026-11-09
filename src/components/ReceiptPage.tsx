import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { listRecipes } from "../lib/db";
import { receiptPieces } from "../lib/image";
import { loadPantry, recordPurchase, setItem } from "../lib/pantry";
import { addPrice, deletePrice, dollars, parsePrice } from "../lib/prices";
import { alreadyImported, receiptId, receiptTime, rememberImported, type Receipt } from "../lib/receipt";
import { href, navigate } from "../lib/route";
import { getApiKey } from "../lib/settings";
import { loadShopping, saveShopping, type ShoppingItem } from "../lib/shopping";
import { shoppingItems } from "../lib/shoppingItems";
import type { SavedRecipe } from "../lib/schema";

interface Row {
  include: boolean;
  name: string;
  receiptText: string;
  size: string;
  price: string;
  isFood: boolean;
  /** The shopping-list item it ticks off, if any. */
  listItem: ShoppingItem | null;
  /** Already in the pantry (by this name). */
  inPantry: boolean;
}

/**
 * Import a receipt or order screenshots: Claude reads each line; after a quick
 * review, prices are saved, matching shopping-list items are ticked off, and
 * other groceries go into the pantry.
 */
export default function ReceiptPage() {
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasKey = !!getApiKey();

  useEffect(() => {
    listRecipes().then(setRecipes, () => {});
  }, []);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      const pieces = (await Promise.all(Array.from(files).map((f) => receiptPieces(f)))).flat();
      setImages((xs) => [...xs, ...pieces].slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function read() {
    setBusy(true);
    setError("");
    try {
      const list = shoppingItems(recipes, loadShopping());
      const pantry = loadPantry();
      const byName = new Map<string, ShoppingItem>(list.map((i) => [i.name, i]));
      const pantryNames = Object.values(pantry).map((p) => p.name);
      const known = [...new Set([...list.map((i) => i.name), ...pantryNames])];
      const { readReceipt } = await import("../lib/receipt");
      const r = await readReceipt(getApiKey(), images, known);
      setReceipt(r);
      setRows(
        r.items.map((it) => {
          const listItem = it.matches ? (byName.get(it.matches) ?? null) : null;
          return {
            include: true,
            name: listItem?.name ?? it.matches ?? it.name,
            receiptText: it.receipt_text,
            size: it.size ?? "",
            price: it.price.toFixed(2),
            isFood: it.is_food,
            listItem,
            inPantry: !!it.matches && pantryNames.includes(it.matches),
          };
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const id = receipt && receiptId(receipt);
  const duplicate = !!id && alreadyImported(id);
  const itemsTotal = rows.filter((r) => r.include).reduce((s, r) => s + (parsePrice(r.price) ?? 0), 0);
  const withTax = itemsTotal + (receipt?.tax ?? 0);
  const totalOff = receipt?.total != null && rows.every((r) => r.include) && Math.abs(withTax - receipt.total) > 0.05;

  function save() {
    if (!receipt) return;
    const at = receiptTime(receipt.date);
    const state = loadShopping();
    const bought = { ...(state.bought ?? {}) };
    const checked = new Set(state.checked);
    let ticked = 0;
    let pantryAdded = 0;
    for (const r of rows) {
      const price = parsePrice(r.price);
      if (!r.include || price === null) continue;
      if (r.listItem) {
        const key = r.listItem.key;
        const prev = bought[key];
        if (prev) {
          // Already ticked by hand: replace the guess with what the receipt says.
          setItem(key, prev.before);
          if (prev.priceId) deletePrice(prev.priceId);
        }
        const text = r.size || r.listItem.amount || "";
        const before = prev ? prev.before : recordPurchase(r.listItem.name, text);
        if (prev) recordPurchase(r.listItem.name, text);
        const priceId = addPrice(r.listItem.name, text, price, at);
        bought[key] = { text: text || "some", before, price, priceId };
        if (!checked.has(key)) ticked++;
        checked.add(key);
      } else {
        addPrice(r.name, r.size, price, at);
        if (r.isFood) {
          recordPurchase(r.name, r.size);
          pantryAdded++;
        }
      }
    }
    if (receipt.tax) addPrice("Sales tax", "", receipt.tax, at);
    saveShopping({ ...state, checked: [...checked], bought });
    if (id) rememberImported(id);
    try {
      sessionStorage.setItem("recipe-builder.receiptDone", `Receipt saved: ${ticked} ticked off your list, ${pantryAdded} added to your pantry.`);
    } catch {
      /* fine */
    }
    navigate({ name: "shopping" }, true);
  }

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <Header title="Import a receipt" back={href({ name: "shopping" })} returnToPrevious />
      <main className="page">
        {!hasKey && (
          <div className="callout">
            Reading receipts uses Claude. <a href={href({ name: "settings" })}>Add your Anthropic API key in Settings</a>.
          </div>
        )}
        {hasKey && !receipt && (
          <>
            <p className="muted small">
              Add screenshots of your order (for Walmart: the order page in the app, scrolled so every item shows) or photos of a paper
              receipt. Long screenshots are fine — they're split up so the text stays sharp.
            </p>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="image" size={18} /> {images.length ? "Add more screenshots" : "Choose screenshots or photos"}
            </button>
            {images.length > 0 && (
              <>
                <div className="receipt-thumbs">
                  {images.map((src, i) => (
                    <img key={i} src={src} alt={`Receipt part ${i + 1}`} />
                  ))}
                </div>
                <div className="button-row">
                  <button className="btn" onClick={() => setImages([])} disabled={busy}>
                    Start over
                  </button>
                  <button className="btn primary" onClick={read} disabled={busy}>
                    {busy ? "Reading… (about 20–40 seconds)" : "Read receipt"}
                  </button>
                </div>
                <p className="muted small">Uses Claude — usually a few cents per receipt.</p>
              </>
            )}
          </>
        )}

        {receipt && rows.length === 0 && (
          <div className="callout warn">
            <strong>No items found{receipt.total != null ? ` — only the total (${dollars(receipt.total)})` : ""}.</strong> In the Walmart app, scroll up
            from the total to the list of items and take screenshots of every item (overlapping is fine), then try again.
            <div className="button-row">
              <button className="btn" onClick={() => (setReceipt(null), setImages([]))}>
                Choose other screenshots
              </button>
            </div>
          </div>
        )}
        {receipt && rows.length > 0 && (
          <>
            {duplicate && (
              <div className="callout warn small">
                <strong>You may have imported this receipt already.</strong> Saving it again would count the spending twice.
              </div>
            )}
            <p className="small">
              {receipt.store ?? "Receipt"}
              {receipt.date ? ` · ${new Date(receiptTime(receipt.date)).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""} ·{" "}
              {rows.length} items · {dollars(itemsTotal)}
              {receipt.tax ? ` + ${dollars(receipt.tax)} tax = ${dollars(withTax)}` : ""}
              {receipt.total != null && (
                <span className={totalOff ? " total-off" : " muted"}> (receipt total {dollars(receipt.total)}{totalOff ? " — check the prices" : " ✓"})</span>
              )}
            </p>
            {receipt.warnings.length > 0 && (
              <div className="callout warn small">
                {receipt.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
            <p className="muted small">Untick anything you don't want saved. Prices can be corrected.</p>
            <ul className="receipt-rows">
              {rows.map((r, i) => (
                <li key={i} className={r.include ? "" : "off"}>
                  <input type="checkbox" checked={r.include} onChange={(e) => set(i, { include: e.target.checked })} aria-label={`Include ${r.name}`} />
                  <div className="receipt-main">
                    <div>
                      <strong>{r.name}</strong>
                      {r.size && <span className="muted"> · {r.size}</span>}
                    </div>
                    <div className="muted small">{r.receiptText}</div>
                    <div className="small receipt-where">
                      {r.listItem ? "✓ Ticks off your shopping list" : !r.isFood ? "Not food — price only" : r.inPantry ? "Adds to your pantry" : "New in your pantry"}
                    </div>
                  </div>
                  <label className="receipt-price">
                    <span>$</span>
                    <input className="text-input" inputMode="decimal" value={r.price} onChange={(e) => set(i, { price: e.target.value })} aria-label={`Price of ${r.name}`} />
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
      {receipt && rows.length > 0 && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={save}>
            Save {rows.filter((r) => r.include).length} items
          </button>
        </div>
      )}
    </>
  );
}
