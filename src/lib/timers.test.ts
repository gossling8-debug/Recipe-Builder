import { describe, expect, it } from "vitest";
import { clock, findTimers } from "./timers";

describe("findTimers", () => {
  it("finds minutes", () => expect(findTimers("Cook on high pressure for 15 minutes, then quick release.")).toEqual([{ label: "15 minutes", seconds: 900, maxSeconds: 900 }]));
  it("uses the low end of a range", () => expect(findTimers("Bake 8–10 minutes until golden.")).toEqual([{ label: "8–10 minutes", seconds: 480, maxSeconds: 600 }]));
  it("finds hours and halves", () => expect(findTimers("Chill 1½ hours or 2 hrs.").map((t) => t.seconds)).toEqual([5400, 7200]));
  it("finds 'to' ranges and abbreviations", () => expect(findTimers("Simmer 20 to 25 min.")[0].seconds).toBe(1200));
  it("finds several, without duplicates", () =>
    expect(findTimers("Wait 2 minutes, add bacon, cook 5 minutes; rest 2 minutes.").map((t) => t.seconds)).toEqual([120, 300]));
  it("ignores temperatures and amounts", () => expect(findTimers("Preheat to 350°F. Add 2 cups flour.")).toEqual([]));
});

describe("clock", () => {
  it.each([[905, "15:05"], [59.2, "1:00"], [3725, "1:02:05"], [-3, "0:00"]])("%s → %s", (s, c) => expect(clock(s)).toBe(c));
});
