import { useEffect, useMemo, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { listRecipes } from "../lib/db";
import { href } from "../lib/route";
import { bigMealIcs, ovenClashes, timeline } from "../lib/bigMeal";
import { dayOf, setPlan, timeOf, type Plan } from "../lib/plan";
import { fromDateInput, toDateInput } from "../lib/shelfLife";
import type { SavedRecipe } from "../lib/schema";

const duration = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
const BASIS = { history: "your own time", stated: "from the recipe", guess: "a rough guess" } as const;

/** Several dishes, one meal time: when to start each so everything is ready together. */
export default function BigMealPage({ day, ids }: { day?: string; ids?: string[] }) {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ids ?? []));
  const [date, setDate] = useState(day ?? toDateInput(Date.now()));
  const [time, setTime] = useState("17:00");
  const [saved, setSaved] = useState<Plan[] | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    listRecipes().then((rs) => setRecipes([...rs].sort((a, b) => a.title.localeCompare(b.title))), () => setRecipes([]));
  }, []);

  const eatAt = useMemo(() => {
    const d = fromDateInput(date);
    if (d === null) return null;
    const [h, m] = time.split(":").map(Number);
    const at = new Date(d);
    at.setHours(h || 0, m || 0, 0, 0);
    return at.getTime();
  }, [date, time]);

  const chosen = (recipes ?? []).filter((r) => picked.has(r.id));
  const dishes = eatAt === null ? [] : timeline(chosen, eatAt);
  const clashes = eatAt === null ? [] : ovenClashes(dishes, eatAt);
  const now = Date.now();
  const toggle = (id: string) => {
    setSaved(null);
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  function save() {
    if (eatAt === null) return;
    const plans = dishes.map((d) => ({ recipeId: d.recipe.id, title: d.recipe.title, eatAt, startAt: d.startAt, minutes: d.minutes }));
    plans.forEach(setPlan);
    setSaved(plans);
    showToast("Saved — the app will chime when it's time to start each dish");
  }

  function calendar(plans: Plan[]) {
    const link = (p: Plan) => `${location.origin}${location.pathname}#/recipe/${encodeURIComponent(p.recipeId)}`;
    const blob = new Blob([bigMealIcs(plans, link)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "big-meal-reminders.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <>
      <Header title="Plan a big meal" back={href({ name: "week" })} returnToPrevious />
      <main className="page">
        <p className="muted small">Pick the dishes and when you want to eat. You'll get one schedule so everything is ready together.</p>
        <div className="field-row">
          <label className="field">
            <span>Day</span>
            <input className="text-input" type="date" value={date} onChange={(e) => (setDate(e.target.value), setSaved(null))} />
          </label>
          <label className="field">
            <span>Eat at</span>
            <input className="text-input" type="time" value={time} onChange={(e) => (setTime(e.target.value), setSaved(null))} />
          </label>
        </div>

        {dishes.length > 0 && eatAt !== null && (
          <section>
            <h3>Schedule · {dayOf(eatAt)}</h3>
            <ol className="meal-timeline">
              {dishes.map((d) => (
                <li key={d.recipe.id} className={d.startAt < now ? "late" : ""}>
                  <span className="tl-time">{timeOf(d.startAt)}</span>
                  <span>
                    Start <a href={href({ name: "recipe", id: d.recipe.id })}>{d.recipe.title}</a>
                    <span className="muted small">
                      {" "}
                      · allow {duration(d.minutes)} ({BASIS[d.basis]})
                      {d.oven && ` · oven ${d.oven.tempF}°F`}
                    </span>
                    {d.startAt < now && eatAt > now && <span className="small late-note"> Should have started {duration(Math.round((now - d.startAt) / 60000))} ago</span>}
                  </span>
                </li>
              ))}
              <li className="eat">
                <span className="tl-time">{timeOf(eatAt)}</span>
                <strong>Eat</strong>
              </li>
            </ol>
            {clashes.map((c, i) => (
              <div key={i} className="callout warn small">
                <strong>Oven clash around {timeOf(c.from)}:</strong> {c.a.recipe.title} needs {c.a.oven!.tempF}°F and {c.b.recipe.title}{" "}
                needs {c.b.oven!.tempF}°F. Bake one earlier and keep it warm, or use a second oven or toaster oven.
              </div>
            ))}
            <p className="muted small">
              Each dish is timed to finish when you eat; times include about 5 minutes to get set up. After you cook something in cooking
              mode, your real time is used next time.
            </p>
            {saved ? (
              <div className="button-row">
                <button className="btn primary" onClick={() => calendar(saved)}>
                  <Icon name="calendar" size={18} /> Add all reminders to Calendar
                </button>
              </div>
            ) : (
              <div className="button-row">
                <button className="btn primary" onClick={save} disabled={eatAt <= now}>
                  <Icon name="timer" size={18} /> Save &amp; remind me
                </button>
              </div>
            )}
            {eatAt <= now && <p className="small late-note">That time has already passed — pick a later time.</p>}
          </section>
        )}

        <h3>Dishes {picked.size > 0 && <span className="muted small">· {picked.size} chosen</span>}</h3>
        {recipes === null && <p className="muted">Loading…</p>}
        {recipes?.length === 0 && <p className="muted">Add some recipes first.</p>}
        <ul className="ingredients meal-pick">
          {(recipes ?? []).map((r) => (
            <li key={r.id}>
              <label className={picked.has(r.id) ? "picked" : ""}>
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                <span>{r.title}</span>
              </label>
            </li>
          ))}
        </ul>
      </main>
      {toast}
    </>
  );
}
