import { useEffect, useRef, useState } from "react";
import type { Quad } from "../lib/docscan";
import { outputSize } from "../lib/docscan";
import { cleanScan, findPage, loadOpenCv, straighten } from "../lib/opencv";
import type { CropSource } from "../lib/image";
import CropEditor from "./CropEditor";
import { grayOf, sharpestIndex } from "../lib/sharpness";
import { release } from "../lib/canvas";
import { scaleQuad } from "../lib/docscan";

export interface ScannedPage {
  photo: string; // the finished scan (data: URL)
  source: CropSource; // the full camera frame, for adjusting the corners later
  quad: Quad | null;
}

/** Moves each corner a little toward the middle. */
const insetQuad = (q: Quad, by: number): Quad => {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4;
  const cy = q.reduce((s, p) => s + p.y, 0) / 4;
  return q.map((p) => ({ x: p.x + (cx - p.x) * by * 2, y: p.y + (cy - p.y) * by * 2 })) as Quad;
};

const DETECT_W = 480; // detection runs on a small copy of each frame
const STEADY_FRAMES = 8; // ~1 second of the outline holding still → take the picture
const HOLD_FRAMES = 4; // keep showing the outline through ~half a second of missed frames (no flicker)
const BURST = 3; // frames taken a moment apart when the picture is taken; the sharpest is kept
const BURST_GAP_MS = 90;
/** Captured frames are at most this big (the scan itself is at most 1568), to stay within iPhone Safari's canvas memory. */
const CAPTURE_EDGE = 2560;

const far = (a: Quad, b: Quad, diag: number) => a.some((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) > 0.15 * diag);

/** Eases the shown outline toward the newest one, so it glides instead of jumping. A big jump (a different card) snaps. */
export function easeQuad(shown: Quad | null, next: Quad, diag: number, amount = 0.5): Quad {
  if (!shown || far(shown, next, diag)) return next;
  return shown.map((p, i) => ({ x: p.x + (next[i].x - p.x) * amount, y: p.y + (next[i].y - p.y) * amount })) as Quad;
}

/**
 * The outline to show after a new detection. A shape far from the shown one is believed
 * only when the next frame agrees, so a one-frame mistake (a shadow, a picture on the
 * card) never flashes up; nearby moves glide.
 */
export function followOutline(
  state: { shown: Quad | null; pending: Quad | null },
  found: Quad,
  diag: number,
): { shown: Quad | null; pending: Quad | null } {
  if (state.shown && far(state.shown, found, diag) && !(state.pending && !far(state.pending, found, diag)))
    return { shown: state.shown, pending: found };
  return { shown: easeQuad(state.shown, found, diag), pending: null };
}

/**
 * A live document scanner, like a bank's check scanner or Apple's "Scan
 * Documents": the camera view outlines the page as you aim, takes the picture
 * by itself when the outline holds steady, straightens it and cleans it up.
 */
export default function DocumentScanner(props: {
  multiPage?: boolean;
  cleanByDefault?: boolean;
  maxEdge?: number;
  quality?: number;
  onDone: (pages: ScannedPage[]) => void;
  onCancel: () => void;
  /** No camera available (or not allowed): fall back to choosing a photo. */
  onNoCamera: (why: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Starting the camera…");
  const [auto, setAuto] = useState(true);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [review, setReview] = useState<{ frame: CropSource; quad: Quad | null } | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [clean, setClean] = useState(props.cleanByDefault ?? true);
  const [preview, setPreview] = useState<string | null>(null);
  const cvRef = useRef<unknown>(null);
  const live = useRef<Quad | null>(null);
  const detectCanvas = useRef<HTMLCanvasElement | null>(null); // one, reused for every look
  const shown = useRef<Quad | null>(null);
  const pending = useRef<Quad | null>(null);
  const misses = useRef(0);
  const history = useRef<Quad[]>([]);
  const capturing = useRef(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const reviewRef = useRef(review);
  reviewRef.current = review;

  // Camera + OpenCV
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer = 0;
    const drawn = overlay.current; // freed when the scanner closes
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open the camera here.");
        const [s, cv] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }),
          loadOpenCv(),
        ]);
        if (stop) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        cvRef.current = cv;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        setStatus("Point the camera at the card");
        const tick = () => {
          if (stop) return;
          if (!reviewRef.current) detect();
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        props.onNoCamera(
          name === "NotAllowedError"
            ? "Camera access is off for this site. Allow the camera in your browser's settings, or choose a photo instead."
            : e instanceof Error
              ? e.message
              : "The camera couldn't start.",
        );
      }
    })();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      release(detectCanvas.current, drawn);
      detectCanvas.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function detect() {
    const v = video.current;
    const cv = cvRef.current;
    if (!v || !cv || !v.videoWidth) return;
    const s = DETECT_W / v.videoWidth;
    const h = Math.round(v.videoHeight * s);
    const c = (detectCanvas.current ??= document.createElement("canvas"));
    if (c.width !== DETECT_W || c.height !== h) {
      c.width = DETECT_W;
      c.height = h;
    }
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, DETECT_W, h);
    const q = findPage(cv, ctx.getImageData(0, 0, DETECT_W, h));
    const full = q ? (q.map((p) => ({ x: p.x / s, y: p.y / s })) as Quad) : null;
    live.current = full;
    // Holding steady? Corners moving less than 2% of the frame over the last second.
    if (full) history.current = [...history.current.slice(-(STEADY_FRAMES - 1)), full];
    else history.current = [];
    const diag = Math.hypot(v.videoWidth, v.videoHeight);
    const steady =
      history.current.length >= STEADY_FRAMES &&
      history.current.every((hq) => hq.every((p, i) => Math.hypot(p.x - full![i].x, p.y - full![i].y) < 0.02 * diag));
    // What's drawn: eased toward each new outline, and kept through a few missed frames.
    if (full) {
      misses.current = 0;
      ({ shown: shown.current, pending: pending.current } = followOutline({ shown: shown.current, pending: pending.current }, full, diag));
    } else if (++misses.current > HOLD_FRAMES) shown.current = null;
    draw(shown.current, steady);
    if (capturing.current) return;
    setStatus(
      shown.current
        ? autoRef.current
          ? steady
            ? "Hold still…"
            : "Found it — hold steady"
          : "Found it — tap the button"
        : "Fit the card inside the corners",
    );
    if (full && steady && autoRef.current && !capturing.current) void capture();
  }

  function draw(q: Quad | null, steady: boolean) {
    const v = video.current;
    const o = overlay.current;
    if (!v || !o) return;
    const r = v.getBoundingClientRect();
    o.width = r.width;
    o.height = r.height;
    const ctx = o.getContext("2d")!;
    ctx.clearRect(0, 0, o.width, o.height);
    // The video is shown whole ("contain"): work out where it sits.
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const ox = (r.width - v.videoWidth * s) / 2;
    const oy = (r.height - v.videoHeight * s) / 2;
    if (!q) {
      // Nothing found yet: corners to aim at, like a bank's check scanner.
      const vw = v.videoWidth * s, vh = v.videoHeight * s;
      const x0 = ox + vw * 0.08, y0 = oy + vh * 0.08, x1 = ox + vw * 0.92, y1 = oy + vh * 0.92;
      const arm = Math.min(vw, vh) * 0.12;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]) {
        ctx.moveTo(x + dx * arm, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * arm);
      }
      ctx.stroke();
      return;
    }
    // Found: the card shaded blue, like Apple's document scanner; firmer once it's held steady.
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * s, oy + p.y * s) : ctx.moveTo(ox + p.x * s, oy + p.y * s)));
    ctx.closePath();
    ctx.fillStyle = steady ? "rgba(10, 132, 255, 0.38)" : "rgba(10, 132, 255, 0.24)";
    ctx.strokeStyle = "rgba(10, 132, 255, 0.95)";
    ctx.lineWidth = steady ? 4 : 3;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    // The aiming corners move onto the card's own corners, so they fit whatever is being scanned.
    const pts = q.map((p) => ({ x: ox + p.x * s, y: oy + p.y * s }));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach((p, i) => {
      for (const o of [pts[(i + 3) % 4], pts[(i + 1) % 4]]) {
        const len = Math.hypot(o.x - p.x, o.y - p.y) || 1;
        const arm = Math.min(28, len * 0.2);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + ((o.x - p.x) / len) * arm, p.y + ((o.y - p.y) / len) * arm);
      }
    });
    ctx.stroke();
  }

  /**
   * Takes the picture from the camera at full resolution: a few frames a moment apart,
   * keeping the sharpest (the one the phone was held stillest for).
   */
  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    capturing.current = true;
    setStatus("Hold still…");
    // Frames at most CAPTURE_EDGE across; the outline is scaled to match.
    const k = Math.min(1, CAPTURE_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const fw = Math.round(v.videoWidth * k), fh = Math.round(v.videoHeight * k);
    const quad = live.current ? scaleQuad(live.current, k) : null;
    // Judge sharpness on the card itself, not the table around it.
    const xs = quad?.map((p) => p.x) ?? [0, fw];
    const ys = quad?.map((p) => p.y) ?? [0, fh];
    const box = {
      x: Math.max(0, Math.min(...xs)),
      y: Math.max(0, Math.min(...ys)),
      w: Math.max(3, Math.min(fw, Math.max(...xs)) - Math.max(0, Math.min(...xs))),
      h: Math.max(3, Math.min(fh, Math.max(...ys)) - Math.max(0, Math.min(...ys))),
    };
    const frames: HTMLCanvasElement[] = [];
    for (let i = 0; i < BURST; i++) {
      if (i) await new Promise((r) => setTimeout(r, BURST_GAP_MS));
      const c = document.createElement("canvas");
      c.width = fw;
      c.height = fh;
      c.getContext("2d")!.drawImage(v, 0, 0, fw, fh);
      frames.push(c);
    }
    navigator.vibrate?.(20);
    const c = frames[sharpestIndex(frames.map((f) => grayOf(f, box)))];
    const frame: CropSource = { url: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height, found: quad };
    release(...frames);
    setReview({ frame, quad });
    history.current = [];
  }

  // The finished page for the review screen.
  useEffect(() => {
    if (!review) return setPreview(null);
    let cancelled = false;
    (async () => {
      const page = await finish(review.frame, review.quad, clean);
      if (!cancelled) setPreview(page);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, clean]);

  async function finish(frame: CropSource, quad: Quad | null, cleanIt: boolean): Promise<string> {
    const cv = cvRef.current ?? (await loadOpenCv());
    const img = new Image();
    img.src = frame.url;
    await img.decode();
    const full = document.createElement("canvas");
    full.width = frame.w;
    full.height = frame.h;
    full.getContext("2d")!.drawImage(img, 0, 0);
    // Trim just inside a found outline, so the card's edge and shadow don't show as a dark line.
    const q = quad
      ? insetQuad(quad, 0.02)
      : ([{ x: 0, y: 0 }, { x: frame.w, y: 0 }, { x: frame.w, y: frame.h }, { x: 0, y: frame.h }] as Quad);
    const { w, h } = outputSize(q, props.maxEdge ?? 1568);
    const straight = straighten(cv, full, q, w, h);
    release(full);
    const page = cleanIt ? cleanScan(cv, straight) : straight;
    const url = page.toDataURL("image/jpeg", props.quality ?? 0.85);
    release(straight, page);
    return url;
  }

  function keep() {
    if (!review || !preview) return;
    const page: ScannedPage = { photo: preview, source: review.frame, quad: review.quad };
    const all = [...pages, page];
    setReview(null);
    capturing.current = false;
    if (props.multiPage) setPages(all);
    else props.onDone(all);
  }

  const editor = adjusting && review && (
      <CropEditor
        source={review.frame}
        quad={review.quad ?? undefined}
        cancelLabel="Back"
        onCancel={() => setAdjusting(false)}
        onDone={(_photo, quad) => {
          setAdjusting(false);
          setReview({ ...review, quad });
        }}
      />
  );

  return (
    <div className="doc-scanner" role="dialog" aria-modal="true" aria-label="Scanner">
      {editor}
      {/* The camera stays mounted (just hidden) while reviewing, so its picture keeps flowing for the next page. */}
      <div className="scan-live" hidden={!!review}>
        <p className="scan-status" role="status">
          {props.multiPage && pages.length ? `${status} · page ${pages.length + 1}` : status}
        </p>
        <div className="scan-camera">
          <video ref={video} playsInline muted />
          <canvas ref={overlay} className="scan-overlay" />
        </div>
        <div className="scan-controls">
          <button className="link-btn small scan-cancel" onClick={props.onCancel}>
            Cancel
          </button>
          <button className="shutter" aria-label="Take the picture" onClick={() => !capturing.current && void capture()} />
          <button className={auto ? "chip active scan-auto" : "chip scan-auto"} aria-pressed={auto} onClick={() => setAuto(!auto)}>
            Auto
          </button>
        </div>
        {props.multiPage && pages.length > 0 && (
          <button className="btn primary scan-done" onClick={() => props.onDone(pages)}>
            Done · {pages.length} {pages.length === 1 ? "page" : "pages"}
          </button>
        )}
      </div>
      {review && (
        <div className="scan-review-wrap">
          <p className="scan-status">{props.multiPage && pages.length ? `Page ${pages.length + 1}` : "Check the scan"}</p>
          <div className="scan-review">{preview ? <img src={preview} alt="The scanned page" /> : <p className="scan-status">Straightening…</p>}</div>
          <div className="segmented scan-look" role="radiogroup" aria-label="Look">
            <button role="radio" aria-checked={clean} className={clean ? "chip active" : "chip"} onClick={() => setClean(true)}>
              Clean scan
            </button>
            <button role="radio" aria-checked={!clean} className={!clean ? "chip active" : "chip"} onClick={() => setClean(false)}>
              Original color
            </button>
          </div>
          <div className="scan-actions">
            <button
              className="btn"
              onClick={() => {
                setReview(null);
                capturing.current = false;
              }}
            >
              Retake
            </button>
            <button className="btn" onClick={() => setAdjusting(true)}>
              Adjust corners
            </button>
            <button className="btn primary" disabled={!preview} onClick={keep}>
              {props.multiPage ? "Keep scan" : "Use scan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
