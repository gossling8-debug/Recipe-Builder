import { useState } from "react";
import Icon from "./Icon";
import { href } from "../lib/route";
import { tipsForRecipe, type TipRow } from "../lib/tips";
import type { ScannedRecipe } from "../lib/schema";

const table = (rows: TipRow[]) => (
  <table className="tip-table">
    <tbody>
      {rows.map((r) => (
        <tr key={r.what}>
          <th scope="row">{r.what}</th>
          <td>
            <strong>{r.value}</strong>
            {r.detail && <span className="tip-detail">{r.detail}</span>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** On a recipe: a Tips button next to Size and Units with the tips that fit this recipe, and a link to all tips. */
export default function RecipeTips({ recipe }: { recipe: ScannedRecipe }) {
  const [open, setOpen] = useState(false);
  const t = tipsForRecipe(recipe);
  const any = t.safe.length + t.steak.length + t.grill.length > 0;

  return (
    <>
      <div className="scale-row">
        <span className="small muted">Tips</span>
        <button className={open ? "chip active tips-chip" : "chip tips-chip"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="bulb" size={16} /> {any ? "Temperatures for this recipe" : "Cooking tips"}
        </button>
      </div>
      {open && (
        <div className="plan-card recipe-tips">
          {t.safe.length > 0 && (
            <>
              <h4>Cook to</h4>
              {table(t.safe)}
            </>
          )}
          {t.steak.length > 0 && (
            <>
              <h4>Steak doneness</h4>
              <p className="muted small">After resting — take it off the heat about 5°F early.</p>
              {table(t.steak)}
            </>
          )}
          {t.grill.length > 0 && (
            <>
              <h4>On the grill</h4>
              {table(t.grill)}
            </>
          )}
          {!any && <p className="small">No temperature tips needed for this one.</p>}
          <p className="small">
            <a href={href({ name: "tips" })}>All tips</a>
            <span className="muted"> — food safety, grilling, kitchen math, swaps, eggs &amp; rice</span>
          </p>
          <p className="muted small">Check with a food thermometer in the thickest part.</p>
        </div>
      )}
    </>
  );
}
