import { useState } from "react";
import Icon from "./Icon";
import { loadProgress, saveProgress } from "../lib/progress";

/**
 * "Cook once, eat twice": doubles the recipe now; when it's marked as made,
 * half goes on the freezer list (best within about 3 months).
 */
export default function FreezeHalf({ recipeId, onChange }: { recipeId: string; onChange: () => void }) {
  const [p, setP] = useState(() => loadProgress(recipeId));
  const set = (next: typeof p) => {
    saveProgress(recipeId, next);
    setP(next);
    onChange();
  };

  if (p.freezeHalf) {
    return (
      <div className="callout small freeze-half">
        <strong>Doubled to freeze half.</strong> Cook it at this size; when you mark it as made, half goes on your freezer list and the
        recipe goes back to ×{p.scale / 2 === 0.5 ? "½" : p.scale / 2}.{" "}
        <button className="link-btn small" onClick={() => set({ ...p, freezeHalf: false, scale: p.scale / 2 })}>
          Cancel
        </button>
      </div>
    );
  }
  // Only offered when doubling stays within the size choices (up to 3×).
  if (p.scale > 1.5) return null;
  return (
    <button className="btn plan-open" onClick={() => set({ ...p, freezeHalf: true, scale: p.scale * 2 })}>
      <Icon name="jar" size={18} /> Double it &amp; freeze half
    </button>
  );
}
