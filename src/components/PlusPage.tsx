import { useEffect, useState } from "react";
import { FEATURES } from "../lib/features";
import { href } from "../lib/route";
import { HOUSEHOLD_MAX, manageSubscription, myPlan, refreshMyPlan, upgrade, type MyPlan } from "../lib/subscription";
import Header from "./Header";
import Icon from "./Icon";
import HouseholdSection from "./HouseholdSection";
import { InvitesWaiting } from "./Invites";

const PRICE = {
  plus: { yearly: "$34.99", monthly: "$4.49", perMonth: "$2.92" },
  family: { yearly: "$69.99", monthly: "$8.99", perMonth: "$5.83" },
};

const dateText = (ms?: number | null) => (ms ? new Date(ms).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "");

/** Cardamix Plus: what it includes, upgrading, and managing the subscription. */
export default function PlusPage({ done }: { done?: boolean }) {
  const [plan, setPlan] = useState<MyPlan>(myPlan);
  const [interval, setInterval] = useState<"monthly" | "yearly">("yearly");
  const [tier, setTier] = useState<"plus" | "family">(() => (myPlan().plan === "plus" && myPlan().source === "stripe" ? "family" : "plus"));
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
        // Keep what we have, but say so — don't quietly look like the Free plan.
        if (!stop) setError("Couldn't check your plan right now, so this may be out of date. Try again in a minute.");
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
  const familyFeatures = FEATURES.filter((f) => f.plan === "family");
  const isPlus = plan.plan !== "free";
  const isFamily = plan.plan === "family";
  // Plus by subscription can move up to Family.
  const canUpgradeToFamily = plan.plan === "plus" && plan.source === "stripe";
  const beta = plan.source === "beta"; // testing period: Plus is free, subscribing is optional

  return (
    <>
      <Header title="Your plan" back={href({ name: "settings" })} />
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
            <h1 className="page-title">{isFamily ? "You have Cardamix Family" : "You have Plus"}</h1>
            {plan.source === "beta" ? (
              <p>Cardamix is in testing, so every account has Plus for free for now. Thanks for trying it!</p>
            ) : plan.source === "household" ? (
              <p>You're on your household's Family plan — everything is included, with an AI allowance you all share.</p>
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
        <InvitesWaiting kinds={["household"]} />
        {isFamily && <HouseholdSection plan={plan} />}
        {(!isPlus || beta || canUpgradeToFamily) && plan.source !== "household" && (
          <section>
            {beta ? <h3>Subscribe early (optional)</h3> : canUpgradeToFamily ? <h3>Move up to Cardamix Family</h3> : <h1 className="page-title">Choose a plan</h1>}
            {!canUpgradeToFamily && (
              <div className="segmented plus-tier" role="radiogroup" aria-label="Plan">
                <button role="radio" aria-checked={tier === "plus"} className={tier === "plus" ? "chip active" : "chip"} onClick={() => setTier("plus")}>
                  Plus · just you
                </button>
                <button role="radio" aria-checked={tier === "family"} className={tier === "family" ? "chip active" : "chip"} onClick={() => setTier("family")}>
                  Family · up to {HOUSEHOLD_MAX}
                </button>
              </div>
            )}
            <p>
              {tier === "family"
                ? `Everything in Plus for up to ${HOUSEHOLD_MAX} people in your household — each with their own account — plus the Family features below, with one AI allowance you share.`
                : "Every feature, and far more AI each month."}
            </p>
            <div className="segmented plus-interval" role="radiogroup" aria-label="Billing">
              <button role="radio" aria-checked={interval === "yearly"} className={interval === "yearly" ? "chip active" : "chip"} onClick={() => setInterval("yearly")}>
                Yearly · {PRICE[tier].yearly}
              </button>
              <button role="radio" aria-checked={interval === "monthly"} className={interval === "monthly" ? "chip active" : "chip"} onClick={() => setInterval("monthly")}>
                Monthly · {PRICE[tier].monthly}
              </button>
            </div>
            <p className="muted small">
              {interval === "yearly" ? `${PRICE[tier].perMonth} a month, billed yearly — save 35%.` : "Billed monthly. Cancel any time."}
              {canUpgradeToFamily && " Your Plus subscription switches over; you're only charged the difference."}
            </p>
            <div className="button-row">
              <button
                className="btn primary"
                disabled={busy || checking}
                onClick={run(async () => {
                  if ((await upgrade(interval, tier)) === "upgraded") {
                    setPlan(myPlan());
                    setBusy(false);
                  }
                })}
              >
                {busy ? "Opening checkout…" : tier === "family" ? "Get Cardamix Family" : "Upgrade to Plus"}
              </button>
            </div>
            <p className="muted small">
              Secure checkout by Stripe. Renews automatically until you cancel — cancel any time from this page. By upgrading you agree to
              the <a href={href({ name: "terms" })}>Terms of service</a>, including the refund policy.
            </p>
          </section>
        )}
        {error && <div className="callout error small">{error}</div>}

        <section>
          <h3>Plus includes</h3>
          <ul className="plus-list">
            <li>
              <Icon name="check" size={16} />
              <span>
                <strong>Much more AI</strong> — about 50 recipe adds and 20+ created recipes a month (the free plan has 5 and 3), plus
                nutrition, receipts and “Cook with what I have”, and the Advanced reader for handwriting.
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
        {familyFeatures.length > 0 && (
          <section>
            <h3>{beta ? "Coming with Cardamix Family" : "Cardamix Family adds"}</h3>
            <p className="muted small">
              Everything in Plus for your whole household, and more. {beta ? "Included free while Cardamix is being tested." : ""}
            </p>
            <ul className="plus-list">
              {familyFeatures.map((f) => (
                <li key={f.id}>
                  <Icon name="check" size={16} />
                  <span>
                    <strong>{f.name}</strong> — {f.what}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
