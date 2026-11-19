import { useState } from "react";
import { inviteRoute } from "../lib/invite";
import { navigate } from "../lib/route";
import { isStandalone } from "../lib/homeScreen";

/**
 * "Have an invite? Paste it": joins from an invite link without opening it —
 * links open in the phone's browser, which is signed in apart from the
 * home-screen app.
 */
export function PasteInvite({ what }: { what: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const go = (t: string) => {
    const r = inviteRoute(t);
    if (r) navigate(r);
    else setError("That isn't an invite link. Copy the whole link from their message and try again.");
  };
  const paste = async () => {
    setError("");
    try {
      const t = await navigator.clipboard.readText();
      if (inviteRoute(t)) return go(t);
    } catch {
      /* not allowed here: paste it into the box */
    }
    setOpen(true);
  };
  if (!open)
    return (
      <button className="link-btn small" onClick={() => void paste()}>
        Have an invite to {what}? Paste it here
      </button>
    );
  return (
    <div className="paste-invite">
      <label className="field">
        <span>Paste the invite link</span>
        <input className="text-input" value={text} autoFocus placeholder="https://…" onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="button-row">
        <button className="btn primary" disabled={!text.trim()} onClick={() => go(text)}>
          Join
        </button>
        <button className="link-btn small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <div className="callout error small">{error}</div>}
    </div>
  );
}

/**
 * Above the sign-in screen when an invite link opened in the browser: someone
 * who uses the home-screen app needn't sign in here too.
 */
export function InviteInBrowserNote() {
  const [copied, setCopied] = useState<boolean | null>(null);
  if (isStandalone()) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      return setCopied(true);
    } catch {
      /* try the older way */
    }
    const t = document.createElement("textarea");
    t.value = location.href;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;opacity:0;top:0";
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, t.value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    t.remove();
    setCopied(ok);
  };
  return (
    <div className="callout invite-note small">
      <strong>Use Cardamix from your home screen?</strong> You don't need to sign in here. Tap <em>Copy invite</em>, open Cardamix from
      your home screen, and tap <em>Have an invite? Paste it here</em> on the Shopping list or Cookbooks.
      <div className="button-row">
        <button className="btn" onClick={() => void copy()}>
          {copied ? "Copied ✓" : "Copy invite"}
        </button>
      </div>
      {copied === false && (
        <p className="small">
          Couldn't copy it here — press and hold this link to copy it: <span className="invite-url">{location.href}</span>
        </p>
      )}
    </div>
  );
}
