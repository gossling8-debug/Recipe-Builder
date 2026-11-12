import { useEffect, useState } from "react";
import { hasPlus } from "../lib/features";
import { costOf, getModel } from "../lib/models";
import { href } from "../lib/route";
import { ownKey } from "../lib/settings";
import { ALLOWANCE, loadAiUsage, type AiUsage } from "../lib/subscription";

/** Settings: how much of this month's AI is used. */
export default function AiAllowance() {
  const [usage, setUsage] = useState<AiUsage | null | undefined>(undefined);
  useEffect(() => {
    loadAiUsage().then(setUsage, () => setUsage(null));
  }, []);
  if (ownKey()) return null; // billed to their own key instead

  const plus = hasPlus();
  const limit = usage?.limit ?? ALLOWANCE[plus ? "plus" : "free"];
  const spent = usage?.spent ?? 0;
  const pct = Math.min(100, Math.round((spent / limit) * 100));
  // Typical card scan: ~3,500 tokens in, ~4,000 out.
  const scansLeft = Math.max(0, Math.floor((limit - spent) / costOf(getModel(), 3500, 4000)));

  return (
    <section>
      <h3>AI this month</h3>
      <div className="ai-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="AI used this month">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="small">
        {usage === undefined ? "Checking…" : `${pct}% used · about ${scansLeft} recipe card ${scansLeft === 1 ? "scan" : "scans"} left (${getModel().label})`}
      </p>
      <p className="muted small">
        Resets on the 1st. {plus ? "Plus includes about 10× the free amount." : <>Free includes a small amount to try it. <a href={href({ name: "plus" })}>Plus</a> has about 10× more.</>}
      </p>
    </section>
  );
}
