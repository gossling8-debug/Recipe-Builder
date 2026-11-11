import { useState } from "react";
import Icon from "./Icon";
import { ALLERGEN_GROUPS, isActive, loadAvoid } from "../lib/avoid";
import { getApiKey, aiReady } from "../lib/settings";
import { href } from "../lib/route";
import { activeSwaps, ingredientsKey, type Swap } from "../lib/swaps";
import { caloriesWithSwaps, type Nutrition } from "../lib/nutrition";
import type { SavedRecipe } from "../lib/schema";
import { formatNumber } from "../lib/quantity";
import { realServings } from "../lib/autoPlan";
import { convertText, useUnits } from "../lib/units";

type Healthier = Nutrition["healthier"][number];

/**
 * Nutrition per serving and healthier swaps, estimated by Claude for this
 * recipe and saved with it (paid for once). Swaps use the same "Use this"
 * mechanism as allergy substitutes, so the steps update too.
 */
export default function NutritionSection({ recipe, onSaved }: { recipe: SavedRecipe; onSaved: (r: SavedRecipe) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saved = recipe.nutrition;
  const current = saved && saved.ingredientsKey === ingredientsKey(recipe);
  const swaps = activeSwaps(recipe);
  const hasKey = aiReady();
  const [units] = useUnits();

  const swapFor = (h: Healthier): Swap => ({ name: h.short_name, amount: h.amount, closeness: "Healthier", original: recipe.ingredients[h.ingredient_index].name });
  const isChosen = (h: Healthier) => {
    const s = swaps.get(h.ingredient_index);
    return !!s && s.name === h.short_name && s.amount === h.amount;
  };

  async function choose(h: Healthier, on: boolean) {
    const byIndex = { ...(swaps.size ? recipe.swaps!.byIndex : {}) };
    if (on) byIndex[h.ingredient_index] = swapFor(h);
    else delete byIndex[h.ingredient_index];
    await onSaved({ ...recipe, swaps: { ingredientsKey: ingredientsKey(recipe), byIndex } });
  }

  async function ask() {
    setBusy(true);
    setError("");
    try {
      const { estimateNutrition } = await import("../lib/nutrition");
      const avoid = loadAvoid();
      const labels = isActive(avoid) ? [...avoid.groups.map((g) => ALLERGEN_GROUPS[g]?.label ?? g), ...avoid.custom] : [];
      const result = await estimateNutrition(getApiKey(), recipe, labels, recipe.photos.slice(0, 4));
      await onSaved({ ...recipe, nutrition: { ingredientsKey: ingredientsKey(recipe), createdAt: Date.now(), result } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const raw = saved?.result;
  // If you've since said how many servings it really makes, per-serving numbers
  // follow your count (the whole-recipe totals stay the same). A card's own
  // nutrition facts are left as printed.
  const yours = realServings(recipe);
  const factor = raw && yours && raw.servings > 0 && raw.source !== "card" && yours !== raw.servings ? raw.servings / yours : 1;
  const n: typeof raw =
    raw && factor !== 1
      ? {
          ...raw,
          per_serving: Object.fromEntries(Object.entries(raw.per_serving).map(([k, v]) => [k, v * factor])) as typeof raw.per_serving,
          serving_size: raw.serving_size && { measure: `about 1/${yours} of the recipe`, weight_g: raw.serving_size.weight_g * factor },
          healthier: raw.healthier.map((h) => ({ ...h, calories_change: h.calories_change * factor })),
          servings_note: `Adjusted to your ${yours} servings (estimated for ${raw.servings})`,
        }
      : raw;
  const fromCard = n?.source === "card";
  const withSwaps = n && n.healthier.some(isChosen) ? caloriesWithSwaps(n, isChosen) : null;

  return (
    <section id="nutrition">
      <h3>Nutrition</h3>
      {n && (
        <>
          {!current && <div className="callout warn small">This was estimated before the ingredients were edited.</div>}
          <div className="nutri-head">
            <div>
              <div className="nutri-cal">
                {fromCard ? "" : "≈ "}
                {Math.round(n.per_serving.calories)}
              </div>
              <div className="muted small">calories per serving{fromCard ? " · from the recipe" : ""}</div>
            </div>
            {withSwaps !== null && (
              <div>
                <div className="nutri-cal swapped">≈ {Math.round(withSwaps)}</div>
                <div className="muted small">with your swaps</div>
              </div>
            )}
          </div>
          {!n.serving_size && current && hasKey && (
            <p className="small">
              <button className="link-btn small" onClick={ask} disabled={busy}>
                {busy ? "Working… (about 15–30 seconds)" : "Add the serving size"}
              </button>{" "}
              <span className="muted">(reads it from your card)</span>
            </p>
          )}
          {n.serving_size && (
            <p className="serving-size">
              <span className="muted small">Serving size</span>{" "}
              <strong>{convertText(n.serving_size.measure, units)}</strong>
              <span className="muted"> · ≈ {weightText(n.serving_size.weight_g, units)}</span>
            </p>
          )}
          <p className="muted small">
            {n.servings_note} · {fromCard ? "Numbers from the recipe" : `Estimate: ${n.confidence.toLowerCase()}`}
          </p>
          <table className="conv-table nutri-table">
            <tbody>
              {(
                [
                  ["Protein", n.per_serving.protein_g, "g"],
                  ["Carbohydrates", n.per_serving.carbs_g, "g"],
                  ["  Fiber", n.per_serving.fiber_g, "g"],
                  ["  Sugars", n.per_serving.sugar_g, "g"],
                  ["Fat", n.per_serving.fat_g, "g"],
                  ["  Saturated fat", n.per_serving.saturated_fat_g, "g"],
                  ["Sodium", n.per_serving.sodium_mg, "mg"],
                ] as const
              ).map(([label, v, unit]) => (
                <tr key={label}>
                  <th scope="row" className={label.startsWith(" ") ? "sub" : undefined}>
                    {label.trim()}
                  </th>
                  <td>
                    {Math.round(v)} {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{n.caveats} Amounts are per serving, so changing the size above doesn't change them.</p>

          <h4>Make it healthier</h4>
          {n.healthier.length === 0 && <p className="small">This is already a fairly light recipe — no swaps worth making.</p>}
          <ul className="subs">
            {n.healthier.map((h, i) => {
              const chosen = isChosen(h);
              return (
                <li key={i}>
                  <div className={chosen ? "sub-option chosen" : "sub-option"}>
                    <div className="sub-head">
                      <strong>
                        {h.substitute} <span className="muted">instead of {h.ingredient}</span>
                      </strong>
                      <span className="closeness close">
                        {h.calories_change <= 0 ? "−" : "+"}
                        {Math.abs(Math.round(h.calories_change))} cal
                      </span>
                    </div>
                    <div className="sub-amount">{h.amount}</div>
                    <p>
                      <strong>{h.benefit.charAt(0).toUpperCase() + h.benefit.slice(1)}.</strong> {h.what_changes}
                    </p>
                    {chosen ? (
                      <div className="sub-actions">
                        <span className="small">
                          <Icon name="check" size={16} /> Using this in the recipe
                        </span>
                        <button className="link-btn small" onClick={() => choose(h, false)}>
                          Undo
                        </button>
                      </div>
                    ) : (
                      <button className="btn sub-use" onClick={() => choose(h, true)}>
                        Use this
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {n.tips.length > 0 && (
            <ul className="nutri-tips small">
              {n.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          <p className="muted small">
            {fromCard ? "Nutrition as listed on the recipe; swap calories are Claude's estimates." : "An estimate from Claude, not a lab test — fine for everyday choices, not for medical diets."}
          </p>
        </>
      )}

      {(!n || !current) &&
        (hasKey ? (
          <>
            {!n && (
              <p className="muted small">
                See calories, protein, carbs, fat and sodium per serving, plus a few honest swaps to make it lighter. Uses a
                little of your monthly AI; the answer is saved with the recipe.
              </p>
            )}
            <button className="btn" onClick={ask} disabled={busy}>
              <Icon name="reset" size={18} /> {busy ? "Estimating… (about 15–30 seconds)" : n ? "Estimate again" : "Estimate nutrition"}
            </button>
          </>
        ) : (
          <p className="muted small">
            Add your Anthropic API key in <a href={href({ name: "settings" })}>Settings</a> to estimate nutrition.
          </p>
        ))}
      {error && <div className="callout error">{error}</div>}
    </section>
  );
}

/** "240 g (8½ oz)"; metric shows grams only, US shows ounces first. */
function weightText(g: number, units: string): string {
  const grams = g < 100 ? Math.round(g / 5) * 5 : Math.round(g / 10) * 10;
  const oz = g / 28.35;
  const ozText = oz >= 16 ? `${Math.round((oz / 16) * 10) / 10} lb` : `${formatNumber(Math.round(oz * 2) / 2)} oz`;
  if (units === "metric") return `${grams} g`;
  if (units === "us") return `${ozText} (${grams} g)`;
  return `${grams} g (${ozText})`;
}
