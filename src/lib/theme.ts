/** Light or night (black background, white text), or follow the phone's setting. */
export type Theme = "auto" | "light" | "night";

export const THEMES: { value: Theme; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "light", label: "Light" },
  { value: "night", label: "Night" },
];

const KEY = "recipe-builder.theme";
let current: Theme = "auto";

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "auto" || v === "light" || v === "night") return v;
  } catch {
    /* storage blocked: this session's choice */
  }
  return current;
}

const BAR = { light: "#faf8f5", night: "#000000" };

/** Sets data-theme on <html> (styles.css picks the colors) and the phone's status-bar color. */
export function applyTheme(theme: Theme, save = true): void {
  current = theme;
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  // The two theme-color tags follow the phone's setting; a fixed choice sets both.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const forDark = (m.media || "").includes("dark");
    m.content = theme === "auto" ? (forDark ? BAR.night : BAR.light) : BAR[theme];
  });
  if (!save) return;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* kept for this session only */
  }
}
