import { useState } from "react";
import Icon from "./Icon";
import { agoText, lastMade, madeDays, madeToday, markMade, unmarkMadeToday } from "../lib/made";
import type { SavedRecipe } from "../lib/schema";

/** "Last made 2 weeks ago · 4 times", "Made it today", and the cook's own notes. */
export default function MyNotes({ recipe, onSaved }: { recipe: SavedRecipe; onSaved: (r: SavedRecipe) => Promise<void> }) {
  const [text, setText] = useState(recipe.myNotes ?? "");
  const [editing, setEditing] = useState(false);
  const days = madeDays(recipe);
  const last = lastMade(recipe);
  const today = madeToday(recipe);

  async function saveNotes() {
    const clean = text.trim();
    setEditing(false);
    if (clean === (recipe.myNotes ?? "")) return;
    await onSaved({ ...recipe, myNotes: clean || undefined });
  }

  return (
    <section className="my-notes">
      <h3>My notes</h3>
      <p className="small made-line">
        {last === undefined ? (
          <span className="muted">Not made yet.</span>
        ) : (
          <span>
            Last made <strong>{agoText(last)}</strong>
            {days.length > 1 && <span className="muted"> · made {days.length} times</span>}
          </span>
        )}{" "}
        {today ? (
          // Only a mark made here can be undone; a time logged in cooking mode stays.
          madeToday({ madeOn: recipe.madeOn }) && (
            <button className="link-btn small" onClick={() => onSaved(unmarkMadeToday(recipe))}>
              Undo today
            </button>
          )
        ) : (
          <button className="btn made-btn" onClick={() => onSaved(markMade(recipe))}>
            <Icon name="check" size={16} /> Made it today
          </button>
        )}
      </p>

      {editing ? (
        <>
          <textarea
            className="text-input notes-input"
            autoFocus
            rows={4}
            placeholder="e.g. Used half the sugar — still sweet enough. Kids loved it."
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="My notes"
          />
          <div className="button-row">
            <button
              className="btn"
              onClick={() => {
                setText(recipe.myNotes ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
            <button className="btn primary" onClick={saveNotes}>
              Save notes
            </button>
          </div>
        </>
      ) : recipe.myNotes ? (
        <>
          <p className="notes my-notes-text">{recipe.myNotes}</p>
          <button className="link-btn small" onClick={() => setEditing(true)}>
            Edit notes
          </button>
        </>
      ) : (
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" size={18} /> Add a note
        </button>
      )}
    </section>
  );
}
