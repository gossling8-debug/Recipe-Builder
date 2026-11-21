import { useEffect, useState } from "react";
import { href } from "../lib/route";
import { getEaters, nextTaste, tastesOf, withTaste } from "../lib/tastes";
import type { SavedRecipe } from "../lib/schema";

/** On a recipe (Family plan): who loves it and who won't eat it. Tap a name to change it. */
export default function TastesRow({ recipe, onSaved }: { recipe: SavedRecipe; onSaved: (r: SavedRecipe) => Promise<void> }) {
  const [eaters, setEaters] = useState(getEaters);
  useEffect(() => {
    const on = () => setEaters(getEaters());
    window.addEventListener("eaters-changed", on);
    window.addEventListener("state-synced", on);
    return () => {
      window.removeEventListener("eaters-changed", on);
      window.removeEventListener("state-synced", on);
    };
  }, []);
  if (!eaters.length)
    return (
      <p className="muted small tastes-setup">
        Cooking for others? <a href={href({ name: "settings" })}>Add who you cook for</a> to mark who loves this and who won't eat it.
      </p>
    );
  const marks = tastesOf(recipe, eaters);
  return (
    <div className="tastes" role="group" aria-label="Who likes it">
      <span className="muted small">Who likes it</span>
      {eaters.map((n) => {
        const t = marks[n];
        return (
          <button
            key={n}
            className={t === "love" ? "tag on taste-love" : t === "no" ? "tag taste-no" : "tag"}
            aria-label={`${n}: ${t === "love" ? "loves it" : t === "no" ? "won't eat it" : "not marked"}. Tap to change.`}
            onClick={() => void onSaved(withTaste(recipe, n, nextTaste(t)))}
          >
            {n}
            {t === "love" ? " ♥" : t === "no" ? " · won't eat" : ""}
          </button>
        );
      })}
    </div>
  );
}
