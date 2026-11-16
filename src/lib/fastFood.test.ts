import { beforeEach, describe, expect, it } from "vitest";
import { addFastFood, deleteFastFood, fastFoodPlaces, fastFoodSince, fastFoodTotal, loadFastFood } from "./fastFood";
import { addPrice, deletePrice, loadPrices, spentSince } from "./prices";

describe("fast food", () => {
  beforeEach(() => {
    loadFastFood().forEach((e) => deleteFastFood(e.id));
    [...loadPrices()].forEach((p) => deletePrice(p.id));
  });

  it("adds up separately from groceries", () => {
    addFastFood(12.5, "Chick-fil-A", 1000);
    addFastFood(8.255, " Whataburger ", 3000);
    addPrice("milk", "1 gal", 3, 2000);
    expect(fastFoodTotal(0)).toBeCloseTo(20.76);
    expect(spentSince(0)).toBeCloseTo(3); // groceries don't include fast food
    expect(fastFoodTotal(2500)).toBeCloseTo(8.26);
    expect(fastFoodSince(0).map((e) => e.place)).toEqual(["Whataburger", "Chick-fil-A"]);
  });

  it("refuses amounts that aren't money, and removes entries", () => {
    expect(addFastFood(0, null)).toBeNull();
    expect(addFastFood(-3, null)).toBeNull();
    expect(addFastFood(Number.NaN, null)).toBeNull();
    const e = addFastFood(5, "", 1)!;
    expect(e.place).toBeNull();
    deleteFastFood(e.id);
    expect(loadFastFood()).toEqual([]);
  });

  it("suggests places used most", () => {
    addFastFood(5, "Sonic", 1);
    addFastFood(5, "Taco Bell", 2);
    addFastFood(5, "Taco Bell", 3);
    expect(fastFoodPlaces()).toEqual(["Taco Bell", "Sonic"]);
  });
});
