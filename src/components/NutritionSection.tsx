import { useState } from "react";
import Icon from "./Icon";
import { ALLERGEN_GROUPS, isActive, loadAvoid } from "../lib/avoid";
import { getApiKey } from "../lib/settings";
import { href } from "../lib/route";
import { activeSwaps, ingredientsKey, type Swap } from "../lib/swaps";
import { caloriesWithSwaps, type Nutrition } from "../lib/nutrition";
import type { SavedRecipe } from "../lib/schema";

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
  const hasKey = !!getApiKey();

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
      const result = await estimateNutrition(getApiKey(), recipe, labels);
      await onSaved({ ...recipe, nutrition: { ingredientsKey: ingredientsKey(recipe), createdAt: Date.now(), result } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const n = saved?.result;
  const withSwaps = n && n.healthier.some(isChosen) ? caloriesWithSwaps(n, isChosen) : null;

  return (
    <section id="nutrition">
      <h3>Nutrition</h3>
      {n && (
        <>
          {!current && <div className="callout warn small">This was estimated before the ingredients were edited.</div>}
          <div className="nutri-head">
            <div>
              <div className="nutri-cal">≈ {Math.round(n.per_serving.calories)}</div>
              <div className="muted small">calories per serving</div>
            </div>
            {withSwaps !== null && (
              <div>
                <div className="nutri-cal swapped">≈ {Math.round(withSwaps)}</div>
                <div className="muted small">with your swaps</div>
              </div>
            )}
          </div>
          <p className="muted small">
            {n.servings_note} · Estimate: {n.confidence.toLowerCase()}
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
          <p className="muted small">An estimate from Claude, not a lab test — fine for everyday choices, not for medical diets.</p>
        </>
      )}

      {(!n || !current) &&
        (hasKey ? (
          <>
            {!n && (
              <p className="muted small">
                See calories, protein, carbs, fat and sodium per serving, plus a few honest swaps to make it lighter. Uses Claude
                (a few cents); the answer is saved with the recipe.
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
