import { useEffect, useState } from "react";
import Icon from "./Icon";
import WarnIcon from "./WarnIcon";
import { href } from "../lib/route";
import { plannedThawReminders } from "../lib/thawPlan";
import type { SavedRecipe } from "../lib/schema";
import { COLD_WATER_TIP, markNotFrozen, markThawed, thawIcs, whenText, type ThawReminder } from "../lib/thaw";

const mealDay = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
  return days === 0 ? "tonight" : days === 1 ? "tomorrow" : d.toLocaleDateString([], { weekday: "long" });
};

/** "Move ground beef to the fridge tonight — for Tacos tomorrow", with Done and Not frozen. */
export default function ThawList({ reminders, calendar = false }: { reminders: ThawReminder[]; calendar?: boolean }) {
  if (!reminders.length) return null;
  const late = reminders.some((r) => whenText(r.moveBy) === "late");

  function addToCalendar() {
    const link = (r: ThawReminder) => `${location.origin}${location.pathname}#/recipe/${encodeURIComponent(r.recipeId)}`;
    // Only reminders still ahead — an alert in the past is no use.
    const blob = new Blob([thawIcs(reminders.filter((r) => r.moveBy > Date.now()), link)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "thaw-reminders.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="thaw-list">
      <ul>
        {reminders.map((r) => {
          const when = whenText(r.moveBy);
          return (
            <li key={r.id} className={when === "late" ? "late" : when === "today" ? "today" : ""}>
              <div>
                {when === "late" && <WarnIcon size={16} />}
                <strong>
                  {when === "late" ? "Thaw now: " : when === "today" ? "Tonight: " : `${when.charAt(0).toUpperCase()}${when.slice(1)}: `}
                </strong>
                move <strong>{r.item.name}</strong> to the fridge
                <span className="muted small">
                  {" "}
                  — for <a href={href({ name: "recipe", id: r.recipeId })}>{r.title}</a> {mealDay(r.mealAt)} · about {r.item.days}{" "}
                  {r.item.days === 1 ? "day" : "days"} to thaw
                </span>
              </div>
              <div className="thaw-actions">
                <button className="link-btn small" onClick={() => markThawed(r.id)}>
                  <Icon name="check" size={14} /> It's in the fridge
                </button>
                <button className="link-btn small" onClick={() => markNotFrozen(r.item.key)}>
                  I buy it fresh
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {late && <p className="small thaw-tip">{COLD_WATER_TIP}</p>}
      {calendar && reminders.some((r) => r.moveBy > Date.now()) && (
        <button className="btn" onClick={addToCalendar}>
          <Icon name="calendar" size={18} /> Add thaw reminders to Calendar
        </button>
      )}
    </div>
  );
}

/** Thaw reminders for the planned meals, kept current as plans and choices change. */
export function useThawReminders(recipes: SavedRecipe[] | null): ThawReminder[] {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    for (const ev of ["thaw-changed", "week-changed", "features-changed"]) window.addEventListener(ev, on);
    return () => {
      for (const ev of ["thaw-changed", "week-changed", "features-changed"]) window.removeEventListener(ev, on);
    };
  }, []);
  return recipes ? plannedThawReminders(recipes) : [];
}
