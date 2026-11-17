import { useEffect } from "react";
import Icon from "./Icon";
import WarnIcon from "./WarnIcon";
import { href } from "../lib/route";
import { feature } from "../lib/features";
import { lastMade, madeToday } from "../lib/made";
import { clearPlan, dayOf, loadPlans, planDone, timeOf } from "../lib/plan";
import { namesText, whenText, type ThawGroup } from "../lib/thaw";
import { dayKey, loadWeek } from "../lib/week";
import type { SavedRecipe } from "../lib/schema";

const SHOW = 2;

/**
 * The home screen's "coming up": one line per recipe, with everything about it
 * together — on today's plan, when to start cooking, what to thaw — instead of
 * a banner for each. A recipe already made today drops off (its leftovers have
 * their own line), and a meal time set before it was made is forgotten.
 */
export default function UpNext({ recipes, thaw }: { recipes: SavedRecipe[]; thaw: ThawGroup[] }) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const now = Date.now();
  const plans = Object.values(feature("mealTime") ? loadPlans() : {});
  const done = plans.filter((p) => {
    const r = byId.get(p.recipeId);
    return r && planDone(p, lastMade(r));
  });
  // Forget them, so the start-cooking alert doesn't go off for a meal already made.
  useEffect(() => {
    done.forEach((p) => clearPlan(p.recipeId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done.map((p) => p.recipeId).join()]);

  interface Line {
    id: string;
    title: string;
    parts: string[];
    urgent: boolean;
    sortAt: number;
  }
  const lines = new Map<string, Line>();
  const line = (id: string, sortAt: number): Line | null => {
    const r = byId.get(id);
    if (!r) return null;
    let l = lines.get(id);
    if (!l) lines.set(id, (l = { id, title: r.title, parts: [], urgent: false, sortAt }));
    l.sortAt = Math.min(l.sortAt, sortAt);
    return l;
  };

  // Today's plan (meals already made today drop off).
  const today = feature("weekPlanner") ? (loadWeek().days[dayKey(new Date())] ?? []) : [];
  for (const m of today) {
    const r = byId.get(m.id);
    if (!r || (!m.leftover && madeToday(r, now))) continue;
    const l = line(m.id, now + 6 * 3600_000);
    if (l && !l.parts.includes("today")) l.parts.push(m.leftover ? "leftovers today" : "today");
  }
  // When to start cooking.
  for (const p of plans) {
    if (done.includes(p)) continue;
    const l = line(p.recipeId, p.startAt);
    if (!l) continue;
    const day = dayOf(p.eatAt);
    if (p.startAt <= now) {
      l.parts.push(`start now · eat at ${timeOf(p.eatAt)}`);
      l.urgent = true;
    } else l.parts.push(`start by ${timeOf(p.startAt)}${day === "today" ? "" : ` ${day}`} · eat at ${timeOf(p.eatAt)}`);
  }
  // What to thaw (the soonest only, if the recipe is planned more than once).
  for (const g of thaw) {
    const l = line(g.recipeId, g.moveBy);
    if (!l || l.parts.some((x) => x.startsWith("thaw"))) continue;
    const late = whenText(g.moveBy) === "late";
    const meal = dayOf(g.mealAt);
    l.parts.push(`${late ? "thaw now" : "thaw tonight"}: ${namesText(g.items)}${meal === "today" ? "" : ` (for ${meal})`}`);
    if (late) l.urgent = true;
  }

  const all = [...lines.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.sortAt - b.sortAt);
  if (!all.length) return null;
  return (
    <>
      {all.slice(0, SHOW).map((l) => (
        <a key={l.id} className={l.urgent ? "plan-strip use-soon-strip" : "plan-strip"} href={href({ name: "recipe", id: l.id })}>
          {l.urgent ? <WarnIcon /> : <Icon name={l.parts.some((p) => p.startsWith("thaw") || p.startsWith("start")) ? "timer" : "calendar"} size={18} />}
          <span>
            <strong>{l.title}</strong>
            <span className="muted small"> · {l.parts.join(" · ")}</span>
          </span>
        </a>
      ))}
      {all.length > SHOW && (
        <a className="link-btn small up-next-more" href={href({ name: "week" })}>
          +{all.length - SHOW} more coming up · see the week
        </a>
      )}
    </>
  );
}
