import { useEffect, useState } from "react";
import {
  biometricAvailable,
  checkPasscode,
  disableBiometric,
  enableBiometric,
  LOCK_AFTER,
  loadLock,
  removeLock,
  setLockAfter,
  setPasscode,
  validPasscode,
} from "../lib/appLock";

type Mode = null | "set" | "change" | "off";

/** Settings: lock the app with a passcode and, if the phone supports it, Face ID. */
export default function AppLockSection() {
  const [lock, setLock] = useState(loadLock);
  const [canFace, setCanFace] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void biometricAvailable().then(setCanFace);
    const on = () => setLock(loadLock());
    window.addEventListener("lock-changed", on);
    return () => window.removeEventListener("lock-changed", on);
  }, []);

  const reset = (m: Mode = null) => {
    setMode(m);
    setCurrent("");
    setCode("");
    setAgain("");
  };

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      if ((mode === "change" || mode === "off") && !(await checkPasscode(current))) throw new Error("Current passcode is wrong.");
      if (mode === "off") {
        removeLock();
        reset();
        setMsg("App lock is off.");
      } else {
        if (!validPasscode(code)) throw new Error("Use 4 or 6 digits.");
        if (code !== again) throw new Error("The two passcodes don't match.");
        await setPasscode(code);
        reset();
        setMsg(mode === "set" ? "App lock is on. You'll enter the passcode when you open the app." : "Passcode changed.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const field = (label: string, value: string, set: (v: string) => void, auto?: boolean) => (
    <input
      className="text-input"
      type="password"
      inputMode="numeric"
      autoComplete="off"
      placeholder={label}
      aria-label={label}
      autoFocus={auto}
      value={value}
      onChange={(e) => set(digits(e.target.value))}
    />
  );

  return (
    <section>
      <h3>App lock</h3>
      {!lock && !mode && (
        <>
          <p className="muted small">Ask for a passcode{canFace ? " or Face ID" : ""} when the app opens, so others using this phone can't see your recipes and lists.</p>
          <div className="button-row">
            <button className="btn" onClick={() => (reset("set"), setMsg(""))}>
              Turn on app lock
            </button>
          </div>
        </>
      )}

      {mode && (
        <form
          className="cloud-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {(mode === "change" || mode === "off") && field("Current passcode", current, setCurrent, true)}
          {mode !== "off" && (
            <>
              {field("New passcode (4 or 6 digits)", code, setCode, mode === "set")}
              {field("Enter it again", again, setAgain)}
            </>
          )}
          <div className="button-row">
            <button type="submit" className="btn primary" disabled={busy}>
              {mode === "off" ? "Turn off" : "Save passcode"}
            </button>
            <button type="button" className="btn" onClick={() => (reset(), setMsg(""))}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {lock && !mode && (
        <>
          <p className="small">
            <strong>On</strong> — passcode{lock.biometricId ? " or Face ID" : ""} needed to open the app.
          </p>
          {canFace ? (
            <label className="toggle-row">
              <span>
                <span className="feature-name">Use Face ID</span>
                <span className="muted small feature-what">Your phone may ask to save a passkey — that's how Face ID is connected. The passcode always works too.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Use Face ID"
                checked={!!lock.biometricId}
                disabled={busy}
                onChange={async (e) => {
                  setMsg("");
                  if (!e.target.checked) return disableBiometric();
                  setBusy(true);
                  try {
                    await enableBiometric();
                    setMsg("Face ID is on.");
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : String(err));
                  }
                  setBusy(false);
                }}
              />
            </label>
          ) : (
            canFace === false && <p className="muted small">Face ID isn't available in this browser, so the passcode is used.</p>
          )}
          <p className="small lock-after-label">Lock again when I leave the app</p>
          <div className="tag-picker">
            {LOCK_AFTER.map((o) => (
              <button key={o.ms} className={lock.after === o.ms ? "tag on" : "tag"} aria-pressed={lock.after === o.ms} onClick={() => setLockAfter(o.ms)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="button-row">
            <button className="btn" onClick={() => (reset("change"), setMsg(""))}>
              Change passcode
            </button>
            <button className="btn" onClick={() => (reset("off"), setMsg(""))}>
              Turn off
            </button>
          </div>
        </>
      )}
      {msg && <div className="callout small">{msg}</div>}
    </section>
  );
}
