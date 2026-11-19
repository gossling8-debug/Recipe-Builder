import type { Route } from "./route";

/** An invite link (or just its code) pasted into the app: the screen that joins it. */
export function inviteRoute(text: string): Route | null {
  const t = text.trim();
  const shop = t.match(/#\/shop\/([A-Za-z0-9_-]{6,})/);
  if (shop) return { name: "shopjoin", id: shop[1] };
  const book = t.match(/#\/join\/([A-Za-z0-9_-]{6,})/);
  if (book) return { name: "join", id: book[1] };
  return null;
}
