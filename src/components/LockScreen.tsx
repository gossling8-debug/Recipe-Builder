import { useEffect, useState } from "react";
import { checkPasscode, eraseThisPhone, loadLock, loadTries, removeLock, saveTries, unlockWithBiometric, waitAfter } from "../lib/appLock";
import { cloudState, subscribeCloud } from "../lib/cloud";

/** Covers the app until the passcode or Face ID is given. */
export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const lock = loadLock();
  const length = lock?.length ?? 4;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(loadTries);
  const [now, setNow] = useState(Date.now());
  const [forgot, setForgot] = useState(false);
  const waiting = Math.max(0, Math.ceil((tries.until - now) / 1000));

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  async function face() {
    if (await unlockWithBiometric()) {
      saveTries({ wrong: 0, until: 0 });
      onUnlock();
    }
  }
  // Offer Face ID straight away (some browsers only allow it after a tap — then the button is there).
  useEffect(() => {
    if (lock?.biometricId) void face();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function press(d: string) {
    if (waiting) return;
    const next = (code + d).slice(0, length);
    setCode(next);
    setError("");
    if (next.length < length) return;
    if (await checkPasscode(next)) {
      saveTries({ wrong: 0, until: 0 });
      onUnlock();
      return;
    }
    const wrong = tries.wrong + 1;
    const t = { wrong, until: Date.now() + waitAfter(wrong) * 1000 };
    saveTries(t);
    setTries(t);
    setNow(Date.now());
    setCode("");
    setError("Wrong passcode");
  }

  if (forgot) return <Forgot onBack={() => setForgot(false)} onUnlock={onUnlock} />;

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="App locked">
      <div className="lock-inner">
        <h2>Enter passcode</h2>
        <div className="lock-dots" aria-label={`${code.length} of ${length} digits`}>
          {Array.from({ length }, (_, i) => (
            <span key={i} className={i < code.length ? "dot on" : "dot"} />
          ))}
        </div>
        <p className="lock-msg" role="alert">
          {waiting ? `Too many tries. Try again in ${waiting} s.` : error}
        </p>
        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} className="key" onClick={() => press(d)} disabled={!!waiting}>
              {d}
            </button>
          ))}
          {lock?.biometricId ? (
            <button className="key key-text" onClick={face}>
              Face ID
            </button>
          ) : (
            <span />
          )}
          <button className="key" onClick={() => press("0")} disabled={!!waiting}>
            0
          </button>
          <button className="key key-text" aria-label="Delete" onClick={() => setCode(code.slice(0, -1))}>
            ⌫
          </button>
        </div>
        <button className="link-btn small" onClick={() => setForgot(true)}>
          Forgot passcode?
        </button>
      </div>
    </div>
  );
}

function Forgot({ onBack, onUnlock }: { onBack: () => void; onUnlock: () => void }) {
  // Wait until we know whether someone is signed in — never offer "erase" by mistake.
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  const known = cloud.status === "off" || cloud.authKnown;
  const signedIn = !!cloud.uid;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="Forgot passcode">
      <div className="lock-inner lock-forgot">
        <h2>Forgot passcode</h2>
        {!known ? (
          <p className="small">Checking your account…</p>
        ) : signedIn ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const { verifyPassword } = await import("../lib/account");
                await verifyPassword(password);
                removeLock();
                saveTries({ wrong: 0, until: 0 });
                onUnlock();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            <p className="small">Enter your account password ({cloud.email}). This turns the app lock off; you can set a new passcode in Settings.</p>
            <input className="text-input" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="button-row">
              <button type="submit" className="btn primary" disabled={busy || !password}>
                {busy ? "Checking…" : "Remove app lock"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="small">
              Without cloud backup there's no other way to prove it's you. You can start over: this <strong>erases everything</strong> in
              the app on this phone — recipes, lists and settings — and removes the lock.
            </p>
            <div className="button-row">
              <button
                className="btn danger-solid"
                onClick={async () => {
                  if (!confirm("Erase all recipes and lists on this phone? This can't be undone.")) return;
                  await eraseThisPhone();
                  location.reload();
                }}
              >
                Erase and start over
              </button>
            </div>
          </>
        )}
        {error && <p className="lock-msg">{error}</p>}
        <button className="link-btn small" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
