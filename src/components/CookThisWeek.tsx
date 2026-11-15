import { useEffect, useState } from "react";
import Icon from "./Icon";
import { href } from "../lib/route";
import { agoText } from "../lib/made";
import { loadWeek, pastPlans } from "../lib/week";
import { cookThisWeek, hideThisWeek, loadHidden } from "../lib/cookThisWeek";
import type { SavedRecipe } from "../lib/schema";

/** On the home screen: up to 3 recipes you loved but haven't made in a while. */
export default function CookThisWeek({ recipes }: { recipes: SavedRecipe[] }) {
  const [week, setWeek] = useState(() => loadWeek());
  const [hidden, setHidden] = useState(() => loadHidden());
  useEffect(() => {
    const on = () => setWeek(loadWeek());
    window.addEventListener("week-changed", on);
    return () => window.removeEventListener("week-changed", on);
  }, []);
  const ideas = cookThisWeek({ recipes, planned: [week.days, pastPlans()], hidden });
  if (ideas.length === 0) return null;
  return (
    <section className="cook-week" aria-label="Cook this week">
      <h2 className="list-heading">Cook this week</h2>
      <p className="muted small">Recipes you loved that you haven't made in a while.</p>
      <ul className="cook-week-list">
        {ideas.map(({ recipe: r, last }) => {
          const photo = r.dishPhoto ?? r.photos[0];
          return (
            <li key={r.id} className="cook-week-card">
              <a href={href({ name: "recipe", id: r.id })}>
                {photo ? <img src={photo} alt="" /> : <div className="thumb-placeholder" />}
                <span className="recipe-card-title">{r.title}</span>
                <span className="muted small">
                  {r.rating ? <span className="row-stars" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)} </span> : null}
                  {last === undefined ? "Not made yet" : `Made ${agoText(last)}`}
                </span>
              </a>
              <button className="icon-btn cook-week-hide" aria-label={`Not this week: ${r.title}`} onClick={() => setHidden(hideThisWeek(r.id))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
