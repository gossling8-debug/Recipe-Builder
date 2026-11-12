import { useEffect, useRef, useState } from "react";
import { addMemory, bookMemories, deleteMemory, getCover, saveCover, type Cookbook, type Cover, type Memory, type SharedRecipe } from "../lib/family";
import { compressPhoto } from "../lib/image";
import { href } from "../lib/route";
import Icon from "./Icon";

/** A photo small enough to share in a cookbook (Firestore documents are capped at 1 MB). */
async function bookPhoto(file: File): Promise<string> {
  let url = await compressPhoto(file, 1100, 0.72);
  if (url.length > 650_000) url = await compressPhoto(file, 800, 0.6);
  if (url.length > 650_000) throw new Error("That photo is too large. Try another one.");
  return url;
}

function PhotoPicker({ photo, onChange, label }: { photo: string | null; onChange: (p: string | null) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return (
    <div className="photo-picker">
      {photo && <img src={photo} alt="" />}
      <div className="button-row">
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          <Icon name="image" size={18} /> {photo ? "Change photo" : label}
        </button>
        {photo && (
          <button type="button" className="link-btn small" onClick={() => onChange(null)}>
            Remove photo
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError("");
          try {
            onChange(await bookPhoto(file));
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      {error && <p className="small error-text">{error}</p>}
    </div>
  );
}

// ---------- cover page ----------
export function CookbookCover({ book, isOwner }: { book: Cookbook; isOwner: boolean }) {
  const [cover, setCover] = useState<Cover | null | undefined>(undefined);
  const [editing, setEditing] = useState<Cover | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    getCover(book.id).then(setCover, () => setCover(null));
  }, [book.id]);

  if (editing) {
    return (
      <section className="book-cover editing">
        <h3>Cover page</h3>
        <PhotoPicker photo={editing.photo} onChange={(photo) => setEditing({ ...editing, photo })} label="Add a cover photo" />
        <label className="field">
          <span>Subtitle</span>
          <input className="text-input" maxLength={120} placeholder="Recipes from the Smith kitchen" value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
        </label>
        <label className="field">
          <span>Dedication</span>
          <textarea className="text-input" rows={3} maxLength={1000} placeholder="For Grandma, who taught us all to cook." value={editing.dedication} onChange={(e) => setEditing({ ...editing, dedication: e.target.value })} />
        </label>
        <div className="button-row">
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await saveCover(book.id, editing);
                setCover({ ...editing, updatedAt: Date.now() });
                setEditing(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
              setBusy(false);
            }}
          >
            {busy ? "Saving…" : "Save cover"}
          </button>
          <button className="btn" disabled={busy} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
        {error && <div className="callout error small">{error}</div>}
      </section>
    );
  }

  const empty = !cover || (!cover.photo && !cover.subtitle && !cover.dedication);
  if (cover === undefined || (empty && !isOwner)) return null;
  return (
    <section className={cover?.photo ? "book-cover with-photo" : "book-cover"}>
      {cover?.photo && <img className="cover-photo" src={cover.photo} alt="" />}
      <div className="cover-text">
        <h2 className="cover-title">{book.name}</h2>
        {cover?.subtitle && <p className="cover-subtitle">{cover.subtitle}</p>}
        {cover?.dedication && <p className="cover-dedication">{cover.dedication}</p>}
      </div>
      {isOwner && (
        <button className="link-btn small cover-edit" onClick={() => setEditing({ subtitle: cover?.subtitle ?? "", dedication: cover?.dedication ?? "", photo: cover?.photo ?? null })}>
          {empty ? "Add a cover page — photo, subtitle and dedication" : "Edit cover"}
        </button>
      )}
    </section>
  );
}

// ---------- memories ----------
const monthYear = (ms: number) => new Date(ms).toLocaleDateString([], { month: "long", year: "numeric" });

export function CookbookMemories({ book, recipes, myUid, isOwner }: { book: Cookbook; recipes: SharedRecipe[]; myUid: string; isOwner: boolean }) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = () => bookMemories(book.id).then(setMemories, (e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await addMemory(book, { text, photo, recipe: recipes.find((r) => r.id === recipeId) ?? null });
      setText("");
      setPhoto(null);
      setRecipeId("");
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <section className="book-memories">
      <h2 className="list-heading">Memories</h2>
      {memories?.length === 0 && !adding && <p className="muted small">Stories, photos and moments around the table — the things that make these recipes family.</p>}
      <ul className="memory-list">
        {(memories ?? []).map((m) => (
          <li key={m.id} className="memory">
            {m.photo && <img src={m.photo} alt="" />}
            <p className="memory-text">{m.text}</p>
            <p className="muted small">
              — {m.by === myUid ? "You" : m.byName}, {monthYear(m.at)}
              {m.recipeId && m.recipeTitle && (
                <>
                  {" "}· about <a href={href({ name: "family", book: book.id, recipe: m.recipeId })}>{m.recipeTitle}</a>
                </>
              )}
              {(m.by === myUid || isOwner) && (
                <>
                  {" "}·{" "}
                  <button
                    className="link-btn small"
                    onClick={async () => {
                      if (!confirm("Delete this memory?")) return;
                      try {
                        await deleteMemory(book.id, m.id);
                        setMemories((xs) => xs && xs.filter((x) => x.id !== m.id));
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="memory-form">
          <textarea className="text-input" rows={4} maxLength={2000} placeholder="Grandma made this every Christmas Eve…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <PhotoPicker photo={photo} onChange={setPhoto} label="Add a photo" />
          {recipes.length > 0 && (
            <label className="field">
              <span>About a recipe (optional)</span>
              <select className="text-input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                <option value="">—</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.recipe.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="button-row">
            <button className="btn primary" disabled={busy || !text.trim()} onClick={save}>
              {busy ? "Saving…" : "Add memory"}
            </button>
            <button className="btn" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="button-row">
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Add a memory
          </button>
        </div>
      )}
      {error && <div className="callout error small">{error}</div>}
    </section>
  );
}
