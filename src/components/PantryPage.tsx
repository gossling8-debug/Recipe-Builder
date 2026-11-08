import { useEffect, useState } from "react";
import { listRecipes } from "../lib/db";
import { whatCanIMake, type CanMake } from "../lib/canMake";
import { addToShopping, loadShopping } from "../lib/shopping";
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
  const [ideas, setIdeas] = useState<CanMake[] | null>(null);
  const [listed, setListed] = useState(() => new Set(loadShopping().recipes.map((r) => r.id)));
  const loadIdeas = () => listRecipes().then((rs) => setIdeas(whatCanIMake(rs)), () => setIdeas([]));
  useEffect(() => {
    void loadIdeas();
  }, []);
  const refresh = () => {
    setItems(Object.values(loadPantry()).sort((a, b) => a.name.localeCompare(b.name)));
    void loadIdeas();
  };

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

        {items.length > 0 && ideas && (
          <section className="ideas">
            <h3 className="list-heading">What can I make?</h3>
            {ideas.length === 0 ? (
              <p className="muted small">None of your recipes are close yet — they each need 3 or more things you don't have.</p>
            ) : (
              <ul className="idea-list">
                {ideas.slice(0, 8).map((c) => {
                  const gaps = [...c.missing, ...c.short];
                  return (
                    <li key={c.recipe.id}>
                      <a className="idea-title" href={href({ name: "recipe", id: c.recipe.id })}>
                        {c.recipe.title}
                      </a>
                      <div className="small">
                        {gaps.length === 0 ? (
                          <span className="idea-ready">You have everything</span>
                        ) : (
                          <span>Need: {gaps.join(" · ")}</span>
                        )}
                        {c.check.length > 0 && <span className="muted"> · check you have enough {c.check.join(", ")}</span>}
                      </div>
                      {gaps.length > 0 &&
                        (listed.has(c.recipe.id) ? (
                          <span className="muted small">On your shopping list</span>
                        ) : (
                          <button
                            className="link-btn small"
                            onClick={() => {
                              addToShopping(c.recipe.id, 1);
                              setListed(new Set([...listed, c.recipe.id]));
                            }}
                          >
                            Add to shopping list
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted small">Salt, pepper and water are assumed. Uses each recipe at its normal size.</p>
          </section>
        )}

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
