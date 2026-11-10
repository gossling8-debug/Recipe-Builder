import { useEffect, useState } from "react";
import Icon from "./Icon";
import ThawList from "./ThawList";
import { loadNotFrozen, markNotFrozen, thawItems, unmarkNotFrozen } from "../lib/thaw";
import { plannedThawReminders } from "../lib/thawPlan";
import type { SavedRecipe, ScannedRecipe } from "../lib/schema";

/**
 * On a recipe: which ingredients need thawing and for how long, and — when
 * the recipe is planned — the day to move each one to the fridge.
 */
export default function ThawNote({ recipe, saved, scale }: { recipe: ScannedRecipe; saved: SavedRecipe; scale: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    for (const ev of ["thaw-changed", "week-changed"]) window.addEventListener(ev, on);
    return () => {
      for (const ev of ["thaw-changed", "week-changed"]) window.removeEventListener(ev, on);
    };
  }, []);
  const notFrozen = new Set(loadNotFrozen());
  const all = thawItems(recipe, scale);
  const items = all.filter((i) => !notFrozen.has(i.key));
  const fresh = all.filter((i) => notFrozen.has(i.key));
  const planned = plannedThawReminders([saved]).filter((r) => r.recipeId === saved.id);
  if (!all.length) return null;

  return (
    <div className="thaw-note">
      {planned.length > 0 ? (
        <ThawList reminders={planned} />
      ) : (
        items.length > 0 && (
          <p className="small">
            <Icon name="timer" size={16} /> <strong>Thaw ahead if frozen:</strong>{" "}
            {items.map((i, n) => (
              <span key={i.key}>
                {n > 0 && "; "}
                {i.name} (about {i.days} {i.days === 1 ? "day" : "days"} in the fridge){" "}
                <button className="link-btn small" onClick={() => markNotFrozen(i.key)}>
                  I buy it fresh
                </button>
              </span>
            ))}
            . Plan a day for this recipe and you'll get a reminder.
          </p>
        )
      )}
      {fresh.length > 0 && (
        <p className="muted small">
          No thaw reminders for {fresh.map((i) => i.name).join(", ")} (you buy {fresh.length === 1 ? "it" : "them"} fresh).{" "}
          <button className="link-btn small" onClick={() => fresh.forEach((i) => unmarkNotFrozen(i.key))}>
            Remind me again
          </button>
        </p>
      )}
    </div>
  );
}
