import { beforeEach, describe, expect, it } from "vitest";
import { addLeftover, freezeLeftover, loadLeftovers, removeLeftover } from "./leftovers";

describe("leftovers", () => {
  beforeEach(() => loadLeftovers().forEach((l) => removeLeftover(l.id)));
  const made = new Date(2026, 10, 8, 18).getTime();

  it("fridge leftovers are good through 3 days after cooking", () => {
    addLeftover("a", "Chili", made);
    const [l] = loadLeftovers();
    expect(new Date(l.eatBy).toDateString()).toBe(new Date(2026, 10, 11).toDateString());
  });
  it("one entry per recipe; cooking again resets the date", () => {
    addLeftover("a", "Chili", made);
    addLeftover("a", "Chili", made + 2 * 86400000);
    expect(loadLeftovers()).toHaveLength(1);
    expect(new Date(loadLeftovers()[0].eatBy).getDate()).toBe(13);
  });
  it("freezing gives about 3 months", () => {
    addLeftover("a", "Chili", made);
    freezeLeftover("a", made);
    const [l] = loadLeftovers();
    expect(l.frozen).toBe(true);
    expect(new Date(l.eatBy).toDateString()).toBe(new Date(2027, 1, 6).toDateString());
  });
  it("sorts soonest first", () => {
    addLeftover("a", "A", made);
    addLeftover("b", "B", made - 86400000);
    expect(loadLeftovers().map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("cook once, eat twice", () => {
  it("puts half in the freezer and goes back to the usual size", async () => {
    const { freezeHalfIfPlanned, loadLeftovers, removeLeftover } = await import("./leftovers");
    loadLeftovers().forEach((l) => removeLeftover(l.id));
    let saved: { freezeHalf?: boolean; scale: number } | null = null;
    expect(freezeHalfIfPlanned("a", "Chili", { scale: 1 }, (p) => (saved = p))).toBe(false);
    expect(freezeHalfIfPlanned("a", "Chili", { scale: 2, freezeHalf: true }, (p) => (saved = p))).toBe(true);
    expect(saved).toEqual({ scale: 1, freezeHalf: false });
    expect(loadLeftovers()[0]).toMatchObject({ id: "a", frozen: true });
  });
});
