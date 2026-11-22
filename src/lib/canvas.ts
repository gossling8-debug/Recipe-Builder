/**
 * Frees a canvas's pixel memory now instead of whenever the browser gets round to it.
 * iPhone Safari has a small total budget for canvases; past it, canvases (and the screen)
 * go blank or black while the app keeps running underneath. The scanner makes many large
 * ones, so each is released as soon as it has been used (docs/DECISIONS.md).
 */
export function release(...canvases: (HTMLCanvasElement | null | undefined)[]): void {
  for (const c of canvases) {
    if (!c) continue;
    c.width = 0;
    c.height = 0;
  }
}
