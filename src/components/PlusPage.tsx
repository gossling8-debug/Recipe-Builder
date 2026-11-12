import { useEffect, useState } from "react";
import { FEATURES } from "../lib/features";
import { href } from "../lib/route";
import { manageSubscription, myPlan, refreshMyPlan, upgrade, type MyPlan } from "../lib/subscription";
import Header from "./Header";
import Icon from "./Icon";

const dateText = (ms?: number | null) => (ms ? new Date(ms).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "");

/** Cardamix Plus: what it includes, upgrading, and managing the subscription. */
export default function PlusPage({ done }: { done?: boolean }) {
  const [plan, setPlan] = useState<MyPlan>(myPlan);
  const [interval, setInterval] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  // Ask the server — right after paying, Stripe may need a moment to confirm.
  useEffect(() => {
    let tries = done ? 6 : 1;
    let stop = false;
    const check = async () => {
      try {
        const p = await refreshMyPlan();
        if (stop) return;
        setPlan(p);
        if (p.plan !== "plus" && --tries > 0) return void setTimeout(check, 2500);
      } catch {
        /* keep what we have */
      }
      if (!stop) setChecking(false);
    };
    void check();
    return () => {
      stop = true;
    };
  }, [done]);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError("");
    try {
      await fn(); // moves to Stripe on success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const plusFeatures = FEATURES.filter((f) => f.plan === "plus");
  const isPlus = plan.plan === "plus";
  const beta = plan.source === "beta"; // testing period: Plus is free, subscribing is optional

  return (
    <>
      <Header title="Cardamix Plus" back={href({ name: "settings" })} />
      <main className="page plus-page">
        {done && isPlus && (
          <div className="callout plan-card-plus">
            <strong>Welcome to Plus!</strong> Every feature is unlocked. Thank you for supporting Cardamix.
          </div>
        )}
        {done && !isPlus && checking && <p className="muted">Confirming your payment…</p>}
        {done && !isPlus && !checking && (
          <div className="callout small">Your payment is still being confirmed. This page will show Plus as soon as it is — try again in a minute.</div>
        )}

        {isPlus ? (
          <section>
            <h1 className="page-title">You have Plus</h1>
            {plan.source === "beta" ? (
              <p>Cardamix is in testing, so every account has Plus for free for now. Thanks for trying it!</p>
            ) : plan.source === "comp" ? (
              <p>Your account has Plus for free.</p>
            ) : plan.cancelsAt ? (
              <p>Your subscription is cancelled and ends on {dateText(plan.cancelsAt)}. You keep Plus until then.</p>
            ) : (
              <p>{plan.renews ? `Renews on ${dateText(plan.renews)}.` : "Your subscription is active."}</p>
            )}
            {plan.status === "past_due" && <div className="callout warn small">Your last payment didn't go through. Update your card to keep Plus.</div>}
            {plan.source === "stripe" && (
              <div className="button-row">
                <button className="btn" disabled={busy} onClick={run(manageSubscription)}>
                  {busy ? "Opening…" : "Manage subscription"}
                </button>
              </div>
            )}
            {plan.source === "stripe" && <p className="muted small">Change your card, see receipts or cancel — on Stripe's secure page.</p>}
          </section>
        ) : null}
        {(!isPlus || beta) && (
          <section>
            {beta ? <h3>Subscribe early (optional)</h3> : <h1 className="page-title">Cardamix Plus</h1>}
            <p>Every feature, and far more AI each month.</p>
            <div className="segmented plus-interval" role="radiogroup" aria-label="Billing">
              <button role="radio" aria-checked={interval === "yearly"} className={interval === "yearly" ? "chip active" : "chip"} onClick={() => setInterval("yearly")}>
                Yearly · $29.99
              </button>
              <button role="radio" aria-checked={interval === "monthly"} className={interval === "monthly" ? "chip active" : "chip"} onClick={() => setInterval("monthly")}>
                Monthly · $3.99
              </button>
            </div>
            <p className="muted small">{interval === "yearly" ? "$2.50 a month, billed yearly — save 37%." : "Billed monthly. Cancel any time."}</p>
            <div className="button-row">
              <button className="btn primary" disabled={busy || checking} onClick={run(() => upgrade(interval))}>
                {busy ? "Opening checkout…" : "Upgrade to Plus"}
              </button>
            </div>
            <p className="muted small">Secure checkout by Stripe. Cancel any time from this page.</p>
          </section>
        )}
        {error && <div className="callout error small">{error}</div>}

        <section>
          <h3>Plus includes</h3>
          <ul className="plus-list">
            <li>
              <Icon name="check" size={16} />
              <span>
                <strong>About 10× more AI</strong> — roughly 50 recipe card scans a month, plus nutrition, receipts and “Cook with what I
                have”. Free includes about 5.
              </span>
            </li>
            {plusFeatures.map((f) => (
              <li key={f.id}>
                <Icon name="check" size={16} />
                <span>
                  <strong>{f.name}</strong> — {f.what}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
