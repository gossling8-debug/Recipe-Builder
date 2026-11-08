import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { listRecipes } from "../lib/db";
import { href } from "../lib/route";
import { addToShopping } from "../lib/shopping";
import { addMeal, countMeals, loadWeek, mealsToShop, removeMeal, upcomingDays, type WeekState } from "../lib/week";
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
                          {r ? <a href={href({ name: "recipe", id: m.id })}>{r.title}</a> : <span className="muted">{recipes ? "(deleted recipe)" : "…"}</span>}
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
                {meals.length > 1 && (
                  <a className="link-btn small week-add" href={href({ name: "meal", day: d.key, ids: [...new Set(meals.map((m) => m.id))] })}>
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
