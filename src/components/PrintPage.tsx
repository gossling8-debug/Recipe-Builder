import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { getRecipe } from "../lib/db";
import { loadProgress } from "../lib/progress";
import { ingredientText, scaleAmount, stepAmount } from "../lib/quantity";
import { href } from "../lib/route";
import { applySwaps } from "../lib/swaps";
import { convertRecipe, getUnits } from "../lib/units";
import type { Ingredient, SavedRecipe } from "../lib/schema";

const line = (ing: Ingredient, scale: number) => ingredientText(ing, scale);

/**
 * A clean, printable recipe card — at the size and units chosen on the recipe,
 * with substitutes applied — to print or save as a PDF (e.g. to give as a gift).
 */
export default function PrintPage({ id }: { id: string }) {
  const [saved, setSaved] = useState<SavedRecipe | null | undefined>(undefined);
  const [large, setLarge] = useState(true);
  const [withNotes, setWithNotes] = useState(false);
  const [withPhoto, setWithPhoto] = useState(true);
  useEffect(() => {
    getRecipe(id).then((r) => setSaved(r ?? null), () => setSaved(null));
  }, [id]);

  if (saved === undefined) return <p className="muted page">Loading…</p>;
  if (saved === null) return <div className="callout error page">That recipe wasn't found on this device.</div>;

  const scale = loadProgress(id).scale;
  const r = convertRecipe(applySwaps(saved), getUnits());
  const meta = [r.servings && scaleAmount(r.servings, scale), r.time].filter(Boolean).join(" · ");
  const groups: { section: string | null; items: Ingredient[] }[] = [];
  for (const ing of r.ingredients) {
    const last = groups[groups.length - 1];
    if (last && last.section === ing.section) last.items.push(ing);
    else groups.push({ section: ing.section, items: [ing] });
  }

  return (
    <>
      <div className="no-print">
        <Header title="Print" back={href({ name: "recipe", id })} />
      </div>
      <main className="page">
        <div className="no-print print-controls">
          <div className="filters">
            <button className={large ? "tag on" : "tag"} aria-pressed={large} onClick={() => setLarge((v) => !v)}>
              Large print
            </button>
            {saved.dishPhoto && (
              <button className={withPhoto ? "tag on" : "tag"} aria-pressed={withPhoto} onClick={() => setWithPhoto((v) => !v)}>
                Your photo
              </button>
            )}
            {saved.myNotes && (
              <button className={withNotes ? "tag on" : "tag"} aria-pressed={withNotes} onClick={() => setWithNotes((v) => !v)}>
                Your notes
              </button>
            )}
          </div>
          <button className="btn primary" onClick={() => window.print()}>
            <Icon name="download" size={18} /> Print or save as PDF
          </button>
          <p className="muted small">
            Uses the size{scale !== 1 ? ` (×${scale})` : ""} and units chosen on the recipe. If nothing happens on iPhone, tap the share
            button in DuckDuckGo, then <strong>Print</strong> (pinch out on the preview to save it as a PDF).
          </p>
        </div>

        <article className={large ? "print-card large" : "print-card"}>
          {withPhoto && saved.dishPhoto && <img className="print-photo" src={saved.dishPhoto} alt="" />}
          <h1>{r.title}</h1>
          {meta && <p className="print-meta">{meta}</p>}
          <h2>Ingredients</h2>
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.section && <h3>{g.section}</h3>}
              <ul className="print-ings">
                {g.items.map((ing, i) => (
                  <li key={i}>{line(ing, scale)}</li>
                ))}
              </ul>
            </div>
          ))}
          <h2>Instructions</h2>
          <ol className="print-steps">
            {r.steps.map((st, i) => (
              <li key={i}>
                {st.segments.map((sg, k) =>
                  sg.ingredient_index !== null && sg.amount ? (
                    <span key={k}>
                      {sg.text} <strong>({stepAmount(sg.amount, r.ingredients[sg.ingredient_index], scale)})</strong>
                    </span>
                  ) : (
                    <span key={k}>{sg.text}</span>
                  ),
                )}
              </li>
            ))}
          </ol>
          {r.notes && (
            <>
              <h2>Notes</h2>
              <p className="print-notes">{r.notes}</p>
            </>
          )}
          {withNotes && saved.myNotes && (
            <>
              <h2>My notes</h2>
              <p className="print-notes">{saved.myNotes}</p>
            </>
          )}
        </article>
      </main>
    </>
  );
}
