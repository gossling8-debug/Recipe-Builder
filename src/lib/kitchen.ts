/**
 * The cook's kitchen devices beyond the basics (stovetop, oven, pans, a blender or hand
 * mixer). Asked in setup and in Settings; recipes Cardamix writes ("Create a recipe",
 * "Cook with what I have") may use one when it suits the dish, never one that isn't here.
 * Synced like the avoid list (stateSync "kitchen").
 */
export const DEVICES = [
  { id: "airFryer", label: "Air fryer" },
  { id: "slowCooker", label: "Slow cooker" },
  { id: "pressureCooker", label: "Instant Pot / pressure cooker" },
  { id: "standMixer", label: "Stand mixer" },
  { id: "foodProcessor", label: "Food processor" },
  { id: "dutchOven", label: "Dutch oven" },
  { id: "grill", label: "Grill" },
  { id: "sousVide", label: "Sous vide" },
] as const;
export type DeviceId = (typeof DEVICES)[number]["id"];

const KEY = "recipe-builder.kitchen";
const known = new Set<string>(DEVICES.map((d) => d.id));
let memory: DeviceId[] = [];

export function loadKitchen(): DeviceId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return (JSON.parse(raw) as unknown[]).filter((x): x is DeviceId => typeof x === "string" && known.has(x));
  } catch {
    /* blocked or damaged: fall through */
  }
  return memory;
}

export function saveKitchen(ids: DeviceId[]): void {
  memory = ids.filter((x) => known.has(x));
  try {
    localStorage.setItem(KEY, JSON.stringify(memory)); // stateSync notices and syncs it
  } catch {
    /* kept for this session */
  }
}

/** The devices' names, for the AI: ["Air fryer", "Slow cooker"]. */
export const kitchenLabels = (ids: DeviceId[] = loadKitchen()) => DEVICES.filter((d) => ids.includes(d.id)).map((d) => d.label);
