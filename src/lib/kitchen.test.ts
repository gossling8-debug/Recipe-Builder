import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the browser's saved settings (these tests run without a browser).
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});
import { kitchenLabels, loadKitchen, saveKitchen } from "./kitchen";
import { createPrompt } from "./createRecipe";
import { pantryPrompt } from "./pantryRecipe";

describe("your kitchen", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the devices you tick, and ignores anything it doesn't know", () => {
    saveKitchen(["airFryer", "slowCooker"]);
    expect(loadKitchen()).toEqual(["airFryer", "slowCooker"]);
    localStorage.setItem("recipe-builder.kitchen", JSON.stringify(["airFryer", "teleporter", 7]));
    expect(loadKitchen()).toEqual(["airFryer"]);
  });

  it("names them for the AI in a fixed order", () => {
    expect(kitchenLabels(["slowCooker", "airFryer"])).toEqual(["Air fryer", "Slow cooker"]);
    expect(kitchenLabels([])).toEqual([]);
  });

  it("tells Create a recipe and Cook with what I have about them, and says nothing when there are none", () => {
    const base = { request: "chicken", people: 2, avoid: [], existingTitles: [] };
    expect(createPrompt({ ...base, devices: ["Air fryer"] })).toContain("My kitchen also has: Air fryer");
    expect(createPrompt({ ...base, devices: [] })).not.toContain("My kitchen");
    expect(createPrompt(base)).not.toContain("My kitchen");
    const pantry = { items: [], avoid: [], people: 2, request: "", existingTitles: [] };
    expect(pantryPrompt({ ...pantry, devices: ["Slow cooker", "Grill"] })).toContain("My kitchen also has: Slow cooker, Grill");
    expect(pantryPrompt(pantry)).not.toContain("My kitchen");
  });
});
