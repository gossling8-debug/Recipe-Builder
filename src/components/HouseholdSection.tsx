import { useEffect, useState } from "react";
import { cloudState } from "../lib/cloud";
import { inviteToHousehold, leaveHousehold, myHousehold, removeFromHousehold, type Household } from "../lib/household";
import { HOUSEHOLD_MAX, type MyPlan } from "../lib/subscription";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * On the Plus page, with Cardamix Family: who's on the plan. The payer
 * invites people by email and can take them off; anyone can leave.
 */
export default function HouseholdSection({ plan }: { plan: MyPlan }) {
  const uid = cloudState().uid;
  const [h, setH] = useState<Household | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const payer = plan.source !== "household";
  const load = () => myHousehold().then(setH, () => setH(null));
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  };

  const members = h?.members ?? (uid ? [uid] : []);
  const full = members.length >= HOUSEHOLD_MAX;
  return (
    <section className="household">
      <h2 className="h3">Your household</h2>
      {h === undefined ? (
        <p className="muted small">Loading…</p>
      ) : (
        <ul className="household-list">
          {members.map((m) => (
            <li key={m}>
              <span>
                {m === uid ? "You" : (h?.names[m] ?? "Someone")}
                {m === (h?.owner ?? uid) && <span className="muted small"> · pays for the plan</span>}
              </span>
              {payer && m !== uid && (
                <button
                  className="link-btn small"
                  disabled={busy}
                  onClick={() =>
                    confirm(`Take ${h?.names[m] ?? "them"} off your Family plan? They keep their account and recipes.`) &&
                    void run(async () => {
                      await removeFromHousehold(m);
                      await load();
                    })
                  }
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        {members.length} of {HOUSEHOLD_MAX} places used. Everyone has their own account, recipes and lists; the AI allowance is shared.
      </p>
      {payer && !full && (
        <div className="household-invite">
          <label className="field">
            <span>Your name, as they'll see it</span>
            <input className="text-input" value={name} maxLength={40} placeholder="e.g. Sam" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Their email — the one they use for Cardamix</span>
            <input
              className="text-input"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="off"
              value={email}
              placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="btn primary"
              disabled={busy || !email.trim()}
              onClick={() =>
                void run(async () => {
                  await inviteToHousehold(email, name);
                  setMsg(`Invite sent to ${email.trim()}. It'll be waiting for them next time they open Cardamix (once they've confirmed that email).`);
                  setEmail("");
                })
              }
            >
              {busy ? "Sending…" : "Invite to my plan"}
            </button>
          </div>
          <p className="muted small">They need a free Cardamix account with this email. If they're paying for Plus themselves, they can cancel it once they join.</p>
        </div>
      )}
      {!payer && (
        <button
          className="link-btn small"
          disabled={busy}
          onClick={() =>
            confirm("Leave this Family plan? You keep your account and recipes, and go back to your own plan.") &&
            void run(async () => {
              await leaveHousehold();
              location.reload();
            })
          }
        >
          Leave this Family plan
        </button>
      )}
      {msg && <div className="callout small">{msg}</div>}
      {error && <div className="callout error small">{error}</div>}
    </section>
  );
}
