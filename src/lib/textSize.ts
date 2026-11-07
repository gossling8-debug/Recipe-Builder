/** App-wide text size, for anyone who wants it bigger. Everything scales together. */
export type TextSize = "standard" | "large" | "largest";

export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "largest", label: "Largest" },
];

const KEY = "recipe-builder.textSize";
let current: TextSize = "standard";

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "standard" || v === "large" || v === "largest") return v;
  } catch {
    /* storage blocked: use this session's choice */
  }
  return current;
}

/** Sets data-text-size on <html>; styles.css scales the page from that. */
export function applyTextSize(size: TextSize): void {
  current = size;
  document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(KEY, size);
  } catch {
    /* kept for this session only */
  }
}
