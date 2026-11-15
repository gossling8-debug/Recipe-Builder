import { useEffect, useLayoutEffect, useState } from "react";
import { finishTour, TOUR_STEPS, visibleSteps, type TourStep } from "../lib/tour";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * A short tour of the home screen: dims the screen, rings one button at a
 * time and explains it. Next / Back, and Skip on every step.
 */
export default function Tour({ onDone }: { onDone: () => void }) {
  // Start a moment after the home screen shows, once its buttons (which depend on your plan and features) are in place.
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setSteps(visibleSteps(TOUR_STEPS, (s) => !!document.querySelector(s))), 1200);
    return () => window.clearTimeout(t);
  }, []);
  return steps ? <TourSteps steps={steps} onDone={onDone} /> : null;
}

function TourSteps({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[i];

  const done = () => {
    finishTour();
    onDone();
  };

  // Where the current button is (again after scrolling, rotating or the keyboard).
  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = document.querySelector(step.target);
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
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
    if (steps.length === 0) done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const below = !box || box.top + box.height / 2 < window.innerHeight / 2;
  const last = i === steps.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {ring ? <div className="tour-ring" style={ring} /> : <div className="tour-dim" />}
      <div
        className="tour-card"
        style={below ? { top: (ring ? ring.top + ring.height : 80) + 12 } : { bottom: window.innerHeight - (ring ? ring.top : window.innerHeight) + 12 }}
      >
        <p className="muted small tour-count">
          {i + 1} of {steps.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-actions">
          <button className="link-btn small" onClick={done}>
            Skip tour
          </button>
          <span className="tour-nav">
            {i > 0 && (
              <button className="btn" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button className="btn primary" autoFocus onClick={() => (last ? done() : setI(i + 1))}>
              {last ? "Done" : "Next"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
