import { beforeEach, describe, expect, it } from "vitest";
import { feature, FEATURES, hasPlus, locked, setSwitchedOn, switchedOn } from "./features";
import { remember } from "./subscription";

describe("feature switches and plans", () => {
  beforeEach(() => {
    FEATURES.forEach((f) => setSwitchedOn(f.id, true));
    remember({ plan: "plus" });
  });

  it("with Plus, everything is on by default", () => {
    expect(hasPlus()).toBe(true);
    expect(FEATURES.every((f) => feature(f.id))).toBe(true);
  });

  it("switching a feature off hides it; on brings it back", () => {
    setSwitchedOn("budget", false);
    expect(feature("budget")).toBe(false);
    expect(switchedOn("budget")).toBe(false);
    setSwitchedOn("budget", true);
    expect(feature("budget")).toBe(true);
  });

  it("on the free plan, Plus features are locked but free ones stay", () => {
    remember({ plan: "free" });
    expect(locked("budget")).toBe(true);
    expect(feature("budget")).toBe(false);
    expect(feature("cookMode")).toBe(true);
    expect(locked("cookMode")).toBe(false);
    expect(locked("walmart")).toBe(true); // Walmart buttons come with Plus
    expect(locked("tonight")).toBe(true); // so does Tonight
  });

  it("each feature is listed once", () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });
});
