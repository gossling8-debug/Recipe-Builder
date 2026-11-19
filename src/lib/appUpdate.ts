/**
 * A home-screen app can stay open in the background for days, so it keeps
 * running the version it started with. When you come back to it after a
 * while and a newer version is out, it reloads — unless you're in the middle
 * of something (reading a recipe, typing, a screen with unsaved work): then
 * a bar offers "Refresh" instead.
 */
declare const __APP_BUILD__: string;
const MINE = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";
const AWAY = 30_000; // away at least this long before checking

// Screens where a reload could lose what you're doing.
const BUSY_SCREENS = /^#\/(scan|import|receipt)\b/;

/** Something typed or being edited on screen (a filled-in box), so a reload could lose it. */
export function hasWorkOnScreen(doc: Pick<Document, "querySelectorAll">): boolean {
  if (doc.querySelectorAll("textarea").length) return true;
  return Array.from(doc.querySelectorAll<HTMLInputElement>("input")).some(
    (i) => !["search", "checkbox", "radio", "file", "hidden", "range", "button", "submit"].includes(i.type) && i.value.trim() !== "",
  );
}

/** Whether it's safe to reload right now. */
export function safeToReload(hash: string, active: Element | null, reading: boolean, work = false): boolean {
  if (BUSY_SCREENS.test(hash) || reading || work) return false;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return false;
  return true;
}

export const isNewer = (latest: unknown, mine: string) => typeof latest === "string" && latest.length > 0 && latest !== mine;

async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return ((await r.json()) as { build?: string }).build ?? null;
  } catch {
    return null;
  }
}

let started = false;
export function startUpdateCheck(): void {
  if (started || !import.meta.env.PROD) return;
  started = true;
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (!hiddenAt || Date.now() - hiddenAt < AWAY) return;
    void latestBuild().then((latest) => {
      if (!isNewer(latest, MINE)) return;
      if (safeToReload(location.hash, document.activeElement, !!document.querySelector(".working"), hasWorkOnScreen(document))) location.reload();
      else window.dispatchEvent(new Event("app-update-ready")); // a "Refresh" bar instead
    });
  });
}

/** The "new version" bar's state: shown once an update is waiting. */
export function onUpdateReady(cb: () => void): () => void {
  window.addEventListener("app-update-ready", cb);
  return () => window.removeEventListener("app-update-ready", cb);
}
