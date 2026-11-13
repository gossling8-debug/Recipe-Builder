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
import { dollars, recipeCost } from "../lib/prices";
import { realServings } from "../lib/autoPlan";
import { printOrShare, recipePdf, type PdfBlock } from "../lib/printPdf";

const line = (ing: Ingredient, scale: number) => ingredientText(ing, scale);

/** The parts of a recipe that can be printed. */
type Part = "photo" | "info" | "ingredients" | "steps" | "amounts" | "cardNotes" | "myNotes" | "nutrition" | "cost";
const PART_LABELS: Record<Part, string> = {
  photo: "Your photo",
  info: "Servings and time",
  ingredients: "Ingredients",
  steps: "Directions",
  amounts: "Amounts in the directions",
  cardNotes: "Notes from the recipe",
  myNotes: "Your notes",
  nutrition: "Nutrition",
  cost: "Cost",
};
const DEFAULT_PARTS: Part[] = ["photo", "info", "ingredients", "steps", "amounts", "cardNotes"];
const JUST_THE_RECIPE: Part[] = ["ingredients", "steps", "amounts"];
const PARTS_KEY = "recipe-builder.printParts";
function loadParts(): Set<Part> {
  try {
    const raw = localStorage.getItem(PARTS_KEY);
    if (raw) return new Set(JSON.parse(raw) as Part[]);
  } catch {
    /* defaults */
  }
  return new Set(DEFAULT_PARTS);
}
function saveParts(parts: Set<Part>) {
  try {
    localStorage.setItem(PARTS_KEY, JSON.stringify([...parts]));
  } catch {
    /* this time only */
  }
}

/**
 * A clean, printable recipe card — at the size and units chosen on the recipe,
 * with substitutes applied — to print or save as a PDF (e.g. to give as a gift).
 */
export default function PrintPage({ id }: { id: string }) {
  const [saved, setSaved] = useState<SavedRecipe | null | undefined>(undefined);
  const [large, setLarge] = useState(true);
  // What to print, remembered for next time.
  const [parts, setPartsState] = useState<Set<Part>>(loadParts);
  const setParts = (next: Set<Part>) => {
    setPartsState(next);
    saveParts(next);
  };
  const toggle = (p: Part) => {
    const next = new Set(parts);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setParts(next);
  };
  const on = (p: Part) => parts.has(p);
  useEffect(() => {
    getRecipe(id).then((r) => setSaved(r ?? null), () => setSaved(null));
  }, [id]);

  // The PDF is made ahead (when the choices change), so the share sheet can open right on the tap — phones require that.
  const [pdf, setPdf] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!saved) return;
    let live = true;
    setPdf(null);
    recipePdf(pdfBlocks(saved, parts), saved.title, large).then((f) => live && setPdf(f), () => live && setPdf(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, parts, large]);

  if (saved === undefined) return <p className="muted page">Loading…</p>;
  if (saved === null) return <div className="callout error page">That recipe wasn't found on this device.</div>;

  const scale = loadProgress(id).scale;
  const r = convertRecipe(applySwaps(saved), getUnits());
  const meta = [r.servings && scaleAmount(r.servings, scale), r.time].filter(Boolean).join(" · ");
  const n = saved.nutrition?.result;
  const cost = recipeCost(applySwaps(saved), scale);
  const serves = realServings(saved);
  // Only offer what this recipe has.
  const available: Part[] = (Object.keys(PART_LABELS) as Part[]).filter((p) =>
    p === "photo" ? !!saved.dishPhoto
    : p === "info" ? !!meta
    : p === "cardNotes" ? !!r.notes
    : p === "myNotes" ? !!saved.myNotes
    : p === "nutrition" ? !!n
    : p === "cost" ? cost.priced > 0
    : p === "amounts" ? on("steps")
    : true,
  );
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
          <h3 className="list-heading">What to print</h3>
          <div className="filters print-presets">
            <button className="tag" onClick={() => setParts(new Set(JUST_THE_RECIPE))}>
              Just the recipe
            </button>
            <button className="tag" onClick={() => setParts(new Set(available))}>
              Everything
            </button>
          </div>
          <div className="print-parts">
            {available.map((p) => (
              <label key={p} className={p === "amounts" ? "check-line print-sub" : "check-line"}>
                <input type="checkbox" checked={on(p)} onChange={() => toggle(p)} />
                <span>{PART_LABELS[p]}</span>
              </label>
            ))}
            <label className="check-line">
              <input type="checkbox" checked={large} onChange={() => setLarge((v) => !v)} />
              <span>Large print</span>
            </label>
          </div>
          {!on("ingredients") && !on("steps") && <p className="callout small">Pick at least the ingredients or the directions.</p>}
          <p className="muted small">
            Uses the size{scale !== 1 ? ` (×${scale})` : ""} and units chosen on the recipe. On a phone, the button opens the share menu:
            choose <strong>Print</strong>, or <strong>Save to Files</strong> to keep the PDF.
          </p>
        </div>

        <article className={large ? "print-card large" : "print-card"}>
          {on("photo") && saved.dishPhoto && <img className="print-photo" src={saved.dishPhoto} alt="" />}
          <h1>{r.title}</h1>
          {on("info") && meta && <p className="print-meta">{meta}</p>}
          {on("ingredients") && (
            <>
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
            </>
          )}
          {on("steps") && (
          <>
          <h2>Directions</h2>
          <ol className="print-steps">
            {r.steps.map((st, i) => (
              <li key={i}>
                {st.segments.map((sg, k) =>
                  on("amounts") && sg.ingredient_index !== null && sg.amount ? (
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
          </>
          )}
          {on("cardNotes") && r.notes && (
            <>
              <h2>Notes</h2>
              <p className="print-notes">{r.notes}</p>
            </>
          )}
          {on("myNotes") && saved.myNotes && (
            <>
              <h2>My notes</h2>
              <p className="print-notes">{saved.myNotes}</p>
            </>
          )}
          {on("nutrition") && n && (
            <>
              <h2>Nutrition per serving</h2>
              <p className="print-notes">
                {n.serving_size ? `${n.serving_size.measure} · ` : ""}
                {Math.round(n.per_serving.calories)} calories · protein {Math.round(n.per_serving.protein_g)} g · carbs{" "}
                {Math.round(n.per_serving.carbs_g)} g · fat {Math.round(n.per_serving.fat_g)} g · sodium {Math.round(n.per_serving.sodium_mg)} mg
                {n.source !== "card" ? " (estimated)" : ""}
              </p>
            </>
          )}
          {on("cost") && cost.priced > 0 && (
            <>
              <h2>Cost</h2>
              <p className="print-notes">
                Ingredients ≈ {dollars(cost.total)}
                {serves ? ` · ${dollars(cost.total / (serves * scale))} per serving` : ""}
              </p>
            </>
          )}
        </article>
        {message && <p className="callout small">{message}</p>}
      </main>
      <div className="fab-bar">
        <button
          className="btn primary big"
          disabled={(!on("ingredients") && !on("steps")) || !pdf}
          onClick={async () => {
            setMessage("");
            const r = await printOrShare(pdf);
            if (r === "shared") setMessage("");
          }}
        >
          <Icon name="download" size={18} /> {pdf ? "Print or save as PDF" : "Getting it ready…"}
        </button>
      </div>
    </>
  );
}

/** The same card as the preview, as blocks for the PDF. */
function pdfBlocks(saved: SavedRecipe, parts: Set<Part>): PdfBlock[] {
  const on = (p: Part) => parts.has(p);
  const scale = loadProgress(saved.id).scale;
  const r = convertRecipe(applySwaps(saved), getUnits());
  const out: PdfBlock[] = [];
  if (on("photo") && saved.dishPhoto) out.push({ kind: "img", src: saved.dishPhoto });
  out.push({ kind: "title", text: r.title });
  const meta = [r.servings && scaleAmount(r.servings, scale), r.time].filter(Boolean).join(" · ");
  if (on("info") && meta) out.push({ kind: "meta", text: meta });
  if (on("ingredients")) {
    out.push({ kind: "h2", text: "Ingredients" });
    let section: string | null = null;
    for (const ing of r.ingredients) {
      if (ing.section && ing.section !== section) out.push({ kind: "h3", text: ing.section });
      section = ing.section;
      out.push({ kind: "bullet", text: line(ing, scale) });
    }
  }
  if (on("steps")) {
    out.push({ kind: "h2", text: "Directions" });
    r.steps.forEach((st, i) =>
      out.push({
        kind: "step",
        n: i + 1,
        text: st.segments
          .map((sg) =>
            on("amounts") && sg.ingredient_index !== null && sg.amount
              ? `${sg.text} (${stepAmount(sg.amount, r.ingredients[sg.ingredient_index], scale)})`
              : sg.text,
          )
          .join(""),
      }),
    );
  }
  if (on("cardNotes") && r.notes) out.push({ kind: "h2", text: "Notes" }, { kind: "p", text: r.notes });
  if (on("myNotes") && saved.myNotes) out.push({ kind: "h2", text: "My notes" }, { kind: "p", text: saved.myNotes });
  const n = saved.nutrition?.result;
  if (on("nutrition") && n) {
    out.push(
      { kind: "h2", text: "Nutrition per serving" },
      {
        kind: "p",
        text:
          `${n.serving_size ? `${n.serving_size.measure} · ` : ""}${Math.round(n.per_serving.calories)} calories · protein ${Math.round(n.per_serving.protein_g)} g · ` +
          `carbs ${Math.round(n.per_serving.carbs_g)} g · fat ${Math.round(n.per_serving.fat_g)} g · sodium ${Math.round(n.per_serving.sodium_mg)} mg` +
          (n.source !== "card" ? " (estimated)" : ""),
      },
    );
  }
  const cost = recipeCost(applySwaps(saved), scale);
  const serves = realServings(saved);
  if (on("cost") && cost.priced > 0) {
    out.push({ kind: "h2", text: "Cost" }, { kind: "p", text: `Ingredients ≈ ${dollars(cost.total)}${serves ? ` · ${dollars(cost.total / (serves * scale))} per serving` : ""}` });
  }
  return out;
}
