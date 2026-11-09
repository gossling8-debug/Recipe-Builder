import { useState } from "react";
import Icon from "./Icon";
import { href } from "../lib/route";
import { loadPantry } from "../lib/pantry";
import { addStaple, removeStaple, stapleStatus, statusText, useStaples } from "../lib/staples";

/** The pantry's "Always keep" list: staples that go on the shopping list by themselves when low. */
export default function StaplesSection() {
  const staples = useStaples();
  const [name, setName] = useState("");
  const pantry = loadPantry();
  const add = () => {
    addStaple(name);
    setName("");
  };
  return (
    <section className="staples">
      <h3 className="list-heading">Always keep</h3>
      <p className="muted small">
        When one of these is out, past its date, or down to about a quarter of what you last bought, it goes on your{" "}
        <a href={href({ name: "shopping" })}>shopping list</a> by itself.
      </p>
      {staples.length > 0 && (
        <ul className="staple-list">
          {staples.map((s) => {
            const st = stapleStatus(pantry[s.key]);
            return (
              <li key={s.key}>
                <span>
                  <strong>{s.name}</strong>{" "}
                  <span className={st === "ok" || st === "unknown" ? "muted small" : "small staple-need"}>
                    {statusText[st]}
                    {st === "out" || st === "low" || st === "past" ? " · on your shopping list" : ""}
                  </span>
                </span>
                <button className="icon-btn small-btn" aria-label={`Stop always keeping ${s.name}`} onClick={() => removeStaple(s.key)}>
                  <Icon name="close" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="pantry-add">
        <input
          className="text-input"
          placeholder="e.g. milk, eggs, butter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Add an always-keep staple"
        />
        <button className="btn" onClick={add} disabled={!name.trim()}>
          <Icon name="plus" size={18} /> Add
        </button>
      </div>
    </section>
  );
}
