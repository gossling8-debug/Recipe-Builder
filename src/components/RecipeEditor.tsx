import { useState } from "react";
import { fieldsToIngredient, ingredientToFields, stepToText, textToStep } from "../lib/edit";
import { cleanTags, sanitizeRecipe, type SavedRecipe } from "../lib/schema";
import Icon from "./Icon";
import TagPicker from "./TagPicker";

interface Row {
  key: number;
  amount: string;
  name: string;
  section: string | null;
}

let nextKey = 1;

/** Edit every part of a recipe. Steps are edited as text with [ingredient: amount] tags. */
export default function RecipeEditor(props: {
  recipe: SavedRecipe;
  onSave: (r: SavedRecipe) => Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { recipe } = props;
  const [title, setTitle] = useState(recipe.title);
  const [servings, setServings] = useState(recipe.servings ?? "");
  const [time, setTime] = useState(recipe.time ?? "");
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [keepWarnings, setKeepWarnings] = useState(true);
  const [tags, setTags] = useState<string[]>(recipe.tags ?? []);
  const [rows, setRows] = useState<Row[]>(() =>
    recipe.ingredients.map((ing) => ({ key: nextKey++, ...ingredientToFields(ing), section: ing.section })),
  );
  const [steps, setSteps] = useState<string[]>(() => recipe.steps.map(stepToText));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setStep = (i: number, text: string) => setSteps((ss) => ss.map((s, j) => (j === i ? text : s)));
  const moveStep = (i: number, d: -1 | 1) =>
    setSteps((ss) => {
      const j = i + d;
      if (j < 0 || j >= ss.length) return ss;
      const next = [...ss];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    const ingredients = rows
      .filter((r) => r.name.trim() || r.amount.trim())
      .map((r) => fieldsToIngredient(r.amount, r.name, r.section));
    const edited = sanitizeRecipe({
      title,
      servings: servings.trim() || null,
      time: time.trim() || null,
      notes: notes.trim() || null,
      warnings: keepWarnings ? recipe.warnings : [],
      tags: cleanTags(tags),
      ingredients,
      steps: steps.filter((s) => s.trim()).map((s) => textToStep(s.trim(), ingredients)),
    });
    setSaving(true);
    setError("");
    try {
      await props.onSave({ ...recipe, ...edited });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <label className="field">
        <span>Title</span>
        <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Servings</span>
          <input className="text-input" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="e.g. 4" />
        </label>
        <label className="field">
          <span>Time / temp</span>
          <input className="text-input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 350°F, 25 min" />
        </label>
      </div>

      <h3>Labels</h3>
      <p className="muted small">Tap to add or remove. Labels let you filter your recipes, and a Dinner label lets “Fill my week” pick it.</p>
      <TagPicker tags={tags} onChange={setTags} />

      <h3>Ingredients</h3>
      <p className="muted small">Each ingredient has its amount on top and its name below. Add notes after a comma: “butter, softened”.</p>
      <ul className="edit-list">
        {rows.map((r) => (
          <li key={r.key} className="ing-row">
            <input
              className="text-input amount-input"
              aria-label="Amount"
              placeholder="1 cup"
              value={r.amount}
              onChange={(e) => setRow(r.key, { amount: e.target.value })}
            />
            <input
              className="text-input"
              aria-label="Ingredient"
              placeholder="flour"
              value={r.name}
              onChange={(e) => setRow(r.key, { name: e.target.value })}
            />
            <button className="icon-btn small-btn" aria-label="Remove ingredient" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Icon name="close" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <button
        className="btn"
        onClick={() => setRows((rs) => [...rs, { key: nextKey++, amount: "", name: "", section: rs[rs.length - 1]?.section ?? null }])}
      >
        <Icon name="plus" size={18} /> Add ingredient
      </button>

      <h3>Instructions</h3>
      <p className="muted small">
        Put ingredients in square brackets with the amount after a colon, like <code>[the flour: 2 cups]</code>. That's what
        shows the amount in the step and lets you cross it off. The name in brackets must match an ingredient above.
      </p>
      <ol className="edit-list">
        {steps.map((s, i) => (
          <li key={i} className="step-edit">
            <div className="step-edit-head">
              <strong>Step {i + 1}</strong>
              <span>
                <button className="icon-btn small-btn" aria-label="Move step up" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                  <Icon name="up" size={18} />
                </button>
                <button
                  className="icon-btn small-btn"
                  aria-label="Move step down"
                  disabled={i === steps.length - 1}
                  onClick={() => moveStep(i, 1)}
                >
                  <Icon name="down" size={18} />
                </button>
                <button className="icon-btn small-btn" aria-label="Remove step" onClick={() => setSteps((ss) => ss.filter((_, j) => j !== i))}>
                  <Icon name="close" size={18} />
                </button>
              </span>
            </div>
            <textarea className="text-input" rows={4} value={s} onChange={(e) => setStep(i, e.target.value)} />
          </li>
        ))}
      </ol>
      <button className="btn" onClick={() => setSteps((ss) => [...ss, ""])}>
        <Icon name="plus" size={18} /> Add step
      </button>

      <h3>Notes</h3>
      <textarea className="text-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      {recipe.warnings.length > 0 && (
        <label className="check-line">
          <input type="checkbox" checked={!keepWarnings} onChange={(e) => setKeepWarnings(!e.target.checked)} />
          <span>I've checked it — remove the “Double-check” notes</span>
        </label>
      )}

      {error && <div className="callout error">{error}</div>}
      <div className="danger-zone">
        <button className="btn danger" onClick={props.onDelete} disabled={saving}>
          <Icon name="trash" size={18} /> Delete this recipe
        </button>
      </div>
      <p className="muted small">Saving clears this recipe's checkmarks. If you change the ingredients, chosen substitutes are cleared too.</p>
      <div className="fab-bar">
        <div className="button-row">
          <button className="btn" onClick={props.onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

