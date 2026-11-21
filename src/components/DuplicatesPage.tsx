import { useEffect, useState } from "react";
import { listRecipes } from "../lib/db";
import { deleteWithUndo } from "../lib/undoDelete";
import { duplicatePairs, markNotDuplicates, notDuplicates } from "../lib/duplicates";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import Header from "./Header";
import { Loading } from "./LogoLoader";

const day = (ms: number) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/** Recipes that look like they were saved twice. Nothing is deleted without asking. */
export default function DuplicatesPage() {
  const [all, setAll] = useState<SavedRecipe[] | null>(null);
  const [ignored, setIgnored] = useState(notDuplicates);
  useEffect(() => {
    listRecipes().then(setAll, () => setAll([]));
  }, []);
  const pairs = all ? duplicatePairs(all, ignored) : [];

  async function remove(r: SavedRecipe) {
    await deleteWithUndo(r);
    setAll((xs) => xs && xs.filter((x) => x.id !== r.id));
  }

  const card = (r: SavedRecipe) => (
    <a className="dup-card" href={href({ name: "recipe", id: r.id })}>
      <strong>{r.title}</strong>
      <span className="muted small">
        Added {day(r.createdAt)} · {r.ingredients.length} ingredients
        {r.rating ? ` · ${"★".repeat(r.rating)}` : ""}
      </span>
    </a>
  );

  return (
    <>
      <Header title="Possible duplicates" back={href({ name: "library" })} />
      <main className="page">
        {all === null && <Loading />}
        {all && pairs.length === 0 && <p className="muted">No duplicates found.</p>}
        {pairs.length > 0 && <p className="muted small">These look like the same recipe saved twice. Open them to compare, then keep one.</p>}
        <ul className="dup-list">
          {pairs.map(({ a, b, reason }) => (
            <li key={`${a.id}|${b.id}`} className="dup-pair">
              <p className="muted small">Same {reason.replace("same ", "")}</p>
              {card(a)}
              {card(b)}
              <div className="button-row">
                <button className="btn" onClick={() => remove(b)}>
                  Delete the newer one
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    markNotDuplicates(a.id, b.id);
                    setIgnored(notDuplicates());
                  }}
                >
                  Not duplicates
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
