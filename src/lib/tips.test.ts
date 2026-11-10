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
