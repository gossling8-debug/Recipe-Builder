import { describe, expect, it } from "vitest";
import { ADD_TOUR_STEPS, visibleSteps } from "./tour";

describe("tour steps", () => {
  it("keeps steps whose button is on screen, and closing cards that point at nothing", () => {
    const shown = visibleSteps(ADD_TOUR_STEPS, (sel) => sel !== ".verify-email");
    expect(shown.map((s) => s.title)).toEqual(["Four ways to add a recipe", "Snap a recipe card", "Labels (optional)", "Then tap Read recipe"]);
  });
});
