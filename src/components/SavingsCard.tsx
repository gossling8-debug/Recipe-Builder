import { useState } from "react";
import { loadFastFood } from "../lib/fastFood";
import { dollars, loadPrices } from "../lib/prices";
import { loadRescued } from "../lib/rescued";
import { homeCooking, knownCost, MIN_EATING_OUT, monthStarts, rescuedValue, storeSavings } from "../lib/savings";
import { applySwaps } from "../lib/swaps";
import type { SavedRecipe } from "../lib/schema";

/**
 * "You saved $X this month" on the Budget page: what shopping smart, using
 * food before it went bad and cooking at home saved — from your own records.
 */
export default function SavingsCard({ recipes }: { recipes: SavedRecipe[] }) {
  const [which, setWhich] = useState<"this" | "last">("this");
  const [open, setOpen] = useState(false);
  const { thisMonth, lastMonth } = monthStarts();
  const [from, to] = which === "this" ? [thisMonth, Date.now() + 1] : [lastMonth, thisMonth];
  const prices = loadPrices();
  const fastFood = loadFastFood();

  const stores = storeSavings(prices, from, to);
  const storeTotal = stores.reduce((s, x) => s + x.saving, 0);
  const rescued = rescuedValue(loadRescued(), prices, from, to);
  const rescuedTotal = rescued.reduce((s, x) => s + x.value, 0);
  const home = homeCooking(recipes, fastFood, from, to, (r) => knownCost(applySwaps(r), prices));
  const total = storeTotal + rescuedTotal + (home?.saving ?? 0);
  // Nothing saved this month or last: the card stays out of the way until there is.
  const anyAtAll = (() => {
    const [f, t] = which === "this" ? [lastMonth, thisMonth] : [thisMonth, Date.now() + 1];
    const other =
      storeSavings(prices, f, t).reduce((s2, x) => s2 + x.saving, 0) +
      rescuedValue(loadRescued(), prices, f, t).reduce((s2, x) => s2 + x.value, 0) +
      (homeCooking(recipes, fastFood, f, t, (r) => knownCost(applySwaps(r), prices))?.saving ?? 0);
    return total > 0 || other > 0;
  })();
  const label = which === "this" ? "this month" : "last month";

  const rows: { title: string; amount: number; detail: string }[] = [];
  if (storeTotal > 0)
    rows.push({
      title: "Shopping where it's cheaper",
      amount: storeTotal,
      detail: stores
        .slice(0, 3)
        .map((s) => `${s.name} at ${s.store} (${dollars(s.saving)} less than ${s.vs})`)
        .join(" · "),
    });
  if (rescuedTotal > 0)
    rows.push({
      title: "Food used before it went bad",
      amount: rescuedTotal,
      detail: [...new Set(rescued.map((r) => r.name))].slice(0, 4).join(", "),
    });
  if (home && home.saving > 0)
    rows.push({
      title: "Cooking at home",
      amount: home.saving,
      detail: `${home.counted} ${home.counted === 1 ? "dinner" : "dinners"} at about ${dollars(home.homeEach)} each, vs. ${dollars(home.outEach)} for your usual eating-out trip`,
    });

  if (!anyAtAll) return null;
  return (
    <section className="savings-card">
      <div className="savings-head">
        <h3>You saved</h3>
        <div className="segmented small" role="tablist">
          <button role="tab" aria-selected={which === "this"} className={which === "this" ? "chip active" : "chip"} onClick={() => setWhich("this")}>
            This month
          </button>
          <button role="tab" aria-selected={which === "last"} className={which === "last" ? "chip active" : "chip"} onClick={() => setWhich("last")}>
            Last month
          </button>
        </div>
      </div>
      {total > 0 ? (
        <>
          <p className="savings-total">
            <strong>{dollars(total)}</strong> <span className="muted">{label}</span>
          </p>
          <ul className="savings-rows">
            {rows.map((r) => (
              <li key={r.title}>
                <span>
                  <strong>{r.title}</strong>
                  {r.detail && <span className="muted small"> — {r.detail}</span>}
                </span>
                <span className="savings-amount">{dollars(r.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted small">
          Nothing counted {label} yet. Savings show up as you note prices (with the store) on the shopping list or from receipts, mark
          recipes as made, and log eating out.
        </p>
      )}
      <button className="link-btn small" onClick={() => setOpen(!open)}>
        {open ? "Hide how it's counted" : "How it's counted"}
      </button>
      {open && (
        <ul className="muted small savings-how">
          <li>
            <strong>Shopping where it's cheaper:</strong> something you bought for less than its latest price at the cheapest other store
            you've bought it at (same size compared per ounce or item).
          </li>
          <li>
            <strong>Food used before it went bad:</strong> pantry food due to go off within 3 days that a recipe you made used up, at what you
            paid for it.
          </li>
          <li>
            <strong>Cooking at home:</strong> each dinner you marked as made, against your average eating-out trip (once you've logged{" "}
            {MIN_EATING_OUT}), when the dinner's cost is known.
          </li>
          <li>Only your own prices and records count — nothing is estimated.</li>
        </ul>
      )}
    </section>
  );
}
