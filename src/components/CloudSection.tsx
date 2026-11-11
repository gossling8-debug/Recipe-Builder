import { useEffect, useState } from "react";
import { href } from "../lib/route";
import { deleteAccount } from "../lib/account";
import { cloudState, createAccount, resetPassword, signIn, signOut, subscribeCloud, syncNow, type CloudState } from "../lib/cloud";

const ago = (ms?: number) => {
  if (!ms) return "";
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
};

/** Settings: sign in to back up and sync recipes across devices. */
export default function CloudSection() {
  const [s, setS] = useState<CloudState>(cloudState());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => subscribeCloud(setS), []);

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  if (s.status === "off") {
    return (
      <section>
        <h3>Cloud backup &amp; sync</h3>
        <p className="muted small">Not set up yet. Until it is, recipes are saved only on this phone — use Export backup below.</p>
      </section>
    );
  }

  if (s.status === "signed-out") {
    return (
      <section>
        <h3>Cloud backup &amp; sync</h3>
        <p className="muted small">
          Sign in to back up your recipes, lists and settings and use them on any device. Free. Your Anthropic key is never uploaded.{" "}
          <a href={href({ name: "privacy" })}>How your data is handled</a>
        </p>
        <form
          className="cloud-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => signIn(email, password));
          }}
        >
          <input className="text-input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="button-row">
            <button type="submit" className="btn primary" disabled={busy || !email || !password}>
              Sign in
            </button>
            <button type="button" className="btn" disabled={busy || !email || !password} onClick={() => run(() => createAccount(email, password))}>
              Create account
            </button>
          </div>
          <button
            type="button"
            className="link-btn small"
            disabled={busy || !email}
            onClick={() => run(() => resetPassword(email), "Check your email for a link to reset your password.")}
          >
            Forgot password?
          </button>
        </form>
        {message && <div className="callout small">{message}</div>}
      </section>
    );
  }

  return (
    <section>
      <h3>Cloud backup &amp; sync</h3>
      <p>
        Signed in as <strong>{s.email}</strong>
      </p>
      <p className={s.status === "error" ? "small cloud-status error" : "small cloud-status"} role="status">
        {s.status === "syncing" && "Syncing…"}
        {s.status === "synced" && `Everything backed up · ${ago(s.lastSync)}`}
        {(s.status === "offline" || s.status === "error") && s.message}
      </p>
      <div className="button-row">
        <button className="btn" disabled={busy || s.status === "syncing"} onClick={() => run(syncNow)}>
          Sync now
        </button>
        <button className="btn" disabled={busy} onClick={() => run(signOut)}>
          Sign out
        </button>
      </div>
      <p className="muted small">Backed up: recipes, photos, pantry, shopping list, week plan, prices and budget, and settings (except your Anthropic key). Signing out keeps everything on this phone and in the cloud.</p>
      <p>
        <a href={href({ name: "family" })}>Family cookbooks</a>
        <span className="muted small"> — share chosen recipes with family or friends</span>
      </p>
      {message && <div className="callout small">{message}</div>}
      {!deleting ? (
        <button className="link-btn small" onClick={() => (setDeleting(true), setPassword(""), setMessage(""))}>
          Delete my account
        </button>
      ) : (
        <form
          className="cloud-form delete-account"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirm("Delete your account and everything backed up in the cloud? This can't be undone.")) return;
            void run(async () => {
              await deleteAccount(password);
              setDeleting(false);
              setPassword("");
            }, "Your account and its cloud data are deleted. Your recipes and lists are still on this phone.");
          }}
        >
          <p className="small">
            This deletes your account and everything backed up with it: recipes, photos, lists and settings, cookbooks you
            made, and recipes you shared with others. <strong>What's on this phone stays.</strong> Export a backup first if
            you want a copy.
          </p>
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            placeholder="Your password, to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="button-row">
            <button type="submit" className="btn danger-solid" disabled={busy || !password}>
              {busy ? "Deleting…" : "Delete account"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => (setDeleting(false), setMessage(""))}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
