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
    label: "Best",
    blurb: "Claude Opus 5.5 — most reliable on faded or messy handwriting.",
    inPerM: 4,
    outPerM: 20,
    effort: "medium",
    fallbacks: true,
    webFetch: "web_fetch_20260209",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Balanced",
    blurb: "Claude Sonnet 5.5 — about half the cost; very good on most cards.",
    inPerM: 2,
    outPerM: 10,
    effort: "medium",
    fallbacks: true,
    webFetch: "web_fetch_20260209",
  },
  {
    id: "claude-haiku-5-5",
    label: "Budget",
    blurb: "Claude Haiku 5.5 — a small fraction of the cost; great for printed cards and websites, may misread hard handwriting.",
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
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
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
