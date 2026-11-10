import { describe, expect, it } from "vitest";
import { searchTips, temp, TIPS } from "./tips";

describe("tips", () => {
  it("shows Celsius too", () => {
    expect(temp(145)).toBe("145°F (63°C)");
    expect(temp(165)).toBe("165°F (74°C)");
    expect(temp(160)).toBe("160°F (71°C)");
  });
  it("has the USDA safe temperatures", () => {
    const safe = TIPS.find((s) => s.id === "safe")!.rows!;
    const v = (w: RegExp) => safe.find((r) => w.test(r.what))!.value;
    expect(v(/^Beef/)).toMatch(/^145/);
    expect(v(/^Ground beef/)).toMatch(/^160/);
    expect(v(/^Chicken/)).toMatch(/^165/);
    expect(v(/^Fish/)).toMatch(/^145/);
    expect(v(/^Hot dogs/)).toMatch(/^165/);
  });
  it("search finds rows across sections", () => {
    const res = searchTips("chicken");
    expect(res.map((s) => s.id)).toEqual(expect.arrayContaining(["safe", "grill"]));
    expect(res.find((s) => s.id === "grill")!.rows!.every((r) => /chicken/i.test(r.what + r.detail))).toBe(true);
    expect(searchTips("")).toBe(TIPS);
    expect(searchTips("zzz")).toEqual([]);
  });
});

describe("tips for a recipe", () => {
  const recipe = (title: string, ings: string[], step = "Cook.") => ({
    title,
    ingredients: ings.map((name) => ({ name, preparation: null })),
    steps: [{ segments: [{ text: step }] }],
  });
  it("finds the safe temperatures for its meats", async () => {
    const { tipsForRecipe } = await import("./tips");
    const t = tipsForRecipe(recipe("Crack Chicken", ["boneless skinless chicken breasts", "bacon", "chicken broth", "ranch seasoning"]));
    expect(t.safe.map((r) => r.value)).toEqual(["165°F (74°C)"]);
    expect(t.grill).toEqual([]); // not grilled
    expect(t.steak).toEqual([]);
  });
  it("adds steak doneness and grill rows when grilling", async () => {
    const { tipsForRecipe } = await import("./tips");
    const t = tipsForRecipe(recipe("Grilled Ribeye", ["2 ribeye steaks"], "Grill over high heat."));
    expect(t.steak.map((r) => r.what)).toContain("Medium rare");
    expect(t.grill.map((r) => r.what)).toEqual(["Steaks (1 inch)"]);
    expect(t.safe[0].value).toMatch(/^145/);
  });
  it("burgers and seafood", async () => {
    const { tipsForRecipe } = await import("./tips");
    expect(tipsForRecipe(recipe("Burgers", ["1 lb ground beef"], "Grill 4 minutes per side.")).grill.map((r) => r.what)).toEqual(["Hamburgers (¾ inch)"]);
    expect(tipsForRecipe(recipe("Shrimp Scampi", ["shrimp", "chicken stock"])).safe.map((r) => r.what)).toEqual(["Fish & shellfish"]);
    expect(tipsForRecipe(recipe("Salad", ["lettuce"])).safe).toEqual([]);
  });
});
