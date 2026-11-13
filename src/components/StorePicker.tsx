import { useState } from "react";
import Icon from "./Icon";
import { MAX_FAVORITES, STORE_LIST, favoriteStores, setFavoriteStores, storeInfo } from "../lib/stores";

/** The store menu: pinned favorites first, then every store; the star pins or unpins the chosen one. */
export default function StorePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [favs, setFavs] = useState(favoriteStores);
  const [note, setNote] = useState("");
  const pinned = favs.includes(value);
  const others = STORE_LIST.filter((s) => !favs.includes(s.id));

  function togglePin() {
    setNote("");
    if (pinned) {
      const next = favs.filter((id) => id !== value);
      setFavs(next);
      setFavoriteStores(next);
    } else if (favs.length >= MAX_FAVORITES) {
      setNote(`You can pin ${MAX_FAVORITES}. Pick a pinned store and tap its star to unpin it first.`);
    } else {
      const next = [...favs, value];
      setFavs(next);
      setFavoriteStores(next);
    }
  }

  return (
    <div className="store-picker">
      <label className="store-select">
        <span className="muted small">Shop at</span>
        <select value={value} onChange={(e) => (setNote(""), onChange(e.target.value))} aria-label="Store">
          {favs.length > 0 && (
            <optgroup label="★ Favorites">
              {favs.map((id) => (
                <option key={id} value={id}>
                  {storeInfo(id).label}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={favs.length ? "All stores" : "Stores"}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <button
        className={pinned ? "icon-btn starred" : "icon-btn"}
        onClick={togglePin}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${storeInfo(value).label}` : `Pin ${storeInfo(value).label} to your favorites`}
        title={pinned ? "Pinned — tap to unpin" : "Pin to favorites"}
      >
        <Icon name="star" filled={pinned} />
      </button>
      {note && <p className="muted small store-note">{note}</p>}
    </div>
  );
}
