import { useEffect, useRef, useState } from "react";
import { defaultQuad, type Point, type Quad } from "../lib/docscan";
import { cropToCard, startingQuad, type CropSource } from "../lib/image";

/**
 * Like a scanning app: shows the photo with the card's corners found, lets the
 * cook drag them, then straightens the card. "Use whole photo" skips cropping.
 */
export default function CropEditor(props: {
  source: CropSource;
  quad?: Quad;
  onDone: (photo: string, quad: Quad | null) => void;
  onCancel: () => void;
  /** Output size and quality (smaller for photos shared in cookbooks). */
  maxEdge?: number;
  quality?: number;
  /** When no card or page is found: start from the whole photo (for photos that may not be of a page). */
  wholeIfNotFound?: boolean;
  cancelLabel?: string;
}) {
  const { source } = props;
  const [quad, setQuad] = useState<Quad>(() => props.quad ?? (props.wholeIfNotFound && !source.found ? defaultQuad(source.w, source.h, 0) : startingQuad(source)));
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const [scale, setScale] = useState(1); // screen px per photo px

  useEffect(() => {
    const measure = () => box.current && setScale(box.current.clientWidth / source.w);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [source.w]);

  const toPhoto = (e: React.PointerEvent): Point => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / scale, 0), source.w),
      y: Math.min(Math.max((e.clientY - r.top) / scale, 0), source.h),
    };
  };

  async function finish(useWhole: boolean) {
    setBusy(true);
    try {
      if (useWhole) {
        const { compressPhoto } = await import("../lib/image");
        props.onDone(await compressPhoto(await (await fetch(source.url)).blob(), props.maxEdge, props.quality), null);
      } else props.onDone(await cropToCard(source, quad, props.maxEdge, props.quality), quad);
    } catch (e) {
      console.warn("Crop failed; using the whole photo.", e);
      props.onDone(source.url, null);
    }
  }

  const pts = quad.map((p) => `${p.x * scale},${p.y * scale}`).join(" ");
  return (
    <div className="crop-screen" role="dialog" aria-modal="true" aria-label="Crop the photo">
      <p className="crop-help">
        {props.quad
          ? "Drag the corners to the edges."
          : source.found
            ? "Found the edges. Drag a corner to adjust."
            : props.wholeIfNotFound
              ? "No page found — drag the corners to crop, or keep the whole photo."
              : "Couldn't find the card's edges — drag the corners to them."}
      </p>
      <div className="crop-stage">
        <div className="crop-box" ref={box} style={{ aspectRatio: `${source.w} / ${source.h}` }}>
          <img src={source.url} alt="" draggable={false} />
          <svg
            className="crop-overlay"
            onPointerMove={(e) => {
              if (dragging.current === null) return;
              const p = toPhoto(e);
              setQuad((q) => q.map((c, i) => (i === dragging.current ? p : c)) as Quad);
            }}
            onPointerUp={() => (dragging.current = null)}
            onPointerCancel={() => (dragging.current = null)}
          >
            <defs>
              <mask id="crop-hole">
                <rect width="100%" height="100%" fill="white" />
                <polygon points={pts} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#crop-hole)" />
            <polygon points={pts} className="crop-edge" />
            {quad.map((p, i) => (
              <g key={i}>
                <circle cx={p.x * scale} cy={p.y * scale} r={11} className="crop-handle" />
                <circle
                  cx={p.x * scale}
                  cy={p.y * scale}
                  r={26}
                  fill="transparent"
                  aria-label={["Top-left", "Top-right", "Bottom-right", "Bottom-left"][i] + " corner"}
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    dragging.current = i;
                  }}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
      <div className="crop-actions">
        <button className="btn" disabled={busy} onClick={() => finish(true)}>
          Use whole photo
        </button>
        <button className="btn primary" disabled={busy} onClick={() => finish(false)}>
          {busy ? "Cropping…" : "Crop"}
        </button>
      </div>
      <button className="link-btn small crop-cancel" disabled={busy} onClick={props.onCancel}>
        {props.cancelLabel ?? "Don't add this photo"}
      </button>
    </div>
  );
}
