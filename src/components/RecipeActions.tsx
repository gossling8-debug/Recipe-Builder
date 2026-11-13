import { useEffect, useRef, useState } from "react";
import { feature } from "../lib/features";
import { recipeLink } from "../lib/link";
import { loadProgress } from "../lib/progress";
import { href } from "../lib/route";
import type { SavedRecipe, ScannedRecipe } from "../lib/schema";
import { newId, saveRecipe } from "../lib/db";
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

/**
 * Press-and-hold menu for a recipe in a family cookbook. The same options as
 * your own recipes; favorites, the shopping list and printing work on your own
 * copy, so without one the menu offers to save it first.
 */
export function BookRecipeActions(props: {
  title: string;
  recipe: ScannedRecipe;
  /** Your own copy of this recipe, if you have one. */
  myCopy: SavedRecipe | null;
  canRemove: boolean;
  /** Edit the cookbook's copy (shown when canRemove: the sharer or the owner). */
  onEdit?: () => void;
  onClose: () => void;
  onSaved: (r: SavedRecipe) => void;
  onRemove: () => Promise<void>;
  onMessage: (m: string) => void;
}) {
  const { recipe, myCopy, onClose } = props;
  const [link, setLink] = useState<string | null>(null);
  const onList = !!myCopy && loadShopping().recipes.some((x) => x.id === myCopy.id);
  useEffect(() => {
    recipeLink(recipe).then(setLink, () => setLink(""));
  }, [recipe]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const act = (fn: () => void | Promise<void>) => async () => {
    onClose();
    try {
      await fn();
    } catch (e) {
      props.onMessage(e instanceof Error ? e.message : String(e));
    }
  };
  async function saveCopy(extra: Partial<SavedRecipe> = {}): Promise<SavedRecipe> {
    const saved: SavedRecipe = { ...recipe, id: newId(), createdAt: Date.now(), photos: [], ...extra };
    await saveRecipe(saved);
    props.onSaved(saved);
    return saved;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Options for ${props.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">{props.title}</div>
        {myCopy ? (
          <button
            className="sheet-item"
            onClick={act(async () => {
              const updated = { ...myCopy, favorite: !myCopy.favorite };
              await saveRecipe(updated);
              props.onSaved(updated);
              props.onMessage(updated.favorite ? "Added your copy to Favorites" : "Removed from Favorites");
            })}
          >
            <Icon name="star" size={20} filled={!!myCopy.favorite} /> {myCopy.favorite ? "Remove from Favorites" : "Add to Favorites"}
          </button>
        ) : (
          <>
            <button
              className="sheet-item"
              onClick={act(async () => {
                await saveCopy();
                props.onMessage("Saved to your recipes");
              })}
            >
              <Icon name="plus" size={20} /> Save to my recipes
            </button>
            <button
              className="sheet-item"
              onClick={act(async () => {
                await saveCopy({ favorite: true });
                props.onMessage("Saved to your recipes and Favorites");
              })}
            >
              <Icon name="star" size={20} /> Save to Favorites
            </button>
          </>
        )}
        <button
          className="sheet-item"
          onClick={act(async () => {
            if (myCopy && onList) {
              removeFromShopping(myCopy.id);
              props.onMessage("Removed from your shopping list");
            } else if (myCopy) {
              const p = loadProgress(myCopy.id);
              addToShopping(myCopy.id, p.scale, p.have.filter((i) => i < myCopy.ingredients.length));
              props.onMessage("Added to your shopping list");
            } else {
              const saved = await saveCopy();
              addToShopping(saved.id, 1, []);
              props.onMessage("Saved to your recipes and added to your shopping list");
            }
          })}
        >
          <Icon name="bag" size={20} />{" "}
          {onList ? "Remove from shopping list" : myCopy ? "Add to shopping list" : "Save & add to shopping list"}
        </button>
        <button
          className="sheet-item"
          disabled={link === null}
          onClick={act(async () => {
            const result = link
              ? await shareText(props.title, `${props.title}\nOpen the recipe in Cardamix:`, link)
              : await shareText(props.title, recipeToText(recipe, 1));
            if (result === "copied") props.onMessage("Link copied — paste it in a message");
            if (result === "failed") props.onMessage("Sharing isn't available in this browser");
          })}
        >
          <Icon name="share" size={20} /> Share
        </button>
        {feature("print") && myCopy && (
          <a className="sheet-item" href={href({ name: "print", id: myCopy.id })} onClick={onClose}>
            <Icon name="download" size={20} /> Print or save as PDF
          </a>
        )}
        {props.canRemove && props.onEdit && (
          <button className="sheet-item" onClick={act(props.onEdit)}>
            <Icon name="edit" size={20} /> Edit
          </button>
        )}
        {props.canRemove && (
          <button className="sheet-item danger" onClick={act(props.onRemove)}>
            <Icon name="trash" size={20} /> Remove from cookbook
          </button>
        )}
        <button className="sheet-item sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
