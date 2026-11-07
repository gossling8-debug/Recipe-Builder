import { useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { href } from "../lib/route";
import { boughtWhen, loadPantry, setItem, type PantryItem } from "../lib/pantry";
import { formatQty, parseQty } from "../lib/qty";
import { nameKey } from "../lib/shopping";

/** What should be on hand: added when shopping, used up by cooking. Fix anything that's off. */
export default function PantryPage() {
  const [items, setItems] = useState(() => Object.values(loadPantry()).sort((a, b) => a.name.localeCompare(b.name)));
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const refresh = () => setItems(Object.values(loadPantry()).sort((a, b) => a.name.localeCompare(b.name)));

  function save(item: PantryItem, text: string) {
    setItem(item.key, { ...item, qty: text.trim() ? parseQty(text, item.name) : null, updatedAt: Date.now() });
    setEditing(null);
    refresh();
  }

  function addItem() {
    if (!name.trim()) return;
    const key = nameKey(name);
    setItem(key, { key, name: name.trim(), qty: amount.trim() ? parseQty(amount, name) : null, updatedAt: Date.now() });
    setName("");
    setAmount("");
    refresh();
  }

  return (
    <>
      <Header
        title="Pantry"
        back={href({ name: "library" })}
        returnToPrevious
        actions={
          <a className="icon-btn" href={href({ name: "shopping" })} aria-label="Shopping list">
            <Icon name="bag" />
          </a>
        }
      />
      <main className="page">
        <p className="muted small">
          What you should have on hand. Ticking items on your shopping list adds them; making a recipe uses them up. Amounts
          are estimates — tap one to correct it.
        </p>

        {items.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Your pantry is empty.</p>
            <p className="muted">Tick items on your shopping list as you buy them, or add what you already have below.</p>
          </div>
        ) : (
          <ul className="pantry-list">
            {items.map((it) => (
              <li key={it.key}>
                <div className="pantry-main">
                  <div className="pantry-name">{it.name}</div>
                  {editing?.key === it.key ? (
                    <form
                      className="pantry-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(it, editing.text);
                      }}
                    >
                      <input
                        className="text-input"
                        autoFocus
                        aria-label={`How much ${it.name} do you have?`}
                        placeholder="e.g. 2 cups, 1 lb, 3"
                        value={editing.text}
                        onChange={(e) => setEditing({ key: it.key, text: e.target.value })}
                      />
                      <button className="btn" type="submit">
                        Save
                      </button>
                    </form>
                  ) : (
                    <button className="link-btn pantry-amount" onClick={() => setEditing({ key: it.key, text: it.qty ? formatQty(it.qty) : "" })}>
                      {it.qty ? `≈ ${formatQty(it.qty)}` : "Some (amount unknown)"}
                    </button>
                  )}
                  {boughtWhen(it) && <div className="muted small">Bought {boughtWhen(it)}</div>}
                </div>
                <button
                  className="btn pantry-used"
                  onClick={() => {
                    setItem(it.key, null);
                    refresh();
                  }}
                >
                  Used up
                </button>
              </li>
            ))}
          </ul>
        )}

        <section>
          <h3 className="list-heading">Add something you have</h3>
          <div className="pantry-add">
            <input className="text-input" placeholder="Ingredient, e.g. sugar" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="text-input" placeholder="Amount, e.g. 4 lb" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="btn" onClick={addItem} disabled={!name.trim()}>
              <Icon name="plus" size={18} /> Add
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
