import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import { compressPhoto, stripDataUrl } from "../lib/image";
import { isStorageBlocked, newId, saveRecipe, STORAGE_BLOCKED_HELP } from "../lib/db";
import { href, navigate } from "../lib/route";
import { getApiKey } from "../lib/settings";

const MAX_PHOTOS = 4;

export default function Scanner() {
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const apiKey = getApiKey();

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

  async function read() {
    setBusy(true);
    setError("");
    try {
      // The Claude SDK is loaded only when scanning, so the library opens fast.
      const { scanRecipe } = await import("../lib/claude");
      const recipe = await scanRecipe(apiKey, photos.map(stripDataUrl));
      if (recipe.steps.length === 0 && recipe.ingredients.length === 0) {
        throw new Error(recipe.warnings[0] ?? "No recipe was found in that photo.");
      }
      const id = newId();
      // Smaller copies for the library so storage doesn't fill up.
      const thumbs = await Promise.all(photos.map((p) => fetch(p).then((r) => r.blob()).then((b) => compressPhoto(b, 1200, 0.7))));
      await saveRecipe({ ...recipe, id, createdAt: Date.now(), photos: thumbs });
      navigate({ name: "recipe", id }, true);
    } catch (e) {
      setError(isStorageBlocked(e) ? STORAGE_BLOCKED_HELP : e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!apiKey) {
    return (
      <>
        <Header title="Scan" back={href({ name: "library" })} />
        <main className="page">
          <div className="callout">
            Scanning uses Claude to read the card, which needs your Anthropic API key.{" "}
            <a href={href({ name: "settings" })}>Add it in Settings</a>.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Scan a card" back={busy ? undefined : href({ name: "library" })} />
      <main className="page">
        {busy ? (
          <div className="working" role="status">
            <div className="spinner" aria-hidden />
            <p>
              <strong>Reading your recipe…</strong>
            </p>
            <p className="muted">
              Claude is reading the card and matching each ingredient to the step where it's used. This usually takes 20–60
              seconds. ({seconds}s)
            </p>
          </div>
        ) : (
          <>
            <p className="muted">
              Lay the card flat in good light and fill the frame. If the recipe continues on the back, add a second photo.
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
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_PHOTOS && (
              <div className="button-row">
                <button className="btn" onClick={() => cameraInput.current?.click()}>
                  📷 {photos.length ? "Add another photo" : "Take photo"}
                </button>
                <button className="btn" onClick={() => libraryInput.current?.click()}>
                  🖼️ Choose from photos
                </button>
              </div>
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
            {error && <div className="callout error">{error}</div>}
          </>
        )}
      </main>
      {!busy && photos.length > 0 && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={read}>
            ✨ Read recipe
          </button>
        </div>
      )}
    </>
  );
}
