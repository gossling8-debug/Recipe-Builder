import { useState } from "react";
import { rateInCookbook, ratingSummary, type Cookbook, type Rating } from "../lib/family";
import Icon from "./Icon";

const one = (n: number) => (Math.round(n * 10) / 10).toString();

/** "★ 4.6 · 5 ratings" for a list row; nothing when nobody has rated. */
export function RatingBadge({ ratings }: { ratings: Rating[] | undefined }) {
  const s = ratingSummary(ratings);
  if (!s) return null;
  return (
    <div className="muted small book-rating" aria-label={`Rated ${one(s.average)} out of 5 by ${s.count}`}>
      <span className="row-stars">★</span> {one(s.average)} · {s.count} {s.count === 1 ? "rating" : "ratings"}
    </div>
  );
}

/** On a cookbook recipe: your own stars, the cookbook's average, and who gave what. */
export function CookbookRating(props: { book: Cookbook; recipeId: string; ratings: Rating[]; myUid: string; onChange: (rs: Rating[]) => void }) {
  const { book, recipeId, ratings, myUid } = props;
  const mine = ratings.find((r) => r.by === myUid)?.stars ?? 0;
  const s = ratingSummary(ratings);
  const [error, setError] = useState("");
  const [showWho, setShowWho] = useState(false);

  async function rate(n: number) {
    setError("");
    const stars = mine === n ? null : n; // tapping your current rating again clears it
    const before = ratings;
    const others = ratings.filter((r) => r.by !== myUid);
    // Show it right away; undo if saving fails.
    props.onChange(stars ? [...others, { recipeId, by: myUid, byName: book.names[myUid] ?? "You", stars, at: Date.now() }] : others);
    try {
      await rateInCookbook(book, recipeId, stars);
    } catch (e) {
      props.onChange(before);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="cookbook-rating">
      <div className="rating-row" role="group" aria-label="Your rating">
        <span className="small muted">Your rating</span>
        <span className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={n <= mine ? "star-pick on" : "star-pick"}
              aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
              aria-pressed={mine === n}
              onClick={() => rate(n)}
            >
              <Icon name="star" size={24} filled={n <= mine} />
            </button>
          ))}
        </span>
      </div>
      {s ? (
        <p className="small">
          <span className="row-stars">★</span> <strong>{one(s.average)}</strong> from {s.count} {s.count === 1 ? "person" : "people"} in{" "}
          {book.name} ·{" "}
          <button className="link-btn small" onClick={() => setShowWho((v) => !v)} aria-expanded={showWho}>
            {showWho ? "Hide" : "See who"}
          </button>
        </p>
      ) : (
        <p className="muted small">No ratings yet. Be the first in {book.name}.</p>
      )}
      {showWho && s && (
        <ul className="who-rated small">
          {[...ratings]
            .sort((a, b) => b.stars - a.stars || a.byName.localeCompare(b.byName))
            .map((r) => (
              <li key={r.by}>
                {r.by === myUid ? "You" : r.byName} <span className="row-stars">{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
              </li>
            ))}
        </ul>
      )}
      {error && <div className="callout error small">{error}</div>}
    </section>
  );
}
