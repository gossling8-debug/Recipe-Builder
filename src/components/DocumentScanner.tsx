import { useEffect, useRef, useState } from "react";
import type { Quad } from "../lib/docscan";
import { outputSize } from "../lib/docscan";
import { cleanScan, findPage, loadOpenCv, straighten } from "../lib/opencv";
import type { CropSource } from "../lib/image";
import CropEditor from "./CropEditor";

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function detect() {
    const v = video.current;
    const cv = cvRef.current;
    if (!v || !cv || !v.videoWidth) return;
    const s = DETECT_W / v.videoWidth;
    const h = Math.round(v.videoHeight * s);
    const c = document.createElement("canvas");
    c.width = DETECT_W;
    c.height = h;
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
    draw(full, steady);
    setStatus(full ? (autoRef.current ? (steady ? "Hold still…" : "Found it — hold steady") : "Found it — tap the button") : "Point the camera at the card");
    if (full && steady && autoRef.current && !capturing.current) capture();
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
    if (!q) return;
    // The video is shown whole ("contain"): work out where it sits.
    const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const ox = (r.width - v.videoWidth * s) / 2;
    const oy = (r.height - v.videoHeight * s) / 2;
    ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * s, oy + p.y * s) : ctx.moveTo(ox + p.x * s, oy + p.y * s)));
    ctx.closePath();
    ctx.fillStyle = steady ? "rgba(80, 200, 120, 0.25)" : "rgba(242, 179, 127, 0.2)";
    ctx.strokeStyle = steady ? "#50c878" : "#f2b37f";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
  }

  /** Takes the picture from the camera at full resolution. */
  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    capturing.current = true;
    navigator.vibrate?.(20);
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const frame: CropSource = { url: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height, found: live.current };
    setReview({ frame, quad: live.current });
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
    let page = straighten(cv, full, q, w, h);
    if (cleanIt) page = cleanScan(cv, page);
    return page.toDataURL("image/jpeg", props.quality ?? 0.85);
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

  if (adjusting && review) {
    return (
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
  }

  return (
    <div className="doc-scanner" role="dialog" aria-modal="true" aria-label="Scanner">
      {review ? (
        <>
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
        </>
      ) : (
        <>
          <p className="scan-status" role="status">
            {status}
          </p>
          <div className="scan-camera">
            <video ref={video} playsInline muted />
            <canvas ref={overlay} className="scan-overlay" />
          </div>
          <div className="scan-controls">
            <button className="link-btn small scan-cancel" onClick={props.onCancel}>
              Cancel
            </button>
            <button className="shutter" aria-label="Take the picture" onClick={() => !capturing.current && capture()} />
            <button className={auto ? "chip active scan-auto" : "chip scan-auto"} aria-pressed={auto} onClick={() => setAuto(!auto)}>
              Auto
            </button>
          </div>
          {props.multiPage && pages.length > 0 && (
            <button className="btn primary scan-done" onClick={() => props.onDone(pages)}>
              Done · {pages.length} {pages.length === 1 ? "page" : "pages"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
