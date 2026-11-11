import { describe, expect, it } from "vitest";
import { originNote, pantryPrompt } from "./pantryRecipe";
import type { PantryItem } from "./pantry";

const DAY = 86_400_000;
const now = new Date(2026, 10, 10, 12).getTime();
const item = (name: string, useBy?: number, qty: PantryItem["qty"] = null): PantryItem => ({ key: name, name, qty, updatedAt: now, useBy });

describe("cook with what I have: the request", () => {
  const prompt = pantryPrompt({
    items: [item("rice"), item("spinach", now + DAY), item("old milk", now - 2 * DAY), item("chicken thighs", now + 10 * DAY)],
    avoid: ["Dairy", "cilantro"],
    people: 3,
    request: " soup ",
    existingTitles: ["Chicken Soup"],
    now,
  });
  it("marks what to use soon and what's past its date", () => {
    expect(prompt).toContain("- spinach — USE SOON");
    expect(prompt).toContain("- old milk — PAST DATE, don't use");
    expect(prompt).toMatch(/- chicken thighs\n/);
  });
  it("lists soonest-to-go first", () => {
    expect(prompt.indexOf("old milk")).toBeLessThan(prompt.indexOf("spinach"));
    expect(prompt.indexOf("spinach")).toBeLessThan(prompt.indexOf("rice"));
  });
  it("passes on people, the avoid list, the wish and existing recipes", () => {
    expect(prompt).toContain("Cooking for: 3 people");
    expect(prompt).toContain("I avoid: Dairy, cilantro");
    expect(prompt).toContain("What I'd like: soup");
    expect(prompt).toContain("Recipes I already have: Chicken Soup");
  });
  it("leaves out the avoid line when there's nothing to avoid", () => {
    expect(pantryPrompt({ items: [item("rice")], avoid: [], people: 1, request: "", existingTitles: [], now })).not.toContain("I avoid");
  });
});

describe("origin note", () => {
  it("says what it uses up and what to buy", () => {
    expect(originNote(["spinach"], ["lemon"])).toBe("Made from your pantry. Uses up: spinach. You'll also need: lemon.");
    expect(originNote([], [])).toBe("Made from your pantry.");
  });
});
