/**
 * Finding a recipe card in a photo and straightening it, like a document
 * scanner. Runs on the phone (no AI, no upload).
 *
 * Detection: on a small grey copy, split light from dark (Otsu), take the
 * largest light or dark region that isn't the background, and use its four
 * extreme points as the card's corners. Works when the card stands out from
 * what it's lying on; otherwise the cook drags the corners.
 */
export interface Point {
  x: number;
  y: number;
}
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export function otsu(gray: ArrayLike<number>): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i] | 0]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Average jump in shade across the region's border, looking 3 pixels outward. */
function edgeContrast(gray: ArrayLike<number>, mask: Uint8Array, region: number[], w: number, h: number): number {
  let sum = 0;
  let n = 0;
  const step = 3;
  for (const i of region) {
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx]) continue; // not a border in this direction
      const ox = Math.min(Math.max(x + dx * step, 0), w - 1);
      const oy = Math.min(Math.max(y + dy * step, 0), h - 1);
      const ix = Math.min(Math.max(x - dx * (step - 1), 0), w - 1);
      const iy = Math.min(Math.max(y - dy * (step - 1), 0), h - 1);
      sum += Math.abs(gray[iy * w + ix] - gray[oy * w + ox]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Largest 4-connected region of `mask`; returns its pixel indices. */
function largestRegion(mask: Uint8Array, w: number, h: number): number[] {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    const region: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      region.push(i);
      const x = i % w;
      const nbrs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const n of nbrs) if (n >= 0 && n < w * h && mask[n] && !seen[n]) (seen[n] = 1), stack.push(n);
    }
    if (region.length > best.length) best = region;
  }
  return best;
}

const area = (q: Quad) => Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0)) / 2;
const isConvex = (q: Quad) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
};

/**
 * The card's corners in a grey image (values 0–255, row by row), in that
 * image's pixel coordinates, or null if no clear card was found.
 */
export function detectCard(gray: ArrayLike<number>, w: number, h: number): Quad | null {
  const t = otsu(gray);
  let best: Quad | null = null;
  let bestArea = 0;
  for (const light of [true, false]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = (light ? gray[i] > t : gray[i] <= t) ? 1 : 0;
    const region = largestRegion(mask, w, h);
    const frac = region.length / (w * h);
    if (frac < 0.12 || frac > 0.97) continue;
    // A region touching all four edges is the background, not the card.
    let edges = 0;
    let top = false, bottom = false, left = false, right = false;
    for (const i of region) {
      const x = i % w;
      const y = (i / w) | 0;
      if (y === 0) top = true;
      if (y === h - 1) bottom = true;
      if (x === 0) left = true;
      if (x === w - 1) right = true;
    }
    edges = +top + +bottom + +left + +right;
    if (edges >= 4) continue;
    // A card has a sharp border: across the region's edge the shade jumps.
    // Soft shading (a sunset, a gradient, a face) doesn't, so it isn't a page.
    if (edgeContrast(gray, mask, region, w, h) < 25) continue;
    let tl = { x: 0, y: 0, s: Infinity }, br = { x: 0, y: 0, s: -Infinity }, tr = { x: 0, y: 0, s: -Infinity }, bl = { x: 0, y: 0, s: Infinity };
    for (const i of region) {
      const x = i % w;
      const y = (i / w) | 0;
      if (x + y < tl.s) tl = { x, y, s: x + y };
      if (x + y > br.s) br = { x, y, s: x + y };
      if (x - y > tr.s) tr = { x, y, s: x - y };
      if (x - y < bl.s) bl = { x, y, s: x - y };
    }
    const q: Quad = [tl, tr, br, bl].map(({ x, y }) => ({ x, y })) as Quad;
    const a = area(q);
    // The region should fill most of its corner shape (a card, not a scribble).
    if (!isConvex(q) || a < 0.12 * w * h || region.length < 0.6 * a) continue;
    if (a > bestArea) {
      best = q;
      bestArea = a;
    }
  }
  return best;
}

/** Scales a quad found on a small copy back to the full image. */
export const scaleQuad = (q: Quad, s: number): Quad => q.map((p) => ({ x: p.x * s, y: p.y * s })) as Quad;

/** A slightly inset rectangle: the starting crop when no card is found. */
export const defaultQuad = (w: number, h: number, inset = 0.04): Quad => [
  { x: w * inset, y: h * inset },
  { x: w * (1 - inset), y: h * inset },
  { x: w * (1 - inset), y: h * (1 - inset) },
  { x: w * inset, y: h * (1 - inset) },
];

/** Output size for a straightened card: its average side lengths, capped. */
export function outputSize(q: Quad, maxEdge = 1568): { w: number; h: number } {
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (d(q[0], q[1]) + d(q[3], q[2])) / 2;
  const h = (d(q[0], q[3]) + d(q[1], q[2])) / 2;
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * The 3×3 projective transform taking the output rectangle (0,0)-(w,h) to the
 * quad in the photo, so each output pixel knows where to sample from.
 */
export function rectToQuad(q: Quad, w: number, h: number): number[] {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const hh = (dx1 * dy3 - dx3 * dy1) / det;
  // Unit square → quad
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + hh * p3.x, c = p0.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + hh * p3.y, f = p0.y;
  // Pre-scale so (u, v) in pixels of the output rectangle
  return [a / w, b / h, c, d / w, e / h, f, g / w, hh / h, 1];
}

export function mapPoint(m: number[], u: number, v: number): Point {
  const z = m[6] * u + m[7] * v + m[8];
  return { x: (m[0] * u + m[1] * v + m[2]) / z, y: (m[3] * u + m[4] * v + m[5]) / z };
}

/** Straightens the quad of `src` (RGBA) into a w×h RGBA image, with bilinear sampling. */
export function warp(src: { data: ArrayLike<number>; width: number; height: number }, q: Quad, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  const m = rectToQuad(q, w, h);
  const sw = src.width, sh = src.height, s = src.data;
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const p = mapPoint(m, u + 0.5, v + 0.5);
      const x = Math.min(Math.max(p.x - 0.5, 0), sw - 1.001);
      const y = Math.min(Math.max(p.y - 0.5, 0), sh - 1.001);
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (v * w + u) * 4;
      for (let c = 0; c < 4; c++)
        out[o + c] = (s[i00 + c] * (1 - fx) + s[i10 + c] * fx) * (1 - fy) + (s[i01 + c] * (1 - fx) + s[i11 + c] * fx) * fy;
    }
  }
  return out;
}
