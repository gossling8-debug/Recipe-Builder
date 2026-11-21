import { useEffect, useState } from "react";
import Icon from "./Icon";
import { getEaters, setEaters } from "../lib/tastes";

/** Settings (Family plan): the people you cook for, for "who likes what". */
export default function EatersSection() {
  const [names, setNames] = useState(getEaters);
  const [name, setName] = useState("");
  useEffect(() => {
    const on = () => setNames(getEaters());
    window.addEventListener("eaters-changed", on);
    window.addEventListener("state-synced", on);
    return () => {
      window.removeEventListener("eaters-changed", on);
      window.removeEventListener("state-synced", on);
    };
  }, []);
  const add = () => {
    if (!name.trim()) return;
    setNames(setEaters([...names, name]));
    setName("");
  };
  return (
    <section>
      <h2 className="h3">Who you cook for</h2>
      <p className="muted small">
        Add the people at your table. On each recipe, mark who loves it and who won't eat it: Fill my week, Tonight and the budget
        planner then skip what someone won't eat.
      </p>
      {names.length > 0 && (
        <ul className="eaters">
          {names.map((n) => (
            <li key={n}>
              {n}
              <button className="icon-btn small-btn" aria-label={`Remove ${n}`} onClick={() => setNames(setEaters(names.filter((x) => x !== n)))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="eaters-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="text-input" placeholder="A name, e.g. Sam or Grandpa" aria-label="Name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}
