import { useEffect, useState } from "react";
import { createCookbook, myCookbooks, shareToCookbook, type Cookbook } from "../lib/family";
import { cloudState } from "../lib/cloud";
import type { SavedRecipe } from "../lib/schema";
import Icon from "./Icon";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The name you go by in your other cookbooks, to fill in for a new one. */
function nameInBooks(books: Cookbook[]): string {
  const uid = cloudState().uid;
  return (uid && books.map((b) => b.names[uid]).find(Boolean)) || "";
}

/**
 * Make a new cookbook right where you are (on a recipe, or after adding one).
 * onCreated gets the new cookbook; the caller decides what to put in it.
 */
export function NewCookbookForm(props: { books: Cookbook[]; onCreated: (book: Cookbook) => Promise<void> | void; onCancel: () => void; createLabel?: string }) {
  const [name, setName] = useState("");
  const known = nameInBooks(props.books);
  const [myName, setMyName] = useState(known);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const book = await createCookbook(name, myName);
      await props.onCreated(book);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }
  return (
    <div className="new-book-form">
      <label className="field">
        <span>New cookbook name</span>
        <input className="text-input" value={name} autoFocus placeholder="e.g. Weeknight Dinners" maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      {!known && (
        <label className="field">
          <span>Your name, as others will see it</span>
          <input className="text-input" value={myName} placeholder="e.g. Mom" maxLength={40} onChange={(e) => setMyName(e.target.value)} />
        </label>
      )}
      {error && <div className="callout error small">{error}</div>}
      <div className="button-row">
        <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>
          <Icon name="plus" size={18} /> {busy ? "Creating…" : props.createLabel ?? "Create cookbook"}
        </button>
        <button className="btn" disabled={busy} onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * After a new recipe is saved to your recipes: offers to add it to your family
 * cookbooks too. Closes by itself (onDone(0)) when you aren't in any.
 */
export function AddToBooksPrompt({ recipe, onDone }: { recipe: SavedRecipe; onDone: (added: number) => void }) {
  const [books, setBooks] = useState<Cookbook[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    myCookbooks().then(
      (bs) => (bs.length ? setBooks(bs) : onDone(0)),
      () => onDone(0),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!books) return null;

  async function add() {
    setBusy(true);
    setError("");
    let n = 0;
    try {
      for (const b of books!.filter((x) => picked.has(x.id))) {
        await shareToCookbook(b, recipe, recipe);
        n++;
      }
      onDone(n);
    } catch (e) {
      setError(`${n ? `Added to ${n}, then: ` : ""}${errText(e)}`);
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop">
      <div className="sheet add-to-book" role="dialog" aria-modal="true" aria-label="Add to a cookbook">
        <div className="sheet-title">Saved to your recipes</div>
        <p className="muted small">Add “{recipe.title}” to a cookbook too?</p>
        <ul className="pick-list">
          {books.map((b) => (
            <li key={b.id}>
              <label className="pick-row">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={picked.has(b.id)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(b.id)) n.delete(b.id);
                      else n.add(b.id);
                      return n;
                    })
                  }
                />
                <span className="pick-title">{b.name}</span>
              </label>
            </li>
          ))}
        </ul>
        {creating ? (
          <NewCookbookForm
            books={books}
            createLabel="Create and tick it"
            onCancel={() => setCreating(false)}
            onCreated={(b) => {
              setBooks([...books, b]);
              setPicked((s) => new Set(s).add(b.id));
              setCreating(false);
            }}
          />
        ) : (
          <button className="link-btn small new-book-link" disabled={busy} onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New cookbook
          </button>
        )}
        {error && <div className="callout error small">{error}</div>}
        <div className="button-row add-to-book-actions">
          <button className="btn primary" disabled={busy || picked.size === 0} onClick={add}>
            <Icon name="book" size={18} />{" "}
            {busy ? "Adding…" : picked.size ? `Add to ${picked.size} ${picked.size === 1 ? "cookbook" : "cookbooks"}` : "Choose cookbooks"}
          </button>
          <button className="btn" disabled={busy} onClick={() => onDone(0)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** After a new recipe is added straight into a cookbook: offers to keep a copy in your recipes. */
export function SaveToMinePrompt(props: { title: string; bookName: string; alreadyMine?: string; onAnswer: (save: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function answer(save: boolean) {
    setBusy(true);
    setError("");
    try {
      await props.onAnswer(save);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }
  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Save to your recipes">
        <div className="sheet-title">Added to {props.bookName}</div>
        <p>Save “{props.title}” to your own recipes too?</p>
        {props.alreadyMine && <p className="small dup-flag">You already have “{props.alreadyMine}” in your recipes.</p>}
        <p className="muted small">Your copy is yours to change, plan with and cook from. The cookbook's copy stays as it is.</p>
        {error && <div className="callout error small">{error}</div>}
        <div className="button-row add-to-book-actions">
          <button className="btn" disabled={busy} onClick={() => answer(true)}>
            {busy ? "Saving…" : "Save to my recipes"}
          </button>
          <button className="btn primary" disabled={busy} onClick={() => answer(false)}>
            No, just the cookbook
          </button>
        </div>
      </div>
    </div>
  );
}

export interface DuplicateMatch {
  title: string;
  /** e.g. "in your recipes", "in Grandma Carlson, shared by you" */
  where: string;
}

/** Right after a recipe is read, before it's saved: it looks like one that's already there. */
export function DuplicatePrompt(props: { title: string; matches: DuplicateMatch[]; onAddAnyway: () => Promise<void>; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Possible duplicate">
        <div className="sheet-title">Already have this one?</div>
        <p>“{props.title}” looks like:</p>
        <ul className="dup-matches">
          {props.matches.slice(0, 3).map((m, i) => (
            <li key={i}>
              <strong>{m.title}</strong> <span className="muted small">{m.where}</span>
            </li>
          ))}
        </ul>
        {error && <div className="callout error small">{error}</div>}
        <div className="button-row add-to-book-actions">
          <button className="btn primary" disabled={busy} onClick={props.onSkip}>
            Don't add it
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await props.onAddAnyway();
              } catch (e) {
                setError(errText(e));
                setBusy(false);
              }
            }}
          >
            {busy ? "Adding…" : "Add anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
