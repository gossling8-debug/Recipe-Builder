import { describe, expect, it } from "vitest";
import { hasWorkOnScreen, isNewer, safeToReload } from "./appUpdate";

describe("app update", () => {
  it("reloads only for a different, real build", () => {
    expect(isNewer("2026-11-19T06:00:00", "2026-11-19T05:35:00")).toBe(true);
    expect(isNewer("2026-11-19T05:35:00", "2026-11-19T05:35:00")).toBe(false);
    expect(isNewer(null, "x")).toBe(false);
    expect(isNewer(undefined, "x")).toBe(false);
  });
  it("waits while you're in the middle of something", () => {
    expect(safeToReload("#/shopping", null, false)).toBe(true);
    expect(safeToReload("#/scan", null, false)).toBe(false);
    expect(safeToReload("#/receipt", null, false)).toBe(false);
    expect(safeToReload("#/shopping", null, true)).toBe(false);
    expect(safeToReload("#/shopping", { tagName: "INPUT" } as Element, false)).toBe(false);
    expect(safeToReload("#/recipe/x", null, false, true)).toBe(false);
  });
  it("sees a filled-in box as work, not a search or a tick box", () => {
    const doc = (textareas: number, inputs: { type: string; value: string }[]) =>
      ({ querySelectorAll: (sel: string) => (sel === "textarea" ? Array(textareas) : inputs) }) as unknown as Document;
    expect(hasWorkOnScreen(doc(0, [{ type: "search", value: "pie" }, { type: "checkbox", value: "on" }, { type: "text", value: "" }]))).toBe(false);
    expect(hasWorkOnScreen(doc(0, [{ type: "text", value: "Grandma's pie" }]))).toBe(true);
    expect(hasWorkOnScreen(doc(1, []))).toBe(true);
  });
});
