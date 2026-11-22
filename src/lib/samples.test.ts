import { describe, expect, it, vi } from "vitest";

const saved: { id: string; ingredients: unknown[]; steps: { segments: { ingredient_index: number | null }[] }[]; createdAt: number }[] = [];
vi.mock("./db", () => ({
  saveRecipe: async (r: (typeof saved)[number]) => void saved.push(r),
  deleteRecipe: async () => {},
}));
const { addSamples, isSample } = await import("./samples");

describe("sample recipes", () => {
  it("are three, marked as samples, with every step's ingredient pointing at a real ingredient", async () => {
    await addSamples();
    expect(saved).toHaveLength(3);
    for (const r of saved) {
      expect(isSample(r)).toBe(true);
      for (const s of r.steps)
        for (const seg of s.segments) if (seg.ingredient_index !== null) expect(seg.ingredient_index).toBeLessThan(r.ingredients.length);
    }
    // The dinner is newest, so it's at the top of the list.
    expect([...saved].sort((a, b) => b.createdAt - a.createdAt)[0].id).toBe("sample-sheet-pan-chicken");
  });
});

describe("who is offered the sample recipes", () => {
  it("only new accounts (created in the last 14 days), never older ones or unknown ones", async () => {
    const { isNewAccount } = await import("./samples");
    const now = Date.parse("2026-11-21T12:00:00Z");
    const day = 86_400_000;
    expect(isNewAccount(now - 1 * day, now)).toBe(true);
    expect(isNewAccount(now - 13 * day, now)).toBe(true);
    expect(isNewAccount(now - 15 * day, now)).toBe(false);
    expect(isNewAccount(now - 400 * day, now)).toBe(false);
    expect(isNewAccount(null, now)).toBe(false);
    expect(isNewAccount(Number.NaN, now)).toBe(false);
  });
});
