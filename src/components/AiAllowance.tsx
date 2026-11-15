import { useEffect, useState } from "react";
import { hasPlus } from "../lib/features";
import { costOf, getModel } from "../lib/models";
import { href } from "../lib/route";
import { ownKey } from "../lib/settings";
import { allowanceFor, FREE_LIMITS, freeLeft, loadAiUsage, type AiUsage } from "../lib/subscription";
import VerifyEmail from "./VerifyEmail";

/** Settings: this month's AI — counts on the free plan, a meter with Plus. */
export default function AiAllowance() {
  const [usage, setUsage] = useState<AiUsage | null | undefined>(undefined);
  useEffect(() => {
    loadAiUsage().then(setUsage, () => setUsage(null));
  }, []);
  if (ownKey()) return null; // billed to their own key instead

  if (!hasPlus()) {
    const scans = freeLeft("scan", usage ?? null);
    const creates = freeLeft("create", usage ?? null);
    return (
      <section>
        <h3>Free AI this month</h3>
        <VerifyEmail compact />
        {usage === undefined ? (
          <p className="small">Checking…</p>
        ) : (
          <ul className="free-counts small">
            <li>
              <strong>{scans}</strong> of {FREE_LIMITS.scan} recipe adds left <span className="muted">(photo, website or text)</span>
            </li>
            <li>
              <strong>{creates}</strong> of {FREE_LIMITS.create} created recipes left
            </li>
          </ul>
        )}
        <p className="muted small">
          Resets on the 1st. <a href={href({ name: "plus" })}>Plus</a> adds about 50 recipe adds and 20+ created recipes a month, plus
          nutrition, receipts and more.
        </p>
      </section>
    );
  }

  const limit = usage?.limit ?? allowanceFor();
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
      <p className="muted small">Resets on the 1st. Shared by scans, created recipes, nutrition, receipts and the other AI features.</p>
    </section>
  );
}
