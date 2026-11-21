import { useEffect, useState } from "react";
import Icon from "./Icon";
import { suggestDinner } from "../lib/autoPlan";
import { saveRecipe } from "../lib/db";
import { markMade } from "../lib/made";
import { clearPlan } from "../lib/plan";
import { loadProgress } from "../lib/progress";
import { href, navigate } from "../lib/route";
import { addToShopping, loadShopping } from "../lib/shopping";
import { markThawed, namesText, type ThawGroup } from "../lib/thaw";
import { dayKey, loadWeek, moveMeal, pastPlans, saveWeek, upcomingDays } from "../lib/week";
import type { SavedRecipe } from "../lib/schema";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Press and hold a line in the Today card: check it off, move it to another
 * day, swap it for another dinner, take it off today, mark what's thawing,
 * or put it on the shopping list.
 */
export default function TodayActions(props: {
  recipe: SavedRecipe;
  recipes: SavedRecipe[];
  thaw: ThawGroup[];
  onClose: () => void;
  onMessage: (m: string) => void;
}) {
  const { recipe: r, onClose } = props;
  const [moving, setMoving] = useState(false);
  const today = dayKey(new Date());
  const todays = loadWeek().days[today] ?? [];
  const index = todays.findIndex((m) => m.id === r.id);
  const planned = index >= 0;
  const leftover = planned && !!todays[index].leftover;
  const thawing = props.thaw.filter((g) => g.recipeId === r.id);
  const onList = loadShopping().recipes.some((x) => x.id === r.id);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const act = (fn: () => void | Promise<void>) => async () => {
    onClose();
    try {
      await fn();
    } catch (e) {
      props.onMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const removeToday = () => {
    const s = loadWeek();
    saveWeek({ days: { ...s.days, [today]: (s.days[today] ?? []).filter((_, i) => i !== index) } });
  };

  if (moving)
    return (
      <div className="sheet-backdrop" onClick={onClose}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label={`Move ${r.title}`} onClick={(e) => e.stopPropagation()}>
          <div className="sheet-title">Move {r.title} to…</div>
          {upcomingDays(7)
            .filter((d) => d.key !== today)
            .map((d) => {
              const there = (loadWeek().days[d.key] ?? []).length;
              return (
                <button
                  key={d.key}
                  className="sheet-item"
                  onClick={act(() => {
                    moveMeal(today, index, d.key);
                    clearPlan(r.id); // its meal time was for today
                    props.onMessage(there ? `Moved to ${d.name} — swapped with what was planned there` : `Moved to ${d.name}`);
                  })}
                >
                  <Icon name="calendar" size={20} /> {d.name}
                  <span className="muted small"> · {d.date}{there ? " · swaps with what's there" : ""}</span>
                </button>
              );
            })}
          <button className="sheet-item" onClick={() => setMoving(false)}>
            Back
          </button>
        </div>
      </div>
    );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Options for ${r.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">
          {r.title}
          {leftover ? " (leftovers)" : ""}
        </div>
        <button
          className="sheet-item"
          onClick={act(async () => {
            if (!leftover) {
              await saveRecipe(markMade(r));
              window.dispatchEvent(new Event("recipes-synced")); // the home screen reloads its recipes
            }
            clearPlan(r.id);
            if (leftover) removeToday();
            props.onMessage(leftover ? "Leftovers eaten — off today's plan" : "Marked as made today");
          })}
        >
          <Icon name="check" size={20} /> {leftover ? "Ate the leftovers" : "Made it"}
        </button>
        {planned && (
          <button className="sheet-item" onClick={() => setMoving(true)}>
            <Icon name="calendar" size={20} /> Move to another day
          </button>
        )}
        {planned && !leftover && (
          <button
            className="sheet-item"
            onClick={act(() => {
              const s = loadWeek();
              const other = suggestDinner({ recipes: props.recipes, past: pastPlans(), week: s, skip: new Set([r.id]) });
              if (!other) return props.onMessage("No other dinner fits — the rest are planned or were made in the last two weeks.");
              const days = { ...s.days, [today]: (s.days[today] ?? []).map((m, i) => (i === index ? { id: other.id, scale: 1 } : m)) };
              saveWeek({ days });
              clearPlan(r.id);
              props.onMessage(`Swapped for ${other.title}`);
            })}
          >
            <Icon name="reset" size={20} /> Swap for another dinner
          </button>
        )}
        {thawing.length > 0 && (
          <button
            className="sheet-item"
            onClick={act(() => {
              thawing.forEach((g) => g.ids.forEach(markThawed));
              props.onMessage(`Got it — ${namesText(thawing.flatMap((g) => g.items))} ${thawing.flatMap((g) => g.items).length > 1 ? "are" : "is"} thawing`);
            })}
          >
            <Icon name="check" size={20} /> {cap(namesText(thawing.flatMap((g) => g.items)))} {thawing.flatMap((g) => g.items).length > 1 ? "are" : "is"} in the fridge
          </button>
        )}
        {!onList && !leftover && (
          <button
            className="sheet-item"
            onClick={act(() => {
              const p = loadProgress(r.id);
              addToShopping(r.id, p.scale, p.have.filter((i) => i < r.ingredients.length));
              props.onMessage("Added to your shopping list");
            })}
          >
            <Icon name="bag" size={20} /> Add to shopping list
          </button>
        )}
        <button className="sheet-item" onClick={act(() => navigate({ name: "recipe", id: r.id }))}>
          <Icon name="book" size={20} /> Open recipe
        </button>
        {planned && (
          <button
            className="sheet-item danger"
            onClick={act(() => {
              removeToday();
              clearPlan(r.id);
              props.onMessage("Taken off today's plan");
            })}
          >
            <Icon name="close" size={20} /> Not today — take it off the plan
          </button>
        )}
        <a className="sheet-item" href={href({ name: "week" })} onClick={onClose}>
          <Icon name="calendar" size={20} /> See the week
        </a>
      </div>
    </div>
  );
}
