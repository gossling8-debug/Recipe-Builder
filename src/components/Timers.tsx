import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { chime, clock, unlockAudio } from "../lib/timers";

export interface Timer {
  id: number;
  label: string; // "Step 2 · 15 minutes"
  endsAt: number; // ms timestamp — survives the phone pausing the page
  done: boolean;
}

/**
 * Kitchen timers for one recipe. They count from an end time, so they stay
 * correct even if the phone pauses the page; the alarm sounds when the page is
 * next active.
 */
export function useTimers() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  const current = useRef(timers);
  current.current = timers;

  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const tick = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const finished = current.current.filter((x) => !x.done && t >= x.endsAt).map((x) => x.id);
      if (finished.length) {
        chime();
        setTimers((ts) => ts.map((x) => (finished.includes(x.id) ? { ...x, done: true } : x)));
      }
    }, 500);
    return () => clearInterval(tick);
  }, [timers]);

  const start = (label: string, seconds: number) => {
    unlockAudio(); // must happen during the tap so the alarm can play later
    setNow(Date.now());
    setTimers((ts) => [...ts, { id: Date.now() + Math.random(), label, endsAt: Date.now() + seconds * 1000, done: false }]);
  };
  const remove = (id: number) => setTimers((ts) => ts.filter((t) => t.id !== id));
  return { timers, now, start, remove };
}

export function TimerBar({ timers, now, remove }: ReturnType<typeof useTimers>) {
  if (timers.length === 0) return null;
  return (
    <div className="timer-bar" role="status" aria-live="polite">
      {timers.map((t) => (
        <div key={t.id} className={t.done ? "timer done" : "timer"}>
          <span className="timer-time">{t.done ? "Done!" : clock((t.endsAt - now) / 1000)}</span>
          <span className="timer-label">{t.label}</span>
          <button className="icon-btn small-btn" aria-label={t.done ? "Dismiss timer" : "Cancel timer"} onClick={() => remove(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
