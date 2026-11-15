import { useRef, useState } from "react";
import Icon from "./Icon";
import { compressPhoto } from "../lib/image";

/**
 * "Take a photo of your dish" and "Choose from photos". The photo is made
 * small enough to keep many on the phone and to sync, but big enough for a
 * nice thumbnail, then handed to onPhoto.
 */
export default function DishPhotoButtons(props: { onPhoto: (dataUrl: string) => Promise<void>; primary?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The recipe page lets go of "keep the screen on" while the camera is open.
  const open = (input: HTMLInputElement | null) => {
    window.dispatchEvent(new Event("camera-opening"));
    // If the picker is cancelled there's no change event; coming back to the page resumes it.
    window.addEventListener("focus", () => setTimeout(() => window.dispatchEvent(new Event("camera-closed")), 500), { once: true });
    input?.click();
  };
  async function add(file: File | undefined) {
    window.dispatchEvent(new Event("camera-closed"));
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      await props.onPhoto(await compressPhoto(file, 1000, 0.75));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }
  return (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => (add(e.target.files?.[0]), (e.target.value = ""))} />
      <div className="button-row dish-photo-btns">
        <button className={props.primary ? "btn primary" : "btn"} disabled={busy} onClick={() => open(camera.current)}>
          <Icon name="camera" size={18} /> {busy ? "Saving…" : "Take a photo of your dish"}
        </button>
        <button className="btn" disabled={busy} onClick={() => open(library.current)}>
          <Icon name="image" size={18} /> Choose from photos
        </button>
      </div>
      {error && <div className="callout error small">{error}</div>}
    </>
  );
}

/** "Not now" on the photo prompt: remembered for that recipe until tomorrow. */
const SKIPPED = "cardamix-photo-ask-skipped";
const today = () => new Date().toDateString();
export function photoAskSkipped(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(SKIPPED) || "{}") as Record<string, string>)[id] === today();
  } catch {
    return false;
  }
}
export function skipPhotoAsk(id: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(SKIPPED) || "{}") as Record<string, string>;
    // Keep only today's entries, so the list never grows.
    const kept = Object.fromEntries(Object.entries(all).filter(([, d]) => d === today()));
    localStorage.setItem(SKIPPED, JSON.stringify({ ...kept, [id]: today() }));
  } catch {
    /* not remembered: it asks again next time */
  }
}
