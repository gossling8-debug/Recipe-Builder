import { useState } from "react";
import Icon from "./Icon";
import {
  addFastFood,
  deleteFastFood,
  fastFoodPlaces,
  fastFoodSince,
  fastFoodTotal,
} from "../lib/fastFood";
import { dollars, parsePrice } from "../lib/prices";
import { fromDateInput, toDateInput } from "../lib/shelfLife";

const SHOW = 5;
const day = (ms: number) =>
  new Date(ms).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/**
 * Fast food on the Budget page: its own totals and list, apart from groceries,
 * then both together (with each part shown).
 */
export default function FastFoodSection({
  starts,
  groceries,
}: {
  starts: { week: number; month: number };
  groceries: { week: number; month: number };
}) {
  const [, refresh] = useState(0);
  const [amount, setAmount] = useState("");
  const [place, setPlace] = useState("");
  const today = toDateInput(Date.now());
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);

  const week = fastFoodTotal(starts.week);
  const month = fastFoodTotal(starts.month);
  const entries = fastFoodSince(starts.month);
  const places = fastFoodPlaces();

  function add() {
    const v = parsePrice(amount);
    if (v === null || v <= 0)
      return setError("Enter what you spent, e.g. 12.50.");
    // Today: now. Another day: midday that day.
    const end = date === today ? Date.now() : fromDateInput(date);
    const at =
      end === null ? Date.now() : date === today ? end : end - 12 * 3_600_000;
    if (at > Date.now()) return setError("That date is in the future.");
    addFastFood(v, place, at);
    setAmount("");
    setPlace("");
    setDate(today);
    setError("");
    refresh((n) => n + 1);
  }

  const shown = all ? entries : entries.slice(0, SHOW);
  return (
    <>
      <section className="fast-food">
        <h3>Fast food</h3>
        <p className="budget-big">
          <strong>{dollars(week)}</strong>{" "}
          <span className="muted">this week</span>
        </p>
        <p className="muted small">
          This month: {dollars(month)}. Kept separate from groceries.
        </p>

        <form
          className="fast-food-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="fast-food-amount">
            <span>$</span>
            <input
              className="text-input"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => (setAmount(e.target.value), setError(""))}
              aria-label="Fast food spent"
            />
          </label>
          <input
            className="text-input fast-food-place"
            list="fast-food-places"
            placeholder="Where (optional)"
            value={place}
            maxLength={60}
            onChange={(e) => setPlace(e.target.value)}
            aria-label="Where"
          />
          <datalist id="fast-food-places">
            {places.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <input
            className="text-input fast-food-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value || today)}
            aria-label="When"
          />
          <button
            className="btn primary"
            type="submit"
            disabled={!amount.trim()}
          >
            Add
          </button>
        </form>
        {error && <p className="small error-text">{error}</p>}

        {entries.length > 0 && (
          <ul className="price-stores fast-food-list">
            {shown.map((e) => (
              <li key={e.id}>
                <span>
                  {e.place ?? "Fast food"}{" "}
                  <span className="muted small">· {day(e.at)}</span>
                </span>
                <span className="fast-food-amt">
                  {dollars(e.amount)}
                  <button
                    className="icon-btn small-icon"
                    aria-label={`Remove ${dollars(e.amount)}${e.place ? ` at ${e.place}` : ""} on ${day(e.at)}`}
                    onClick={() => {
                      if (
                        !confirm(
                          `Remove ${dollars(e.amount)}${e.place ? ` at ${e.place}` : ""}?`,
                        )
                      )
                        return;
                      deleteFastFood(e.id);
                      refresh((n) => n + 1);
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {entries.length > SHOW && (
          <button className="link-btn small" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${entries.length} this month`}
          </button>
        )}
      </section>
      {/* Groceries and fast food together — one line, once there's fast food to add. */}
      {(week > 0 || month > 0) && (
        <p className="small fast-food-together">
          All food (groceries + fast food): <strong>{dollars(groceries.week + week)}</strong> this week ·{" "}
          <strong>{dollars(groceries.month + month)}</strong> this month
        </p>
      )}
    </>
  );
}
