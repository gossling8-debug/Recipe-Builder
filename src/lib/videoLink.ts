/**
 * Recipe videos (TikTok, Instagram, YouTube): the recipe is usually written
 * in the caption or description. These are the public pages that show that
 * text without signing in, for Claude to read on Anthropic's side.
 */
export type VideoSite = "TikTok" | "Instagram" | "YouTube";
export interface VideoSource {
  site: VideoSite;
  /** Pages to read, best first. */
  pages: string[];
}

export function videoSource(link: string): VideoSource | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const clean = `https://${u.hostname}${u.pathname}`;
    // oEmbed gives the caption as plain text; the page itself is the backup.
    return { site: "TikTok", pages: [`https://www.tiktok.com/oembed?url=${encodeURIComponent(clean)}`, clean] };
  }
  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (!m) return null;
    // The "captioned" embed shows the caption without signing in.
    return { site: "Instagram", pages: [`https://www.instagram.com/p/${m[2]}/embed/captioned/`, `https://www.instagram.com/p/${m[2]}/`] };
  }
  if (host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com") {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1).split("/")[0]
        : (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/)?.[1] ?? "");
    if (!/^[\w-]{6,}$/.test(id)) return null;
    return { site: "YouTube", pages: [`https://www.youtube.com/watch?v=${id}`] };
  }
  return null;
}
