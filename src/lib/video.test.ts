import { describe, expect, it } from "vitest";
import { pickFrames, scrollShift } from "./video";

// A fake "page": a long column of row brightnesses with an irregular pattern.
const page = Array.from({ length: 2000 }, (_, i) => 128 + 100 * Math.sin(i * 0.37) * Math.cos(i * 0.051));
const bar = (h: number) => Array.from({ length: h }, () => 240); // a header/footer that doesn't scroll
const screen = (scrollTop: number, h = 200) => {
  const head = bar(24);
  const foot = bar(24);
  return [...head, ...page.slice(scrollTop, scrollTop + h - 48), ...foot];
};

describe("screen recording frames", () => {
  it("measures how far the list scrolled, ignoring fixed bars", () => {
    expect(scrollShift(screen(100), screen(100))).toBe(0);
    expect(scrollShift(screen(100), screen(130))).toBe(30);
    expect(scrollShift(screen(0), screen(90))).toBe(90);
  });

  it("keeps a frame each time about half a screen has scrolled by", () => {
    const shifts = [0, 20, 20, 20, 20, 20, 0, 0, 40, 40, 10];
    expect(pickFrames(shifts, 100)).toEqual([0, 3, 8, 10]); // 60 → keep; 20+20+0+0+40 → keep; 40+10 → keep
  });

  it("keeps just one frame if nothing scrolled", () => {
    expect(pickFrames([0, 0, 0, 0], 100)).toEqual([0]);
  });

  it("thins out a very long recording", () => {
    const shifts = Array.from({ length: 200 }, (_, i) => (i ? 60 : 0));
    const keep = pickFrames(shifts, 100, 0.5, 10);
    expect(keep).toHaveLength(10);
    expect(keep[0]).toBe(0);
    expect(keep[9]).toBe(199);
  });
});
