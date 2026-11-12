import { describe, expect, it } from "vitest";
import { detectCard, mapPoint, outputSize, rectToQuad, type Quad } from "./docscan";

/** A synthetic photo: a light card (a tilted quad) on a darker table. */
function photo(w: number, h: number, card: Quad, cardShade = 230, table = 70): number[] {
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = card[i], b = card[(i + 1) % 4];
      const c = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
      if (c && sign && c !== sign) return false;
      if (c) sign = c;
    }
    return true;
  };
  const g: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.push(inside(x, y) ? cardShade + ((x * 7 + y * 3) % 9) : table + ((x + y) % 11));
  return g;
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 4) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe("finding the card", () => {
  it("finds a straight card", () => {
    const card: Quad = [{ x: 40, y: 30 }, { x: 260, y: 30 }, { x: 260, y: 190 }, { x: 40, y: 190 }];
    const q = detectCard(photo(300, 220, card), 300, 220)!;
    expect(q).not.toBeNull();
    q.forEach((p, i) => expect(near(p, card[i]), `corner ${i}: ${JSON.stringify(p)}`).toBe(true));
  });
  it("finds a tilted card photographed at an angle", () => {
    const card: Quad = [{ x: 70, y: 40 }, { x: 250, y: 60 }, { x: 230, y: 200 }, { x: 50, y: 170 }];
    const q = detectCard(photo(300, 230, card), 300, 230)!;
    q.forEach((p, i) => expect(near(p, card[i], 5), `corner ${i}: ${JSON.stringify(p)}`).toBe(true));
  });
  it("finds a dark card on a light counter too", () => {
    const card: Quad = [{ x: 60, y: 50 }, { x: 240, y: 50 }, { x: 240, y: 170 }, { x: 60, y: 170 }];
    const q = detectCard(photo(300, 220, card, 60, 225), 300, 220)!;
    q.forEach((p, i) => expect(near(p, card[i]), `corner ${i}`).toBe(true));
  });
  it("doesn't mistake soft shading (a gradient, a sunset) for a page", () => {
    const w = 240, h = 180;
    const g: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.push(Math.round(40 + (180 * (x + y)) / (w + h)));
    expect(detectCard(g, w, h)).toBeNull();
  });
  it("gives up (null) on a photo with no card", () => {
    const flat = Array.from({ length: 200 * 150 }, (_, i) => 120 + (i % 7));
    expect(detectCard(flat, 200, 150)).toBeNull();
  });
});

describe("straightening", () => {
  it("maps the output rectangle's corners onto the card's corners", () => {
    const card: Quad = [{ x: 70, y: 40 }, { x: 250, y: 60 }, { x: 230, y: 200 }, { x: 50, y: 170 }];
    const { w, h } = outputSize(card);
    const m = rectToQuad(card, w, h);
    [[0, 0], [w, 0], [w, h], [0, h]].forEach(([u, v], i) => expect(near(mapPoint(m, u, v), card[i], 0.01)).toBe(true));
  });
  it("sizes the output from the card's sides, capped", () => {
    expect(outputSize([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }])).toEqual({ w: 400, h: 300 });
    expect(outputSize([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], 1568)).toEqual({ w: 1568, h: 1176 });
  });
});
