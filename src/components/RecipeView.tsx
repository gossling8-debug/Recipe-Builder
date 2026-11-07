import { useState } from "react";
import { formatIngredient, unusedIngredients, type ScannedRecipe } from "../lib/schema";

/**
 * The cook-friendly view: the usual ingredient list on top, then steps with
 * each ingredient's amount shown right where it's added.
 */
export default function RecipeView({ recipe }: { recipe: ScannedRecipe }) {
  const [have, setHave] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set());
  // Ingredient mentions crossed off in the steps, keyed "step-segment".
  const [added, setAdded] = useState<Set<string>>(new Set());

  const toggleAdded = (key: string) =>
    setAdded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };

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
        <p className="meta">{[recipe.servings, recipe.time].filter(Boolean).join(" · ")}</p>
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
                    <input type="checkbox" checked={have.has(i)} onChange={() => setHave((s) => toggle(s, i))} />
                    <span>{formatIngredient(recipe.ingredients[i])}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h3>Instructions</h3>
        <p className="muted small">Tap an ingredient to cross it off as you add it. Tap anywhere else in a step to mark the whole step done.</p>
        <ol className="steps">
          {recipe.steps.map((step, si) => (
            <li
              key={si}
              className={done.has(si) ? "done" : ""}
              onClick={() => setDone((s) => toggle(s, si))}
            >
              <span className="step-num" aria-hidden>
                {done.has(si) ? "✓" : si + 1}
              </span>
              <p>
                {step.segments.map((seg, k) =>
                  seg.ingredient_index === null ? (
                    <span key={k}>{seg.text}</span>
                  ) : (
                    <IngredientMention
                      key={k}
                      text={seg.text}
                      amount={seg.amount}
                      crossed={added.has(`${si}-${k}`)}
                      onToggle={() => toggleAdded(`${si}-${k}`)}
                    />
                  ),
                )}
              </p>
            </li>
          ))}
        </ol>
      </section>

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
