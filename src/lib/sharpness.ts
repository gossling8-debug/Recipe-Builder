import { release } from "./canvas";

/**
 * Which of several photos of the same card is the sharpest? Runs on the phone.
 *
 * Judging one photo alone ("is this blurry?") isn't reliable: faded pencil, big
 * lettering and a mostly blank card all look soft to any simple measure. Comparing
 * photos of the same card taken a moment apart is: the writing is the same, so the
 * one with the crisper edges is the one the phone held stillest for. The live scanner
 * takes a few frames and keeps the best (docs/DECISIONS.md).
 *
 * The measure: how much the shade jumps between neighbouring pixels (variance of the
 * Laplacian), across and down, keeping the lower one so a shake in one direction counts.
 */
export const MEASURE_EDGE = 800;

/** Higher = sharper. Only meaningful compared with photos of the same thing. */
export function sharpnessScore(gray: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sx = 0, sxx = 0, sy = 0, syy = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const c = 2 * gray[i];
      const lx = gray[i - 1] + gray[i + 1] - c;
      const ly = gray[i - w] + gray[i + w] - c;
      sx += lx;
      sxx += lx * lx;
      sy += ly;
      syy += ly * ly;
      n++;
    }
  }
  const varX = sxx / n - (sx / n) ** 2;
  const varY = syy / n - (sy / n) ** 2;
  return Math.min(varX, varY);
}

/** The index of the sharpest of several same-size grey images. */
export function sharpestIndex(frames: { gray: ArrayLike<number>; w: number; h: number }[]): number {
  let best = 0, bestScore = -1;
  frames.forEach((f, i) => {
    const s = sharpnessScore(f.gray, f.w, f.h);
    if (s > bestScore) (best = i), (bestScore = s);
  });
  return best;
}

/** A grey copy of part of a picture (the card's box), at most MEASURE_EDGE across. */
export function grayOf(
  source: CanvasImageSource,
  box: { x: number; y: number; w: number; h: number },
): { gray: Uint8Array; w: number; h: number } {
  const s = Math.min(1, MEASURE_EDGE / Math.max(box.w, box.h));
  const w = Math.max(3, Math.round(box.w * s));
  const h = Math.max(3, Math.round(box.h * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  release(c);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0;
  return { gray, w, h };
}
