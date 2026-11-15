import { lazy, type ComponentType } from "react";

/**
 * Screens load on demand so the first screen appears sooner. Two catches,
 * both handled here:
 * - Offline: the service worker only caches files that have been loaded, so
 *   every screen is fetched quietly in the background once the app is up
 *   (preloadScreens), and a screen never opened still works with no signal.
 * - Updates: after a new version is published, an open tab still asks for the
 *   old version's files, which are gone. Then the page reloads once to get the
 *   new version, instead of showing the crash screen.
 */
const loaders: (() => Promise<unknown>)[] = [];
const RELOADED = "cardamix-screen-reload";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  loaders.push(load);
  return lazy(() =>
    load().catch((err) => {
      if (reloadOnce()) return new Promise<never>(() => {}); // the page is reloading
      throw err;
    }),
  );
}

/** Reload to pick up the new version, at most once a minute (so a real outage can't loop). */
function reloadOnce(): boolean {
  if (!navigator.onLine) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Fetch every screen in the background, one after another, once the first screen is showing. */
export function preloadScreens(delay = 2500): void {
  window.setTimeout(async () => {
    for (const load of loaders) await load().catch(() => {});
  }, delay);
}
