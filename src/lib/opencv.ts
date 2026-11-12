/**
 * OpenCV (the standard computer-vision library) for the document scanner:
 * finding a page's outline, straightening it, and cleaning it up like a scan.
 * It's large (~3–4 MB to download), so it loads only when the scanner opens
 * and is then cached.
 */
import cvUrl from "@techstark/opencv-js/dist/opencv.js?url";
import type { Quad } from "./docscan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;
let loading: Promise<CV> | null = null;

export function loadOpenCv(): Promise<CV> {
  loading ??= new Promise<CV>((resolve, reject) => {
    const w = window as unknown as { cv?: CV };
    const ready = async () => {
      let cv = w.cv;
      if (cv instanceof Promise) cv = await cv;
      if (cv?.Mat) return resolve(cv);
      cv.onRuntimeInitialized = () => resolve(cv);
    };
    if (w.cv) return void ready();
    const s = document.createElement("script");
    s.src = cvUrl;
    s.async = true;
    s.onload = () => void ready();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the scanner. Check your internet connection."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Corners in order top-left, top-right, bottom-right, bottom-left. */
function order(pts: { x: number; y: number }[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0], byDiff[3], bySum[3], byDiff[0]] as Quad;
}

/**
 * The page's outline in an image (RGBA), or null. Edges (Canny) → outlines
 * (contours) → the largest one that simplifies to four corners.
 */
export function findPage(cv: CV, img: ImageData): Quad | null {
  const W = img.width;
  const H = img.height;
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    // Thresholds from the image's own median brightness, so dim kitchens work too.
    const sorted = Array.from(gray.data as Uint8Array).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    cv.Canny(gray, edges, Math.max(10, 0.66 * median), Math.min(255, 1.33 * median));
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best: Quad | null = null;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const hull = new cv.Mat();
      cv.convexHull(c, hull);
      const area = cv.contourArea(hull);
      if (area > 0.15 * W * H && area > bestArea) {
        const peri = cv.arcLength(hull, true);
        // Simplify the outline until it's four corners.
        for (const eps of [0.02, 0.03, 0.04, 0.06, 0.08]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4) {
            const pts = [0, 1, 2, 3].map((k) => ({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] }));
            best = order(pts);
            bestArea = area;
            approx.delete();
            break;
          }
          approx.delete();
        }
      }
      hull.delete();
      c.delete();
    }
    // A page filling almost the whole picture is usually the table, not the card.
    if (best && bestArea > 0.97 * W * H) return null;
    return best;
  } finally {
    [src, gray, edges, contours, hierarchy, kernel].forEach((m) => m.delete());
  }
}

/** Straightens the quad of `source` into a flat page (as a canvas). */
export function straighten(cv: CV, source: HTMLCanvasElement, q: Quad, outW: number, outH: number): HTMLCanvasElement {
  const src = cv.imread(source);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, q.flatMap((p) => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const m = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, m, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const out = document.createElement("canvas");
    cv.imshow(out, dst);
    return out;
  } finally {
    [src, dst, from, to, m].forEach((x) => x.delete());
  }
}

/**
 * "Clean scan": evens out shadows and makes the paper white while keeping
 * ink and colors — estimate the page's background per color, then divide it out.
 */
export function cleanScan(cv: CV, page: HTMLCanvasElement): HTMLCanvasElement {
  const src = cv.imread(page);
  const planes = new cv.MatVector();
  const outPlanes = new cv.MatVector();
  const kernel = cv.Mat.ones(9, 9, cv.CV_8U);
  try {
    cv.split(src, planes);
    for (let i = 0; i < 3; i++) {
      const p = planes.get(i);
      const bg = new cv.Mat();
      const diff = new cv.Mat();
      cv.dilate(p, bg, kernel); // text disappears, paper remains
      cv.medianBlur(bg, bg, 31);
      cv.absdiff(p, bg, diff);
      cv.bitwise_not(diff, diff); // paper → white, ink stays dark
      cv.normalize(diff, diff, 0, 255, cv.NORM_MINMAX);
      outPlanes.push_back(diff);
      [p, bg, diff].forEach((x) => x.delete());
    }
    const alpha = planes.get(3);
    outPlanes.push_back(alpha);
    alpha.delete();
    const merged = new cv.Mat();
    cv.merge(outPlanes, merged);
    const out = document.createElement("canvas");
    cv.imshow(out, merged);
    merged.delete();
    return out;
  } finally {
    [src, planes, outPlanes, kernel].forEach((x) => x.delete());
  }
}
