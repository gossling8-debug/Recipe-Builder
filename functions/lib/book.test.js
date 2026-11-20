import { describe, expect, it } from "vitest";
import { buildCover, buildInterior, MIN_PAGES, PAGE, previewCoverSize } from "./bookPdf.js";
import { chargeCents, luluAddress } from "./lulu.js";

const ing = (quantity, unit, name) => ({ quantity, unit, name, preparation: null, section: null });
const step = (text) => ({ segments: [{ text, ingredient_index: null, amount: null }] });
const recipe = (title, n = 5) => ({ title, servings: "Serves 4", time: "30 min", ingredients: Array.from({ length: n }, (_, i) => ing("1", "cup", `thing ${i}`)), steps: Array.from({ length: n }, (_, i) => step(`Step ${i}`)), notes: null, photo: null });
const text = (pdf) => Buffer.from(pdf).toString("latin1");

describe("printed cookbook PDF", () => {
  it("has at least the minimum pages, an even count, at the bleed size, with only embedded fonts", () => {
    const r = buildInterior({ title: "Our Recipes", subtitle: "", dedication: "", includePhotos: false }, [recipe("A"), recipe("B")]);
    expect(r.pages).toBeGreaterThanOrEqual(MIN_PAGES);
    expect(r.pages % 2).toBe(0);
    const t = text(r.pdf);
    expect(t).toMatch(new RegExp(`/MediaBox \\[0 0 ${PAGE.w}\\.? ${PAGE.h}\\.?\\]`));
    expect(t).toContain("/FontFile2"); // embedded TrueType
    expect(t).not.toMatch(/\/BaseFont \/(Helvetica|Times|Courier)/); // no unembedded standard fonts
  });
  it("puts each recipe on its own page, and counts long books", () => {
    const many = Array.from({ length: 40 }, (_, i) => recipe(`Recipe ${i}`, 12));
    const r = buildInterior({ title: "Big", includePhotos: false }, many);
    expect(r.starts).toHaveLength(40);
    expect(new Set(r.starts).size).toBe(40);
    expect(r.pages).toBeGreaterThan(40);
  });
  it("makes a cover spread at the size it's given", () => {
    const size = previewCoverSize(24);
    const t = text(buildCover({ title: "Our Recipes", subtitle: "x", cover: null }, size));
    expect(t).toMatch(new RegExp(`/MediaBox \\[0 0 ${size.width}\\.? ${size.height}\\.?\\]`));
  });
});

describe("ordering", () => {
  it("checks the delivery address", () => {
    const ok = { name: "Sam Smith", street1: "1 Main St", city: "Austin", state: "tx", postcode: "78701", phone: "5125550100" };
    expect(luluAddress(ok)).toMatchObject({ state_code: "TX", country_code: "US", postcode: "78701" });
    expect("street2" in luluAddress({ ...ok, street2: "  " })).toBe(false);
    expect(() => luluAddress({ ...ok, phone: "" })).toThrow(/phone/);
    expect(() => luluAddress({ ...ok, state: "Texas" })).toThrow(/2-letter/);
    expect(() => luluAddress({ ...ok, postcode: "7870" })).toThrow(/ZIP/);
  });
  it("charges the book price plus delivery and tax, rounded up to the cent", () => {
    expect(chargeCents(7.991)).toBe(4999 + 800);
    expect(chargeCents(0)).toBe(4999);
    expect(chargeCents(6.99 + 1.05)).toBe(4999 + 804); // not 805 from floating point
  });
});
