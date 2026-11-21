import { useEffect, useState } from "react";
import { loadAppConfig, setCopyrightEmail } from "../lib/appConfig";
import { href } from "../lib/route";

/** Owner dashboard: the address copyright notices go to (shown publicly on the copyright page). */
export default function CopyrightEmailSection() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadAppConfig().then((c) => setEmail(c.copyrightEmail), () => {});
  }, []);
  return (
    <section>
      <h3>Copyright notices</h3>
      <p className="muted small">
        The address on the public <a href={href({ name: "copyright" })}>copyright page</a> where rights holders send notices. Use the same
        one you register as your copyright agent with the US Copyright Office. To take a Mix recipe down after a notice, open it and tap
        “Take down: copyright notice”.
      </p>
      <label className="field">
        <span>Email for copyright notices</span>
        <input className="text-input" type="email" autoCapitalize="none" value={email} placeholder="e.g. copyright@cardamix.com" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="button-row">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await setCopyrightEmail(email);
              setMsg(email.trim() ? "Saved — it's on the copyright page." : "Removed.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : String(e));
            }
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
