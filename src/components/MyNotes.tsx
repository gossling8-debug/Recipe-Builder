import { useRef, useState } from "react";
import { compressPhoto } from "../lib/image";
import Icon from "./Icon";
import { agoText, lastMade, madeDays, madeToday, markMade, unmarkMadeToday } from "../lib/made";
import type { SavedRecipe } from "../lib/schema";

/** "Last made 2 weeks ago · 4 times", "Made it today", and the cook's own notes. */
export default function MyNotes({ recipe, onSaved }: { recipe: SavedRecipe; onSaved: (r: SavedRecipe) => Promise<void> }) {
  const [text, setText] = useState(recipe.myNotes ?? "");
  const [editing, setEditing] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError("");
    try {
      // Small enough to keep many on the phone and to sync, big enough for a nice thumbnail.
      await onSaved({ ...recipe, dishPhoto: await compressPhoto(file, 1000, 0.75) });
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : String(e));
    }
  }
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

      <div className="rating-row" role="group" aria-label="Your rating">
        <span className="small muted">Your rating</span>
        <span className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={n <= (recipe.rating ?? 0) ? "star-pick on" : "star-pick"}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              aria-pressed={recipe.rating === n}
              // Tapping the current rating again clears it.
              onClick={() => onSaved({ ...recipe, rating: recipe.rating === n ? undefined : n })}
            >
              <Icon name="star" size={24} filled={n <= (recipe.rating ?? 0)} />
            </button>
          ))}
        </span>
      </div>
      <div className="make-again" role="group" aria-label="Would you make it again?">
        {(
          [
            [true, "Would make again"],
            [false, "Wouldn't make again"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={label}
            className={recipe.makeAgain === v ? "tag on" : "tag"}
            aria-pressed={recipe.makeAgain === v}
            onClick={() => onSaved({ ...recipe, makeAgain: recipe.makeAgain === v ? undefined : v })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dish-photo-row">
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => (addPhoto(e.target.files?.[0]), (e.target.value = ""))} />
        {recipe.dishPhoto ? (
          <span className="small">
            <Icon name="camera" size={16} /> Your photo is at the top of the recipe ·{" "}
            <button className="link-btn small" onClick={() => fileInput.current?.click()}>
              Change
            </button>{" "}
            ·{" "}
            <button className="link-btn small" onClick={() => onSaved({ ...recipe, dishPhoto: undefined })}>
              Remove
            </button>
          </span>
        ) : (
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Icon name="camera" size={18} /> Add a photo of your dish
          </button>
        )}
        {photoError && <div className="callout error small">{photoError}</div>}
      </div>

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
