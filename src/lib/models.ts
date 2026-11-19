import { myPlan } from "./subscription";

/**
 * Which Claude model reads recipes. The cook picks in Settings; cheaper
 * models cost far less per scan but read messy handwriting less reliably.
 * Prices are Anthropic's list prices per million tokens (input / output),
 * used only to estimate costs shown in the app.
 */
export interface ModelOption {
  id: string;
  label: string;
  blurb: string;
  inPerM: number;
  outPerM: number;
  effort: "low" | "medium" | "high";
  /** Server-side fallback on a safety refusal ("default" mode). Not offered for Haiku. */
  fallbacks: boolean;
  /** Web fetch tool version this model supports. */
  webFetch: "web_fetch_20260209" | "web_fetch_20250910";
}

export const MODELS: ModelOption[] = [
  {
    id: "claude-opus-5-5",
    label: "Expert",
    blurb: "The most capable; most reliable on faded or messy handwriting.",
    inPerM: 4,
    outPerM: 20,
    effort: "medium",
    fallbacks: true,
    webFetch: "web_fetch_20260209",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Advanced",
    blurb: "Very good on handwriting and most cards.",
    inPerM: 2,
    outPerM: 10,
    effort: "medium",
    fallbacks: true,
    webFetch: "web_fetch_20260209",
  },
  {
    id: "claude-haiku-5-5",
    label: "Standard",
    blurb: "Great for printed cards and websites; may misread hard handwriting. Uses the least AI.",
    inPerM: 0.1,
    outPerM: 0.5,
    effort: "high",
    fallbacks: false,
    webFetch: "web_fetch_20250910",
  },
];

const KEY = "recipe-builder.model";
let memory = MODELS[0].id;

export function getModel(): ModelOption {
  let id = memory;
  try {
    id = localStorage.getItem(KEY) ?? memory;
  } catch {
    /* blocked */
  }
  const chosen = MODELS.find((m) => m.id === id);
  // The app pays for Advanced and Standard; Expert needs your own key.
  const allowed = availableModels();
  return chosen && allowed.includes(chosen) ? chosen : (allowed.find((m) => m.id === "claude-sonnet-5-5") ?? allowed[0]);
}

/**
 * Models you can pick: all of them with your own key; otherwise the ones the
 * app pays for — Advanced and Standard with Plus, Standard on the free plan.
 */
export function availableModels(): ModelOption[] {
  let own = false;
  try {
    own = !!localStorage.getItem("recipe-builder.apiKey");
  } catch {
    /* blocked */
  }
  if (own) return MODELS;
  if (myPlan().plan === "free") return MODELS.filter((m) => m.id === "claude-haiku-5-5");
  return MODELS.filter((m) => m.id !== "claude-opus-5-5");
}

export function setModel(id: string): void {
  memory = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* session only */
  }
}

export const costOf = (m: ModelOption, input: number, output: number) => (input * m.inPerM + output * m.outPerM) / 1_000_000;
