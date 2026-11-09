import { useState } from "react";
import Icon from "./Icon";
import { deletePrice, dollars, parsePrice, periodStarts, spendingEntries, spentSince, startSpendingOver, updatePrice } from "../lib/prices";
import type { ShoppingState } from "../lib/shopping";

/**
 * "Spent $x this week · $y this month", with Edit: correct or remove any
 * purchase, or start the totals over from today (prices are kept for recipe costs).
 */
export default function SpendingEditor({
  state,
  update,
  compact = false,
}: {
  state: ShoppingState;
  update: (s: ShoppingState) => void;
  /** Just an "Edit purchases" link (where the totals are already shown). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const starts = periodStarts();
  const week = spentSince(starts.week);
  const month = spentSince(starts.month);
  const entries = spendingEntries(starts.month);
  if (month <= 0 && !open) return null;

  // Keep the shopping list's "Bought … · $x" lines in step with edits here.
  const syncList = (id: string, price: number | null) => {
    const bought = Object.fromEntries(
      Object.entries(state.bought ?? {}).map(([k, b]) =>
        b.priceId !== id ? [k, b] : [k, price === null ? { ...b, price: undefined, priceId: undefined } : { ...b, price }],
      ),
    );
    update({ ...state, bought });
  };

  return (
    <div className="spending">
      {compact ? (
        <p className="small">
          <button className="link-btn small" onClick={() => setOpen((o) => !o)}>
            {open ? "Done" : "Edit purchases"}
          </button>
        </p>
      ) : (
        <p className="small spent-line">
          Spent <strong>{dollars(week)}</strong> this week · <strong>{dollars(month)}</strong> this month
          <span className="muted"> (from prices you entered)</span>{" "}
          <button className="link-btn small" onClick={() => setOpen((o) => !o)}>
            {open ? "Done" : "Edit"}
          </button>
        </p>
      )}
      {open && (
        <div className="plan-card spending-editor">
          {entries.length === 0 ? (
            <p className="muted small">Nothing counted this month.</p>
          ) : (
            <ul className="spend-list">
              {entries.map((p) => (
                <li key={p.id}>
                  <span className="spend-name">
                    {p.name}
                    <span className="muted small"> · {new Date(p.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                  </span>
                  <label className="receipt-price">
                    <span>$</span>
                    <input
                      className="text-input"
                      inputMode="decimal"
                      defaultValue={p.price.toFixed(2)}
                      aria-label={`What ${p.name} cost`}
                      onBlur={(e) => {
                        const v = parsePrice(e.target.value);
                        if (v === null || v === p.price) return;
                        updatePrice(p.id, v);
                        syncList(p.id, v);
                        refresh((n) => n + 1);
                      }}
                    />
                  </label>
                  <button
                    className="icon-btn small-btn"
                    aria-label={`Remove ${p.name} from spending`}
                    onClick={() => {
                      deletePrice(p.id);
                      syncList(p.id, null);
                      refresh((n) => n + 1);
                    }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="button-row">
            <button
              className="btn"
              onClick={() => {
                if (!confirm("Start spending over from today? Totals reset to $0. Prices you entered are kept for recipe costs.")) return;
                startSpendingOver();
                setOpen(false);
                refresh((n) => n + 1);
              }}
            >
              <Icon name="reset" size={18} /> Start spending over
            </button>
          </div>
          <p className="muted small">Removing a purchase also removes its price from recipe costs. Starting over keeps prices for recipe costs.</p>
        </div>
      )}
    </div>
  );
}
