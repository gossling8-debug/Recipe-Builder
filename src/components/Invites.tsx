import { useEffect, useState } from "react";
import { cloudState, subscribeCloud } from "../lib/cloud";
import { clearInvitesFor, myInvites, sendInvite, type Invite, type InviteKind } from "../lib/invites";
import { navigate } from "../lib/route";

function useCloud() {
  const [s, setS] = useState(cloudState());
  useEffect(() => subscribeCloud(setS), []);
  return s;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Invite someone by the email they use for Cardamix (or send a link instead). */
export function EmailInviteForm({
  kind,
  target,
  title,
  fromName,
  onLink,
  onClose,
}: {
  kind: InviteKind;
  target: string;
  title: string;
  fromName: string;
  onLink: () => void;
  onClose?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    setError("");
    try {
      await sendInvite(kind, target, email, fromName, title);
      setSent(email.trim());
      setEmail("");
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }
  return (
    <div className="email-invite">
      {sent && (
        <div className="callout small">
          Invite sent to <strong>{sent}</strong>. It'll be waiting for them next time they open Cardamix (once they've confirmed that email).
        </div>
      )}
      <label className="field">
        <span>Their email — the one they use for Cardamix</span>
        <input
          className="text-input"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          value={email}
          placeholder="name@example.com"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && email.trim() && void send()}
        />
      </label>
      <div className="button-row">
        <button className="btn primary" disabled={busy || !email.trim()} onClick={() => void send()}>
          {busy ? "Sending…" : sent ? "Invite someone else" : "Send invite"}
        </button>
        {onClose && (
          <button className="link-btn small" disabled={busy} onClick={onClose}>
            Done
          </button>
        )}
      </div>
      {error && <div className="callout error small">{error}</div>}
      <p className="muted small">
        No Cardamix account yet?{" "}
        <button className="link-btn small" onClick={onLink}>
          Send them a link instead
        </button>
      </p>
    </div>
  );
}

const WHAT: Record<InviteKind, string> = { shop: "share a shopping list", book: "join a cookbook" };

/** "Sam invited you to share a shopping list" — waiting in the app, no link needed. */
export function InvitesWaiting({ kinds }: { kinds: InviteKind[] }) {
  const s = useCloud();
  const [invites, setInvites] = useState<Invite[]>([]);
  const ready = !!s.uid && !!s.emailVerified;
  const key = kinds.join();
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const load = () => void myInvites().then((x) => live && setInvites(x), () => {});
    load();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("invites-changed", load);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("invites-changed", load);
    };
  }, [ready]);
  const shown = invites.filter((i) => key.split(",").includes(i.kind));
  if (!shown.length) return null;
  return (
    <>
      {shown.map((i) => (
        <div className="plan-card invite-waiting" key={i.id}>
          <p>
            <strong>{i.fromName}</strong> invited you to {i.kind === "book" && i.title ? <>join the cookbook “{i.title}”</> : WHAT[i.kind]}.
          </p>
          <div className="button-row">
            <button className="btn primary" onClick={() => navigate(i.kind === "shop" ? { name: "shopjoin", id: i.target } : { name: "join", id: i.target })}>
              {i.kind === "shop" ? "See invite" : "See cookbook"}
            </button>
            <button
              className="link-btn small"
              onClick={() => {
                setInvites((all) => all.filter((x) => x.id !== i.id));
                void clearInvitesFor(i.kind, i.target).catch(() => {});
              }}
            >
              No thanks
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
