import { describe, expect, it } from "vitest";
import { edgeSupport, MIN_EDGE_SUPPORT, orderCorners, plausibleQuad, type Quad } from "./docscan";

const P = (x: number, y: number) => ({ x, y });

describe("is this outline really a card?", () => {
  it("accepts a card seen straight on, turned, or at a slant", () => {
    expect(plausibleQuad([P(100, 100), P(500, 100), P(500, 370), P(100, 370)])).toBe(true);
    expect(plausibleQuad(orderCorners([P(300, 80), P(560, 250), P(400, 490), P(140, 320)]))).toBe(true); // turned ~33°
    expect(plausibleQuad([P(140, 100), P(460, 100), P(520, 380), P(80, 380)])).toBe(true); // phone tilted back
  });

  it("rejects shapes like the ones from the phone (a sharp 'triangle', a lopsided slice)", () => {
    // From the first screenshot: a long sliver running off the card onto the chair.
    expect(plausibleQuad(orderCorners([P(175, 750), P(320, 850), P(625, 1055), P(505, 1370)]))).toBe(false);
    // Nearly a triangle: one corner squashed flat.
    expect(plausibleQuad([P(100, 100), P(500, 100), P(300, 300), P(102, 300)])).toBe(false);
    // A strongly slanted shape (45° corners) with equal opposite sides: too sharp for a card seen at an angle.
    expect(plausibleQuad([P(100, 100), P(500, 100), P(700, 300), P(300, 300)])).toBe(false);
    // One side less than half its opposite.
    expect(plausibleQuad([P(100, 100), P(600, 100), P(400, 300), P(300, 300)])).toBe(false);
  });

  it("never joins the corners in a crossed (bow-tie) order, however they arrive", () => {
    const corners = [P(500, 370), P(100, 100), P(100, 370), P(500, 100)];
    expect(orderCorners(corners)).toEqual([P(100, 100), P(500, 100), P(500, 370), P(100, 370)]);
    expect(plausibleQuad([P(100, 100), P(500, 370), P(500, 100), P(100, 370)])).toBe(false); // crossed
  });

  it("checks each side follows an edge in the picture", () => {
    const W = 600, H = 400, edges = new Uint8Array(W * H);
    // The card's real outline, drawn into the edge map.
    const card: Quad = [P(100, 100), P(500, 100), P(500, 300), P(100, 300)];
    for (let x = 100; x <= 500; x++) edges[100 * W + x] = edges[300 * W + x] = 255;
    for (let y = 100; y <= 300; y++) edges[y * W + 100] = edges[y * W + 500] = 255;
    expect(edgeSupport(edges, W, H, card).every((s) => s >= MIN_EDGE_SUPPORT)).toBe(true);
    // A shape whose right side cuts across the middle of the card, where there's no edge.
    const wrong: Quad = [P(100, 100), P(500, 100), P(320, 300), P(100, 300)];
    const support = edgeSupport(edges, W, H, wrong);
    expect(support[1]).toBeLessThan(MIN_EDGE_SUPPORT);
  });
});

import { touchesBorder } from "./docscan";
describe("the edge of the camera picture isn't a card's edge", () => {
  it("rejects a shape with a side along the picture's border (the chair seat running out of view)", () => {
    expect(touchesBorder([P(0, 0), P(716, 0), P(620, 968), P(0, 916)], 720, 1280)).toBe(true); // from the chair test
    expect(touchesBorder([P(64, 595), P(632, 555), P(656, 944), P(91, 981)], 720, 1280)).toBe(false); // the card itself
  });
  it("allows a card that just reaches one corner of the picture", () => {
    expect(touchesBorder([P(0, 0), P(400, 30), P(420, 300), P(20, 280)], 720, 1280)).toBe(false);
  });
});

import { medianOf } from "./opencv";
describe("middle brightness (counted instead of sorted)", () => {
  it("gives exactly the same value as sorting", () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    for (const n of [1, 2, 3, 10, 1001, 40_000]) {
      const v = Uint8Array.from({ length: n }, rand);
      const sorted = Array.from(v).sort((a, b) => a - b);
      expect(medianOf(v)).toBe(sorted[sorted.length >> 1]);
    }
  });
});

import { EDGE_REACH, sideContrast, standsOut } from "./docscan";
describe("real photos: a page in a sleeve, and a pattern that only looks like edges", () => {
  const W = 300, H = 300;
  const page: Quad = [P(60, 60), P(240, 60), P(240, 240), P(60, 240)];

  it("counts an edge a few pixels off the outline (the sleeve's edge next to the paper's)", () => {
    const edges = new Uint8Array(W * H);
    for (let t = 60; t <= 240; t++) {
      edges[56 * W + t] = edges[244 * W + t] = 255; // 4 px outside, top and bottom
      edges[t * W + 56] = edges[t * W + 244] = 255; // 4 px outside, left and right
    }
    expect(edgeSupport(edges, W, H, page).every((s) => s < MIN_EDGE_SUPPORT)).toBe(true);
    expect(edgeSupport(edges, W, H, page, EDGE_REACH).every((s) => s >= MIN_EDGE_SUPPORT)).toBe(true);
  });

  it("a white page on a dark table stands out on every side", () => {
    const gray = new Uint8Array(W * H).fill(70);
    for (let y = 60; y <= 240; y++) for (let x = 60; x <= 240; x++) gray[y * W + x] = 230;
    expect(standsOut(sideContrast(gray, W, H, page))).toBe(true);
  });

  it("a shape traced in a carpet pattern doesn't (the same carpet inside and out)", () => {
    let seed = 5;
    const gray = Uint8Array.from({ length: W * H }, () => 60 + ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 120));
    expect(standsOut(sideContrast(gray, W, H, page))).toBe(false);
  });

  it("a page lit on one side only doesn't count (it must stand out all the way round)", () => {
    const gray = new Uint8Array(W * H).fill(150);
    for (let y = 60; y <= 240; y++) for (let x = 60; x <= 240; x++) gray[y * W + x] = 150;
    for (let y = 0; y < H; y++) for (let x = 0; x < 60; x++) gray[y * W + x] = 40; // dark only to the left
    expect(standsOut(sideContrast(gray, W, H, page))).toBe(false);
  });
});
