import { useState } from "react";
import Icon from "./Icon";
import {
  clearPlan,
  dayOf,
  estimate,
  getPlan,
  googleCalendarUrl,
  nextOccurrence,
  reminderIcs,
  setPlan,
  timeOf,
  untilText,
  type Plan,
} from "../lib/plan";
import type { SavedRecipe, ScannedRecipe } from "../lib/schema";

/** "When do you want to eat?" → when to start, plus a calendar reminder. */
export default function PlanMeal({ recipe, recipeId }: { recipe: ScannedRecipe & { cookLog?: SavedRecipe["cookLog"] }; recipeId: string }) {
  const [plan, setPlanState] = useState<Plan | undefined>(() => getPlan(recipeId));
  const [open, setOpen] = useState(false);
  const est = estimate(recipe);
  const [time, setTime] = useState(() => defaultTime(est.minutes));

  const eat = nextOccurrence(time);
  const start = eat.getTime() - est.minutes * 60000;
  const link = `${location.origin}${location.pathname}#/recipe/${encodeURIComponent(recipeId)}`;

  function save() {
    const p: Plan = { recipeId, title: recipe.title, eatAt: eat.getTime(), startAt: start, minutes: est.minutes };
    setPlan(p);
    setPlanState(p);
    setOpen(false);
  }

  function downloadReminder(p: Plan) {
    const blob = new Blob([reminderIcs(p, link)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `start-cooking-${recipe.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (plan && !open) {
    const late = plan.startAt <= Date.now();
    return (
      <div className="plan-card">
        <div className="plan-main">
          <Icon name="timer" size={20} />
          <div>
            <div>
              <strong>
                {late ? "Start now" : `Start by ${timeOf(plan.startAt)}`}
              </strong>{" "}
              <span className="muted">{late ? "" : `(${untilText(plan.startAt)})`}</span>
            </div>
            <div className="muted small">
              To eat at {timeOf(plan.eatAt)} {dayOf(plan.eatAt)} · allow about {plan.minutes} min
            </div>
          </div>
        </div>
        <div className="plan-actions">
          <button className="btn" onClick={() => downloadReminder(plan)}>
            Add reminder to Calendar
          </button>
          <a className="link-btn small" href={googleCalendarUrl(plan, link)} target="_blank" rel="noopener noreferrer">
            Google Calendar instead
          </a>
          <button className="link-btn small" onClick={() => setOpen(true)}>
            Change
          </button>
          <button
            className="link-btn small"
            onClick={() => {
              clearPlan(recipeId);
              setPlanState(undefined);
            }}
          >
            Cancel plan
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn plan-open" onClick={() => setOpen(true)}>
        <Icon name="timer" size={18} /> Plan a meal time
      </button>
    );
  }

  return (
    <div className="plan-card">
      <label className="plan-time">
        <span>What time do you want to eat?</span>
        <input type="time" className="text-input" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <p className="plan-result">
        Start by <strong>{timeOf(start)}</strong> {dayOf(start)} · allow about {est.minutes} min
      </p>
      <p className="muted small">{est.detail}</p>
      {est.basis !== "history" && (
        <p className="muted small">
          Estimates can't see things like oven preheating or a pressure cooker coming up to pressure unless the recipe
          mentions them. When you finish in cooking mode, you'll confirm how long it really took.
        </p>
      )}
      <div className="button-row">
        <button className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          Save plan
        </button>
      </div>
    </div>
  );
}

/** Suggest the next 6:00 PM, or the next whole hour that leaves enough time. */
function defaultTime(minutes: number): string {
  const now = new Date();
  const earliest = new Date(now.getTime() + (minutes + 10) * 60000);
  const six = new Date(now);
  six.setHours(18, 0, 0, 0);
  const pick = six > earliest ? six : new Date(Math.ceil(earliest.getTime() / 1800000) * 1800000);
  return `${String(pick.getHours()).padStart(2, "0")}:${String(pick.getMinutes()).padStart(2, "0")}`;
}
