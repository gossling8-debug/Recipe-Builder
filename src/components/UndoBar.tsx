import { useEffect, useState } from "react";
import { lastDeleted, undoDelete } from "../lib/undoDelete";

/** "Deleted “Chili” · Undo" — shown on whatever screen you land on after deleting. */
export default function UndoBar() {
  const [d, setD] = useState(lastDeleted);
  useEffect(() => {
    const on = () => setD(lastDeleted());
    window.addEventListener("undo-delete-changed", on);
    return () => window.removeEventListener("undo-delete-changed", on);
  }, []);
  if (!d) return null;
  return (
    <div className="toast undo-toast" role="status">
      <span className="undo-text">Deleted “{d.recipe.title}”</span>
      <button className="link-btn" onClick={() => void undoDelete()}>
        Undo
      </button>
    </div>
  );
}
