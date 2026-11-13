import { feature } from "../lib/features";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { IngredientMention } from "./RecipeView";
import { TimerBar, type useTimers } from "./Timers";
import { scaleNote, stepAmount } from "../lib/quantity";
import { convertRecipe, useUnits } from "../lib/units";
import { toggleIn, useProgress } from "../lib/progress";
import { findTimers } from "../lib/timers";
import { stepChunks } from "../lib/speech";
import { ReadAloudBar, useReader, useVoiceCommands } from "./ReadAloud";
import type { ScannedRecipe } from "../lib/schema";

/**
 * Cooking mode: one step at a time in large text, the ingredients that step
 * needs, and one-tap timers for any times it mentions. Big buttons (and
 * swipes) to move between steps, for messy hands.
 */
export default function CookMode({
  recipe: original,
  recipeId,
  timers,
  onClose,
  onLog,
  plannedMinutes,
  onMade,
}: {
  recipe: ScannedRecipe;
  recipeId: string;
  timers: ReturnType<typeof useTimers>;
  onClose: () => void;
  /** Saves how long it actually took (minutes). */
  onLog: (minutes: number) => Promise<void>;
  /** The plan's estimate, if one was made, to compare against. */
  plannedMinutes?: number;
  /** Called once when the cook taps Finish (updates the pantry). */
  onMade?: () => void;
}) {
  const [units] = useUnits();
  const recipe = convertRecipe(original, units);
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

  // Read aloud: one step at a time; it never moves on by itself.
  const reader = useReader();
  const [reading, setReading] = useState(false);
  const chunksAt = (i: number) => stepChunks(recipe.steps[i], scale, recipe.ingredients);
  const toggleRead = () => {
    if (reading) {
      setReading(false);
      reader.stop();
    } else {
      setReading(true);
      reader.read(chunksAt(at)); // started by the tap, which iPhones require for speech
    }
  };
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    if (reading) reader.read(chunksAt(at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const voice = useVoiceCommands((cmd) => {
    if (cmd === "pause") reader.pause();
    else if (cmd === "resume") reader.state === "paused" ? reader.resume() : reader.repeat();
    else if (cmd === "repeat") reader.repeat();
    else if (cmd === "next") next();
    else if (cmd === "back") go(at - 1);
  }, reader.current);
  const [finishing, setFinishing] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const next = () => {
    update((p) => ({ ...p, done: p.done.includes(at) ? p.done : [...p.done, at] }));
    if (!last) return go(at + 1);
    // Measured from when cooking mode was first opened for this meal.
    const startedAt = cookStart(recipeId);
    const measured = Math.round((Date.now() - startedAt) / 60000);
    setMinutes(measured >= 2 ? measured : plannedMinutes ?? 30);
    reader.stop();
    setFinishing(true);
    onMade?.();
  };

  // Swipe left / right to change steps. (All hooks must run before any early return.)
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (finishing) {
    return (
      <div className="cook" role="dialog" aria-label="How long did it take?">
        <main className="cook-body cook-finish">
          <p className="cook-count">All done — enjoy!</p>
          <h2>How long did it take?</h2>
          <p className="muted">
            From starting prep to ready to eat. It's pre-filled with the time since you opened cooking mode — adjust it if
            you started earlier.
          </p>
          <div className="minutes-picker">
            <button className="btn" aria-label="5 minutes less" onClick={() => setMinutes((m) => Math.max(5, m - 5))}>
              −5
            </button>
            <label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="text-input"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
              />
              <span>minutes</span>
            </label>
            <button className="btn" aria-label="5 minutes more" onClick={() => setMinutes((m) => m + 5)}>
              +5
            </button>
          </div>
          {plannedMinutes !== undefined && (
            <p className="small">
              You planned about {plannedMinutes} min —{" "}
              {Math.abs(minutes - plannedMinutes) <= 5
                ? "right on time."
                : minutes > plannedMinutes
                  ? `it took ${minutes - plannedMinutes} min longer.`
                  : `${plannedMinutes - minutes} min quicker.`}
            </p>
          )}
          <p className="muted small">Next time you plan this recipe, your real times are used.</p>
        </main>
        <footer className="cook-nav">
          <button
            className="btn big"
            onClick={() => {
              clearCookStart(recipeId);
              onClose();
            }}
          >
            Skip
          </button>
          <button
            className="btn primary big"
            onClick={async () => {
              await onLog(minutes);
              onClose();
            }}
          >
            Confirm {minutes} min
          </button>
        </footer>
      </div>
    );
  }


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
      {feature("readAloud") && <ReadAloudBar reader={reader} voice={voice} reading={reading} onToggleRead={toggleRead} />}

      <main
        className={reader.waiting ? "cook-body waiting" : "cook-body"}
        onClick={() => reader.waiting && reader.resume()}
      >
        {reader.waiting && (
          <div className="tap-hint" role="status">
            Added it? <strong>Tap anywhere</strong> to go on.
          </div>
        )}
        <p className="cook-step">
          {step.segments.map((seg, k) =>
            seg.ingredient_index === null ? (
              <span key={k}>{seg.text}</span>
            ) : (
              <IngredientMention
                key={k}
                text={seg.text}
                amount={seg.amount && stepAmount(seg.amount, recipe.ingredients[seg.ingredient_index], scale)}
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
                    <strong>{seg.amount ? stepAmount(seg.amount, ing, scale) : ""}</strong> {ing?.name ?? seg.text}
                    {ing?.preparation && !/^or\s/i.test(ing.preparation.trim()) ? <span className="muted">, {scaleNote(ing.preparation, scale)}</span> : null}
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

/** When cooking started for this meal (first time cooking mode opened, within the last 8 hours). */
export function cookStart(recipeId: string): number {
  const key = `recipe-builder.cookStart.${recipeId}`;
  try {
    const saved = Number(sessionStorage.getItem(key));
    if (saved && Date.now() - saved < 8 * 3600_000) return saved;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* fall through */
  }
  return Date.now();
}

export function clearCookStart(recipeId: string): void {
  try {
    sessionStorage.removeItem(`recipe-builder.cookStart.${recipeId}`);
  } catch {
    /* ignore */
  }
}
