import { useEffect, useState } from "react";
import Icon from "./Icon";
import { href } from "../lib/route";
import { loadProgress } from "../lib/progress";
import { addMeal, loadWeek, upcomingDays } from "../lib/week";

/** On a recipe: "Add to my week" → pick a day. Shows the days it's already planned for. */
export default function AddToWeek({ recipeId }: { recipeId: string }) {
  const [week, setWeek] = useState(() => loadWeek());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setWeek(loadWeek());
    window.addEventListener("week-changed", on);
    return () => window.removeEventListener("week-changed", on);
  }, []);
  const days = upcomingDays(7);
  const plannedOn = days.filter((d) => (week.days[d.key] ?? []).some((m) => m.id === recipeId && !m.leftover));

  return (
    <div className="add-week">
      {plannedOn.length > 0 && !open && (
        <p className="small">
          <Icon name="calendar" size={16} /> Planned for {plannedOn.map((d) => d.name).join(", ")} ·{" "}
          <a href={href({ name: "week" })}>See the week</a>
        </p>
      )}
      {open ? (
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
                }}
              >
                {d.name === "Today" || d.name === "Tomorrow" ? d.name : d.name.slice(0, 3)} <span className="muted">{d.date}</span>
              </button>
            ))}
          </div>
          <button className="link-btn small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn plan-open" onClick={() => setOpen(true)}>
          <Icon name="calendar" size={18} /> {plannedOn.length ? "Add to another day" : "Add to my week"}
        </button>
      )}
    </div>
  );
}
