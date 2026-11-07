import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import { getApiKey, setApiKey } from "../lib/settings";
import { href } from "../lib/route";
import { exportBackup, importBackup } from "../lib/backup";

export default function Settings() {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  function save() {
    setApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function doExport() {
    try {
      const n = await exportBackup();
      setMessage(`Backup file created with ${n} recipe${n === 1 ? "" : "s"}. Save it somewhere safe (Files, iCloud Drive, Google Drive, email).`);
    } catch (e) {
      setMessage(`Backup failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importBackup(file);
      setMessage(`Restored ${n} recipe${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <Header title="Settings" back={href({ name: "library" })} />
      <main className="page">
        <section>
          <h3>Anthropic API key</h3>
          <p className="muted small">
            Scanning sends the card photo to Claude. Create a key at console.anthropic.com → API Keys. Each scan costs
            roughly 5–15 cents, billed to your Anthropic account. The key is stored only on this phone.
          </p>
          <input
            className="text-input"
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="button-row">
            <button className="btn primary" onClick={save}>
              {saved ? "Saved ✓" : "Save key"}
            </button>
          </div>
        </section>

        <section>
          <h3>Backup</h3>
          <p className="muted small">
            Recipes are saved on this phone. Clearing this site's data in your browser settings (or deleting the app) erases
            them, so export a backup now and then.
            {persisted === true && " This browser has agreed not to clear them on its own to free up space."}
          </p>
          <div className="button-row">
            <button className="btn" onClick={doExport}>
              ⬇️ Export backup
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              ⬆️ Restore backup
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              doImport(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {message && <div className="callout">{message}</div>}
        </section>
      </main>
    </>
  );
}
