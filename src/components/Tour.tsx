import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOUR_STEPS, visibleSteps, type TourStep } from "../lib/tour";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * A short tour: dims the screen, rings one button at a time and explains it.
 * Next / Back, and Skip on every step. `onDone(true)` when finished,
 * `onDone(false)` when skipped. The home screen's steps unless given others.
 */
export default function Tour({
  steps: all = TOUR_STEPS,
  onDone,
  doneLabel = "Done",
}: {
  steps?: TourStep[];
  onDone: (finished: boolean) => void;
  doneLabel?: string;
}) {
  // Start a moment after the home screen shows, once its buttons (which depend on your plan and features) are in place.
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setSteps(visibleSteps(all, (s) => !!document.querySelector(s))), 1200);
    return () => window.clearTimeout(t);
  }, []);
  return steps ? <TourSteps steps={steps} onDone={onDone} doneLabel={doneLabel} /> : null;
}

function TourSteps({ steps, onDone, doneLabel }: { steps: TourStep[]; onDone: (finished: boolean) => void; doneLabel: string }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  // The card's height, to place it where it fits.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);
  const step = steps[i];

  const done = (finished = false) => onDone(finished);

  // Where the current button is (again after scrolling, rotating or the keyboard).
  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (!el) return setBox(null);
      // The button and anything in it that sticks out (the raised + on Add Recipe).
      const rects = [el, ...el.querySelectorAll("*")].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const right = Math.max(...rects.map((r) => r.right));
      setBox({ top, left, width: right - left, height: bottom - top });
    };
    // Bring it on screen first (things further down a page); the scroll listener then re-measures.
    const target = step.target ? document.querySelector(step.target) : null;
    const r0 = target?.getBoundingClientRect();
    if (target && r0 && (r0.top < 60 || r0.bottom > window.innerHeight - 60)) {
      // Near the top (under the header), so the card fits below it.
      window.scrollBy(0, r0.top - 90);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Escape skips; arrow keys move.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  // Nothing to show (every feature off): count it as seen.
  useEffect(() => {
    if (steps.length === 0) done(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });
  if (!step) return null;

  const pad = 6;
  // Kept inside the screen (the top buttons sit right at its edge).
  const ring = box && (() => {
    const top = Math.max(2, box.top - pad);
    const bottom = Math.min(window.innerHeight - 2, box.top + box.height + pad);
    const left = Math.max(2, box.left - pad);
    const right = Math.min(window.innerWidth - 2, box.left + box.width + pad);
    return { top, left, width: right - left, height: bottom - top };
  })();
  // The card goes on the side of the button with more room.
  // Below the button if it fits, else above, else over the bottom of the screen (a tall button).
  const H = window.innerHeight;
  const roomBelow = ring ? H - (ring.top + ring.height) : H - 80;
  const roomAbove = ring ? ring.top : 0;
  const place: React.CSSProperties = !ring
    ? { top: 80 }
    : roomBelow >= cardH + 24
      ? { top: ring.top + ring.height + 12 }
      : roomAbove >= cardH + 24
        ? { bottom: H - ring.top + 12 }
        : { bottom: 12 };
  const last = i === steps.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {ring ? <div className="tour-ring" style={ring} /> : <div className="tour-dim" />}
      <div
        className="tour-card"
        ref={cardRef}
        style={place}
      >
        <p className="muted small tour-count">
          {i + 1} of {steps.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="link-btn small" onClick={() => done(false)}>
            Skip tour
          </button>
          <span className="tour-nav">
            {i > 0 && (
              <button className="btn" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button className="btn primary" autoFocus onClick={() => (last ? done(true) : setI(i + 1))}>
              {last ? doneLabel : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
