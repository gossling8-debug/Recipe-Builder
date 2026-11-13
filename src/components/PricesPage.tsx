import { useMemo, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useLongPress } from "./RecipeActions";
import { useToast } from "./Toast";
import {
  allItemPrices,
  deletePrice,
  deletePrices,
  dollars,
  editPrice,
  loadPrices,
  parsePrice,
  unitPrice,
  unitText,
  usedStores,
  type ItemPrices,
  type PriceEntry,
} from "../lib/prices";
import { formatQty, type Qty } from "../lib/qty";
import { formatNumber } from "../lib/quantity";
import { href } from "../lib/route";
import { STORAGE_KINDS, fromDateInput, toDateInput, type StorageKind } from "../lib/shelfLife";
import { STORE_NAMES } from "../lib/stores";

const day = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
/** Sizes as they're sold: "1 gal", "2 qt", "12 oz", "12 eggs". */
const sizeText = (q: Qty) =>
  q.kind === "volume" && q.tsp >= 768 ? `${formatNumber(q.tsp / 768)} gal`
  : q.kind === "volume" && q.tsp >= 192 ? `${formatNumber(q.tsp / 192)} qt`
  : formatQty(q);
const pct = (c: number) => `${c > 0 ? "↑" : "↓"} ${Math.round(Math.abs(c) * 100)}%`;
const kindLabel = (k: StorageKind | null | undefined) => STORAGE_KINDS.find((x) => x.id === k)?.label ?? null;
const rowId = (it: ItemPrices) => `${it.key}|${it.storage ?? ""}`;

/**
 * Every price you've paid — from receipts and the shopping list — compared by
 * store and by price per oz / fl oz / each, so different sizes and stores line
 * up. Canned, fresh and frozen are separate rows: they don't compare.
 * Press and hold an item (or tap the pencil on a purchase) to fix or delete it.
 */
export default function PricesPage() {
  const [version, setVersion] = useState(0);
  const prices = useMemo(() => loadPrices(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const stores = usedStores(prices);
  const [query, setQuery] = useState("");
  const [store, setStore] = useState("");
  const [sort, setSort] = useState<"recent" | "az" | "up">("recent");
  const [open, setOpen] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<ItemPrices | null>(null);
  const [editingItem, setEditingItem] = useState<ItemPrices | null>(null);
  const [editing, setEditing] = useState<PriceEntry | null>(null);
  const [toast, showToast] = useToast();
  const changed = (msg: string) => {
    setVersion((v) => v + 1);
    showToast(msg);
  };

  const rows = useMemo(() => {
    const all = allItemPrices(prices);
    // With a store chosen, each item's numbers are for that store.
    const scoped = store ? allItemPrices(prices.filter((p) => p.store === store)) : all;
    const whole = new Map(all.map((it) => [rowId(it), it]));
    const q = query.trim().toLowerCase();
    return scoped
      .filter((it) => !q || it.name.toLowerCase().includes(q) || (kindLabel(it.storage) ?? "").toLowerCase().includes(q))
      .map((it) => ({ it, all: whole.get(rowId(it)) ?? it }))
      .sort((a, b) =>
        sort === "az" ? a.it.name.localeCompare(b.it.name)
        : sort === "up" ? (b.it.change ?? -9) - (a.it.change ?? -9)
        : b.it.latest.at - a.it.latest.at,
      );
  }, [prices, store, query, sort]);

  return (
    <>
      <Header title="Price tracker" back={href({ name: "budget" })} returnToPrevious />
      <main className="page">
        <p className="muted small">
          Every price from your receipts and shopping list, compared per oz, fl oz or item — like a shelf tag. Press and hold an item to
          fix or delete it.
        </p>
        {prices.length === 0 ? (
          <p className="muted">No prices yet. Import a receipt, or add prices as you tick items off your shopping list.</p>
        ) : (
          <>
            <input className="search" type="search" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search items" />
            <div className="price-filters">
              <label>
                <span className="muted small">Store</span>
                <select value={store} onChange={(e) => setStore(e.target.value)}>
                  <option value="">All stores</option>
                  {stores.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="muted small">Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="recent">Recently bought</option>
                  <option value="az">A–Z</option>
                  <option value="up">Price went up</option>
                </select>
              </label>
            </div>
            {rows.length === 0 && <p className="muted">Nothing matches.</p>}
            <ul className="price-list">
              {rows.map(({ it, all }) => (
                <ItemRow
                  key={rowId(it)}
                  it={it}
                  all={all}
                  open={open === rowId(it)}
                  onToggle={() => setOpen(open === rowId(it) ? null : rowId(it))}
                  onHold={() => setMenuFor(all)}
                  onEditPurchase={setEditing}
                  prices={prices}
                />
              ))}
            </ul>
          </>
        )}
      </main>

      {menuFor && (
        <div className="sheet-backdrop" onClick={() => setMenuFor(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Options for ${menuFor.name}`} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">
              {menuFor.name}
              {kindLabel(menuFor.storage) ? ` · ${kindLabel(menuFor.storage)}` : ""}
            </div>
            <button className="sheet-item" onClick={() => (setEditingItem(menuFor), setMenuFor(null))}>
              <Icon name="edit" size={20} /> Rename or change how it's kept
            </button>
            <button className="sheet-item" onClick={() => (setOpen(rowId(menuFor)), setMenuFor(null))}>
              <Icon name="receipt" size={20} /> See and edit each purchase
            </button>
            <button
              className="sheet-item danger"
              onClick={() => {
                const it = menuFor;
                setMenuFor(null);
                if (!confirm(`Delete all ${it.count} ${it.count === 1 ? "price" : "prices"} for ${it.name}? Spending totals will drop by them too.`)) return;
                deletePrices(it.ids);
                changed(`Deleted ${it.name}`);
              }}
            >
              <Icon name="trash" size={20} /> Delete all {menuFor.count} {menuFor.count === 1 ? "price" : "prices"}
            </button>
            <button className="sheet-item sheet-cancel" onClick={() => setMenuFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {editingItem && (
        <ItemEditSheet
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(name, storage) => {
            for (const id of editingItem.ids) editPrice(id, { name, storage });
            setEditingItem(null);
            changed("Saved");
          }}
        />
      )}
      {editing && (
        <PurchaseEditSheet
          entry={editing}
          stores={[...new Set([...stores, ...STORE_NAMES])]}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            editPrice(editing.id, patch);
            setEditing(null);
            changed("Saved");
          }}
          onDelete={() => {
            if (!confirm(`Delete this ${dollars(editing.price)} price for ${editing.name}?`)) return;
            deletePrice(editing.id);
            setEditing(null);
            changed("Price deleted");
          }}
        />
      )}
      {toast}
    </>
  );
}

function ItemRow(props: {
  it: ItemPrices;
  all: ItemPrices;
  open: boolean;
  onToggle: () => void;
  onHold: () => void;
  onEditPurchase: (p: PriceEntry) => void;
  prices: PriceEntry[];
}) {
  const { it, all } = props;
  const hold = useLongPress(props.onHold);
  const kind = kindLabel(it.storage);
  return (
    <li>
      <button className="price-row" {...hold} onClick={(e) => (hold.onClick(e), !e.defaultPrevented && props.onToggle())} aria-expanded={props.open}>
        <span className="price-main">
          <strong>
            {it.name}
            {kind && <span className="tag small-tag price-kind">{kind}</span>}
          </strong>
          <span className="muted small">{[it.latest.qty ? sizeText(it.latest.qty) : null, it.latest.store, day(it.latest.at)].filter(Boolean).join(" · ")}</span>
          <span className="small">
            {it.latestUnit ? unitText(it.latestUnit) : ""}
            {it.change !== null && Math.abs(it.change) >= 0.03 && <span className={it.change > 0 ? "price-up" : "price-down"}> {pct(it.change)} since last time</span>}
          </span>
          {all.byStore.length > 1 && all.byStore[0].store !== it.latest.store && (
            <span className="small price-best">
              Cheapest at {all.byStore[0].store}: {unitText(all.byStore[0].unit)}
            </span>
          )}
        </span>
        <span className="price-amount">{dollars(it.latest.price)}</span>
      </button>
      {props.open && <History item={all} prices={props.prices} onEdit={props.onEditPurchase} />}
    </li>
  );
}

function History({ item, prices, onEdit }: { item: ItemPrices; prices: PriceEntry[]; onEdit: (p: PriceEntry) => void }) {
  const ids = new Set(item.ids);
  const h = prices.filter((p) => ids.has(p.id)).sort((a, b) => b.at - a.at);
  return (
    <div className="price-history">
      {item.byStore.length > 1 && (
        <>
          <div className="muted small">Lowest price by store</div>
          <ul className="price-stores">
            {item.byStore.map((s, i) => (
              <li key={s.store}>
                <span>
                  {i === 0 ? "★ " : ""}
                  {s.store}
                </span>
                <span>{unitText(s.unit)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="muted small">Every purchase — tap the pencil to fix one</div>
      <ul className="price-stores">
        {h.map((p) => (
          <PurchaseRow key={p.id} p={p} onEdit={() => onEdit(p)} />
        ))}
      </ul>
    </div>
  );
}

function PurchaseRow({ p, onEdit }: { p: PriceEntry; onEdit: () => void }) {
  const hold = useLongPress(onEdit);
  const u = unitPrice(p);
  return (
    <li className="purchase-row" {...hold}>
      <span>
        {day(p.at)}
        {p.store ? ` · ${p.store}` : ""}
        {p.qty ? ` · ${sizeText(p.qty)}` : ""}
      </span>
      <span className="purchase-price">
        {dollars(p.price)}
        {u ? <span className="muted"> ({unitText(u)})</span> : null}
        <button className="icon-btn small-icon" onClick={onEdit} aria-label={`Edit the ${dollars(p.price)} price from ${day(p.at)}`}>
          <Icon name="edit" size={16} />
        </button>
      </span>
    </li>
  );
}

function KindChips({ value, onChange }: { value: StorageKind | null; onChange: (k: StorageKind | null) => void }) {
  return (
    <div className="storage-chips" role="radiogroup" aria-label="How it's kept">
      {STORAGE_KINDS.map((k) => (
        <button key={k.id} type="button" role="radio" aria-checked={value === k.id} className={value === k.id ? "chip active" : "chip"} onClick={() => onChange(value === k.id ? null : k.id)}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

/** Rename an item, or say how it's kept, for every purchase in its row. */
function ItemEditSheet(props: { item: ItemPrices; onClose: () => void; onSave: (name: string, storage: StorageKind | null) => void }) {
  const [name, setName] = useState(props.item.name);
  const [storage, setStorage] = useState<StorageKind | null>(props.item.storage);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${props.item.name}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => (e.preventDefault(), name.trim() && props.onSave(name.trim(), storage))}
      >
        <div className="sheet-title">Edit {props.item.name}</div>
        <label className="field">
          <span>Item</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>How it's kept</span>
          <KindChips value={storage} onChange={setStorage} />
          <span className="muted small">Canned, fresh and frozen are tracked separately — their prices don't compare.</span>
        </div>
        <p className="muted small">Changes all {props.item.count} {props.item.count === 1 ? "purchase" : "purchases"}.</p>
        <div className="button-row add-to-book-actions">
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            Save
          </button>
          <button className="btn" type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** Fix one purchase: item, size, price, store, how it's kept, date — or delete it. */
function PurchaseEditSheet(props: {
  entry: PriceEntry;
  stores: string[];
  onClose: () => void;
  onSave: (patch: Parameters<typeof editPrice>[1]) => void;
  onDelete: () => void;
}) {
  const e0 = props.entry;
  const [name, setName] = useState(e0.name);
  const [size, setSize] = useState(e0.qty ? sizeText(e0.qty) : "");
  const [price, setPrice] = useState(e0.price.toFixed(2));
  const [store, setStore] = useState(e0.store ?? "");
  const [other, setOther] = useState(!!e0.store && !props.stores.includes(e0.store));
  const [storage, setStorage] = useState<StorageKind | null>(e0.storage ?? null);
  const [date, setDate] = useState(toDateInput(e0.at));
  const p = parsePrice(price);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <form
        className="sheet price-edit"
        role="dialog"
        aria-modal="true"
        aria-label="Edit this price"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (p === null) return;
          props.onSave({ name, amountText: size, price: p, store: store || null, storage, at: fromDateInput(date) ?? e0.at });
        }}
      >
        <div className="sheet-title">Edit this price</div>
        <label className="field">
          <span>Item</span>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Size</span>
            <input className="text-input" value={size} placeholder="e.g. 1 gal, 2 lb, 12" onChange={(e) => setSize(e.target.value)} />
          </label>
          <label className="field">
            <span>Price</span>
            <input className="text-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Store</span>
          {other ? (
            <input className="text-input" value={store} maxLength={40} placeholder="Store name" onChange={(e) => setStore(e.target.value)} />
          ) : (
            <select className="text-input" value={store} onChange={(e) => (e.target.value === "__other" ? (setOther(true), setStore("")) : setStore(e.target.value))}>
              <option value="">Not recorded</option>
              {props.stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__other">Another store…</option>
            </select>
          )}
        </label>
        <div className="field">
          <span>How it's kept</span>
          <KindChips value={storage} onChange={setStorage} />
        </div>
        <label className="field">
          <span>Date</span>
          <input className="text-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="button-row add-to-book-actions">
          <button className="btn primary" type="submit" disabled={p === null || !name.trim()}>
            Save
          </button>
          <button className="btn" type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
        <button className="link-btn small danger-link" type="button" onClick={props.onDelete}>
          <Icon name="trash" size={16} /> Delete this price
        </button>
      </form>
    </div>
  );
}
