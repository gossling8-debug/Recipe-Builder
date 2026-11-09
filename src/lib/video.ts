/**
 * Screen recordings of a scrolling order page → a few still frames that
 * together show every line once. Frames are sampled through the video; the
 * scroll distance between samples is measured, and a frame is kept each time
 * about half a screen of new content has come into view.
 */

/** Average brightness of each row of a small grayscale image (one number per row). */
export function rowProfile(gray: Uint8ClampedArray | number[], width: number, height: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) s += gray[y * width + x];
    out.push(s / width);
  }
  return out;
}

/**
 * How many rows the content moved up from `prev` to `cur` (0 if it didn't
 * scroll). The top and bottom `margin` share of rows (app bars that don't
 * scroll) are ignored.
 */
export function scrollShift(prev: number[], cur: number[], margin = 0.12): number {
  const h = prev.length;
  const top = Math.floor(h * margin);
  const bottom = h - Math.floor(h * margin);
  let best = 0;
  let bestErr = Infinity;
  for (let d = 0; d < (bottom - top) * 0.9; d++) {
    let err = 0;
    let n = 0;
    for (let y = top; y + d < bottom; y++) {
      err += Math.abs(cur[y] - prev[y + d]);
      n++;
    }
    if (n < (bottom - top) * 0.1) break;
    const e = err / n;
    // Prefer no movement unless moving is clearly a better fit.
    if (e < bestErr - (d === 0 ? 0 : 0.05)) {
      bestErr = e;
      best = d;
    }
  }
  return best;
}

/** Which sampled frames to keep, given the shift between each sample and the one before. */
export function pickFrames(shifts: number[], height: number, keepEvery = 0.5, max = 24): number[] {
  if (!shifts.length) return [];
  const keep = [0];
  let moved = 0;
  for (let i = 1; i < shifts.length; i++) {
    moved += shifts[i];
    if (moved >= height * keepEvery) {
      keep.push(i);
      moved = 0;
    }
  }
  if (keep[keep.length - 1] !== shifts.length - 1 && moved > height * 0.05) keep.push(shifts.length - 1);
  // Too many (a very long order): thin them out evenly, keeping the first and last.
  if (keep.length > max) {
    const step = (keep.length - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => keep[Math.round(i * step)]);
  }
  return keep;
}

// ---------- in the browser ----------
const once = (el: HTMLVideoElement, ev: string) =>
  new Promise<void>((resolve, reject) => {
    const ok = () => (cleanup(), resolve());
    const bad = () => (cleanup(), reject(new Error("This video couldn't be opened. Try screenshots instead.")));
    const cleanup = () => {
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", bad);
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });

/**
 * Pulls the frames to read out of a screen recording, as JPEG data URLs.
 * onProgress gets 0–1 while it works.
 */
export async function framesFromVideo(file: Blob, onProgress?: (p: number) => void, maxEdge = 1568): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("This video couldn't be read. Try screenshots instead.");
    if (duration > 180) throw new Error("That recording is over 3 minutes. Record just the scroll through the items (or split it in two).");

    const step = 0.35; // seconds between samples
    const times: number[] = [];
    for (let t = 0.05; t < duration; t += step) times.push(t);
    times.push(Math.max(0, duration - 0.05));

    const smallW = 48;
    const smallH = Math.round((smallW * video.videoHeight) / video.videoWidth) || 100;
    const small = document.createElement("canvas");
    small.width = smallW;
    small.height = smallH;
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const big = document.createElement("canvas");
    big.width = Math.round(video.videoWidth * scale);
    big.height = Math.round(video.videoHeight * scale);
    const bctx = big.getContext("2d")!;

    // First pass: measure scrolling between samples. If the list moved a lot
    // between two samples (a fast flick), look at a moment in between too, so
    // the measurement never loses track and no lines are skipped.
    const scrollH = smallH * 0.76; // the part of the screen that scrolls
    const shifts: number[] = [];
    const sampled: number[] = [];
    let prev: number[] | null = null;
    let prevT = 0;
    let i = 0;
    while (i < times.length && sampled.length < 1500) {
      const t = times[i];
      video.currentTime = t;
      await once(video, "seeked");
      sctx.drawImage(video, 0, 0, smallW, smallH);
      const px = sctx.getImageData(0, 0, smallW, smallH).data;
      const gray = new Uint8ClampedArray(smallW * smallH);
      for (let j = 0; j < gray.length; j++) gray[j] = (px[j * 4] * 299 + px[j * 4 + 1] * 587 + px[j * 4 + 2] * 114) / 1000;
      const profile = rowProfile(gray, smallW, smallH);
      const shift = prev ? scrollShift(prev, profile) : 0;
      if (prev && shift > scrollH * 0.5 && t - prevT > 0.06) {
        times.splice(i, 0, (prevT + t) / 2); // check halfway first
        continue;
      }
      shifts.push(shift);
      sampled.push(t);
      prev = profile;
      prevT = t;
      i++;
      onProgress?.(Math.min(0.8, (t / duration) * 0.8));
    }

    // Second pass: grab the kept frames at full sharpness (always including the last one).
    const keep = pickFrames(shifts, scrollH, 0.45);
    if (keep[keep.length - 1] !== sampled.length - 1) keep.push(sampled.length - 1);
    times.length = 0;
    times.push(...sampled);
    const out: string[] = [];
    for (let k = 0; k < keep.length; k++) {
      video.currentTime = times[keep[k]];
      await once(video, "seeked");
      bctx.drawImage(video, 0, 0, big.width, big.height);
      out.push(big.toDataURL("image/jpeg", 0.85));
      onProgress?.(0.8 + ((k + 1) / keep.length) * 0.2);
    }
    return out;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
