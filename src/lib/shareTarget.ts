/**
 * Sharing to Cardamix from another app (Android, with Cardamix on the home
 * screen): the share sheet opens Cardamix's index.html?url=…&text=…&title=… (see
 * share_target in manifest.webmanifest). The link is kept for Add Recipe.
 */
const KEY = "recipe-builder.sharedLink";

/** The first web address in what was shared, if any. */
export function linkFrom(params: URLSearchParams): string | null {
  for (const v of [params.get("url"), params.get("text"), params.get("title")]) {
    const m = v?.match(/https?:\/\/[^\s<>"]+/i);
    if (m) return m[0].replace(/[),.]+$/, "");
  }
  return null;
}

/** On start: a shared link opens Add Recipe with it filled in. Returns true if it did. */
export function catchSharedLink(): boolean {
  if (!location.search) return false;
  const params = new URLSearchParams(location.search);
  if (!params.has("url") && !params.has("text") && !params.has("title")) return false;
  const link = linkFrom(params);
  try {
    if (link) sessionStorage.setItem(KEY, JSON.stringify({ link, at: Date.now() }));
  } catch {
    /* ignore */
  }
  history.replaceState(null, "", `${location.pathname}${link ? "#/scan" : location.hash}`);
  return !!link;
}

/** The link just shared (kept until it's read or replaced — Add Recipe can open more than once while the app starts). */
export function takeSharedLink(now = Date.now()): string | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { link: string; at: number } | null;
    return v && now - v.at < 10 * 60_000 ? v.link : null;
  } catch {
    return null;
  }
}
export function clearSharedLink(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
