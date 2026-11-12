import { defaultQuad, detectCard, outputSize, scaleQuad, warp, type Quad } from "./docscan";
/**
 * Shrinks a phone photo before sending it to Claude or saving it.
 * Claude doesn't benefit from images beyond ~1568px on the long edge, and a
 * smaller JPEG means a faster upload, lower cost and less storage used.
 */
export async function compressPhoto(file: Blob, maxEdge = 1568, quality = 0.85): Promise<string> {
  const img = await loadImage(file);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be opened as a photo."));
    };
    img.src = url;
  });
}

/** "data:image/jpeg;base64,AAAA" -> "AAAA" */
export function stripDataUrl(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * For receipts: a tall screenshot (an order page) would be shrunk until the
 * text is unreadable, so it's cut into overlapping pieces that each stay sharp.
 * A normal photo comes back as one piece.
 */
export async function receiptPieces(file: Blob, maxEdge = 1568, quality = 0.85): Promise<string[]> {
  const img = await loadImage(file);
  const ratio = img.height / img.width;
  if (ratio <= 2.2) return [await compressPhoto(file, maxEdge, quality)];
  const pieceH = Math.round(img.width * 1.6);
  const overlap = Math.round(pieceH * 0.08); // so a line cut at an edge appears whole in one piece
  const out: string[] = [];
  for (let top = 0; top < img.height; top += pieceH - overlap) {
    const h = Math.min(pieceH, img.height - top);
    const scale = Math.min(1, maxEdge / Math.max(img.width, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process photos.");
    ctx.drawImage(img, 0, top, img.width, h, 0, 0, canvas.width, canvas.height);
    out.push(canvas.toDataURL("image/jpeg", quality));
    if (top + h >= img.height) break;
  }
  return out;
}

// ---------- scanning: find the card and straighten it ----------

export interface CropSource {
  url: string; // the photo, up to 2000px, as a data: URL
  w: number;
  h: number;
  found: Quad | null; // the card's corners, if it was found
}

/** Loads a photo for cropping and looks for the card in it. */
export async function prepareCrop(file: Blob): Promise<CropSource> {
  const url = await compressPhoto(file, 2000, 0.9);
  const img = await loadImage(await (await fetch(url)).blob());
  const w = img.width;
  const h = img.height;
  // Detect on a small, slightly blurred grey copy: fast, and the writing on the card blurs away.
  const s = Math.min(1, 320 / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * s));
  const sh = Math.max(1, Math.round(h * s));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { url, w, h, found: null };
  ctx.filter = "blur(2px)";
  ctx.drawImage(img, 0, 0, sw, sh);
  const px = ctx.getImageData(0, 0, sw, sh).data;
  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) gray[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0;
  const q = detectCard(gray, sw, sh);
  return { url, w, h, found: q ? scaleQuad(q, 1 / s) : null };
}

export const startingQuad = (src: CropSource): Quad => src.found ?? defaultQuad(src.w, src.h);

/** Straightens the chosen corners into a flat photo of the card. */
export async function cropToCard(src: CropSource, q: Quad, maxEdge = 1568, quality = 0.85): Promise<string> {
  const img = await loadImage(await (await fetch(src.url)).blob());
  const full = document.createElement("canvas");
  full.width = src.w;
  full.height = src.h;
  const fctx = full.getContext("2d");
  if (!fctx) throw new Error("This browser can't process photos.");
  fctx.drawImage(img, 0, 0);
  const { w, h } = outputSize(q, maxEdge);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("This browser can't process photos.");
  const data = warp(fctx.getImageData(0, 0, src.w, src.h), q, w, h);
  octx.putImageData(new ImageData(data, w, h), 0, 0);
  return out.toDataURL("image/jpeg", quality);
}
