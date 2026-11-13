import { describe, expect, it } from "vitest";
import { normalizeBarcode, sizeFromPackage } from "./barcode";
import { parseQty } from "./qty";

describe("barcodes", () => {
  it("keeps real barcodes and skips store-only numbers", () => {
    expect(normalizeBarcode("07874235186")).toBe("078742351865"); // 11 digits get their check digit
    expect(normalizeBarcode("0 37000 12345 6")).toBe("037000123456");
    expect(normalizeBarcode("4006381333931")).toBe("4006381333931");
    expect(normalizeBarcode("1234567")).toBeNull(); // Costco-style item number
    expect(normalizeBarcode(null)).toBeNull();
  });
  it("multiplies the package size by how many were bought", () => {
    expect(sizeFromPackage("14.5 oz (411 g)", 1)).toBe("14.5 oz");
    expect(sizeFromPackage("14.5 oz", 2)).toBe("29 oz (2 × 14.5 oz)");
    expect(sizeFromPackage("nonsense", 1)).toBeNull();
  });
  it("reads estimated pack sizes by their total", () => {
    expect(parseQty("174 oz (12 × 14.5 oz cans)", "green beans")).toEqual(parseQty("174 oz", "green beans"));
  });
});
