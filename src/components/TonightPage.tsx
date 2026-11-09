import { feature } from "../lib/features";
import { useEffect, useState, type ReactNode } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { listRecipes } from "../lib/db";
import { whatCanIMake } from "../lib/canMake";
import { isDinner, suggestDinner } from "../lib/autoPlan";
import { eatByLabel, useLeftovers } from "../lib/leftovers";
import { loadPlans, timeOf } from "../lib/plan";
import { href, navigate } from "../lib/route";
import { addMeal, dayKey, loadWeek, pastPlans, removeMeal } from "../lib/week";
import type { SavedRecipe } from "../lib/schema";

const thumb = (r: SavedRecipe) => r.dishPhoto ?? r.photos[0];

/** What's for dinner tonight — or help deciding. */
export default function TonightPage() {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [week, setWeek] = useState(() => loadWeek());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const leftovers = useLeftovers();
  const fridge = feature("pantry") ? leftovers.filter((l) => !l.frozen && l.eatBy >= Date.now()) : [];
  useEffect(() => {
    listRecipes().then(setRecipes, () => setRecipes([]));
    const on = () => setWeek(loadWeek());
    window.addEventListener("week-changed", on);
    return () => window.removeEventListener("week-changed", on);
  }, []);

  const today = dayKey(new Date());
  const all = recipes ?? [];
  const byId = new Map(all.map((r) => [r.id, r]));
  const meals = (week.days[today] ?? []).filter((m) => byId.has(m.id));
  const plans = feature("mealTime") ? loadPlans() : {};
  const idea = recipes ? suggestDinner({ recipes: all, past: pastPlans(), week, skip }) : undefined;
  const ready = recipes && feature("pantry")
    ? whatCanIMake(all.filter(isDinner), 0)
        .filter((c) => c.missing.length + c.short.length + c.expired.length === 0)
        .slice(0, 3)
    : [];

  const tonight = (id: string, leftover = false) => setWeek(addMeal(today, { id, scale: 1, ...(leftover ? { leftover: true } : {}) }));
  const cook = (id: string) => {
    try {
      sessionStorage.setItem("recipe-builder.cookOnOpen", id);
    } catch {
      /* it just opens the recipe */
    }
    navigate({ name: "recipe", id });
  };

  const card = (r: SavedRecipe, actions: ReactNode, note?: ReactNode) => (
    <div className="tonight-card" key={r.id}>
      <a href={href({ name: "recipe", id: r.id })} className="tonight-main">
        {thumb(r) ? <img src={thumb(r)} alt="" /> : <div className="thumb-placeholder" />}
        <div>
          <div className="recipe-card-title">{r.title}</div>
          {note && <div className="muted small">{note}</div>}
        </div>
      </a>
      <div className="button-row tonight-actions">{actions}</div>
    </div>
  );

  return (
    <>
      <Header title="Tonight" back={href({ name: "library" })} />
      <main className="page">
        <p className="muted">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
        {recipes === null && <p className="muted">Loading…</p>}

        {meals.length > 0 && (
          <section>
            <h3>On the menu</h3>
            {meals.map((m, i) => {
              const r = byId.get(m.id)!;
              const plan = plans[r.id];
              const left = fridge.find((l) => l.id === r.id);
              return (
                <div key={`${m.id}-${i}`}>
                  {card(
                    r,
                    m.leftover ? (
                      <button className="link-btn small" onClick={() => setWeek(removeMeal(today, i))}>
                        Not tonight
                      </button>
                    ) : (
                      <>
                        {feature("cookMode") ? (
                          <button className="btn primary" onClick={() => cook(r.id)}>
                            <Icon name="play" size={18} /> Start cooking
                          </button>
                        ) : (
                          <a className="btn primary" href={href({ name: "recipe", id: r.id })}>
                            Open the recipe
                          </a>
                        )}
                        <button className="link-btn small" onClick={() => setWeek(removeMeal(today, i))}>
                          Not tonight
                        </button>
                      </>
                    ),
                    m.leftover
                      ? `Leftovers${left ? ` · ${eatByLabel(left)}` : ""}`
                      : plan && plan.eatAt > Date.now()
                        ? `Start by ${timeOf(plan.startAt)} to eat at ${timeOf(plan.eatAt)}`
                        : (r.tags ?? []).join(" · "),
                  )}
                </div>
              );
            })}
          </section>
        )}

        {fridge.filter((l) => !meals.some((m) => m.id === l.id) && byId.has(l.id)).length > 0 && (
          <section>
            <h3>In your fridge</h3>
            {fridge
              .filter((l) => !meals.some((m) => m.id === l.id) && byId.has(l.id))
              .map((l) =>
                card(
                  byId.get(l.id)!,
                  <button className="btn" onClick={() => tonight(l.id, true)}>
                    Have the leftovers tonight
                  </button>,
                  `Leftovers · ${eatByLabel(l)}`,
                ),
              )}
          </section>
        )}

        {recipes && meals.length === 0 && (
          <section>
            <h3>Nothing planned yet</h3>
            {ready.length > 0 && (
              <>
                <p className="small">You have everything for:</p>
                {ready.map((c) =>
                  card(
                    c.recipe,
                    <button className="btn" onClick={() => tonight(c.recipe.id)}>
                      Make this tonight
                    </button>,
                    "Everything's in your pantry",
                  ),
                )}
              </>
            )}
            {idea ? (
              <>
                <p className="small">{ready.length ? "Or an idea you haven't had lately:" : "An idea you haven't had in a while:"}</p>
                {card(
                  idea,
                  <>
                    <button className="btn primary" onClick={() => tonight(idea.id)}>
                      Make this tonight
                    </button>
                    <button className="btn" onClick={() => setSkip((s) => new Set([...s, idea.id]))}>
                      <Icon name="reset" size={18} /> Another idea
                    </button>
                  </>,
                  idea.rating ? `${"★".repeat(idea.rating)}${"☆".repeat(5 - idea.rating)}` : (idea.tags ?? []).join(" · "),
                )}
              </>
            ) : (
              all.some(isDinner) && (
                <p className="muted small">
                  {skip.size ? "That's all the dinners you haven't had in the last 2 weeks." : "You've had every dinner recipe in the last 2 weeks."}{" "}
                  {skip.size > 0 && (
                    <button className="link-btn small" onClick={() => setSkip(new Set())}>
                      Start the ideas over
                    </button>
                  )}
                </p>
              )
            )}
            {!all.some(isDinner) && (
              <p className="muted">
                Label some recipes <strong>Dinner</strong> and ideas will show up here. <a href={href({ name: "scan" })}>Add a recipe</a>
              </p>
            )}
          </section>
        )}

        {feature("weekPlanner") && <p className="small tonight-week">
          <Icon name="calendar" size={16} /> <a href={href({ name: "week" })}>Plan the rest of the week</a>
        </p>}
      </main>
    </>
  );
}
