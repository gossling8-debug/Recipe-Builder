import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { IngredientMention } from "./RecipeView";
import { TimerBar, type useTimers } from "./Timers";
import { scaleAmount } from "../lib/quantity";
import { toggleIn, useProgress } from "../lib/progress";
import { findTimers } from "../lib/timers";
import type { ScannedRecipe } from "../lib/schema";

/**
 * Cooking mode: one step at a time in large text, the ingredients that step
 * needs, and one-tap timers for any times it mentions. Big buttons (and
 * swipes) to move between steps, for messy hands.
 */
export default function CookMode({
  recipe,
  recipeId,
  timers,
  onClose,
}: {
  recipe: ScannedRecipe;
  recipeId: string;
  timers: ReturnType<typeof useTimers>;
  onClose: () => void;
}) {
  const [progress, update] = useProgress(recipeId);
  const { scale } = progress;
  const added = new Set(progress.added);
  // Start at the first step that isn't done yet.
  const [at, setAt] = useState(() => {
    const first = recipe.steps.findIndex((_, i) => !progress.done.includes(i));
    return first === -1 ? 0 : first;
  });
  const total = recipe.steps.length;
  const step = recipe.steps[at];
  const text = step.segments.map((s) => s.text).join("");
  const found = findTimers(text);
  const needs = step.segments.filter((s) => s.ingredient_index !== null);
  const last = at === total - 1;

  // Keep the page behind from scrolling while cooking mode is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const go = (to: number) => setAt(Math.max(0, Math.min(total - 1, to)));
  const next = () => {
    update((p) => ({ ...p, done: p.done.includes(at) ? p.done : [...p.done, at] }));
    if (last) onClose();
    else go(at + 1);
  };

  // Swipe left / right to change steps.
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="cook"
      role="dialog"
      aria-label={`Cooking ${recipe.title}`}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1));
      }}
    >
      <header className="cook-top">
        <button className="icon-btn" onClick={onClose} aria-label="Leave cooking mode">
          <Icon name="close" />
        </button>
        <div className="cook-progress">
          <span className="muted small">{recipe.title}</span>
          <span className="cook-count">
            Step {at + 1} <span className="muted">of {total}</span>
          </span>
        </div>
        <span className="icon-btn placeholder" aria-hidden />
      </header>
      <div className="cook-bar" aria-hidden>
        <div style={{ width: `${((at + 1) / total) * 100}%` }} />
      </div>

      <TimerBar {...timers} />

      <main className="cook-body">
        <p className="cook-step">
          {step.segments.map((seg, k) =>
            seg.ingredient_index === null ? (
              <span key={k}>{seg.text}</span>
            ) : (
              <IngredientMention
                key={k}
                text={seg.text}
                amount={seg.amount && scaleAmount(seg.amount, scale)}
                crossed={added.has(`${at}-${k}`)}
                onToggle={() => update((p) => ({ ...p, added: toggleIn(p.added, `${at}-${k}`) }))}
              />
            ),
          )}
        </p>

        {found.length > 0 && (
          <div className="cook-timers">
            {found.map((t) => (
              <button key={t.seconds} className="btn" onClick={() => timers.start(`Step ${at + 1} · ${t.label}`, t.seconds)}>
                <Icon name="timer" size={18} /> Start {t.label} timer
              </button>
            ))}
          </div>
        )}

        {needs.length > 0 && (
          <section className="cook-needs">
            <h3>In this step</h3>
            <ul>
              {needs.map((seg, k) => {
                const ing = recipe.ingredients[seg.ingredient_index!];
                return (
                  <li key={k}>
                    <strong>{seg.amount ? scaleAmount(seg.amount, scale) : ""}</strong> {ing?.name ?? seg.text}
                    {ing?.preparation ? <span className="muted">, {ing.preparation}</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      <footer className="cook-nav">
        <button className="btn big" onClick={() => go(at - 1)} disabled={at === 0}>
          Back
        </button>
        <button className="btn primary big" onClick={next}>
          {last ? "Finish" : "Next step"}
        </button>
      </footer>
    </div>
  );
}
