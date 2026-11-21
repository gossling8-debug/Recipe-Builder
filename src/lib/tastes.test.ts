import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the phone's storage (these tests run without a browser).
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});
vi.stubGlobal("window", { dispatchEvent: () => true });
import { everyoneEats, getEaters, nextTaste, refusedBy, setEaters, tastesOf, withTaste } from "./tastes";
import { isDinner } from "./autoPlan";
import type { SavedRecipe } from "./schema";

const r = (tastes?: Record<string, "love" | "no">) =>
  ({ id: "1", title: "Chili", tags: ["Dinner"], steps: [{ segments: [] }], ingredients: [], tastes }) as unknown as SavedRecipe;

describe("who likes what", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("recipe-builder.myPlan", JSON.stringify({ plan: "family", source: "stripe" }));
  });
  it("keeps names tidy: trimmed, no repeats (any case), at most 12", () => {
    expect(setEaters([" Sam ", "sam", "Kids", ""])).toEqual(["Sam", "Kids"]);
    expect(getEaters()).toEqual(["Sam", "Kids"]);
    expect(setEaters(Array.from({ length: 20 }, (_, i) => `P${i}`))).toHaveLength(12);
  });
  it("cycles a mark: none → loves → won't eat → none", () => {
    expect(nextTaste(undefined)).toBe("love");
    expect(nextTaste("love")).toBe("no");
    expect(nextTaste("no")).toBeUndefined();
    const marked = withTaste(r(), "Sam", "no");
    expect(marked.tastes).toEqual({ Sam: "no" });
    expect(withTaste(marked, "Sam", undefined).tastes).toBeUndefined();
  });
  it("ignores marks for people no longer on the list", () => {
    setEaters(["Sam"]);
    expect(tastesOf(r({ Sam: "love", Old: "no" }))).toEqual({ Sam: "love" });
    expect(refusedBy(r({ Old: "no" }))).toEqual([]);
  });
  it("plans skip a dinner someone won't eat — only on Family, with people listed", () => {
    expect(isDinner(r({ Sam: "no" }))).toBe(true); // nobody listed yet
    setEaters(["Sam", "Kids"]);
    expect(everyoneEats(r({ Sam: "no" }))).toBe(false);
    expect(isDinner(r({ Sam: "no" }))).toBe(false);
    expect(isDinner(r({ Sam: "love" }))).toBe(true);
    localStorage.setItem("recipe-builder.myPlan", JSON.stringify({ plan: "plus", source: "stripe" }));
    expect(isDinner(r({ Sam: "no" }))).toBe(true); // Plus: the feature isn't included
  });
});
