import { useEffect, useState } from "react";
import { checkEmailVerified, cloudState, sendVerificationEmail, subscribeCloud } from "../lib/cloud";
import ChangeEmail from "./ChangeEmail";

/**
 * Free plan: AI needs a confirmed email address. Shown until it's confirmed,
 * with "I've confirmed it" (checks again), "Send the email again" and
 * "Wrong email? Change it".
 */
export default function VerifyEmail({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState(cloudState());
  useEffect(() => subscribeCloud(setS), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // Coming back to the app after tapping the link: check right away.
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && void checkEmailVerified().catch(() => {});
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);
  if (!s.uid || s.emailVerified !== false) return null;

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setNote("");
    try {
      setNote(await fn());
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="callout small verify-email" role="status">
      <strong>Confirm your email to use AI.</strong>{" "}
      {compact
        ? "Tap the link we sent you."
        : `We sent a link to ${s.email}. Tap it to confirm your address — then adding and creating recipes with AI works. (Check spam if you don't see it.)`}
      <div className="button-row">
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => run(async () => ((await checkEmailVerified()) ? "Confirmed — thanks!" : "Not confirmed yet. Tap the link in the email, then try again."))}
        >
          I've confirmed it
        </button>
        <button className="btn" disabled={busy} onClick={() => run(async () => (await sendVerificationEmail(), `Sent a new link to ${s.email}.`))}>
          Send the email again
        </button>
      </div>
      {note && <p className="small verify-note">{note}</p>}
      <ChangeEmail />
    </div>
  );
}
