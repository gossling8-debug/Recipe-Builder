import { useEffect, useState } from "react";
import { href } from "../lib/route";
import { deleteAccount, signOutAndClear } from "../lib/account";
import { cloudState, subscribeCloud, syncNow, type CloudState } from "../lib/cloud";

const ago = (ms?: number) => {
  if (!ms) return "";
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(ms).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
};

/** Settings: the account, its backup status, sign out and delete. */
export default function CloudSection() {
  const [s, setS] = useState<CloudState>(cloudState());
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

  if (!s.uid) return null; // the account screen handles signing in

  return (
    <section>
      <h3>Account</h3>
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
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            if (!confirm("Sign out? Everything stays in your account; this phone's copy is removed until you sign in again.")) return;
            void run(async () => {
              if ((await signOutAndClear()) !== "unsynced") return;
              if (confirm("Your latest changes couldn't be backed up (are you offline?). Sign out anyway and lose them?")) await signOutAndClear(true);
            });
          }}
        >
          Sign out
        </button>
      </div>
      <p className="muted small">Backed up: recipes, photos, pantry, shopping list, week plan, prices and budget, and settings (except your Anthropic key). Signing out removes this phone's copy; it all comes back when you sign in.</p>
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
              await deleteAccount(password); // reloads the app when done
            });
          }}
        >
          <p className="small">
            This deletes your account and everything backed up with it: recipes, photos, lists and settings, cookbooks you
            made, and recipes you shared with others — and clears this phone. <strong>Export a backup first</strong> (below)
            if you want a copy.
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
