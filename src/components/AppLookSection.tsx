import { useEffect, useState } from "react";
import LogoLoader, { animatedLogoOn } from "./LogoLoader";
import { loadAppConfig, setAnimatedLogoForEveryone } from "../lib/appConfig";

/** Owner dashboard: the loading logo for everyone — animated, or the plain spinner. */
export default function AppLookSection() {
  const [on, setOn] = useState(animatedLogoOn);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    loadAppConfig().then((c) => setOn(c.animatedLogo), () => {});
  }, []);
  return (
    <section>
      <h2 className="h3">Loading logo</h2>
      <label className="pick-row animated-logo-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            setMsg("");
            try {
              await setAnimatedLogoForEveryone(next);
              setOn(next);
              setMsg(next ? "The animated logo is on for everyone." : "Everyone now sees the plain spinner.");
            } catch (err) {
              setMsg(err instanceof Error ? err.message : String(err));
            }
            setBusy(false);
          }}
        />
        <span>Animated logo while loading — for everyone</span>
        <span className="logo-preview">
          <LogoLoader size={28} key={String(on)} />
        </span>
      </label>
      <p className="muted small">Off shows a plain spinner instead. People see the change the next time they open Cardamix.</p>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
