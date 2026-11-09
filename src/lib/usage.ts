import { costOf, MODELS } from "./models";

/** A record of each paid Claude request, so the cook can see what the app actually costs. */
export interface UsageEntry {
  at: number;
  kind: "scan" | "website" | "text" | "substitutes" | "nutrition" | "receipt";
  model: string;
  input: number;
  output: number;
  cost: number; // estimated US dollars
}

const KEY = "recipe-builder.usage";

export function loadUsage(): UsageEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as UsageEntry[];
  } catch {
    return [];
  }
}

interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function recordUsage(kind: UsageEntry["kind"], model: string, usage: ApiUsage): UsageEntry {
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0];
  const input = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const entry: UsageEntry = { at: Date.now(), kind, model, input, output: usage.output_tokens, cost: costOf(m, input, usage.output_tokens) };
  try {
    localStorage.setItem(KEY, JSON.stringify([...loadUsage(), entry].slice(-500)));
  } catch {
    /* not recorded */
  }
  return entry;
}

/** "4.2¢" or "$1.35" */
export function money(dollars: number): string {
  if (dollars < 0.001) return "under 0.1¢";
  if (dollars < 0.01) return `${(dollars * 100).toFixed(1)}¢`;
  if (dollars < 1) return `${(dollars * 100).toFixed(1).replace(/\.0$/, "")}¢`;
  return `$${dollars.toFixed(2)}`;
}
