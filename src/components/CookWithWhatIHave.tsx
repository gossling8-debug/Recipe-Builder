import { useState } from "react";
import { getPeople } from "../lib/autoPlan";
import { ALLERGEN_GROUPS, isActive, loadAvoid } from "../lib/avoid";
import { costOf, getModel } from "../lib/models";
import { listRecipes, newId, saveRecipe, storageErrorMessage } from "../lib/db";
import { loadPantry } from "../lib/pantry";
import { href, navigate } from "../lib/route";
import { getApiKey, aiReady, ownKey } from "../lib/settings";
import { money } from "../lib/usage";
import Icon from "./Icon";

const IDEAS = ["Quick dinner", "Soup", "Something healthy", "Breakfast", "Use the oven"];

/** Pantry: Claude invents a new recipe from what's on hand, using up what's about to go off. */
export default function CookWithWhatIHave() {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apiKey = getApiKey();
  // A generated recipe is ~1,000 tokens in and ~5,000 out (thinking + recipe).
  const estimate = money(costOf(getModel(), 1000, 5000));

  async function create() {
    setBusy(true);
    setError("");
    try {
      const avoid = loadAvoid();
      const labels = isActive(avoid) ? [...avoid.groups.map((g) => ALLERGEN_GROUPS[g]?.label ?? g), ...avoid.custom] : [];
      const existing = await listRecipes();
      const { cookWithWhatIHave, originNote } = await import("../lib/pantryRecipe");
      const r = await cookWithWhatIHave(apiKey, {
        items: Object.values(loadPantry()),
        avoid: labels,
        people: getPeople(),
        request,
        existingTitles: existing.map((x) => x.title),
      });
      const id = newId();
      const origin = originNote(r.usesUp, r.notInPantry);
      await saveRecipe({
        ...r.recipe,
        notes: r.recipe.notes ? `${origin}\n\n${r.recipe.notes}` : origin,
        id,
        createdAt: Date.now(),
        photos: [],
        importCost: r.usage.cost,
      });
      navigate({ name: "recipe", id });
    } catch (e) {
      setError(e instanceof DOMException ? storageErrorMessage(e) : e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="cook-with">
      <h3 className="list-heading">Cook with what I have</h3>
      <p className="muted small">
        Claude creates a brand-new recipe from your pantry, using up what's about to go off first and skipping anything you avoid.
      </p>
      {!aiReady() ? (
        <p className="small">
          Needs your Anthropic API key. <a href={href({ name: "settings" })}>Add it in Settings</a>
        </p>
      ) : (
        <>
          <input
            className="text-input"
            placeholder="Anything in mind? (optional)"
            value={request}
            disabled={busy}
            onChange={(e) => setRequest(e.target.value)}
          />
          <div className="tag-picker">
            {IDEAS.map((idea) => (
              <button key={idea} className={request === idea ? "tag on" : "tag"} disabled={busy} onClick={() => setRequest(request === idea ? "" : idea)}>
                {idea}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button className="btn primary" onClick={create} disabled={busy}>
              <Icon name="bulb" size={20} /> {busy ? "Creating your recipe…" : "Create a recipe"}
            </button>
          </div>
          <p className="muted small">{busy ? "This takes about half a minute." : ownKey() ? `About ${estimate} per recipe. It's saved with your other recipes.` : "Uses a little of your monthly AI. It's saved with your other recipes."}</p>
          {error && <div className="callout error small">{error}</div>}
        </>
      )}
    </section>
  );
}
