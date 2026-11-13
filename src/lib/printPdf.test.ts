import { describe, expect, it } from "vitest";
import { pdfSafe } from "./printPdf";

describe("pdfSafe", () => {
  it("spells out fractions and symbols the PDF font lacks", () => {
    expect(pdfSafe("1½ cups")).toBe("1 1/2 cups");
    expect(pdfSafe("⅓ cup sugar")).toBe("1/3 cup sugar");
    expect(pdfSafe("2× size · “quoted” – ok")).toBe("2x size · “quoted” – ok");
    expect(pdfSafe("crème brûlée")).toBe("crème brûlée");
    expect(pdfSafe("★ 4.5")).toBe("* 4.5");
    expect(pdfSafe("Ingredients ≈ $12.40")).toBe("Ingredients about $12.40");
  });
});
