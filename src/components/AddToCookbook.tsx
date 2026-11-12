import { useEffect, useState } from "react";
import { listRecipes } from "../lib/db";
import { duplicatesOf } from "../lib/duplicates";
import { shareToCookbook, type Cookbook, type SharedRecipe } from "../lib/family";
import type { SavedRecipe } from "../lib/schema";
import { searchRecipe } from "../lib/search";
import { applySwaps } from "../lib/swaps";
import Icon from "./Icon";

/** Pick several of your recipes and share them into a cookbook at once. */
export default function AddToCookbook(props: { book: Cookbook; inBook: SharedRecipe[]; myUid: string; onClose: (added: number) => void }) {
  const { book, inBook, myUid } = props;
  const [mine, setMine] = useState<SavedRecipe[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    listRecipes().then((rs) => setMine(rs.sort((a, b) => a.title.localeCompare(b.title))), () => setMine([]));
  }, []);

  const sharedByMe = new Set(inBook.filter((r) => r.sharedBy === myUid).map((r) => r.sourceId));
  const others = inBook.filter((r) => r.sharedBy !== myUid).map((r) => ({ ...r.recipe, id: r.id, sharedByName: r.sharedByName }));
  const shown = (mine ?? []).filter((r) => !query.trim() || searchRecipe(r, query, "all").match);

  async function share() {
    setBusy(true);
    setError("");
    let n = 0;
    try {
      for (const r of (mine ?? []).filter((x) => picked.has(x.id))) {
        await shareToCookbook(book, r, applySwaps(r));
        n++;
      }
      props.onClose(n);
    } catch (e) {
      setError(`${n ? `Shared ${n}, then: ` : ""}${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={() => !busy && props.onClose(0)}>
      <div className="sheet add-to-book" role="dialog" aria-modal="true" aria-label={`Add recipes to ${book.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Add recipes to {book.name}</div>
        <input className="search" type="search" placeholder="Search your recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="pick-list">
          {mine === null && <li className="muted small">Loading…</li>}
          {mine?.length === 0 && <li className="muted small">You don't have any recipes yet.</li>}
          {shown.map((r) => {
            const already = sharedByMe.has(r.id);
            const twin = !already ? duplicatesOf(r, others)[0]?.recipe : undefined;
            return (
              <li key={r.id}>
                <label className={already ? "pick-row done" : "pick-row"}>
                  <input
                    type="checkbox"
                    disabled={already || busy}
                    checked={already || picked.has(r.id)}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    <span className="pick-title">{r.title}</span>
                    {already && <span className="muted small"> · already in this cookbook</span>}
                    {twin && <span className="small dup-flag"> · {twin.sharedByName} shared “{twin.title}”</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {error && <div className="callout error small">{error}</div>}
        <div className="button-row add-to-book-actions">
          <button className="btn primary" disabled={busy || picked.size === 0} onClick={share}>
            <Icon name="book" size={18} /> {busy ? "Sharing…" : picked.size ? `Share ${picked.size} ${picked.size === 1 ? "recipe" : "recipes"}` : "Choose recipes"}
          </button>
          <button className="btn" disabled={busy} onClick={() => props.onClose(0)}>
            Cancel
          </button>
        </div>
        <p className="muted small">Shares each recipe as you cook it (with your swaps). Photos and your notes stay private.</p>
      </div>
    </div>
  );
}
