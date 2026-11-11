import { useEffect, useState } from "react";
import { FEATURES, hasPlus, locked, setSwitchedOn, switchedOn, type Feature } from "../lib/features";
import { href } from "../lib/route";

const GROUPS: Feature["group"][] = ["Cooking", "Planning", "Shopping & pantry", "Health", "Extras"];

/** Settings: switch features on/off, and see which come with Plus. */
export default function FeaturesSection() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const on = () => refresh((n) => n + 1);
    window.addEventListener("features-changed", on);
    return () => window.removeEventListener("features-changed", on);
  }, []);
  const plus = hasPlus();

  return (
    <section className="features">
      <h3>Features</h3>
      <p className="muted small">
        Turn off anything you don't use to keep the app simple. Turning a feature off only hides it — nothing is deleted, and turning it
        back on brings everything back.
      </p>

      <div className={plus ? "callout small plan-card-plus" : "callout small"}>
        <strong>{plus ? "Cardamix Plus" : "Free plan"}</strong>
        {plus ? <> — every feature is included. </> : <> — features marked Plus are locked. </>}
        <a href={href({ name: "plus" })}>{plus ? "Your subscription" : "See Plus"}</a>
      </div>

      {GROUPS.map((g) => (
        <div key={g} className="feature-group">
          <h4>{g}</h4>
          <ul className="feature-list">
            {FEATURES.filter((f) => f.group === g).map((f) => {
              const isLocked = locked(f.id);
              return (
                <li key={f.id} className={isLocked ? "locked" : ""}>
                  <label className="toggle-row">
                    <span>
                      <span className="feature-name">
                        {f.name}
                        {f.plan === "plus" && <span className="plus-badge">Plus</span>}
                      </span>
                      <span className="muted small feature-what">{isLocked ? <>Comes with <a href={href({ name: "plus" })}>Plus</a>.</> : f.what}</span>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={f.name}
                      disabled={isLocked}
                      checked={!isLocked && switchedOn(f.id)}
                      onChange={(e) => setSwitchedOn(f.id, e.target.checked)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
