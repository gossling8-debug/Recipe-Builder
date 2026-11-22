import { describe, expect, it } from "vitest";
import { easeQuad, followOutline } from "./DocumentScanner";
import type { Quad } from "../lib/docscan";

const box = (x: number, y: number, w = 400, h = 300): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const DIAG = 1000;

describe("the live outline", () => {
  it("glides halfway toward a small move instead of jumping", () => {
    expect(easeQuad(box(100, 100), box(110, 120), DIAG)[0]).toEqual({ x: 105, y: 110 });
  });
  it("settles on a card that holds still", () => {
    let q: Quad | null = box(100, 100);
    for (let i = 0; i < 12; i++) q = easeQuad(q, box(120, 100), DIAG);
    expect(q![0].x).toBeCloseTo(120, 1);
  });
  it("snaps straight to a card somewhere else (a different card), and appears at once", () => {
    expect(easeQuad(box(100, 100), box(500, 400), DIAG)).toEqual(box(500, 400));
    expect(easeQuad(null, box(100, 100), DIAG)).toEqual(box(100, 100));
  });

  it("ignores a one-frame mistake, but follows a new card once the next frame agrees", () => {
    const card = box(100, 100), wrong = box(500, 400);
    let st = followOutline({ shown: card, pending: null }, wrong, DIAG);
    expect(st.shown).toEqual(card); // not believed yet
    st = followOutline(st, card, DIAG); // the mistake is gone
    expect(st.shown).toEqual(card);
    st = followOutline(st, wrong, DIAG);
    st = followOutline(st, box(502, 401), DIAG); // two frames agree: it's really there
    expect(st.shown).toEqual(box(502, 401));
  });
});
