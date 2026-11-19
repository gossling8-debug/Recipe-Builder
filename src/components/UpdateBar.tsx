import { useEffect, useState } from "react";
import { onUpdateReady } from "../lib/appUpdate";

/** "Cardamix has been updated — Refresh", when the app couldn't refresh itself (something was being edited). */
export default function UpdateBar() {
  const [ready, setReady] = useState(false);
  useEffect(() => onUpdateReady(() => setReady(true)), []);
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <span>Cardamix has been updated.</span>
      <button className="btn primary" onClick={() => location.reload()}>
        Refresh
      </button>
      <button className="link-btn small" style={{ color: "inherit" }} onClick={() => setReady(false)} aria-label="Later">
        Later
      </button>
    </div>
  );
}
