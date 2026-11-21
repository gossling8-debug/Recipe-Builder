import { useState } from "react";
import { callable } from "../lib/subscription";

/**
 * Owner dashboard: Lulu's API keys for printed cookbooks (from Lulu's
 * developer portal). Saved where only the app's server can read them —
 * never shown again here. Start with "Test (sandbox)": orders aren't printed.
 */
export default function LuluKeysSection() {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [env, setEnv] = useState<"sandbox" | "production">("sandbox");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2 className="h3">Printed cookbooks (Lulu)</h2>
      <p className="muted small">
        Paste the client key and secret from Lulu's developer portal. They're stored where only the server can read them. Use Test first —
        test orders aren't printed or charged by Lulu.
      </p>
      <label className="field">
        <span>Client key</span>
        <input className="text-input" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="field">
        <span>Client secret</span>
        <input className="text-input" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
      </label>
      <div className="segmented" role="radiogroup" aria-label="Lulu account">
        <button role="radio" aria-checked={env === "sandbox"} className={env === "sandbox" ? "chip active" : "chip"} onClick={() => setEnv("sandbox")}>
          Test (sandbox)
        </button>
        <button role="radio" aria-checked={env === "production"} className={env === "production" ? "chip active" : "chip"} onClick={() => setEnv("production")}>
          Live
        </button>
      </div>
      <div className="button-row">
        <button
          className="btn"
          disabled={busy || !key.trim() || !secret.trim()}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await callable("ownerSetLulu", { key, secret, env });
              setKey("");
              setSecret("");
              setMsg(env === "production" ? "Saved — live orders will be printed." : "Saved — test mode.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : String(e));
            }
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save Lulu keys"}
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
