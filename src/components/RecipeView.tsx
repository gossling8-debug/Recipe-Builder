import { unusedIngredients, type Ingredient, type ScannedRecipe } from "../lib/schema";
import { scaleAmount } from "../lib/quantity";
import { toggleIn, useProgress } from "../lib/progress";
import Icon from "./Icon";
import { useState } from "react";
import { addToShopping, loadShopping, removeFromShopping } from "../lib/shopping";
import { href } from "../lib/route";

const SCALES: [number, string][] = [
  [0.5, "½×"],
  [1, "1×"],
  [1.5, "1½×"],
  [2, "2×"],
  [3, "3×"],
];

function ingredientLine(ing: Ingredient, scale: number): string {
  const amount = scaleAmount([ing.quantity, ing.unit].map((s) => s.trim()).filter(Boolean).join(" "), scale);
  const head = [amount, ing.name.trim()].filter(Boolean).join(" ");
  return ing.preparation ? `${head}, ${ing.preparation}` : head;
}

/**
 * The cook-friendly view: the usual ingredient list on top, then steps with
 * each ingredient's amount shown right where it's added. Checkmarks, crossed-off
 * ingredients and the chosen size are saved until "Start over".
 */
export default function RecipeView({ recipe, recipeId, preview = false }: { recipe: ScannedRecipe; recipeId: string; preview?: boolean }) {
  const [progress, update] = useProgress(recipeId);
  const { scale } = progress;
  const have = new Set(progress.have);
  const done = new Set(progress.done);
  const added = new Set(progress.added);
  const started = have.size + done.size + added.size > 0;
  const [listed, setListed] = useState(() => loadShopping().recipes.find((r) => r.id === recipeId));

  // Group ingredients under their card sub-headings, keeping card order.
  const groups: { section: string | null; items: number[] }[] = [];
  recipe.ingredients.forEach((ing, i) => {
    const last = groups[groups.length - 1];
    if (last && last.section === ing.section) last.items.push(i);
    else groups.push({ section: ing.section, items: [i] });
  });

  const unused = unusedIngredients(recipe);

  return (
    <article className="recipe">
      <h2 className="recipe-title">{recipe.title}</h2>
      {(recipe.servings || recipe.time) && (
        <p className="meta">
          {[recipe.servings && scaleAmount(recipe.servings, scale), recipe.time]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <div className="scale-row" role="group" aria-label="Recipe size">
        <span className="small muted">Size</span>
        <div className="segmented">
        {SCALES.map(([value, label]) => (
          <button
            key={value}
            className={value === scale ? "chip active" : "chip"}
            aria-pressed={value === scale}
            onClick={() => update((p) => ({ ...p, scale: value }))}
          >
            {label}
          </button>
        ))}
        </div>
      </div>
      {scale !== 1 && (
        <p className="small muted">
          Amounts are {scale < 1 ? "reduced" : "multiplied"} ×{scaleLabel(scale)}. Cooking times and pan sizes aren't changed —
          use your judgment.
        </p>
      )}

      {recipe.warnings.length > 0 && (
        <div className="callout warn">
          <strong>Double-check against the card:</strong>
          <ul>
            {recipe.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h3>Ingredients</h3>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.section && <h4>{g.section}</h4>}
            <ul className="ingredients">
              {g.items.map((i) => (
                <li key={i}>
                  <label className={have.has(i) ? "checked" : ""}>
                    <input
                      type="checkbox"
                      checked={have.has(i)}
                      onChange={() => update((p) => ({ ...p, have: toggleIn(p.have, i) }))}
                    />
                    <span>{ingredientLine(recipe.ingredients[i], scale)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!preview && (
      <div className="list-row">
        {listed && listed.scale === scale ? (
          <>
            <span className="small">
              <Icon name="check" size={16} /> On your <a href={href({ name: "shopping" })}>shopping list</a>
            </span>
            <button
              className="link-btn small"
              onClick={() => {
                removeFromShopping(recipeId);
                setListed(undefined);
              }}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            className="btn"
            onClick={() => {
              addToShopping(recipeId, scale);
              setListed({ id: recipeId, scale });
            }}
          >
            <Icon name="bag" size={18} /> {listed ? "Update shopping list to this size" : "Add to shopping list"}
          </button>
        )}
      </div>
      )}

      <section>
        <h3>Instructions</h3>
        <p className="muted small">
          Tap an ingredient to cross it off as you add it. Tap anywhere else in a step to mark the whole step done.
        </p>
        <ol className="steps">
          {recipe.steps.map((step, si) => (
            <li
              key={si}
              className={done.has(si) ? "done" : ""}
              onClick={() => update((p) => ({ ...p, done: toggleIn(p.done, si) }))}
            >
              <span className="step-num" aria-hidden>
                {done.has(si) ? <Icon name="check" size={16} /> : si + 1}
              </span>
              <p>
                {step.segments.map((seg, k) =>
                  seg.ingredient_index === null ? (
                    <span key={k}>{seg.text}</span>
                  ) : (
                    <IngredientMention
                      key={k}
                      text={seg.text}
                      amount={seg.amount && scaleAmount(seg.amount, scale)}
                      crossed={added.has(`${si}-${k}`)}
                      onToggle={() => update((p) => ({ ...p, added: toggleIn(p.added, `${si}-${k}`) }))}
                    />
                  ),
                )}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {started && (
        <div className="button-row">
          <button
            className="btn"
            onClick={() => {
              if (confirm("Clear all checkmarks and crossed-off ingredients?")) {
                update((p) => ({ ...p, have: [], done: [], added: [] }));
              }
            }}
          >
            <Icon name="reset" size={18} /> Start over
          </button>
        </div>
      )}

      {unused.length > 0 && recipe.steps.length > 0 && (
        <p className="muted small">
          Not mentioned in the steps: {unused.map((i) => recipe.ingredients[i].name).join(", ")}.
        </p>
      )}

      {recipe.notes && (
        <section>
          <h3>Notes</h3>
          <p className="notes">{recipe.notes}</p>
        </section>
      )}
    </article>
  );
}

function scaleLabel(scale: number): string {
  return SCALES.find(([v]) => v === scale)?.[1].replace("×", "") ?? String(scale);
}

/**
 * An ingredient inside a step, e.g. "the flour [2 cups]". Tapping it crosses it
 * off without marking the whole step done. It's a span (not a <button>) so long
 * names still wrap naturally across lines.
 */
function IngredientMention(props: { text: string; amount: string | null; crossed: boolean; onToggle: () => void }) {
  const { text, amount, crossed, onToggle } = props;
  return (
    <span
      className={crossed ? "ing-mention crossed" : "ing-mention"}
      role="checkbox"
      aria-checked={crossed}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation(); // don't also toggle the step
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
    >
      {text}
      {amount && <span className="amount">{amount}</span>}
    </span>
  );
}
