import { useMemo, useState } from "react";
import Header from "./Header";
import { allItemPrices, dollars, itemPrices, loadPrices, priceHistory, unitPrice, unitText, usedStores, type ItemPrices } from "../lib/prices";
import { formatQty, type Qty } from "../lib/qty";
import { formatNumber } from "../lib/quantity";
import { href } from "../lib/route";

const day = (ms: number) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
/** Sizes as they're sold: "1 gal", "2 qt", "12 oz", "12 eggs". */
const sizeText = (q: Qty) =>
  q.kind === "volume" && q.tsp >= 768 ? `${formatNumber(q.tsp / 768)} gal`
  : q.kind === "volume" && q.tsp >= 192 ? `${formatNumber(q.tsp / 192)} qt`
  : formatQty(q);
const pct = (c: number) => `${c > 0 ? "↑" : "↓"} ${Math.round(Math.abs(c) * 100)}%`;

/**
 * Every price you've paid — from receipts and the shopping list — compared by
 * store and by price per oz / fl oz / each, so different sizes and stores line up.
 */
export default function PricesPage() {
  const prices = loadPrices();
  const stores = usedStores(prices);
  const [query, setQuery] = useState("");
  const [store, setStore] = useState("");
  const [sort, setSort] = useState<"recent" | "az" | "up">("recent");
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(() => {
    // With a store chosen, each item is shown as bought at that store.
    const scoped = store ? prices.filter((p) => p.store === store) : prices;
    const q = query.trim().toLowerCase();
    return allItemPrices(scoped)
      .filter((it) => !q || it.name.toLowerCase().includes(q))
      .map((it) => ({ it, all: itemPrices(it.key, prices)! }))
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
          Every price from your receipts and shopping list. Prices are compared per oz, fl oz or item — like a shelf tag — so different
          sizes and stores line up.
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
            {items.length === 0 && <p className="muted">Nothing matches.</p>}
            <ul className="price-list">
              {items.map(({ it, all }) => (
                <li key={it.key}>
                  <button className="price-row" onClick={() => setOpen(open === it.key ? null : it.key)} aria-expanded={open === it.key}>
                    <span className="price-main">
                      <strong>{it.name}</strong>
                      <span className="muted small">
                        {[it.latest.qty ? sizeText(it.latest.qty) : null, it.latest.store, day(it.latest.at)].filter(Boolean).join(" · ")}
                      </span>
                      <span className="small">
                        {it.latestUnit ? unitText(it.latestUnit) : ""}
                        {it.change !== null && Math.abs(it.change) >= 0.03 && (
                          <span className={it.change > 0 ? "price-up" : "price-down"}> {pct(it.change)} since last time</span>
                        )}
                      </span>
                      <BestLine all={all} latestStore={it.latest.store} />
                    </span>
                    <span className="price-amount">{dollars(it.latest.price)}</span>
                  </button>
                  {open === it.key && <History item={all} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

/** "Cheapest at H-E-B: $0.024/fl oz" when another store has been cheaper. */
function BestLine({ all, latestStore }: { all: ItemPrices; latestStore?: string }) {
  const best = all.byStore[0];
  if (!best || all.byStore.length < 2 || best.store === latestStore) return null;
  return (
    <span className="small price-best">
      Cheapest at {best.store}: {unitText(best.unit)}
    </span>
  );
}

function History({ item }: { item: ItemPrices }) {
  const h = priceHistory(item.key);
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
      <div className="muted small">Every purchase</div>
      <ul className="price-stores">
        {h.map((p) => {
          const u = unitPrice(p);
          return (
            <li key={p.id}>
              <span>
                {day(p.at)}
                {p.store ? ` · ${p.store}` : ""}
                {p.qty ? ` · ${sizeText(p.qty)}` : ""}
              </span>
              <span>
                {dollars(p.price)}
                {u ? <span className="muted"> ({unitText(u)})</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
