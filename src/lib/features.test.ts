import { beforeEach, describe, expect, it } from "vitest";
import { feature, FEATURES, hasPlus, locked, setPreviewPlus, setSwitchedOn, switchedOn } from "./features";

describe("feature switches and plans", () => {
  beforeEach(() => {
    FEATURES.forEach((f) => setSwitchedOn(f.id, true));
    setPreviewPlus(true);
  });

  it("everything is on by default while Plus is previewed", () => {
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
    setPreviewPlus(false);
    expect(locked("budget")).toBe(true);
    expect(feature("budget")).toBe(false);
    expect(feature("cookMode")).toBe(true);
    expect(locked("cookMode")).toBe(false);
    expect(locked("walmart")).toBe(true); // Walmart buttons come with Plus
  });

  it("each feature is listed once", () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });
});
