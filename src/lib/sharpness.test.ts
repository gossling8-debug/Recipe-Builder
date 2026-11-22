import { describe, expect, it } from "vitest";
import { sharpestIndex } from "./sharpness";

const W = 800, H = 530;
// A repeatable "random" (so the grain is the same every run).
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/** A card at the measuring size: paper with grain, and rows of short strokes like handwriting. */
function card(ink: number, rows = 8): Float32Array {
  const g = new Float32Array(W * H).fill(240);
  for (let r = 0; r < rows; r++) {
    const top = 40 + r * 55;
    for (let x = 60; x < 700; x += 9 + ((rand() * 8) | 0)) {
      const tall = 14 + ((rand() * 14) | 0), thick = 2 + ((rand() * 2) | 0);
      for (let y = top; y < top + tall; y++) for (let dx = 0; dx < thick; dx++) g[y * W + x + dx] = ink;
      if (rand() < 0.5) for (let dx = 0; dx < 7; dx++) for (let t = 0; t < thick; t++) g[(top + t) * W + x + dx] = ink; // a crossbar
    }
  }
  return g.map((v) => v + (rand() - 0.5) * 8);
}

/** Blur along one direction with a [1..1]/n box, `times` passes (3 passes ≈ out of focus). */
function blur(src: Float32Array, n: number, dir: "x" | "y", times = 1): Float32Array {
  let a = src;
  for (let t = 0; t < times; t++) {
    const out = new Float32Array(W * H);
    const half = n >> 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let k = -half; k <= half; k++) {
          const xx = dir === "x" ? x + k : x, yy = dir === "y" ? y + k : y;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) (s += a[yy * W + xx]), c++;
        }
        out[y * W + x] = s / c;
      }
    a = out;
  }
  return a;
}
const outOfFocus = (g: Float32Array, n: number) => blur(blur(g, n, "x", 3), n, "y", 3);

const gray = (g: Float32Array) => ({ gray: Uint8Array.from(g, (v) => Math.max(0, Math.min(255, Math.round(v)))), w: W, h: H });

describe("keeping the sharpest of a few frames", () => {
  // Every kind of card, every kind of blur: the steady frame must win, wherever it is in the burst.
  const cards = { dark: card(40), faded: card(195), sparse: card(40, 2) };
  const blurs = {
    "out of focus": (g: Float32Array) => outOfFocus(g, 3),
    "slightly soft": (g: Float32Array) => outOfFocus(g, 2),
    "shake across": (g: Float32Array) => blur(g, 9, "x"),
    "shake down": (g: Float32Array) => blur(g, 9, "y"),
    "small shake": (g: Float32Array) => blur(g, 3, "x"),
  };
  for (const [cardName, c] of Object.entries(cards))
    for (const [blurName, b] of Object.entries(blurs))
      it(`${cardName} card: the steady frame beats one with ${blurName}`, () => {
        expect(sharpestIndex([gray(b(c)), gray(c)])).toBe(1);
        expect(sharpestIndex([gray(c), gray(b(c))])).toBe(0);
      });

  it("of three frames, picks the steady one", () => {
    const c = card(40);
    expect(sharpestIndex([gray(blur(c, 9, "x")), gray(outOfFocus(c, 2)), gray(c)])).toBe(2);
    expect(sharpestIndex([gray(blur(c, 9, "y")), gray(c), gray(blur(c, 3, "x"))])).toBe(1);
  });
});
