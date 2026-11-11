import { useState } from "react";
import { avoidKey, ALLERGEN_GROUPS, findAvoided, isActive, loadAvoid } from "../lib/avoid";
import { getApiKey, aiReady } from "../lib/settings";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import { activeSwaps, ingredientsKey, shortName, type Swap } from "../lib/swaps";
import { matchIngredient } from "../lib/edit";
import Icon from "./Icon";

/**
 * Substitutes for the ingredients on the cook's avoid list, written by
 * Claude for this specific recipe and saved with it (so it's paid for once).
 */
export default function Substitutes({ recipe, onSaved }: { recipe: SavedRecipe; onSaved: (r: SavedRecipe) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const avoid = loadAvoid();
  if (!isActive(avoid)) return null;
  // Everything flagged on the original recipe, swapped or not.
  const flagged = findAvoided(recipe.ingredients, avoid);
  if (flagged.length === 0) return null;
  const swaps = activeSwaps(recipe);
  const flaggedIdx = new Set(flagged.map((f) => f.index));

  // Which ingredient a suggestion is for (older saved suggestions don't say, so match by name).
  const indexFor = (item: { ingredient: string; ingredient_index?: number }) => {
    if (item.ingredient_index !== undefined && flaggedIdx.has(item.ingredient_index)) return item.ingredient_index;
    const byName = matchIngredient(item.ingredient, recipe.ingredients);
    return byName !== null && flaggedIdx.has(byName) ? byName : null;
  };

  async function choose(index: number, swap: Swap | null) {
    const byIndex = { ...(activeSwaps(recipe).size ? recipe.swaps!.byIndex : {}) };
    if (swap) byIndex[index] = swap;
    else delete byIndex[index];
    await onSaved({ ...recipe, swaps: { ingredientsKey: ingredientsKey(recipe), byIndex } });
  }

  const saved = recipe.substitutions;
  const current = saved && saved.avoidKey === avoidKey(avoid) && saved.ingredientsKey === ingredientsKey(recipe);
  const hasKey = aiReady();

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
          return { index: f.index, ingredient: [i.quantity, i.unit, i.name, i.preparation].filter(Boolean).join(" "), reasons: f.reasons };
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
            {saved.result.items.map((item, i) => {
              const idx = indexFor(item);
              const chosen = idx === null ? undefined : swaps.get(idx);
              return (
                <li key={i}>
                  <div className="sub-ingredient">Instead of {item.ingredient}</div>
                  <p className="muted small sub-role">{item.role}</p>
                  {item.options.map((o, j) => {
                    const name = o.short_name || shortName(o.substitute);
                    const amount = o.amount.replace(/\s*\((same|equal)[^)]*\)/i, "").trim();
                    const isChosen = chosen?.name === name && chosen.amount === amount;
                    return (
                      <div key={j} className={isChosen ? "sub-option chosen" : "sub-option"}>
                        <div className="sub-head">
                          <strong>{o.substitute}</strong>
                          <span className={`closeness ${o.closeness.split(" ")[0].toLowerCase()}`}>{o.closeness}</span>
                        </div>
                        <div className="sub-amount">{o.amount}</div>
                        <p>{o.what_changes}</p>
                        {o.tip && <p className="muted small">Tip: {o.tip}</p>}
                        {idx !== null &&
                          (isChosen ? (
                            <div className="sub-actions">
                              <span className="small">
                                <Icon name="check" size={16} /> Using this in the recipe
                              </span>
                              <button className="link-btn small" onClick={() => choose(idx, null)}>
                                Undo
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn sub-use"
                              onClick={() =>
                                choose(idx, { name, amount, closeness: o.closeness, original: recipe.ingredients[idx].name })
                              }
                            >
                              Use this
                            </button>
                          ))}
                      </div>
                    );
                  })}
                  {item.leave_it_out && (
                    <p className="small">
                      <strong>Leaving it out:</strong> {item.leave_it_out}
                    </p>
                  )}
                </li>
              );
            })}
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
                recipe, with an honest note on how close each one comes. Uses a little of your monthly AI; the answer is saved
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
