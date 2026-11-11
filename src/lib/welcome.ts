/** First-time setup: shown once, on a phone with no recipes yet. */
const KEY = "recipe-builder.welcomeDone";

export function welcomeDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: don't trap anyone in setup
  }
}
export function finishWelcome(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}
