import { myPlan } from "./subscription";
/**
 * Features the cook can switch on or off (to keep the app uncluttered), and
 * which plan each belongs to. A feature shows only when it's switched on AND
 * the plan includes it. Switching off only hides things — nothing is deleted.
 *
 * Plus comes from the server (Stripe or a complimentary account), see subscription.ts.
 */
export type Plan = "free" | "plus" | "family";
/** Each plan includes everything in the ones before it. */
const RANK: Record<Plan, number> = { free: 0, plus: 1, family: 2 };

export interface Feature {
  id: FeatureId;
  name: string;
  what: string; // one line for Settings
  plan: Plan;
  group: "Cooking" | "Planning" | "Shopping & pantry" | "Health" | "Extras";
}

export type FeatureId =
  | "cookMode"
  | "tips"
  | "units"
  | "notes"
  | "print"
  | "walmart"
  | "conversions"
  | "readAloud"
  | "versions"
  | "freezeHalf"
  | "weekPlanner"
  | "tonight"
  | "mealTime"
  | "thaw"
  | "history"
  | "pantry"
  | "budget"
  | "nutrition"
  | "avoid"
  | "family"
  | "mix"
  | "budgetPlan"
  | "videoImport";

export const FEATURES: Feature[] = [
  { id: "cookMode", name: "Cooking mode", what: "One step at a time, big text, timers.", plan: "free", group: "Cooking" },
  { id: "tips", name: "Tips", what: "Safe temperatures, steak doneness, grilling and kitchen basics.", plan: "free", group: "Cooking" },
  { id: "units", name: "US / metric", what: "The Units switch on each recipe.", plan: "free", group: "Cooking" },
  { id: "notes", name: "Notes, ratings & photos", what: "My notes, stars, made history and your dish photo.", plan: "free", group: "Cooking" },
  { id: "print", name: "Print", what: "Print or save a recipe as a PDF.", plan: "plus", group: "Cooking" },
  { id: "walmart", name: "Store buttons", what: "Find shopping-list items in the Walmart or H-E-B app.", plan: "plus", group: "Shopping & pantry" },
  { id: "conversions", name: "Conversion chart", what: "Garlic, onion and other swaps between forms.", plan: "plus", group: "Cooking" },
  { id: "readAloud", name: "Read aloud & voice", what: "Steps read out loud; say “next”, “pause”.", plan: "plus", group: "Cooking" },
  { id: "versions", name: "My own versions", what: "Copy a recipe to make your own version.", plan: "plus", group: "Cooking" },
  { id: "freezeHalf", name: "Double & freeze half", what: "Cook once, eat twice.", plan: "plus", group: "Planning" },
  { id: "tonight", name: "Tonight", what: "What's for dinner tonight, ideas, and what to thaw.", plan: "plus", group: "Planning" },
  { id: "weekPlanner", name: "Week planner", what: "Plan the week, Fill my week, big-meal timeline.", plan: "plus", group: "Planning" },
  { id: "mealTime", name: "Meal times", what: "“Eat at 6” → when to start, with reminders.", plan: "plus", group: "Planning" },
  { id: "thaw", name: "Thaw reminders", what: "When to move frozen meat to the fridge for planned meals.", plan: "plus", group: "Planning" },
  { id: "history", name: "Meal history", what: "What you've cooked, and “a year ago this week”.", plan: "plus", group: "Planning" },
  { id: "pantry", name: "Pantry", what: "What's on hand, staples, leftovers, “What can I make?”.", plan: "plus", group: "Shopping & pantry" },
  { id: "budget", name: "Budget", what: "Spending, prices, receipt import, cost per serving.", plan: "plus", group: "Shopping & pantry" },
  { id: "nutrition", name: "Nutrition", what: "Calories per serving and healthier swaps.", plan: "plus", group: "Health" },
  { id: "avoid", name: "Allergies & substitutes", what: "Flag ingredients you avoid and get swaps.", plan: "plus", group: "Health" },
  { id: "family", name: "Cookbooks", what: "Share recipes with family and friends.", plan: "plus", group: "Extras" },
  { id: "videoImport", name: "Recipes from videos", what: "Save a recipe from a TikTok, Instagram or YouTube video link.", plan: "family", group: "Extras" },
  { id: "budgetPlan", name: "Plan on a budget", what: "Plan the week's dinners under a set amount, using what you have.", plan: "family", group: "Planning" },
  { id: "mix", name: "The Mix", what: "Publish recipes for everyone and find recipes other cooks shared.", plan: "free", group: "Extras" },
];

const OFF_KEY = "recipe-builder.featuresOff";
let offMemory: string[] = [];

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

/**
 * Your plan, as last confirmed by the server. While Cardamix is being tested
 * (Plus free for everyone), and on gifted accounts, everything is included — Family too.
 */
export const plan = (): Plan => {
  const p = myPlan();
  if (p.plan !== "free" && (p.source === "beta" || p.source === "comp")) return "family"; // testing period, or gifted
  return p.plan;
};
export const hasPlus = () => RANK[plan()] >= RANK.plus;
export const hasFamily = () => RANK[plan()] >= RANK.family;

const offList = (): string[] => read<string[]>(OFF_KEY, offMemory);
/** The cook's own on/off switch (regardless of plan). */
export const switchedOn = (id: FeatureId) => !offList().includes(id);
export function setSwitchedOn(id: FeatureId, on: boolean): void {
  const list = offList().filter((x) => x !== id);
  offMemory = on ? list : [...list, id];
  write(OFF_KEY, offMemory);
}

/** Locked because the plan doesn't include it. */
export const locked = (id: FeatureId) => RANK[FEATURES.find((f) => f.id === id)?.plan ?? "free"] > RANK[plan()];

/** Show this feature? (switched on and included in the plan) */
export const feature = (id: FeatureId): boolean => switchedOn(id) && !locked(id);
