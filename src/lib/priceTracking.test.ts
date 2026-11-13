import { beforeEach, describe, expect, it } from "vitest";
import { addPrice, deletePrice, itemPrices, loadPrices, priceInsight, spendingByStore, unitPrice, unitText } from "./prices";
import { nameKey } from "./shopping";

describe("price tracking", () => {
  beforeEach(() => [...loadPrices()].forEach((p) => deletePrice(p.id)));
  it("compares by price per oz / fl oz / each", () => {
    expect(unitText(unitPrice({ qty: { kind: "weight", g: 453.592 }, price: 4.8 })!)).toBe("$0.30/oz");
    expect(unitText(unitPrice({ qty: { kind: "volume", tsp: 768 }, price: 3.2 })!)).toBe("$0.025/fl oz");
    expect(unitText(unitPrice({ qty: { kind: "count", n: 12, noun: "egg" }, price: 3.6 })!)).toBe("$0.30/each");
  });
  it("tracks the cheapest store and the change since last time", () => {
    const d = (n: number) => new Date(2026, 9, n).getTime();
    addPrice("milk", "1 gallon", 3.2, d(1), { store: "H-E-B" });
    addPrice("milk", "1 gallon", 3.6, d(8), { store: "Walmart" });
    const it = itemPrices(nameKey("milk"))!;
    expect(it.latest.store).toBe("Walmart");
    expect(Math.round(it.change! * 100)).toBe(13);
    expect(it.byStore[0].store).toBe("H-E-B");
    const i = priceInsight("milk", "1 gallon", 3.7, "Walmart");
    expect(i.cheaperAt?.store).toBe("H-E-B");
    expect(Math.round(i.change! * 100)).toBe(3);
  });
  it("the same item number at the same store is the same product", () => {
    addPrice("2% milk", "1 gallon", 3.2, 1, { store: "Walmart", code: "0007874235186" });
    addPrice("reduced fat milk", "1 gallon", 3.3, 2, { store: "Walmart", code: "0007874235186" });
    expect(itemPrices(nameKey("2% milk"))!.count).toBe(2);
  });
  it("adds up spending by store", () => {
    addPrice("eggs", "12", 3, Date.now(), { store: "Aldi" });
    addPrice("bread", "1 loaf", 2, Date.now(), { store: "Aldi" });
    addPrice("rice", "2 lb", 4, Date.now());
    expect(spendingByStore(0)).toEqual([
      { store: "Aldi", total: 5 },
      { store: "Store not recorded", total: 4 },
    ]);
  });
});
