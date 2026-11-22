import { describe, expect, it } from "vitest";
import { shrinkBetween, shrinkflation, type PriceEntry } from "./prices";

const DAY = 86_400_000;
const T = Date.parse("2026-11-01T12:00:00Z");
let n = 0;
const oz = (name: string, ounces: number, price: number, at: number, store = "Walmart", extra: Partial<PriceEntry> = {}): PriceEntry => ({
  id: `p${++n}`,
  key: name.toLowerCase(),
  name,
  qty: { kind: "weight", g: ounces * 28.3495 },
  price,
  at,
  store,
  ...extra,
});

describe("shrinkflation", () => {
  it("flags a smaller package at the same price", () => {
    const d = shrinkBetween(oz("Cereal", 12, 4.29, T), oz("Cereal", 10.8, 4.29, T + DAY));
    expect(d?.shrink).toBeCloseTo(0.1, 5);
    expect(d?.unitRise).toBeCloseTo(0.1111, 3);
  });

  it("flags a smaller package even when the price dropped a little", () => {
    expect(shrinkBetween(oz("Chips", 10, 5, T), oz("Chips", 8.5, 4.75, T + DAY))).not.toBeNull(); // 15% less, 4.75 → 11.8% more per oz
  });

  it("doesn't flag a fair price cut, a bigger package, a much smaller size, or a tiny difference", () => {
    expect(shrinkBetween(oz("Coffee", 12, 9, T), oz("Coffee", 10, 7.5, T + DAY))).toBeNull(); // price fell as much as the size
    expect(shrinkBetween(oz("Coffee", 10, 7.5, T), oz("Coffee", 12, 9, T + DAY))).toBeNull(); // bigger
    expect(shrinkBetween(oz("Rice", 48, 6, T), oz("Rice", 16, 3, T + DAY))).toBeNull(); // the small bag, not a shrink
    expect(shrinkBetween(oz("Soup", 10.75, 1.5, T), oz("Soup", 10.5, 1.5, T + DAY))).toBeNull(); // 2%: under the line
  });

  it("only compares packages of the same kind (weight with weight, eggs with eggs)", () => {
    const eggs = (count: number, price: number, at: number): PriceEntry => ({ ...oz("Eggs", 1, price, at), qty: { kind: "count", n: count, noun: "egg" } });
    expect(shrinkBetween(eggs(12, 3.5, T), eggs(10, 3.5, T + DAY))).not.toBeNull();
    expect(shrinkBetween(oz("Eggs", 24, 3.5, T), eggs(10, 3.5, T + DAY))).toBeNull();
  });

  it("compares the latest purchase with the one before at the same store only", () => {
    const prices = [
      oz("Cereal", 12, 4.29, T, "Walmart"),
      oz("Cereal", 10.8, 4.29, T + 10 * DAY, "Walmart"),
      oz("Cereal", 18, 5.99, T + 5 * DAY, "Costco"),
      oz("Cereal", 12, 4.49, T + 12 * DAY, "H-E-B"), // only one at H-E-B: nothing to compare
    ];
    const s = shrinkflation(prices);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: "Cereal", store: "Walmart" });
    expect(s[0].before.at).toBe(T);
    expect(s[0].after.at).toBe(T + 10 * DAY);
  });

  it("stops flagging once the package is back to its size", () => {
    const prices = [oz("Cereal", 12, 4.29, T), oz("Cereal", 10.8, 4.29, T + DAY), oz("Cereal", 12, 4.29, T + 2 * DAY)];
    expect(shrinkflation(prices)).toEqual([]);
  });
});

import { priceInsight } from "./prices";
describe("when a receipt is imported", () => {
  it("notes a smaller package than last time at the same store", () => {
    const prices = [oz("Cereal", 12, 4.29, T, "Walmart")];
    const i = priceInsight("Cereal", "10.8 oz", 4.29, "Walmart", prices);
    expect(i.shrank?.from.at).toBe(T);
    expect(i.shrank?.unitRise).toBeCloseTo(0.111, 2);
    // At a store it hasn't been bought at before: nothing to compare.
    expect(priceInsight("Cereal", "10.8 oz", 4.29, "Costco", prices).shrank).toBeNull();
  });
});
