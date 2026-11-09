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
