import ThawList, { useThawReminders } from "./ThawList";
import { feature } from "../lib/features";
import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { listRecipes } from "../lib/db";
import { href } from "../lib/route";
import { addToShopping } from "../lib/shopping";
import { addMeal, countMeals, loadWeek, mealsToShop, pastPlans, removeMeal, saveWeek, upcomingDays, type WeekState } from "../lib/week";
import { fillWeek, getPeople, isDinner, NO_REPEAT_DAYS, servingsCount, setPeople } from "../lib/autoPlan";
import { loadLeftovers } from "../lib/leftovers";
import type { SavedRecipe } from "../lib/schema";

const sizeLabel = (s: number) => (s === 1 ? "" : ` · ×${s === 0.5 ? "½" : s === 1.5 ? "1½" : s}`);

/** Plan the next 7 days, then put the whole week on the shopping list at once. */
export default function WeekPage() {
  const [week, setWeek] = useState<WeekState>(() => loadWeek());
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // day key with the picker open
  const [toast, showToast] = useToast();
  const days = upcomingDays(7);

  useEffect(() => {
    listRecipes().then((rs) => setRecipes([...rs].sort((a, b) => a.title.localeCompare(b.title))), () => setRecipes([]));
  }, []);

  const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
  const planned = countMeals(week);
  const thaw = useThawReminders(recipes);
  const [people, setPeopleState] = useState(getPeople);
  const [result, setResult] = useState("");
  const hasAuto = Object.values(week.days).some((v) => v.some((m) => m.auto));

  function fill() {
    if (!recipes) return;
    const r = fillWeek({ week, past: pastPlans(), recipes, fridge: loadLeftovers(), people, days: days.map((d) => d.key) });
    saveWeek(r.week);
    setWeek(loadWeek());
    const parts = [`${r.cooked} ${r.cooked === 1 ? "dinner" : "dinners"} picked`];
    if (r.leftovers) parts.push(`${r.leftovers} leftovers ${r.leftovers === 1 ? "night" : "nights"}`);
    setResult(
      parts.join(", ") +
        "." +
        (r.short
          ? ` ${r.short} ${r.short === 1 ? "day is" : "days are"} still open — you don't have enough different dinner recipes to avoid repeating one within ${NO_REPEAT_DAYS} days.`
          : ""),
    );
  }

  function clearPicks() {
    saveWeek({ days: Object.fromEntries(Object.entries(week.days).map(([k, v]) => [k, v.filter((m) => !m.auto)])) });
    setWeek(loadWeek());
    setResult("");
  }

  function shopWeek() {
    const meals = mealsToShop(week, days.map((d) => d.key)).filter((m) => byId.has(m.id));
    meals.forEach((m) => addToShopping(m.id, m.scale));
    showToast(`${meals.length} ${meals.length === 1 ? "recipe" : "recipes"} on your shopping list`);
  }

  return (
    <>
      <Header
        title="This week"
        back={href({ name: "library" })}
        actions={
          <a className="icon-btn" href={href({ name: "shopping" })} aria-label="Shopping list">
            <Icon name="bag" />
          </a>
        }
      />
      <main className="page">
        <p className="muted small">
          Pick what you'll cook each day. When you're done, put the whole week on your shopping list in one tap.
        </p>
        {recipes?.length === 0 && <p className="muted">Add some recipes first — then plan them here.</p>}
        {thaw.length > 0 && (
          <section className="thaw-section">
            <h3>Thaw ahead</h3>
            <ThawList reminders={thaw} calendar />
          </section>
        )}
        {recipes && recipes.some(isDinner) && (
          <div className="plan-card auto-plan">
            <div className="people-row">
              <span>Cooking for</span>
              <button className="icon-btn small-btn" aria-label="Fewer people" disabled={people <= 1} onClick={() => (setPeople(people - 1), setPeopleState(people - 1))}>
                −
              </button>
              <strong aria-live="polite">{people}</strong>
              <button className="icon-btn small-btn" aria-label="More people" disabled={people >= 20} onClick={() => (setPeople(people + 1), setPeopleState(people + 1))}>
                +
              </button>
              <span>{people === 1 ? "person" : "people"}</span>
            </div>
            <div className="button-row">
              <button className="btn primary" onClick={fill}>
                <Icon name="reset" size={18} /> {hasAuto ? "Shuffle again" : "Fill my week for me"}
              </button>
              {hasAuto && (
                <button className="link-btn small" onClick={clearPicks}>
                  Clear the picks
                </button>
              )}
            </div>
            {result && <p className="small">{result}</p>}
            <p className="muted small">
              Fills the empty days with dinners you haven't had in the last {NO_REPEAT_DAYS} days, leaves leftovers nights after big meals,
              and uses up leftovers in your fridge first. Days you picked yourself stay as they are. When a recipe doesn't say how many it
              serves, 4 is assumed (“servings guessed”) — after you make it, you'll be asked.
            </p>
          </div>
        )}
        {feature("history") && <p className="small">
          <a href={href({ name: "history" })}>What we've cooked</a>
          <span className="muted"> — your meal history</span>
        </p>}
        {recipes && recipes.length > 1 && (
          <a className="btn plan-open" href={href({ name: "meal" })}>
            <Icon name="timer" size={18} /> Plan a big meal (several dishes at once)
          </a>
        )}
        <ol className="week">
          {days.map((d) => {
            const meals = week.days[d.key] ?? [];
            return (
              <li key={d.key} className="week-day">
                <div className="week-day-head">
                  <strong>{d.name}</strong> <span className="muted small">{d.date}</span>
                </div>
                {meals.length > 0 && (
                  <ul className="week-meals">
                    {meals.map((m, i) => {
                      const r = byId.get(m.id);
                      return (
                        <li key={i}>
                          {r ? (
                            m.leftover ? (
                              <span className="leftover-night">
                                Leftovers: <a href={href({ name: "recipe", id: m.id })}>{r.title}</a>
                              </span>
                            ) : (
                              <a href={href({ name: "recipe", id: m.id })}>{r.title}</a>
                            )
                          ) : (
                            <span className="muted">{recipes ? "(deleted recipe)" : "…"}</span>
                          )}
                          {m.auto && !m.leftover && <span className="muted small"> · picked for you</span>}
                          {m.auto && !m.leftover && r && servingsCount(r.servings) === null && (
                            <span className="muted small"> · servings guessed</span>
                          )}
                          <span className="muted small">{sizeLabel(m.scale)}</span>
                          <button
                            className="icon-btn small-btn"
                            aria-label={`Remove ${r?.title ?? "meal"} from ${d.name}`}
                            onClick={() => setWeek(removeMeal(d.key, i))}
                          >
                            <Icon name="close" size={18} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {meals.filter((m) => !m.leftover).length > 1 && (
                  <a className="link-btn small week-add" href={href({ name: "meal", day: d.key, ids: [...new Set(meals.filter((m) => !m.leftover).map((m) => m.id))] })}>
                    <Icon name="timer" size={16} /> Timeline so these are ready together
                  </a>
                )}
                {adding === d.key ? (
                  <div className="week-pick">
                    <select
                      className="text-input"
                      autoFocus
                      aria-label={`Recipe for ${d.name}`}
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setWeek(addMeal(d.key, { id: e.target.value, scale: 1 }));
                        setAdding(null);
                      }}
                    >
                      <option value="">Choose a recipe…</option>
                      {(recipes ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                    <button className="link-btn small" onClick={() => setAdding(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  recipes &&
                  recipes.length > 0 && (
                    <button className="link-btn small week-add" onClick={() => setAdding(d.key)}>
                      <Icon name="plus" size={16} /> Add a recipe
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ol>
        {planned > 0 && (
          <>
            <div className="button-row">
              <button className="btn primary" onClick={shopWeek}>
                <Icon name="bag" size={18} /> Put this week on my shopping list
              </button>
            </div>
            <p className="muted small">
              A recipe planned twice is bought for twice. Sizes you set here replace the size already on the list for that recipe.
            </p>
          </>
        )}
      </main>
      {toast}
    </>
  );
}
