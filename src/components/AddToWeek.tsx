import { useEffect, useState } from "react";
import Icon from "./Icon";
import { href } from "../lib/route";
import { loadProgress } from "../lib/progress";
import { addMeal, daysBetween, LEFTOVER_DAYS, loadWeek, removeMeal, upcomingDays } from "../lib/week";

const short = (d: { name: string }) => (d.name === "Today" || d.name === "Tomorrow" ? d.name : d.name.slice(0, 3));

/**
 * On a recipe: "Add to my week" → pick a day, then (optionally) which of the
 * next few days to have its leftovers. Shows the days it's already planned for.
 */
export default function AddToWeek({ recipeId }: { recipeId: string }) {
  const [week, setWeek] = useState(() => loadWeek());
  const [open, setOpen] = useState(false);
  // Just planned to cook on this day: now asking about leftovers.
  const [cookedOn, setCookedOn] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setWeek(loadWeek());
    window.addEventListener("week-changed", on);
    return () => window.removeEventListener("week-changed", on);
  }, []);
  const days = upcomingDays(7);
  const plannedOn = days.filter((d) => (week.days[d.key] ?? []).some((m) => m.id === recipeId && !m.leftover));
  const leftoversOn = days.filter((d) => (week.days[d.key] ?? []).some((m) => m.id === recipeId && m.leftover));

  const toggleLeftovers = (day: string) => {
    const i = (week.days[day] ?? []).findIndex((m) => m.id === recipeId && m.leftover);
    setWeek(i >= 0 ? removeMeal(day, i) : addMeal(day, { id: recipeId, scale: 1, leftover: true }));
  };

  if (cookedOn) {
    const after = days.filter((d) => {
      const n = daysBetween(cookedOn, d.key);
      return n >= 1 && n <= LEFTOVER_DAYS;
    });
    const cookName = days.find((d) => d.key === cookedOn)?.name ?? "";
    return (
      <div className="add-week">
        <div className="plan-card">
          <p className="small">
            Planned for {cookName}. <strong>Leftovers on another night?</strong> Tap the days (nothing extra to cook or buy).
          </p>
          {after.length > 0 ? (
            <div className="day-chips">
              {after.map((d) => {
                const on = leftoversOn.some((x) => x.key === d.key);
                return (
                  <button key={d.key} className={on ? "tag on" : "tag"} aria-pressed={on} onClick={() => toggleLeftovers(d.key)}>
                    {on && "✓ "}
                    {short(d)} <span className="muted">{d.date}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted small">The week ends before then — plan leftovers later from the Week page.</p>
          )}
          <button className="btn" onClick={() => setCookedOn(null)}>
            {leftoversOn.some((d) => after.some((x) => x.key === d.key)) ? "Done" : "No leftovers"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="add-week">
      {(plannedOn.length > 0 || leftoversOn.length > 0) && !open && (
        <p className="small">
          <Icon name="calendar" size={16} /> {plannedOn.length > 0 && `Planned for ${plannedOn.map((d) => d.name).join(", ")}`}
          {plannedOn.length > 0 && leftoversOn.length > 0 && " · "}
          {leftoversOn.length > 0 && `Leftovers ${leftoversOn.map((d) => d.name).join(", ")}`} · <a href={href({ name: "week" })}>See the week</a>
        </p>
      )}
      <button className="btn plan-open disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="calendar" size={18} /> {plannedOn.length ? "Add to another day" : "Add to my week"}
      </button>
      {open && (
        <div className="plan-card">
          <p className="small">Which day? (at the size shown above)</p>
          <div className="day-chips">
            {days.map((d) => (
              <button
                key={d.key}
                className="tag"
                onClick={() => {
                  setWeek(addMeal(d.key, { id: recipeId, scale: loadProgress(recipeId).scale }));
                  setOpen(false);
                  setCookedOn(d.key);
                }}
              >
                {short(d)} <span className="muted">{d.date}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
