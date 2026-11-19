import { useState } from "react";
import Icon from "./Icon";
import { fillWeek, isDinner } from "../lib/autoPlan";
import { budgetChooser, latestPrices, mentions, shoppingCost, skipWords, type CostCtx } from "../lib/budgetPlan";
import { feature } from "../lib/features";
import { findAvoided, isActive, loadAvoid } from "../lib/avoid";
import { loadLeftovers } from "../lib/leftovers";
import { loadPantry, statusFor } from "../lib/pantry";
import { dollars, getBudget, loadPrices } from "../lib/prices";
import { guessPrices, guessQty, loadGuesses } from "../lib/priceGuess";
import { getApiKey } from "../lib/settings";
import { applySwaps } from "../lib/swaps";
import { pastPlans, saveWeek, type WeekState } from "../lib/week";
import type { SavedRecipe } from "../lib/schema";

const SKIP_KEY = "recipe-builder.budgetSkip";
const AMOUNT_KEY = "recipe-builder.budgetPlanAmount";
const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* this visit only */
  }
};

/** What's at home and what things cost, read once for a whole plan. */
function costContext(): CostCtx {
  const pantry = feature("pantry") ? loadPantry() : {};
  const latest = latestPrices(loadPrices());
  const guesses = loadGuesses();
  return {
    have: (key, name, need) => {
      const s = statusFor(key, name, need, pantry);
      return s.kind === "enough" || s.kind === "unknown";
    },
    price: (key, name) => {
      const p = latest.get(key);
      if (p) return { price: p.price, qty: p.qty, guess: false };
      const g = guesses[key];
      return g ? { price: g.price, qty: guessQty(g, name), guess: true } : null;
    },
  };
}

/**
 * "Plan my week on a budget" (Family): fills the empty days with dinners whose
 * shopping comes to as little as possible — what's in the pantry first, and
 * recipes that share ingredients — and says how it compares with the budget.
 */
export default function BudgetPlan(props: {
  recipes: SavedRecipe[];
  week: WeekState;
  days: string[];
  people: number;
  leftoverDays: number[];
  onPlanned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => read(AMOUNT_KEY) || (getBudget() ? String(Math.round(getBudget())) : ""));
  const [skip, setSkip] = useState(() => read(SKIP_KEY));
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{ text: string; over: boolean; notes: string[] } | null>(null);
  if (!feature("budgetPlan") || !props.recipes.some(isDinner)) return null;

  async function plan() {
    const budget = Number(amount.replace(/[$,\s]/g, ""));
    write(AMOUNT_KEY, amount);
    write(SKIP_KEY, skip);
    const words = skipWords(skip);
    const avoid = feature("avoid") ? loadAvoid() : null;
    const leaveOut = (r: SavedRecipe) => mentions(r, words) || (!!avoid && isActive(avoid) && findAvoided(applySwaps(r).ingredients, avoid).length > 0);
    const notes: string[] = [];

    // Prices for things never bought here: estimated once (kept 90 days).
    let ctx = costContext();
    const unpriced = new Map<string, string>();
    for (const r of props.recipes.filter((r) => isDinner(r) && !leaveOut(r)))
      for (const it of shoppingCost([{ recipe: applySwaps(r), scale: 1 }], ctx).items) if (it.unpriced) unpriced.set(it.key, it.name);
    if (unpriced.size) {
      setBusy("Estimating prices…");
      try {
        await guessPrices(getApiKey(), [...unpriced].map(([key, name]) => ({ key, name })));
        ctx = costContext();
      } catch {
        notes.push("Couldn't estimate prices for things you haven't bought yet, so each counts as about $3.");
      }
    }

    setBusy("Planning…");
    const chooser = budgetChooser({ ctx, cooked: applySwaps, leaveOut });
    const r = fillWeek({
      week: props.week,
      past: pastPlans(),
      recipes: props.recipes,
      fridge: loadLeftovers(),
      people: props.people,
      days: props.days,
      leftoverDays: props.leftoverDays,
      choose: chooser.choose,
    });
    saveWeek(r.week);
    props.onPlanned();

    const cost = shoppingCost(chooser.chosen.map((c) => ({ recipe: applySwaps(c), scale: 1 })), ctx);
    const guessed = cost.items.filter((i) => i.guess || i.unpriced).length;
    const over = budget > 0 && cost.total > budget;
    const dinners = `${r.cooked} ${r.cooked === 1 ? "dinner" : "dinners"}`;
    const text = !r.cooked
      ? "No dinners fit — every recipe left is one you skipped or had in the last 2 weeks."
      : `${dinners}${r.leftovers ? ` and ${r.leftovers} leftovers ${r.leftovers === 1 ? "night" : "nights"}` : ""}: about ${dollars(cost.total)} to buy (${cost.items.length} ${cost.items.length === 1 ? "item" : "items"})` +
        (budget > 0 ? (over ? ` — ${dollars(cost.total - budget)} over your ${dollars(budget)}.` : ` — within your ${dollars(budget)}.`) : ".");
    if (over) notes.push("That's the cheapest week your recipes allow. Add a few budget-friendly recipes, or tap Try again for another mix.");
    if (guessed) notes.push(`${guessed} of the prices are estimates — they get exact once you note what you pay on the shopping list.`);
    if (r.short) notes.push(`${r.short} ${r.short === 1 ? "day is" : "days are"} still open — not enough different recipes.`);
    setResult({ text, over, notes });
    setBusy("");
  }

  if (!open)
    return (
      <button className="btn budget-plan-open" onClick={() => setOpen(true)}>
        <Icon name="wallet" size={18} /> Plan my week on a budget
      </button>
    );

  return (
    <div className="budget-plan">
      <h3 className="small-heading">Plan on a budget</h3>
      <div className="budget-plan-fields">
        <label className="field">
          <span>Spend at most</span>
          <input
            className="text-input"
            inputMode="decimal"
            placeholder="$80"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Leave out (optional)</span>
          <input className="text-input" placeholder="e.g. spicy, pork" value={skip} onChange={(e) => setSkip(e.target.value)} />
        </label>
      </div>
      <div className="button-row">
        <button className="btn primary" disabled={!!busy} onClick={() => void plan()}>
          {busy || (result ? "Try again" : "Plan my week")}
        </button>
        <button className="link-btn small" disabled={!!busy} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {result && (
        <div className={result.over ? "callout warn small" : "callout small"} role="status">
          <strong>{result.text}</strong>
          {result.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
      <p className="muted small">
        Picks dinners from your recipes that cost least to shop for: what's in your pantry is used first, and recipes that share
        ingredients are paired up. Uses the prices you've paid{feature("avoid") ? ", skips foods you avoid" : ""}, and leaves your own
        picks alone.
      </p>
    </div>
  );
}
