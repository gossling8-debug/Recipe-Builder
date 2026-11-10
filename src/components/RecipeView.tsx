import RecipeTips from "./RecipeTips";
import { feature } from "../lib/features";
import { unusedIngredients, type Ingredient, type ScannedRecipe } from "../lib/schema";
import { formatNumber, scaleAmount } from "../lib/quantity";
import { toggleIn, useProgress } from "../lib/progress";
import Icon from "./Icon";
import TagPicker from "./TagPicker";
import { dollars, recipeCost } from "../lib/prices";
import { realServings, servingsCount } from "../lib/autoPlan";
import { useState, type ReactNode } from "react";
import { findAvoided, isActive, loadAvoid } from "../lib/avoid";
import { conversionsFor } from "../lib/conversions";
import { addToShopping, loadShopping, removeFromShopping } from "../lib/shopping";
import { href } from "../lib/route";
import type { Swap } from "../lib/swaps";
import { convertRecipe, useUnits, type UnitSystem } from "../lib/units";

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
export default function RecipeView({
  recipe: original,
  recipeId,
  preview = false,
  extra,
  myNotes,
  swaps = new Map(),
  onUndoSwap,
  onStartCooking,
  top,
  onMade,
  made,
  onTagsChange,
  photo,
  versions,
}: {
  recipe: ScannedRecipe;
  recipeId: string;
  preview?: boolean;
  /** Shown after the notes, before the conversions (the substitutes section). */
  extra?: ReactNode;
  /** The cook's own notes (My notes), shown after the card's notes and before the cost. */
  myNotes?: ReactNode;
  /** Substitutes the cook chose, by ingredient index (recipe already has them applied). */
  swaps?: Map<number, Swap>;
  onUndoSwap?: (index: number) => void;
  /** Opens cooking mode (one step at a time). */
  onStartCooking?: () => void;
  /** "I made this" — subtracts the recipe from the pantry. */
  onMade?: () => void;
  /** Set when the pantry was already updated for this recipe recently (offers Undo). */
  made?: { at: number; onUndo: () => void } | null;
  /** Shown under the size control (the meal planner). */
  top?: ReactNode;
  /** Lets the labels under the title be edited in place. */
  onTagsChange?: (tags: string[]) => void;
  /** The cook's photo of the dish: a thumbnail by the title that opens full screen. */
  photo?: string;
  /** The original and its versions, when there's more than one. */
  versions?: { id: string; title: string; original: boolean }[];
}) {
  const [chosenUnits, setUnits] = useUnits();
  const units = feature("units") ? chosenUnits : "original";
  const [editingTags, setEditingTags] = useState(false);
  const [bigPhoto, setBigPhoto] = useState(false);
  const recipe = convertRecipe(original, units);
  // The cook's own servings count (saved recipes only).
  // (Not repeated when it matches the card.)
  const mine = (original as { myServings?: number }).myServings;
  const myServings = mine !== undefined && mine !== servingsCount(original.servings) ? mine : undefined;
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
  const avoided = feature("avoid") ? findAvoided(recipe.ingredients, loadAvoid(), new Set(swaps.keys())) : [];
  const avoidedAt = new Map(avoided.map((m) => [m.index, m.reasons]));
  const conversions = feature("conversions") ? conversionsFor(original.ingredients, scale) : []; // works from the card's own units

  return (
    <article className="recipe">
      <div className="title-row">
        <h2 className="recipe-title">{recipe.title}</h2>
        {photo && (
          <button className="dish-thumb" onClick={() => setBigPhoto(true)} aria-label="Show your photo of the dish">
            <img src={photo} alt="" />
          </button>
        )}
      </div>
      {bigPhoto && photo && (
        <div className="lightbox" role="dialog" aria-label={`${recipe.title}, as you made it`} onClick={() => setBigPhoto(false)}>
          <img src={photo} alt={`${recipe.title}, as you made it`} />
          <button className="icon-btn lightbox-close" aria-label="Close photo" onClick={() => setBigPhoto(false)}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {(recipe.tags?.length > 0 || onTagsChange) && !editingTags && (
        <div className="title-tags">
          {(recipe.tags ?? []).map((t) =>
            preview ? (
              <span key={t} className="tag small-tag">{t}</span>
            ) : (
              <a key={t} className="tag small-tag" href={href({ name: "library" })} onClick={() => showTagInLibrary(t)} aria-label={`Show all ${t} recipes`}>
                {t}
              </a>
            ),
          )}
          {onTagsChange && (
            <button className="link-btn small" onClick={() => setEditingTags(true)}>
              {recipe.tags?.length ? "Edit labels" : "+ Add labels"}
            </button>
          )}
        </div>
      )}
      {versions && (
        <p className="small versions">
          Versions:{" "}
          {versions.map((v, i) => (
            <span key={v.id}>
              {i > 0 && " · "}
              {v.id === recipeId ? (
                <strong>{v.original ? "Original" : v.title}</strong>
              ) : (
                <a href={href({ name: "recipe", id: v.id })}>{v.original ? "Original" : v.title}</a>
              )}
            </span>
          ))}
        </p>
      )}
      {editingTags && onTagsChange && (
        <div className="plan-card title-tag-editor">
          <TagPicker tags={recipe.tags ?? []} onChange={onTagsChange} />
          <div className="button-row">
            <button className="btn primary" onClick={() => setEditingTags(false)}>
              Done
            </button>
          </div>
        </div>
      )}
      {(recipe.servings || recipe.time || myServings) && (
        <p className="meta">
          {[
            recipe.servings && scaleAmount(recipe.servings, scale) + (myServings ? " (card)" : ""),
            myServings && `about ${formatNumber(myServings * scale)} ${myServings * scale === 1 ? "serving" : "servings"} for you`,
            recipe.time,
          ]
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
      {feature("units") && (
      <div className="scale-row" role="group" aria-label="Units">
        <span className="small muted">Units</span>
        <div className="segmented">
          {UNIT_CHOICES.map(([value, label]) => (
            <button
              key={value}
              className={value === units ? "chip active" : "chip"}
              aria-pressed={value === units}
              onClick={() => setUnits(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      )}
      {feature("tips") && !preview && <RecipeTips recipe={original} />}
      {units !== "original" && (
        <p className="small muted">
          Converted from the card and rounded to kitchen-friendly amounts. Teaspoons and tablespoons stay as they are.
        </p>
      )}
      {top}
      {scale !== 1 && (
        <p className="small muted">
          Amounts are {scale < 1 ? "reduced" : "multiplied"} ×{scaleLabel(scale)}. Cooking times and pan sizes aren't changed —
          use your judgment.
        </p>
      )}

      {avoided.length > 0 && (
        <div className="callout error">
          <strong>Contains items you avoid:</strong>{" "}
          {avoided.map((m) => `${recipe.ingredients[m.index].name} (${m.reasons.join(", ")})`).join("; ")}.{" "}
          {!preview && (
            // A button, not a "#…" link: the part after # picks the screen in this app.
            <button
              className="link-btn inline-link"
              onClick={() => document.getElementById("substitutes")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Choose substitutes
            </button>
          )}
        </div>
      )}
      {swaps.size > 0 && (
        <div className="callout small">
          <strong>Swapped:</strong>{" "}
          {[...swaps.values()].map((s) => `${s.original} → ${s.name}`).join("; ")}.{" "}
          {avoided.length === 0 && isActive(loadAvoid()) && [...swaps.values()].some((s) => s.closeness !== "Healthier") && "This recipe now fits your avoid list."}
        </div>
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
                    <span>
                      {ingredientLine(recipe.ingredients[i], scale)}
                      {avoidedAt.has(i) && <span className="avoid-flag">Avoid · {avoidedAt.get(i)!.join(", ")}</span>}
                      {swaps.has(i) && (
                        <span className="swap-note">
                          instead of {swaps.get(i)!.original}
                          {onUndoSwap && (
                            <button
                              className="link-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                onUndoSwap(i);
                              }}
                            >
                              Undo
                            </button>
                          )}
                        </span>
                      )}
                    </span>
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
        {onStartCooking && (
          <button className="btn primary cook-btn" onClick={onStartCooking}>
            Start cooking — one step at a time
          </button>
        )}
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
                      avoid={avoidedAt.has(seg.ingredient_index)}
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

      {onMade && (
        <div className="made-row">
          {made ? (
            <span className="small">
              <Icon name="check" size={16} /> Pantry updated for this meal ·{" "}
              <button className="link-btn small" onClick={made.onUndo}>
                Undo
              </button>
            </span>
          ) : (
            <button className="btn" onClick={onMade}>
              <Icon name="jar" size={18} /> I made this — update my pantry
            </button>
          )}
        </div>
      )}

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
      {myNotes}
      {!preview && feature("budget") && (() => {
        const c = recipeCost(original, scale);
        if (!c.priced) return null;
        const serves = realServings(original);
        return (
          <section className="cost-section">
            <h3>Cost</h3>
            <p className="small cost-line">
            Ingredients ≈ <strong>{dollars(c.total)}</strong>
            {serves ? ` · ${dollars(c.total / (serves * scale))} per serving` : ""}
            <span className="muted">
              {" "}
              (from prices you entered for {c.priced} of {c.of} ingredients{c.priced < c.of ? " — the rest aren't counted" : ""})
            </span>
            </p>
          </section>
        );
      })()}

      {extra}

      {conversions.length > 0 && (
        <section>
          <h3>Conversions</h3>
          <p className="muted small">
            Using a different form of an ingredient? Amounts are for the size shown above and are approximate — garlic
            cloves and onions vary.
          </p>
          <ul className="conversions">
            {conversions.map((c, i) => (
              <li key={i}>
                <div className="conv-title">{c.title}</div>
                {c.lines.map((l, j) => (
                  <div key={j} className="conv-line">
                    {l}
                  </div>
                ))}
                {c.rows && (
                  <table className="conv-table">
                    <tbody>
                      {c.rows.map((r) => (
                        <tr key={r.form} className={r.recipe ? "recipe-form" : undefined}>
                          <th scope="row">
                            {r.form}
                            {r.recipe && <span className="conv-recipe-tag">recipe</span>}
                          </th>
                          <td>
                            {r.amount}
                            {r.detail && <span className="conv-detail">{r.detail}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="conv-note">{c.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

const UNIT_CHOICES: [UnitSystem, string][] = [
  ["original", "As written"],
  ["us", "US"],
  ["metric", "Metric"],
];

/** Opens the recipe list filtered to one label. */
function showTagInLibrary(tag: string) {
  try {
    localStorage.setItem("recipe-builder.library.filter", tag);
  } catch {
    /* the list just opens unfiltered */
  }
}

function scaleLabel(scale: number): string {
  return SCALES.find(([v]) => v === scale)?.[1].replace("×", "") ?? String(scale);
}

/**
 * An ingredient inside a step, e.g. "the flour [2 cups]". Tapping it crosses it
 * off without marking the whole step done. It's a span (not a <button>) so long
 * names still wrap naturally across lines.
 */
export function IngredientMention(props: { text: string; amount: string | null; crossed: boolean; avoid?: boolean; onToggle: () => void }) {
  const { text, amount, crossed, avoid, onToggle } = props;
  return (
    <span
      className={["ing-mention", crossed && "crossed", avoid && "avoided"].filter(Boolean).join(" ")}
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
      {avoid && <span className="avoid-flag step-flag">Avoid</span>}
    </span>
  );
}
