/**
 * Error reports: when something breaks on someone's phone, a short technical
 * note goes to the app's database (errors/{id}) so it can be found and fixed —
 * what went wrong, on which screen, the app build and the browser. Never
 * recipe content, notes or who it was (no account id). A few per session at
 * most, each message once. They expire after 30 days (expireAt).
 */
declare const __APP_BUILD__: string;
const BUILD = typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "dev";
const MAX_PER_SESSION = 5;
const DAY = 86_400_000;
const sent = new Set<string>();

/** Harmless browser noise that isn't a bug in the app. */
const NOISE = /ResizeObserver loop|^Script error\.?$|AbortError|The operation was aborted/i;

/** The report itself (no sending) — exported for tests. */
export function errorDetails(err: unknown, where: string | null, hash: string, device: string) {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err) ?? String(err));
  const message = (e.message || e.name || "Unknown error").slice(0, 300);
  const stack = (e.stack ?? "").split("\n").slice(0, 8).join("\n").slice(0, 1500);
  // Only the kind of screen ("recipe", "family"), never ids from the address.
  const screen = (hash.replace(/^#\/?/, "").split("/")[0] || "home").replace(/[^a-z-]/gi, "").slice(0, 40) || "home";
  return { message, stack, screen, where: where ? where.slice(0, 40) : null, app: BUILD.slice(0, 40), device: device.slice(0, 200) };
}

export function reportError(err: unknown, where: string | null = null): void {
  try {
    const details = errorDetails(err, where, location.hash, navigator.userAgent);
    if (NOISE.test(details.message) || sent.has(details.message) || sent.size >= MAX_PER_SESSION) return;
    sent.add(details.message);
    void (async () => {
      const { fb, user } = await import("./cloud");
      if (!(await user())) return; // only from signed-in accounts (the database rules require it)
      const { db, f } = await fb();
      const now = Date.now();
      await f.addDoc(f.collection(db, "errors"), { ...details, at: now, expireAt: f.Timestamp.fromMillis(now + 30 * DAY) });
    })().catch(() => {});
  } catch {
    /* reporting must never break the app */
  }
}

/** Catch errors that nothing else handled. */
export function installErrorReporting(): void {
  window.addEventListener("error", (e) => reportError(e.error ?? e.message, "window"));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "promise"));
}
