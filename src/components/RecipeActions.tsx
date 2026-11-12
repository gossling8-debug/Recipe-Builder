import { useEffect, useRef, useState } from "react";
import { feature } from "../lib/features";
import { recipeLink } from "../lib/link";
import { loadProgress } from "../lib/progress";
import { href } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import { recipeToText, shareText } from "../lib/share";
import { addToShopping, loadShopping, removeFromShopping } from "../lib/shopping";
import { applySwaps } from "../lib/swaps";
import Icon from "./Icon";

/** Press-and-hold menu for a recipe in the list. */
export default function RecipeActions(props: {
  recipe: SavedRecipe;
  onClose: () => void;
  onFavorite: (r: SavedRecipe) => void;
  onDelete: (r: SavedRecipe) => void;
  onMessage: (m: string) => void;
}) {
  const { recipe: r, onClose } = props;
  const [link, setLink] = useState<string | null>(null);
  const onList = loadShopping().recipes.some((x) => x.id === r.id);

  // Make the share link now, so Share can open the share sheet right away (phones require that).
  useEffect(() => {
    recipeLink(applySwaps(r)).then(setLink, () => setLink(""));
  }, [r]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const act = (fn: () => void | Promise<void>) => async () => {
    onClose();
    await fn();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Options for ${r.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">{r.title}</div>
        <button className="sheet-item" onClick={act(() => props.onFavorite(r))}>
          <Icon name="star" size={20} filled={!!r.favorite} /> {r.favorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        <button
          className="sheet-item"
          onClick={act(() => {
            if (onList) {
              removeFromShopping(r.id);
              props.onMessage("Removed from your shopping list");
            } else {
              const p = loadProgress(r.id);
              addToShopping(r.id, p.scale, p.have.filter((i) => i < r.ingredients.length));
              props.onMessage("Added to your shopping list");
            }
          })}
        >
          <Icon name="bag" size={20} /> {onList ? "Remove from shopping list" : "Add to shopping list"}
        </button>
        <button
          className="sheet-item"
          disabled={link === null}
          onClick={act(async () => {
            const result = link
              ? await shareText(r.title, `${r.title}\nOpen the recipe in Cardamix:`, link)
              : await shareText(r.title, recipeToText(applySwaps(r), loadProgress(r.id).scale));
            if (result === "copied") props.onMessage("Link copied — paste it in a message");
            if (result === "failed") props.onMessage("Sharing isn't available in this browser");
          })}
        >
          <Icon name="share" size={20} /> Share
        </button>
        {feature("print") && (
          <a className="sheet-item" href={href({ name: "print", id: r.id })} onClick={onClose}>
            <Icon name="download" size={20} /> Print or save as PDF
          </a>
        )}
        <button className="sheet-item danger" onClick={act(() => props.onDelete(r))}>
          <Icon name="trash" size={20} /> Delete
        </button>
        <button className="sheet-item sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Press and hold (or right-click) to open a menu; a normal tap still works as a tap. */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;
  const clear = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        latest.current();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s0 = start.current;
      if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 10) clear(); // scrolling, not holding
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClick: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault(); // the hold opened the menu; don't also open the recipe
        fired.current = false;
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      fired.current = false;
      latest.current();
    },
  };
}

/** A link that opens a menu when pressed and held. */
export function HoldLink(props: { href: string; className?: string; onHold: () => void; children: React.ReactNode }) {
  const hold = useLongPress(props.onHold);
  return (
    <a href={props.href} className={props.className} {...hold}>
      {props.children}
    </a>
  );
}
