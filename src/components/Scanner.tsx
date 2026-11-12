import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { compressPhoto, stripDataUrl } from "../lib/image";
import { newId, saveRecipe, storageErrorMessage } from "../lib/db";
import TagPicker from "./TagPicker";
import { cleanTags } from "../lib/schema";
import { href, navigate } from "../lib/route";
import { getApiKey, aiReady } from "../lib/settings";
import { getModel } from "../lib/models";
import type { RecipeSource } from "../lib/claude";

const MAX_PHOTOS = 4;
type Mode = "photo" | "url" | "text";

const MODES: { value: Mode; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "url", label: "Website" },
  { value: "text", label: "Paste text" },
];

/** Add a recipe from card photos, a web page, or pasted/typed text. */
export default function Scanner() {
  const [mode, setMode] = useState<Mode>("photo");
  const [photos, setPhotos] = useState<string[]>([]);
  // Labels picked before reading; if none, Claude's suggestions are used.
  const [tags, setTags] = useState<string[]>([]);
  const [showTags, setShowTags] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const apiKey = getApiKey();
  const model = getModel();

  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      const added = await Promise.all(Array.from(files).map((f) => compressPhoto(f)));
      setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const cleanUrl = (() => {
    const u = url.trim();
    if (!u) return "";
    const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    try {
      const parsed = new URL(withScheme);
      return parsed.hostname.includes(".") ? parsed.href : "";
    } catch {
      return "";
    }
  })();

  const ready = mode === "photo" ? photos.length > 0 : mode === "url" ? !!cleanUrl : text.trim().length > 20;

  async function read() {
    setBusy(true);
    setError("");
    try {
      const source: RecipeSource =
        mode === "photo"
          ? { kind: "photos", photos: photos.map(stripDataUrl) }
          : mode === "url"
            ? { kind: "url", url: cleanUrl }
            : { kind: "text", text: text.trim() };
      // The Claude SDK is loaded only when needed, so the library opens fast.
      const { importRecipe } = await import("../lib/claude");
      const { recipe, usage } = await importRecipe(apiKey, source);
      if (recipe.steps.length === 0 && recipe.ingredients.length === 0) {
        throw new Error(recipe.warnings[0] ?? "No recipe was found there.");
      }
      const id = newId();
      // Smaller copies for the library so storage doesn't fill up.
      const thumbs =
        mode === "photo"
          ? await Promise.all(photos.map((p) => fetch(p).then((r) => r.blob()).then((b) => compressPhoto(b, 1200, 0.7))))
          : [];
      await saveRecipe({
        ...recipe,
        tags: tags.length ? cleanTags(tags) : recipe.tags,
        id,
        createdAt: Date.now(),
        photos: thumbs,
        source: mode === "url" ? cleanUrl : undefined,
        importCost: usage.cost,
      });
      navigate({ name: "recipe", id }, true);
    } catch (e) {
      setError(e instanceof DOMException ? storageErrorMessage(e) : e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!aiReady()) {
    return (
      <>
        <Header title="Add a recipe" back={href({ name: "library" })} />
        <main className="page">
          <div className="callout">
            Reading recipes uses Claude, which needs your Anthropic API key.{" "}
            <a href={href({ name: "settings" })}>Add it in Settings</a>.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Add a recipe" back={busy ? undefined : href({ name: "library" })} />
      <main className="page">
        {busy ? (
          <div className="working" role="status">
            <div className="spinner" aria-hidden />
            <p>
              <strong>{mode === "url" ? "Reading the web page…" : "Reading your recipe…"}</strong>
            </p>
            <p className="muted">
              Claude is reading it and matching each ingredient to the step where it's used. This usually takes 20–60
              seconds. ({seconds}s)
            </p>
          </div>
        ) : (
          <>
            <div className="segmented mode-switch" role="tablist" aria-label="Add from">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  role="tab"
                  aria-selected={mode === m.value}
                  className={mode === m.value ? "chip active" : "chip"}
                  onClick={() => {
                    setMode(m.value);
                    setError("");
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "photo" && (
              <>
                <p className="muted">
                  Lay the card flat in good light and fill the frame. If the recipe continues on the back, add a second
                  photo.
                </p>
                {photos.length > 0 && (
                  <ul className="photo-grid">
                    {photos.map((p, i) => (
                      <li key={i}>
                        <img src={p} alt={`Photo ${i + 1}`} />
                        <button
                          className="remove"
                          aria-label={`Remove photo ${i + 1}`}
                          onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {photos.length < MAX_PHOTOS && (
                  <div className="button-row">
                    <button className="btn" onClick={() => cameraInput.current?.click()}>
                      <Icon name="camera" /> {photos.length ? "Add another photo" : "Take photo"}
                    </button>
                    <button className="btn" onClick={() => libraryInput.current?.click()}>
                      <Icon name="image" /> Choose from photos
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === "url" && (
              <>
                <p className="muted">
                  Copy the address of a recipe page (in your browser: Share → Copy) and paste it here. Claude skips the
                  story and ads and keeps just the recipe.
                </p>
                <input
                  className="text-input"
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                {url.trim() && !cleanUrl && <p className="small" style={{ color: "var(--error)" }}>That doesn't look like a web address.</p>}
              </>
            )}

            {mode === "text" && (
              <>
                <p className="muted">
                  Paste a recipe from a message, email or note — or type one in. The cheapest way to add a recipe.
                </p>
                <textarea
                  className="text-input"
                  rows={12}
                  placeholder={"Grandma's Sugar Cookies\n\n1 cup butter\n1 1/2 cups sugar\n…\n\nCream the butter and 1 cup of the sugar…"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </>
            )}

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={libraryInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              data-testid="library-input"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <section className="scan-labels">
              {showTags || tags.length ? (
                <>
                  <h3>Labels</h3>
                  <p className="muted small">Pick labels for this recipe, or leave them all off and Claude will suggest some.</p>
                  <TagPicker tags={tags} onChange={setTags} />
                </>
              ) : (
                <button className="link-btn small" onClick={() => setShowTags(true)}>
                  <Icon name="plus" size={14} /> Choose labels (optional — Claude suggests some if you skip this)
                </button>
              )}
            </section>
            {error && <div className="callout error">{error}</div>}
            <p className="muted small">
              Using the {model.label.toLowerCase()} reader ({model.blurb.split(" — ")[0]}). Change it in{" "}
              <a href={href({ name: "settings" })}>Settings</a>.
            </p>
          </>
        )}
      </main>
      {!busy && ready && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={read}>
            Read recipe
          </button>
        </div>
      )}
    </>
  );
}
