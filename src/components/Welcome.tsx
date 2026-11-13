import { useState } from "react";
import { getPeople, setPeople } from "../lib/autoPlan";
import { ALLERGEN_GROUPS, loadAvoid, saveAvoid } from "../lib/avoid";
import { FEATURES, setSwitchedOn, switchedOn, type Feature } from "../lib/features";
import { href } from "../lib/route";
import { aiReady } from "../lib/settings";
import { finishWelcome } from "../lib/welcome";
import Icon from "./Icon";

/** What each "help with" choice turns on or off (Cooking basics are always on). */
const HELP: { group: Feature["group"]; label: string; what: string }[] = [
  { group: "Planning", label: "Planning meals", what: "Week planner, Tonight, meal times, thaw reminders" },
  { group: "Shopping & pantry", label: "Shopping & pantry", what: "What's on hand, budget, receipts, Walmart & H-E-B" },
  { group: "Health", label: "Health", what: "Calories, healthier swaps, allergies" },
  { group: "Extras", label: "Cookbooks", what: "Shared cookbooks with family and friends (needs cloud backup)" },
];
const groupOn = (g: Feature["group"]) => FEATURES.filter((f) => f.group === g).some((f) => switchedOn(f.id));
const setGroup = (g: Feature["group"], on: boolean) => FEATURES.filter((f) => f.group === g).forEach((f) => setSwitchedOn(f.id, on));

/** First open with an empty recipe box: four quick questions, each skippable. */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [people, setPeopleState] = useState(getPeople);
  const [help, setHelp] = useState(() => Object.fromEntries(HELP.map((h) => [h.group, groupOn(h.group)])) as Record<string, boolean>);
  const [avoid, setAvoid] = useState(loadAvoid);
  const done = () => {
    finishWelcome();
    onDone();
  };
  // The avoid question only matters if Health is on.
  const steps = ["people", "help", ...(help.Health ? ["avoid"] : []), "start"];
  const current = steps[Math.min(step, steps.length - 1)];
  const next = () => setStep((s) => s + 1);

  return (
    <main className="page welcome">
      <p className="muted small welcome-progress">
        Step {Math.min(step, steps.length - 1) + 1} of {steps.length}
      </p>

      {current === "people" && (
        <>
          <h1 className="page-title">Welcome to Cardamix</h1>
          <p>Snap a photo of any recipe card, cookbook page or screenshot, and it becomes a clean recipe you can cook from, scale and shop for.</p>
          <h3>How many people do you usually cook for?</h3>
          <div className="people-row">
            <button className="icon-btn small-btn" aria-label="Fewer people" disabled={people <= 1} onClick={() => setPeopleState(people - 1)}>
              −
            </button>
            <strong aria-live="polite">{people}</strong>
            <button className="icon-btn small-btn" aria-label="More people" disabled={people >= 20} onClick={() => setPeopleState(people + 1)}>
              +
            </button>
            <span>{people === 1 ? "person" : "people"}</span>
          </div>
          <p className="muted small">Used when planning the week. You can change it any time.</p>
          <div className="button-row">
            <button className="btn primary" onClick={() => (setPeople(people), next())}>
              Next
            </button>
          </div>
        </>
      )}

      {current === "help" && (
        <>
          <h1 className="page-title">What do you want help with?</h1>
          <p className="muted small">Recipes, cooking mode and tips are always included. Turn off anything you won't use to keep the app simple.</p>
          <ul className="feature-list">
            {HELP.map((h) => (
              <li key={h.group}>
                <label className="toggle-row">
                  <span>
                    <span className="feature-name">{h.label}</span>
                    <span className="muted small feature-what">{h.what}</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={h.label}
                    checked={help[h.group]}
                    onChange={(e) => setHelp({ ...help, [h.group]: e.target.checked })}
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="muted small">Fine-tune each feature later in Settings → Features.</p>
          <div className="button-row">
            <button className="btn primary" onClick={() => (HELP.forEach((h) => setGroup(h.group, help[h.group])), next())}>
              Next
            </button>
            <button className="btn" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          </div>
        </>
      )}

      {current === "avoid" && (
        <>
          <h1 className="page-title">Any foods to avoid?</h1>
          <p className="muted small">Recipes that use these get flagged, with substitutes. Skip if none.</p>
          <div className="tag-picker">
            {Object.entries(ALLERGEN_GROUPS).map(([k, g]) => {
              const on = avoid.groups.includes(k);
              return (
                <button
                  key={k}
                  className={on ? "tag on" : "tag"}
                  aria-pressed={on}
                  onClick={() => setAvoid({ ...avoid, groups: on ? avoid.groups.filter((x) => x !== k) : [...avoid.groups, k] })}
                >
                  {on && <Icon name="check" size={14} />} {g.label}
                </button>
              );
            })}
          </div>
          <div className="button-row">
            <button className="btn primary" onClick={() => (saveAvoid(avoid), next())}>
              {avoid.groups.length ? "Next" : "None — next"}
            </button>
            <button className="btn" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          </div>
        </>
      )}

      {current === "start" && (
        <>
          <h1 className="page-title">Add your first recipe</h1>
          {aiReady() ? (
            <p>Take a photo of a recipe card, or pick a screenshot or video from your photos.</p>
          ) : (
            <p>
              Reading recipe photos uses Claude, an AI from Anthropic. Add your Anthropic API key in Settings first, then come
              back and tap <strong>Add Recipe</strong>.
            </p>
          )}
          <div className="button-row">
            {aiReady() ? (
              <a className="btn primary" href={href({ name: "scan" })} onClick={() => finishWelcome()}>
                <Icon name="plus" size={20} /> Add a recipe
              </a>
            ) : (
              <a className="btn primary" href={href({ name: "settings" })} onClick={() => finishWelcome()}>
                Add my API key
              </a>
            )}
            <button className="btn" onClick={done}>
              Look around first
            </button>
          </div>
        </>
      )}

      {current !== "start" && (
        <button className="link-btn small welcome-skip" onClick={done}>
          Skip setup
        </button>
      )}
    </main>
  );
}
