import { describe, expect, it } from "vitest";
import { createPrompt, createdNotes } from "./createRecipe";

describe("create a recipe", () => {
  it("asks for the dish, the servings and what to avoid", () => {
    const p = createPrompt({ request: " Zuppa Toscana like Olive Garden ", people: 4, avoid: ["Dairy"], existingTitles: ["Lemon Chicken"] });
    expect(p).toContain("What I'd like: Zuppa Toscana like Olive Garden");
    expect(p).toContain("Servings: 4");
    expect(p).toContain("I avoid: Dairy");
    expect(p).toContain("Lemon Chicken");
    expect(createPrompt({ request: "x", people: 2, avoid: [], existingTitles: [] })).not.toContain("avoid");
  });
  it("notes say it's untested, and a copycat isn't the official recipe", () => {
    const n = createdNotes({ inspiredBy: "Olive Garden", whyItWorks: "Rendering the sausage first flavors the fat.", chefTips: ["Add kale last."] });
    expect(n).toContain("inspired by Olive Garden, not the official recipe");
    expect(n).toContain("Untested");
    expect(n).toContain("Why this works: Rendering");
    expect(n).toContain("• Add kale last.");
    expect(createdNotes({ inspiredBy: null, whyItWorks: "", chefTips: [], plating: "Ladle into warm bowls." })).toContain("To plate: Ladle into warm bowls.");
    expect(createdNotes({ inspiredBy: null, whyItWorks: "", chefTips: [] })).toBe("Created by Claude. Untested: rate it after you cook it.");
  });
});
