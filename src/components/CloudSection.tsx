import { useEffect, useState } from "react";
import { deleteAccount, signOutHere } from "../lib/account";
import { cloudState, subscribeCloud, type CloudState } from "../lib/cloud";
import ChangeEmail from "./ChangeEmail";

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
        <h2 className="h3">Cloud backup &amp; sync</h2>
        <p className="muted small">Not set up yet. Until it is, recipes are saved only on this phone — use Export backup above.</p>
      </section>
    );
  }

  if (!s.uid) return null; // the account screen handles signing in

  return (
    <section>
      <h2 className="h3">Account</h2>
      <p>
        Signed in as <strong>{s.email}</strong>
      </p>
      <ChangeEmail label="Change email" />
      <p className={s.status === "error" ? "small cloud-status error" : "small cloud-status"} role="status">
        {s.status === "syncing" && "Syncing…"}
        {s.status === "synced" && `Everything backed up · ${ago(s.lastSync)}`}
        {(s.status === "offline" || s.status === "error") && s.message}
      </p>
      <div className="button-row">
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run(signOutHere)}
        >
          Sign out
        </button>
      </div>
      <p className="muted small">Signing out keeps everything in your account and on this phone.</p>
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
            This deletes your account and everything it stored: recipes, photos, lists and settings; what you added to
            cookbooks (and cookbooks only you are in); recipes you published to The Mix, and your ratings and reports there —
            and clears this phone. A Plus subscription is cancelled too. <strong>Export a backup first</strong> (above)
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
