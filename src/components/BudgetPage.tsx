import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import SpendingEditor from "./SpendingEditor";
import { listRecipes } from "../lib/db";
import { isDinner, realServings } from "../lib/autoPlan";
import { dollars, getBudget, parsePrice, periodStarts, recipeCost, setBudget, spentSince } from "../lib/prices";
import { href } from "../lib/route";
import { loadShopping, saveShopping, type ShoppingState } from "../lib/shopping";
import { applySwaps } from "../lib/swaps";
import { loadWeek, upcomingDays } from "../lib/week";
import type { SavedRecipe } from "../lib/schema";

/** The weekly grocery budget: spent vs. budget, what the planned week costs, and the cheapest dinners. */
export default function BudgetPage() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [budget, setBudgetState] = useState(getBudget);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(budget ? String(budget) : "");
  const [shopping, setShopping] = useState<ShoppingState>(loadShopping);
  const [, refresh] = useState(0);
  useEffect(() => {
    listRecipes().then(setRecipes, () => {});
  }, []);

  const starts = periodStarts();
  const week = spentSince(starts.week);
  const month = spentSince(starts.month);
  const left = budget - week;
  const pct = budget ? Math.min(100, (week / budget) * 100) : 0;

  // What the dinners planned for the next 7 days cost (ingredients with prices only).
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const plan = loadWeek();
  let planned = 0;
  let plannedMeals = 0;
  let unpriced = 0;
  for (const d of upcomingDays(7)) {
    for (const m of plan.days[d.key] ?? []) {
      const r = byId.get(m.id);
      if (!r || m.leftover) continue;
      plannedMeals++;
      const c = recipeCost(applySwaps(r), m.scale);
      planned += c.total;
      if (c.priced < c.of) unpriced++;
    }
  }

  // Cheapest dinners per serving, where at least half the ingredients have a price.
  const cheapest = recipes
    .filter(isDinner)
    .map((r) => {
      const c = recipeCost(applySwaps(r), 1);
      const serves = realServings(r);
      return { r, c, per: serves ? c.total / serves : null };
    })
    .filter((x) => x.per !== null && x.c.priced > 0 && x.c.priced >= x.c.of / 2)
    .sort((a, b) => a.per! - b.per!)
    .slice(0, 5);

  function saveBudget() {
    const v = parsePrice(text);
    setBudget(v ?? 0);
    setBudgetState(v ?? 0);
    setEditing(false);
  }

  return (
    <>
      <Header title="Budget" back={href({ name: "library" })} />
      <main className="page">
        <section className="budget-week">
          <h3>This week</h3>
          {budget > 0 ? (
            <>
              <p className="budget-big">
                <strong>{dollars(week)}</strong> <span className="muted">of {dollars(budget)}</span>
              </p>
              <div className="budget-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className={left < 0 ? "over" : pct > 85 ? "near" : ""} style={{ width: `${pct}%` }} />
              </div>
              <p className="small">{left >= 0 ? `${dollars(left)} left this week` : `${dollars(-left)} over this week`}</p>
            </>
          ) : (
            <p className="budget-big">
              <strong>{dollars(week)}</strong> <span className="muted">spent</span>
            </p>
          )}
          {editing ? (
            <form
              className="budget-edit"
              onSubmit={(e) => {
                e.preventDefault();
                saveBudget();
              }}
            >
              <span>$</span>
              <input className="text-input" inputMode="decimal" autoFocus placeholder="e.g. 150" value={text} onChange={(e) => setText(e.target.value)} aria-label="Weekly grocery budget" />
              <span className="muted small">a week</span>
              <button className="btn primary" type="submit">
                Save
              </button>
            </form>
          ) : (
            <button className="link-btn small" onClick={() => setEditing(true)}>
              {budget ? "Change weekly budget" : "Set a weekly budget"}
            </button>
          )}
          <p className="muted small">This month: {dollars(month)}. Weeks start on Sunday.</p>
        </section>

        <SpendingEditor
          compact
          state={shopping}
          update={(s) => {
            setShopping(s);
            saveShopping(s);
            refresh((n) => n + 1);
          }}
        />

        <a className="btn" href={href({ name: "receipt" })}>
          <Icon name="camera" size={18} /> Import a receipt
        </a>

        {plannedMeals > 0 && (
          <section>
            <h3>Your planned dinners</h3>
            <p>
              ≈ <strong>{dollars(planned)}</strong> for {plannedMeals} {plannedMeals === 1 ? "dinner" : "dinners"} in the next 7 days
              {budget > 0 && planned > 0 && <span className="muted"> ({Math.round((planned / budget) * 100)}% of your weekly budget)</span>}
            </p>
            {unpriced > 0 && (
              <p className="muted small">
                Some ingredients don't have a price yet, so the real cost is higher. Prices fill in as you import receipts.
              </p>
            )}
            <a className="link-btn small" href={href({ name: "week" })}>
              See the week
            </a>
          </section>
        )}

        <section>
          <h3>Cheapest dinners</h3>
          {cheapest.length === 0 ? (
            <p className="muted small">Once you've imported a receipt or two, your dinners appear here from cheapest per serving.</p>
          ) : (
            <ul className="cheap-list">
              {cheapest.map(({ r, per, c }) => (
                <li key={r.id}>
                  <a href={href({ name: "recipe", id: r.id })}>{r.title}</a>
                  <span>
                    <strong>{dollars(per!)}</strong>
                    <span className="muted small"> / serving{c.priced < c.of ? " +" : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {cheapest.some((x) => x.c.priced < x.c.of) && <p className="muted small">“+” means some ingredients don't have a price yet.</p>}
        </section>
      </main>
    </>
  );
}
