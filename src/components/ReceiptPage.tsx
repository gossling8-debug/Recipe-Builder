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
import { loadShopping, nameKey, saveShopping, type ShoppingItem } from "../lib/shopping";
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
  const [progress, setProgress] = useState<number | null>(null); // reading a screen recording
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
      const pieces: string[] = [];
      for (const f of Array.from(files)) {
        if (f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name)) {
          // A screen recording: pull out frames that together show every line.
          setProgress(0);
          const { framesFromVideo } = await import("../lib/video");
          pieces.push(...(await framesFromVideo(f, setProgress)));
          setProgress(null);
        } else pieces.push(...(await receiptPieces(f)));
      }
      setImages((xs) => [...xs, ...pieces].slice(0, 30));
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function read() {
    setBusy(true);
    setError("");
    try {
      // Only what's on the shopping list is matched (and saved); everything else is ignored unless ticked.
      const list = shoppingItems(recipes, loadShopping());
      const pantry = loadPantry();
      const byName = new Map<string, ShoppingItem>(list.map((i) => [i.name, i]));
      const { readReceipt } = await import("../lib/receipt");
      const r = await readReceipt(getApiKey(), images, [...new Set(list.map((i) => i.name))]);
      setReceipt(r);
      setRows(
        r.items.map((it) => {
          const listItem = it.matches ? (byName.get(it.matches) ?? null) : null;
          return {
            include: !!listItem,
            name: listItem?.name ?? it.name,
            receiptText: it.receipt_text,
            size: it.size ?? "",
            price: it.price.toFixed(2),
            isFood: it.is_food,
            listItem,
            inPantry: !!pantry[nameKey(it.name)],
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
  const sum = (rs: Row[]) => rs.reduce((s, r) => s + (parsePrice(r.price) ?? 0), 0);
  const allTotal = sum(rows);
  const keptTotal = sum(rows.filter((r) => r.include));
  // Tax is counted only for the share of the receipt being kept.
  const taxShare = receipt?.tax && allTotal > 0 ? (receipt.tax * keptTotal) / allTotal : 0;
  const totalOff = receipt?.total != null && Math.abs(allTotal + (receipt.tax ?? 0) - receipt.total) > 0.05;
  const onList = rows.map((r, i) => [r, i] as const).filter(([r]) => r.listItem);
  const offList = rows.map((r, i) => [r, i] as const).filter(([r]) => !r.listItem);

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
    if (taxShare >= 0.01) addPrice("Sales tax", "", Math.round(taxShare * 100) / 100, at);
    saveShopping({ ...state, checked: [...checked], bought });
    if (id) rememberImported(id);
    try {
      sessionStorage.setItem("recipe-builder.receiptDone", `Receipt saved: ${ticked} ticked off your list${pantryAdded ? `, ${pantryAdded} other ${pantryAdded === 1 ? "item" : "items"} added to your pantry` : ""}.`);
    } catch {
      /* fine */
    }
    navigate({ name: "shopping" }, true);
  }

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const row = (r: Row, i: number) => (
    <li key={i} className={r.include ? "" : "off"}>
      <input type="checkbox" checked={r.include} onChange={(e) => set(i, { include: e.target.checked })} aria-label={`Save ${r.name}`} />
      <div className="receipt-main">
        <div>
          <strong>{r.name}</strong>
          {r.size && <span className="muted"> · {r.size}</span>}
        </div>
        <div className="muted small">{r.receiptText}</div>
        <div className="small receipt-where">
          {r.listItem
            ? "✓ Ticks off your shopping list"
            : !r.include
              ? "Ignored"
              : !r.isFood
                ? "Price only"
                : r.inPantry
                  ? "Adds to your pantry"
                  : "New in your pantry"}
        </div>
      </div>
      <label className="receipt-price">
        <span>$</span>
        <input className="text-input" inputMode="decimal" value={r.price} onChange={(e) => set(i, { price: e.target.value })} aria-label={`Price of ${r.name}`} />
      </label>
    </li>
  );

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
              <strong>Easiest for Walmart:</strong> open the order in the app, start a screen recording, and scroll slowly from the first item
              to the total. Screenshots of every item, or photos of a paper receipt, work too.
            </p>
            <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy || progress !== null}>
              <Icon name="image" size={18} /> {images.length ? "Add more" : "Choose a screen recording or screenshots"}
            </button>
            {progress !== null && (
              <p className="small" role="status">
                Going through the recording… {Math.round(progress * 100)}%
              </p>
            )}
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
                <p className="muted small">
                  {images.length} {images.length === 1 ? "picture" : "pictures"} to read. Uses Claude — a few cents for a short receipt, up to about 20¢
                  for a long order.
                </p>
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
              {rows.length} items · {dollars(allTotal)}
              {receipt.tax ? ` + ${dollars(receipt.tax)} tax` : ""}
              {receipt.total != null && (
                <span className={totalOff ? " total-off" : " muted"}> (receipt total {dollars(receipt.total)}{totalOff ? " — some lines may be missing or misread" : " ✓"})</span>
              )}
            </p>
            {receipt.warnings.length > 0 && (
              <div className="callout warn small">
                {receipt.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
            <h3>On your shopping list · {onList.length}</h3>
            {onList.length === 0 ? (
              <p className="muted small">None of these items are on your shopping list.</p>
            ) : (
              <>
                <p className="muted small">These get ticked off with the size and price paid. Prices can be corrected.</p>
                <ul className="receipt-rows">{onList.map(([r, i]) => row(r, i))}</ul>
              </>
            )}
            {offList.length > 0 && (
              <>
                <h3>Not on your shopping list · {offList.length}</h3>
                <p className="muted small">Ignored — nothing is saved for these. Tick one to save its price{offList.some(([r]) => r.isFood) ? " and add it to your pantry" : ""} anyway.</p>
                <ul className="receipt-rows">{offList.map(([r, i]) => row(r, i))}</ul>
              </>
            )}
            {keptTotal > 0 && (
              <p className="small">
                Saving {dollars(keptTotal)}
                {taxShare >= 0.01 ? ` + ${dollars(taxShare)} of the tax` : ""} to your spending.
              </p>
            )}
          </>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
      {receipt && rows.some((r) => r.include) && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={save}>
            Save {rows.filter((r) => r.include).length} {rows.filter((r) => r.include).length === 1 ? "item" : "items"}
          </button>
        </div>
      )}
    </>
  );
}
