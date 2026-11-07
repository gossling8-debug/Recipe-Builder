import { describe, expect, it } from "vitest";
import { add, compare, formatQty, parseQty, subtract } from "./qty";

describe("parseQty", () => {
  it.each([
    ["1½ cups", { kind: "volume", tsp: 72 }],
    ["2 tablespoons", { kind: "volume", tsp: 6 }],
    ["4 lb", { kind: "weight", g: 1814.4 }],
    ["16 oz", { kind: "weight", g: 453.6 }],
    ["2 lbs (910 g)", { kind: "weight", g: 907.2 }],
    ["3 cans", { kind: "count", n: 3, noun: "can" }],
    ["2 sticks", { kind: "weight", g: 226 }],
  ])("%s", (t, q) => {
    const p = parseQty(t)!;
    expect(p.kind).toBe(q.kind);
    for (const [k, v] of Object.entries(q)) if (typeof v === "number") expect((p as unknown as Record<string, number>)[k]).toBeCloseTo(v, 0);
    else expect((p as unknown as Record<string, unknown>)[k]).toBe(v);
  });
  it("package size: 2 (8 oz) blocks → 16 oz", () => expect(formatQty(parseQty("2 (8 oz/227 g) blocks")!)).toBe("1 lb"));
  it("bare count uses the ingredient name", () => expect(parseQty("3", "eggs")).toEqual({ kind: "count", n: 3, noun: "egg" }));
  it("no number → null", () => expect(parseQty("to taste")).toBeNull());
});

describe("arithmetic", () => {
  const sugar = "sugar";
  it("bought a 4 lb bag, used 2 cups → about 3 lb 2 oz left", () => {
    const left = subtract(parseQty("4 lb")!, parseQty("2 cups")!, sugar)!;
    expect(formatQty(left)).toBe("3⅛ lb");
  });
  it("cups vs cups", () => expect(formatQty(subtract(parseQty("2 cups")!, parseQty("¾ cup")!, "milk")!)).toBe("1¼ cups"));
  it("can't compare unknown volume and weight", () => expect(subtract(parseQty("1 lb")!, parseQty("1 cup")!, "chicken")).toBeNull());
  it("can't compare different counts", () => expect(add(parseQty("2 cans")!, parseQty("3 cloves")!, "x")).toBeNull());
  it("compare enough / some", () => {
    expect(compare(parseQty("3 cups")!, parseQty("1 cup")!, sugar)).toEqual({ status: "enough" });
    const r = compare(parseQty("½ cup")!, parseQty("1 cup")!, sugar);
    expect(r?.status).toBe("some");
    expect(r && r.status === "some" && formatQty(r.short)).toBe("½ cup");
  });
  it("4 lb sugar covers 2 cups", () => expect(compare(parseQty("4 lb")!, parseQty("2 cups")!, sugar)).toEqual({ status: "enough" }));
  it("never below zero", () => expect(formatQty(subtract(parseQty("1 cup")!, parseQty("3 cups")!, "milk")!)).toBe("0 tsp"));
});
