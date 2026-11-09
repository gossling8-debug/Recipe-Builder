import { feature } from "../lib/features";
import { useEffect, useState } from "react";
import { href } from "../lib/route";
import { loadPlans, markAlerted, timeOf, type Plan } from "../lib/plan";
import { chime, unlockAudio } from "../lib/timers";

/**
 * While the app is open, shows a banner (and chimes) when it's time to start
 * a planned recipe. The calendar reminder covers the times the app is closed.
 */
export default function PlanWatcher() {
  const [due, setDue] = useState<Plan | null>(null);

  useEffect(() => {
    // Sound can only play after a tap; unlock it on the first one.
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    const check = () => {
      const now = Date.now();
      if (!feature("mealTime")) return;
      const p = Object.values(loadPlans()).find((x) => !x.alerted && x.startAt <= now && x.eatAt > now);
      if (p) {
        markAlerted(p.recipeId);
        setDue(p);
        chime();
      }
    };
    check();
    const t = setInterval(check, 15000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      document.removeEventListener("pointerdown", unlock);
    };
  }, []);

  if (!due) return null;
  return (
    <div className="plan-alert" role="alert">
      <div>
        <strong>Time to start {due.title}</strong>
        <div className="small">To eat at {timeOf(due.eatAt)}</div>
      </div>
      <a className="btn primary" href={href({ name: "recipe", id: due.recipeId })} onClick={() => setDue(null)}>
        Open
      </a>
      <button className="link-btn" onClick={() => setDue(null)}>
        Dismiss
      </button>
    </div>
  );
}
