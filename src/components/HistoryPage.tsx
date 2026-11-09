import { useEffect, useState } from "react";
import Header from "./Header";
import { listRecipes } from "../lib/db";
import { aYearAgo, byMonth, cookedHistory, mostMade } from "../lib/history";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";

const dayText = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

/** What you've cooked, month by month, plus what you made this time last year. */
export default function HistoryPage() {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  useEffect(() => {
    listRecipes().then(setRecipes, () => setRecipes([]));
  }, []);

  const list = cookedHistory(recipes ?? []);
  const months = byMonth(list);
  const lastYear = aYearAgo(recipes ?? []);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = list.filter((c) => c.at >= monthStart).length;
  const top = mostMade(list, monthStart).filter((m) => m.times > 1)[0];

  return (
    <>
      <Header title="What we've cooked" back={href({ name: "week" })} returnToPrevious />
      <main className="page">
        {recipes === null && <p className="muted">Loading…</p>}
        {recipes && list.length === 0 && (
          <div className="empty">
            <p className="empty-title">Nothing cooked yet.</p>
            <p className="muted">
              When you tap “Made it today” or “I made this”, or finish in cooking mode, the meal shows up here.
            </p>
          </div>
        )}
        {lastYear.length > 0 && (
          <div className="callout small">
            <strong>A year ago this week</strong> you made{" "}
            {lastYear.map((c, i) => (
              <span key={c.recipe.id}>
                {i > 0 && (i === lastYear.length - 1 ? " and " : ", ")}
                <a href={href({ name: "recipe", id: c.recipe.id })}>{c.recipe.title}</a>
              </span>
            ))}
            .
          </div>
        )}
        {list.length > 0 && (
          <p className="small">
            <strong>{thisMonth}</strong> {thisMonth === 1 ? "meal" : "meals"} cooked this month
            {top && (
              <>
                {" "}
                · most made: <a href={href({ name: "recipe", id: top.recipe.id })}>{top.recipe.title}</a> ({top.times}×)
              </>
            )}
          </p>
        )}
        {months.map((g) => (
          <section key={g.month}>
            <h3>{g.month}</h3>
            <ul className="history-list">
              {g.items.map((c) => (
                <li key={`${c.recipe.id}-${c.at}`}>
                  <span className="muted small history-day">{dayText(c.at)}</span>
                  <a href={href({ name: "recipe", id: c.recipe.id })}>{c.recipe.title}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
