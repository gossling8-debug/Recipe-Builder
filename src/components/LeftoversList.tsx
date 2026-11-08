import Icon from "./Icon";
import WarnIcon from "./WarnIcon";
import { href } from "../lib/route";
import { eatByLabel, freezeLeftover, leftoverPast, removeLeftover, useLeftovers } from "../lib/leftovers";

/** The pantry's Leftovers section: eat by when, move to the freezer, mark finished. */
export default function LeftoversList() {
  const list = useLeftovers();
  if (!list.length) return null;
  return (
    <section className="use-soon leftovers">
      <h3 className="list-heading">Leftovers</h3>
      <ul>
        {list.map((l) => (
          <li key={l.id} className={leftoverPast(l) ? "fresh-past" : l.frozen ? "" : "fresh-soon"}>
            <div>
              {leftoverPast(l) && <WarnIcon />}
              <a href={href({ name: "recipe", id: l.id })}>
                <strong>{l.title}</strong>
              </a>{" "}
              <span className="use-by-text">{eatByLabel(l)}</span>
            </div>
            <div className="leftover-actions">
              {!l.frozen && !leftoverPast(l) && (
                <button className="link-btn small" onClick={() => freezeLeftover(l.id)}>
                  Moved to freezer
                </button>
              )}
              <button className="link-btn small" onClick={() => removeLeftover(l.id)}>
                <Icon name="check" size={14} /> {leftoverPast(l) ? "Thrown out" : "All gone"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">Cooked leftovers keep 3–4 days in the fridge; frozen, they're best within about 3 months.</p>
    </section>
  );
}
