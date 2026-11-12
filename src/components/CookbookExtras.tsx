import { useEffect, useRef, useState } from "react";
import { addMemory, bookMemories, deleteMemory, getCover, MAX_MEMORY_PHOTOS, memoryPhotos, saveCover, type Cookbook, type Cover, type Memory, type SharedRecipe } from "../lib/family";
import { compressPhoto, prepareCrop, type CropSource } from "../lib/image";
import CropEditor from "./CropEditor";
import DocumentScanner from "./DocumentScanner";
import { href } from "../lib/route";
import { aiReady, getApiKey } from "../lib/settings";
import Icon from "./Icon";

/** Keeps a photo small enough to share in a cookbook (Firestore documents are capped at 1 MB). */
async function fitForBook(url: string): Promise<string> {
  if (url.length <= 650_000) return url;
  const smaller = await compressPhoto(await (await fetch(url)).blob(), 800, 0.6);
  if (smaller.length > 650_000) throw new Error("That photo is too large. Try another one.");
  return smaller;
}

/** Two ways in: "Scan a page" (find edges, crop, straighten) or "Add a photo" (as it is). */
function PhotoPicker({
  photo,
  onChange,
  scanLabel,
  photoLabel,
  cleanByDefault = true,
}: {
  photo: string | null;
  onChange: (p: string | null) => void;
  scanLabel: string;
  photoLabel: string;
  cleanByDefault?: boolean;
}) {
  const scanInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState<CropSource | null>(null);
  const [scanning, setScanning] = useState(false);
  const [noCamera, setNoCamera] = useState("");
  const take = (scan: boolean) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (scan) setCropping(await prepareCrop(file));
      else onChange(await fitForBook(await compressPhoto(file, 1100, 0.72)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };
  return (
    <div className="photo-picker">
      {photo && <img src={photo} alt="" />}
      <div className="button-row">
        <button type="button" className="btn" disabled={busy} onClick={() => (setNoCamera(""), setScanning(true))}>
          <Icon name="camera" size={18} /> {scanLabel}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => photoInput.current?.click()}>
          <Icon name="image" size={18} /> {photoLabel}
        </button>
      </div>
      {photo && (
        <button type="button" className="link-btn small" onClick={() => onChange(null)}>
          Remove photo
        </button>
      )}
      <input ref={scanInput} type="file" accept="image/*" hidden data-testid="scan-page-input" onChange={take(true)} />
      <input ref={photoInput} type="file" accept="image/*" hidden data-testid="add-photo-input" onChange={take(false)} />
      {busy && !cropping && <p className="muted small">Working on the photo…</p>}
      {noCamera && (
        <p className="small">
          {noCamera}{" "}
          <button type="button" className="link-btn small" onClick={() => scanInput.current?.click()}>
            Choose a photo of the page instead
          </button>
        </p>
      )}
      {scanning && (
        <DocumentScanner
          cleanByDefault={cleanByDefault}
          maxEdge={1100}
          quality={0.72}
          onCancel={() => setScanning(false)}
          onNoCamera={(why) => {
            setScanning(false);
            setNoCamera(why);
          }}
          onDone={async ([page]) => {
            setScanning(false);
            try {
              if (page) onChange(await fitForBook(page.photo));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}
      {cropping && (
        <CropEditor
          source={cropping}
          maxEdge={1100}
          quality={0.72}
          cancelLabel="Don't use this scan"
          onCancel={() => setCropping(null)}
          onDone={async (scanned) => {
            setCropping(null);
            try {
              onChange(await fitForBook(scanned));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}
      {error && <p className="small error-text">{error}</p>}
    </div>
  );
}

// ---------- cover page ----------
export function CookbookCover({ book, isOwner }: { book: Cookbook; isOwner: boolean }) {
  const [cover, setCover] = useState<Cover | null | undefined>(undefined);
  const [editing, setEditing] = useState<Cover | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    getCover(book.id).then(setCover, () => setCover(null));
  }, [book.id]);

  if (editing) {
    return (
      <section className="book-cover editing">
        <h3>Cover page</h3>
        <PhotoPicker
          photo={editing.photo}
          onChange={(photo) => setEditing({ ...editing, photo })}
          scanLabel={editing.photo ? "Scan a new page" : "Scan our cover page"}
          cleanByDefault={false}
          photoLabel={editing.photo ? "Use a different photo" : "Add a cover photo"}
        />
        {editing.photo && (
          <label className="check-line cover-photo-only">
            <input type="checkbox" checked={!!editing.photoOnly} onChange={(e) => setEditing({ ...editing, photoOnly: e.target.checked })} />
            <span>This photo is our cover page — show just the photo</span>
          </label>
        )}
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
  const startEdit = () =>
    setEditing({ subtitle: cover?.subtitle ?? "", dedication: cover?.dedication ?? "", photo: cover?.photo ?? null, photoOnly: cover?.photoOnly ?? false });
  if (cover?.photo && cover.photoOnly) {
    // A photo of the family's own cover page is the cover.
    return (
      <section className="book-cover photo-only">
        <button className="cover-photo-btn" onClick={() => setViewing(true)} aria-label="View the cover full size">
          <img className="cover-page-photo" src={cover.photo} alt={`Cover of ${book.name}`} />
        </button>
        {isOwner && (
          <button className="link-btn small cover-edit" onClick={startEdit}>
            Edit cover
          </button>
        )}
        {viewing && <CoverViewer photo={cover.photo} name={book.name} onClose={() => setViewing(false)} />}
      </section>
    );
  }
  return (
    <section className={cover?.photo ? "book-cover with-photo" : "book-cover"}>
      {cover?.photo && (
        <button className="cover-photo-btn" onClick={() => setViewing(true)} aria-label="View the cover photo full size">
          <img className="cover-photo" src={cover.photo} alt="" />
        </button>
      )}
      <div className="cover-text">
        <h2 className="cover-title">{book.name}</h2>
        {cover?.subtitle && <p className="cover-subtitle">{cover.subtitle}</p>}
        {cover?.dedication && <p className="cover-dedication">{cover.dedication}</p>}
        {isOwner && (
          <button className="link-btn small cover-edit" onClick={startEdit}>
            {empty ? "Add a cover page — photo, subtitle and dedication" : "Edit cover"}
          </button>
        )}
      </div>
      {viewing && cover?.photo && <CoverViewer photo={cover.photo} name={book.name} onClose={() => setViewing(false)} />}
    </section>
  );
}

function CoverViewer({ photo, name, onClose }: { photo: string; name: string; onClose: () => void }) {
  return (
    <div className="memory-viewer" role="dialog" aria-modal="true" aria-label="Cover">
      <div className="memory-viewer-bar">
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <span>{name}</span>
        <span className="icon-btn placeholder" aria-hidden />
      </div>
      <div className="memory-viewer-body">
        <img src={photo} alt={`Cover of ${name}`} />
      </div>
    </div>
  );
}

// ---------- memories ----------
const monthYear = (ms: number) => new Date(ms).toLocaleDateString([], { month: "long", year: "numeric" });

/** Several photos for one memory: scan written pages (one after another) or pick photos. */
function MultiPhotoPicker({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [noCamera, setNoCamera] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const room = MAX_MEMORY_PHOTOS - photos.length;
  const add = (more: string[]) => onChange([...photos, ...more].slice(0, MAX_MEMORY_PHOTOS));
  return (
    <div className="multi-photos">
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p, i) => (
            <li key={i}>
              <img src={p} alt={`Photo ${i + 1}`} />
              <button type="button" className="remove" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}>
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {room > 0 ? (
        <div className="button-row">
          <button type="button" className="btn" disabled={busy} onClick={() => (setNoCamera(""), setScanning(true))}>
            <Icon name="camera" size={18} /> {photos.length ? "Scan more pages" : "Scan written pages"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="image" size={18} /> {photos.length ? "Add more photos" : "Add photos"}
          </button>
        </div>
      ) : (
        <p className="muted small">That's the most photos for one memory ({MAX_MEMORY_PHOTOS}).</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="memory-photos-input"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []).slice(0, room);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setError("");
          try {
            add(await Promise.all(files.map(async (f) => fitForBook(await compressPhoto(f, 1100, 0.72)))));
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
          setBusy(false);
        }}
      />
      {busy && <p className="muted small">Adding photos…</p>}
      {noCamera && (
        <p className="small">
          {noCamera}{" "}
          <button type="button" className="link-btn small" onClick={() => input.current?.click()}>
            Choose photos instead
          </button>
        </p>
      )}
      {scanning && (
        <DocumentScanner
          multiPage
          cleanByDefault
          maxEdge={1100}
          quality={0.72}
          onCancel={() => setScanning(false)}
          onNoCamera={(why) => {
            setScanning(false);
            setNoCamera(why);
          }}
          onDone={async (pages) => {
            setScanning(false);
            try {
              add(await Promise.all(pages.map((pg) => fitForBook(pg.photo))));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      )}
      {error && <p className="small error-text">{error}</p>}
    </div>
  );
}

/** A memory card's preview: its first photo (with a page count), or nothing for text-only memories. */
function MemoryCover({ bookId, memory }: { bookId: string; memory: Memory }) {
  const count = memory.photoCount ?? (memory.photo ? 1 : 0);
  const [first, setFirst] = useState<string | null>(memory.photoCount ? null : memory.photo);
  useEffect(() => {
    if (memory.photoCount) memoryPhotos(bookId, { ...memory, photoCount: 1 }).then((ps) => setFirst(ps[0] ?? null), () => {});
  }, [bookId, memory]);
  if (!count) return null;
  return (
    <span className="memory-cover">
      {first ? <img src={first} alt="" /> : <span className="memory-cover-loading" />}
      {count > 1 && <span className="memory-pages">{count} pages</span>}
    </span>
  );
}

/** One memory: its photos load on their own (each is a separate document). */
function MemoryPhotos({ bookId, memory }: { bookId: string; memory: Memory }) {
  const [photos, setPhotos] = useState<string[] | null>(memory.photoCount ? null : memory.photo ? [memory.photo] : []);
  useEffect(() => {
    if (memory.photoCount) memoryPhotos(bookId, memory).then(setPhotos, () => setPhotos([]));
  }, [bookId, memory]);
  if (photos === null) return <p className="muted small">Loading {memory.photoCount === 1 ? "photo" : "photos"}…</p>;
  return (
    <>
      {photos.map((p, i) => (
        <img key={i} src={p} alt={memory.text ? "" : `A memory from ${memory.byName}${photos.length > 1 ? `, page ${i + 1}` : ""}`} />
      ))}
    </>
  );
}

export function CookbookMemories({
  book,
  recipes,
  myUid,
  isOwner,
  onCount,
}: {
  book: Cookbook;
  recipes: SharedRecipe[];
  myUid: string;
  isOwner: boolean;
  onCount?: (n: number) => void;
}) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [open, setOpen] = useState<Memory | null>(null);
  useEffect(() => {
    if (memories) onCount?.(memories.length);
  }, [memories, onCount]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  async function typeItOut() {
    if (!photos.length) return;
    setReading(true);
    setError("");
    try {
      const { transcribePage } = await import("../lib/transcribe");
      // Page by page, in order.
      const pages: string[] = [];
      for (const p of photos) {
        const written = await transcribePage(getApiKey(), p);
        if (written) pages.push(written);
      }
      const written = pages.join("\n\n").slice(0, 2000);
      if (written) setText((t) => (t.trim() ? `${t.trim()}\n\n${written}` : written).slice(0, 2000));
      else setError("No writing was found in those photos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setReading(false);
  }
  const load = () => bookMemories(book.id).then(setMemories, (e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await addMemory(book, { text, photos, recipe: recipes.find((r) => r.id === recipeId) ?? null });
      setText("");
      setPhotos([]);
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
      {adding ? (
        <div className="memory-form">
          <MultiPhotoPicker photos={photos} onChange={setPhotos} />
          {photos.length > 0 && aiReady() && (
            <button type="button" className="link-btn small" disabled={reading} onClick={typeItOut}>
              {reading ? "Reading…" : photos.length > 1 ? "Type out the writing in these photos" : "Type out the writing in this photo"}
            </button>
          )}
          <textarea
            className="text-input"
            rows={4}
            maxLength={2000}
            placeholder={photos.length ? "Add words, or leave empty to share just the photos" : "Grandma made this every Christmas Eve…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
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
            <button className="btn primary" disabled={busy || reading || (!text.trim() && photos.length === 0)} onClick={save}>
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
      {memories?.length === 0 && !adding && <p className="muted small">Stories, photos and moments around the table — the things that make these recipes family.</p>}
      <ul className="memory-grid">
        {(memories ?? []).map((m) => (
          <li key={m.id}>
            <button className="memory-card" onClick={() => setOpen(m)}>
              <MemoryCover bookId={book.id} memory={m} />
              {m.text && <span className="memory-snippet">{m.text}</span>}
              <span className="muted small memory-by">
                {m.by === myUid ? "You" : m.byName}, {monthYear(m.at)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="memory-viewer" role="dialog" aria-modal="true" aria-label="Memory">
          <div className="memory-viewer-bar">
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(null)}>
              <Icon name="close" />
            </button>
            <span>{open.by === myUid ? "Your memory" : `${open.byName}'s memory`}</span>
            <span className="icon-btn placeholder" aria-hidden />
          </div>
          <div className="memory-viewer-body">
            <MemoryPhotos bookId={book.id} memory={open} />
            {open.text && <p className="memory-text">{open.text}</p>}
            <p className="muted small">
              — {open.by === myUid ? "You" : open.byName}, {monthYear(open.at)}
              {open.recipeId && open.recipeTitle && (
                <>
                  {" "}· about <a href={href({ name: "family", book: book.id, recipe: open.recipeId })}>{open.recipeTitle}</a>
                </>
              )}
            </p>
            {(open.by === myUid || isOwner) && (
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm("Delete this memory?")) return;
                  try {
                    await deleteMemory(book.id, open);
                    setMemories((xs) => xs && xs.filter((x) => x.id !== open.id));
                    setOpen(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                Delete memory
              </button>
            )}
          </div>
        </div>
      )}
      {error && <div className="callout error small">{error}</div>}
    </section>
  );
}
