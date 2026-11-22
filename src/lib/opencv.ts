/**
 * OpenCV (the standard computer-vision library) for the document scanner:
 * finding a page's outline, straightening it, and cleaning it up like a scan.
 * It's large (~3–4 MB to download), so it loads only when the scanner opens
 * and is then cached.
 */
import cvUrl from "@techstark/opencv-js/dist/opencv.js?url";
import { edgeSupport, MIN_EDGE_SUPPORT, orderCorners, plausibleQuad, touchesBorder, type Quad } from "./docscan";

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

/** Four-cornered outlines in a black-and-white mask: each outline's hull, simplified to 4 corners. */
function quadCandidates(cv: CV, mask: CV, W: number, H: number): { area: number; q: Quad }[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const out: { area: number; q: Quad }[] = [];
  try {
    cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const hull = new cv.Mat();
      cv.convexHull(c, hull);
      const area = cv.contourArea(hull);
      // Big enough to be the card; not the whole picture (that's the table).
      if (area >= MIN_AREA * W * H && area <= 0.97 * W * H) {
        const peri = cv.arcLength(hull, true);
        for (const eps of [0.02, 0.03, 0.04, 0.06, 0.08]) {
          const approx = new cv.Mat();
          cv.approxPolyDP(hull, approx, eps * peri, true);
          const four = approx.rows === 4;
          if (four) out.push({ area, q: orderCorners([0, 1, 2, 3].map((k) => ({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] }))) });
          approx.delete();
          if (four) break;
        }
      }
      hull.delete();
      c.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  return out;
}
const MIN_AREA = 0.1; // of the picture

/**
 * The page's outline in an image (RGBA), or null. Showing nothing beats showing a wrong shape.
 *
 * Two ways of spotting it, each giving four-cornered outlines (quadCandidates):
 * - edges (Canny), for a card that stands out by its outline;
 * - paper: bright, colourless areas (Otsu on brightness minus colour), for a card on a busy
 *   background like carpet, where its edges blur into the pattern.
 * The largest outline that is card-shaped (plausibleQuad), doesn't run along the picture's
 * border (touchesBorder) and follows real edges (edgeSupport) wins. Measured on frames made
 * from the owner's own carpet, cabinet and chair photos (docs/DECISIONS.md).
 */
export function findPage(cv: CV, img: ImageData): Quad | null {
  const W = img.width;
  const H = img.height;
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const rgb = new cv.Mat();
  const hsv = new cv.Mat();
  const channels = new cv.MatVector();
  const halfS = new cv.Mat();
  const paper = new cv.Mat();
  const paperEdges = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const big = cv.Mat.ones(7, 7, cv.CV_8U);
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    // Thresholds from the image's own median brightness, so dim kitchens work too.
    const sorted = Array.from(gray.data as Uint8Array).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    cv.Canny(gray, edges, Math.max(10, 0.66 * median), Math.min(255, 1.33 * median));
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2);
    const edgeMap = edges.data as Uint8Array;

    // Paper: brightness minus half the colour, split by Otsu, texture smoothed away.
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.GaussianBlur(rgb, rgb, new cv.Size(9, 9), 0);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    cv.split(hsv, channels);
    const s = channels.get(1), v = channels.get(2);
    s.convertTo(halfS, -1, 0.5, 0);
    cv.subtract(v, halfS, paper);
    s.delete();
    v.delete();
    cv.threshold(paper, paper, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(paper, paper, cv.MORPH_OPEN, big);
    cv.morphologyEx(paper, paper, cv.MORPH_CLOSE, big);
    cv.Canny(paper, paperEdges, 50, 150);
    cv.dilate(paperEdges, paperEdges, kernel, new cv.Point(-1, -1), 2);
    const paperEdgeMap = paperEdges.data as Uint8Array;

    const fromEdges = quadCandidates(cv, edges, W, H).map((c) => ({ ...c, paper: false }));
    const fromPaper = quadCandidates(cv, paper, W, H).map((c) => ({ ...c, paper: true }));
    let best: Quad | null = null;
    let bestArea = 0;
    for (const c of [...fromEdges, ...fromPaper]) {
      if (c.area <= bestArea || !plausibleQuad(c.q) || touchesBorder(c.q, W, H)) continue;
      // Edges all round: of the picture, or of the paper region (which must also mostly sit on picture edges).
      const sides = edgeSupport(c.paper ? paperEdgeMap : edgeMap, W, H, c.q);
      if (sides.some((x) => x < MIN_EDGE_SUPPORT)) continue;
      if (c.paper) {
        const onPicture = edgeSupport(edgeMap, W, H, c.q);
        if (onPicture.reduce((a, b) => a + b, 0) / 4 < 0.5) continue;
      }
      best = c.q;
      bestArea = c.area;
    }
    return best;
  } finally {
    [src, gray, edges, rgb, hsv, channels, halfS, paper, paperEdges, kernel, big].forEach((m) => m.delete());
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
