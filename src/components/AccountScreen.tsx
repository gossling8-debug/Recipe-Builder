import { useEffect, useState } from "react";
import { takeAccountNote } from "../lib/account";
import { createAccount, resetPassword, signIn, startCloud, type CloudState } from "../lib/cloud";
import { listRecipes } from "../lib/db";
import { lastAccount } from "../lib/stateSync";
import { href } from "../lib/route";

/** Everyone has an account: shown until someone signs in (or while we find out). */
export default function AccountScreen({ cloud }: { cloud: CloudState }) {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(takeAccountNote);
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    // Only recipes that don't belong to an account yet move into a new one.
    if (!lastAccount()) listRecipes().then((rs) => setLocalCount(rs.length), () => {});
  }, []);

  if (!cloud.authKnown) {
    return (
      <main className="page account-screen" aria-busy="true">
        <h1 className="page-title">Recipe Builder</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await startCloud(); // in case the first try was offline
      await (mode === "create" ? createAccount(email, password) : signIn(email, password));
      // Signed in: the app opens by itself.
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="page account-screen">
      <h1 className="page-title">Recipe Builder</h1>
      <p>Your recipe cards, cleaned up and ready to cook — backed up and on all your devices.</p>
      {localCount > 0 && mode === "create" && (
        <div className="callout small">
          Create your account to keep using the app. The {localCount} {localCount === 1 ? "recipe" : "recipes"} on this phone will be
          saved to it.
        </div>
      )}

      <div className="segmented account-tabs" role="tablist">
        <button role="tab" aria-selected={mode === "create"} className={mode === "create" ? "chip active" : "chip"} onClick={() => (setMode("create"), setMessage(""))}>
          Create account
        </button>
        <button role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "chip active" : "chip"} onClick={() => (setMode("signin"), setMessage(""))}>
          Sign in
        </button>
      </div>

      <form
        className="cloud-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input className="text-input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="password-row">
          <input
            className="text-input"
            type={show ? "text" : "password"}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            placeholder={mode === "create" ? "Choose a password (6+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="link-btn small" onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <button type="submit" className="btn primary" disabled={busy || !email || !password}>
          {busy ? "One moment…" : mode === "create" ? "Create account" : "Sign in"}
        </button>
        {mode === "signin" && (
          <button
            type="button"
            className="link-btn small"
            disabled={busy || !email}
            onClick={async () => {
              setMessage("");
              try {
                await resetPassword(email);
                setMessage("Check your email for a link to reset your password.");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Forgot password?
          </button>
        )}
      </form>
      {(message || cloud.message) && <div className="callout small">{message || cloud.message}</div>}
      <p className="muted small account-fine-print">
        Free. Your account keeps your recipes, photos and lists safe if you lose or change your phone.{" "}
        <a href={href({ name: "privacy" })}>Privacy policy</a>
      </p>
    </main>
  );
}
