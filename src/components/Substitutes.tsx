import { useState } from "react";
import { avoidKey, ALLERGEN_GROUPS, findAvoided, isActive, loadAvoid } from "../lib/avoid";
import { getApiKey } from "../lib/settings";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import Icon from "./Icon";

export const ingredientsKey = (r: SavedRecipe) => JSON.stringify(r.ingredients.map((i) => [i.quantity, i.unit, i.name]));

/**
 * Substitutes for the ingredients on the cook's avoid list, written by
 * Claude for this specific recipe and saved with it (so it's paid for once).
 */
export default function Substitutes({ recipe, onSaved }: { recipe: SavedRecipe; onSaved: (r: SavedRecipe) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avoid = loadAvoid();
  if (!isActive(avoid)) return null;
  const flagged = findAvoided(recipe.ingredients, avoid);
  if (flagged.length === 0) return null;

  const saved = recipe.substitutions;
  const current = saved && saved.avoidKey === avoidKey(avoid) && saved.ingredientsKey === ingredientsKey(recipe);
  const hasKey = !!getApiKey();

  async function ask() {
    setBusy(true);
    setError("");
    try {
      const { suggestSubstitutes } = await import("../lib/substitutes");
      const labels = [...avoid.groups.map((g) => ALLERGEN_GROUPS[g]?.label ?? g), ...avoid.custom];
      const result = await suggestSubstitutes(
        getApiKey(),
        recipe,
        flagged.map((f) => {
          const i = recipe.ingredients[f.index];
          return { ingredient: [i.quantity, i.unit, i.name, i.preparation].filter(Boolean).join(" "), reasons: f.reasons };
        }),
        labels,
      );
      await onSaved({
        ...recipe,
        substitutions: { avoidKey: avoidKey(avoid), ingredientsKey: ingredientsKey(recipe), createdAt: Date.now(), result },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <section id="substitutes">
      <h3>Substitutes</h3>
      {saved && (
        <>
          {!current && (
            <div className="callout warn small">
              These were suggested for an earlier version of this recipe or of your avoid list.
            </div>
          )}
          <ul className="subs">
            {saved.result.items.map((item, i) => (
              <li key={i}>
                <div className="sub-ingredient">Instead of {item.ingredient}</div>
                <p className="muted small sub-role">{item.role}</p>
                {item.options.map((o, j) => (
                  <div key={j} className="sub-option">
                    <div className="sub-head">
                      <strong>{o.substitute}</strong>
                      <span className={`closeness ${o.closeness.split(" ")[0].toLowerCase()}`}>{o.closeness}</span>
                    </div>
                    <div className="sub-amount">{o.amount}</div>
                    <p>{o.what_changes}</p>
                    {o.tip && <p className="muted small">Tip: {o.tip}</p>}
                  </div>
                ))}
                {item.leave_it_out && (
                  <p className="small">
                    <strong>Leaving it out:</strong> {item.leave_it_out}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {saved.result.label_check.length > 0 && (
            <div className="callout warn small">
              <strong>Check the labels:</strong> {saved.result.label_check.join(" ")}
            </div>
          )}
          <p className="muted small">
            Suggestions from Claude for this recipe. Substitutes can change results; if this is a serious allergy, check
            every label.
          </p>
        </>
      )}

      {(!saved || !current) &&
        (hasKey ? (
          <>
            {!saved && (
              <p className="muted small">
                Get swaps chosen for how {flagged.length === 1 ? "this ingredient is" : "these ingredients are"} used in this
                recipe, with an honest note on how close each one comes. Uses Claude (about 1–3 cents); the answer is saved
                with the recipe.
              </p>
            )}
            <button className="btn" onClick={ask} disabled={busy}>
              <Icon name="reset" size={18} /> {busy ? "Thinking… (about 15–30 seconds)" : saved ? "Update suggestions" : "Suggest substitutes"}
            </button>
          </>
        ) : (
          <p className="muted small">
            Add your Anthropic API key in <a href={href({ name: "settings" })}>Settings</a> to get substitute suggestions.
          </p>
        ))}
      {error && <div className="callout error">{error}</div>}
    </section>
  );
}
