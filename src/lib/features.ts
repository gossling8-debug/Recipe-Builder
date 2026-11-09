/**
 * Features the cook can switch on or off (to keep the app uncluttered), and
 * which plan each belongs to. A feature shows only when it's switched on AND
 * the plan includes it. Switching off only hides things — nothing is deleted.
 *
 * Payments aren't set up yet, so "Preview Plus" (on by default) unlocks Plus
 * features for now. At launch, that becomes the real Upgrade.
 */
export type Plan = "free" | "plus";

export interface Feature {
  id: FeatureId;
  name: string;
  what: string; // one line for Settings
  plan: Plan;
  group: "Cooking" | "Planning" | "Shopping & pantry" | "Health" | "Extras";
}

export type FeatureId =
  | "cookMode"
  | "units"
  | "notes"
  | "print"
  | "walmart"
  | "conversions"
  | "readAloud"
  | "versions"
  | "freezeHalf"
  | "weekPlanner"
  | "mealTime"
  | "history"
  | "pantry"
  | "budget"
  | "nutrition"
  | "avoid"
  | "family";

export const FEATURES: Feature[] = [
  { id: "cookMode", name: "Cooking mode", what: "One step at a time, big text, timers.", plan: "free", group: "Cooking" },
  { id: "units", name: "US / metric", what: "The Units switch on each recipe.", plan: "free", group: "Cooking" },
  { id: "notes", name: "Notes, ratings & photos", what: "My notes, stars, made history and your dish photo.", plan: "free", group: "Cooking" },
  { id: "print", name: "Print", what: "Print or save a recipe as a PDF.", plan: "free", group: "Cooking" },
  { id: "walmart", name: "Walmart buttons", what: "Find shopping-list items in the Walmart app.", plan: "free", group: "Shopping & pantry" },
  { id: "conversions", name: "Conversion chart", what: "Garlic, onion and other swaps between forms.", plan: "plus", group: "Cooking" },
  { id: "readAloud", name: "Read aloud & voice", what: "Steps read out loud; say “next”, “pause”.", plan: "plus", group: "Cooking" },
  { id: "versions", name: "My own versions", what: "Copy a recipe to make your own version.", plan: "plus", group: "Cooking" },
  { id: "freezeHalf", name: "Double & freeze half", what: "Cook once, eat twice.", plan: "plus", group: "Planning" },
  { id: "weekPlanner", name: "Week planner", what: "Plan the week, Fill my week, big-meal timeline.", plan: "plus", group: "Planning" },
  { id: "mealTime", name: "Meal times", what: "“Eat at 6” → when to start, with reminders.", plan: "plus", group: "Planning" },
  { id: "history", name: "Meal history", what: "What you've cooked, and “a year ago this week”.", plan: "plus", group: "Planning" },
  { id: "pantry", name: "Pantry", what: "What's on hand, staples, leftovers, “What can I make?”.", plan: "plus", group: "Shopping & pantry" },
  { id: "budget", name: "Budget", what: "Spending, prices, receipt import, cost per serving.", plan: "plus", group: "Shopping & pantry" },
  { id: "nutrition", name: "Nutrition", what: "Calories per serving and healthier swaps.", plan: "plus", group: "Health" },
  { id: "avoid", name: "Allergies & substitutes", what: "Flag ingredients you avoid and get swaps.", plan: "plus", group: "Health" },
  { id: "family", name: "Family cookbook", what: "Share recipes with family (needs cloud backup).", plan: "plus", group: "Extras" },
];

const OFF_KEY = "recipe-builder.featuresOff";
const PLAN_KEY = "recipe-builder.plan";
const PREVIEW_KEY = "recipe-builder.previewPlus";
let offMemory: string[] = [];
let previewMemory = true;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* session only */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("features-changed"));
}

/** The paid plan, once payments exist. Until then only "free" is ever stored. */
export const plan = (): Plan => read<Plan>(PLAN_KEY, "free");
/** Testing switch: unlock Plus features before payments exist. On by default so nothing disappears. */
export const previewPlus = (): boolean => read<boolean>(PREVIEW_KEY, previewMemory);
export function setPreviewPlus(on: boolean): void {
  previewMemory = on;
  write(PREVIEW_KEY, on);
}
export const hasPlus = () => plan() === "plus" || previewPlus();

const offList = (): string[] => read<string[]>(OFF_KEY, offMemory);
/** The cook's own on/off switch (regardless of plan). */
export const switchedOn = (id: FeatureId) => !offList().includes(id);
export function setSwitchedOn(id: FeatureId, on: boolean): void {
  const list = offList().filter((x) => x !== id);
  offMemory = on ? list : [...list, id];
  write(OFF_KEY, offMemory);
}

/** Locked because the plan doesn't include it. */
export const locked = (id: FeatureId) => FEATURES.find((f) => f.id === id)?.plan === "plus" && !hasPlus();

/** Show this feature? (switched on and included in the plan) */
export const feature = (id: FeatureId): boolean => switchedOn(id) && !locked(id);
