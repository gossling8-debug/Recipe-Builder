import { useState } from "react";
import { changeEmail } from "../lib/cloud";

/**
 * "Wrong email? Change it": the new address and the password, then a link goes
 * to the new address. Tapping it moves the account there (and confirms it).
 */
export default function ChangeEmail({ label = "Wrong email? Change it" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  if (sentTo)
    return (
      <p className="small change-email-sent" role="status">
        We sent a link to <strong>{sentTo}</strong>. Tap it to switch your account to that address — then come back here. (Check spam if you
        don't see it.)
      </p>
    );
  if (!open)
    return (
      <button className="link-btn small" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <form
      className="cloud-form change-email"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await changeEmail(email, password);
          setSentTo(email.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        setBusy(false);
      }}
    >
      <input
        className="text-input"
        type="email"
        autoComplete="email"
        placeholder="The right email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="New email address"
      />
      <input
        className="text-input"
        type="password"
        autoComplete="current-password"
        placeholder="Your password, to confirm"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Your password"
      />
      <div className="button-row">
        <button type="submit" className="btn primary" disabled={busy || !email.trim() || !password}>
          {busy ? "Sending…" : "Send link to new address"}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => (setOpen(false), setError(""))}>
          Cancel
        </button>
      </div>
      {error && <p className="small error-text">{error}</p>}
    </form>
  );
}
