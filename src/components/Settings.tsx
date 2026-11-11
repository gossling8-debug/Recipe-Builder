import { useEffect, useRef, useState } from "react";
import FeaturesSection from "./FeaturesSection";
import { feature } from "../lib/features";
import Header from "./Header";
import Icon from "./Icon";
import CloudSection from "./CloudSection";
import { cloudState, subscribeCloud } from "../lib/cloud";
import { applyTextSize, getTextSize, TEXT_SIZES, type TextSize } from "../lib/textSize";
import { getApiKey, setApiKey } from "../lib/settings";
import { href } from "../lib/route";
import { ALLERGEN_GROUPS, loadAvoid, saveAvoid, type AvoidList } from "../lib/avoid";
import { costOf, getModel, MODELS, setModel } from "../lib/models";
import { loadUsage, money } from "../lib/usage";
import { exportBackup, importBackup } from "../lib/backup";
import { storageErrorMessage, storageMode, STORAGE_MODE_TEXT, type StorageMode } from "../lib/db";

export default function Settings() {
  const [, featuresTick] = useState(0);
  useEffect(() => {
    const on = () => featuresTick((n) => n + 1);
    window.addEventListener("features-changed", on);
    return () => window.removeEventListener("features-changed", on);
  }, []);
  const [signedIn, setSignedIn] = useState(() => !!cloudState().uid);
  useEffect(() => subscribeCloud((c) => setSignedIn(!!c.uid)), []);
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [textSize, setTextSize] = useState<TextSize>(getTextSize());
  const [avoid, setAvoid] = useState<AvoidList>(loadAvoid);
  const [modelId, setModelId] = useState(getModel().id);
  const usage = loadUsage();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = usage.filter((u) => u.at >= monthStart);
  const avgFor = (id: string) => {
    const scans = usage.filter((u) => u.model === id && u.kind !== "substitutes" && u.kind !== "nutrition" && u.kind !== "receipt");
    return scans.length ? { avg: scans.reduce((s, u) => s + u.cost, 0) / scans.length, n: scans.length } : null;
  };
  const [newAvoid, setNewAvoid] = useState("");
  const updateAvoid = (a: AvoidList) => {
    setAvoid(a);
    saveAvoid(a);
  };
  const addAvoidWord = () => {
    const w = newAvoid.trim().toLowerCase();
    if (w && !avoid.custom.includes(w)) updateAvoid({ ...avoid, custom: [...avoid.custom, w] });
    setNewAvoid("");
  };
  const [mode, setMode] = useState<StorageMode | null>(null);
  const [message, setMessage] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
    storageMode().then(setMode, () => {});
  }, []);

  function save() {
    setKeyError(
      setApiKey(key) ? "" : "This browser won't let the app remember your key, so it's kept only until you close the app.",
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function doExport() {
    try {
      const n = await exportBackup();
      setMessage(`Backup file created with ${n} recipe${n === 1 ? "" : "s"}. Save it somewhere safe (Files, iCloud Drive, Google Drive, email).`);
    } catch (e) {
      setMessage(e instanceof DOMException ? storageErrorMessage(e) : `Backup failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importBackup(file);
      setMessage(`Restored ${n} recipe${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(e instanceof DOMException ? storageErrorMessage(e) : e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <Header title="Settings" back={href({ name: "library" })} />
      <main className="page">
        <section>
          <h3>Text size</h3>
          <p className="muted small">Makes text, buttons and checkboxes bigger throughout the app.</p>
          <div className="segmented text-size-control" role="radiogroup" aria-label="Text size">
            {TEXT_SIZES.map(({ value, label }, i) => (
              <button
                key={value}
                role="radio"
                aria-checked={textSize === value}
                className={textSize === value ? "chip active" : "chip"}
                onClick={() => {
                  applyTextSize(value);
                  setTextSize(value);
                }}
              >
                <span className="aa" style={{ fontSize: `${15 + i * 4}px` }} aria-hidden>
                  Aa
                </span>
                {label}
              </button>
            ))}
          </div>
        </section>

        <FeaturesSection />

        {feature("avoid") && (
        <section>
          <h3>Allergies &amp; ingredients to avoid</h3>
          <p className="muted small">
            Recipes that use these are flagged, you can filter them out of your list, and each recipe can suggest
            substitutes. Flags are a helpful check, not a guarantee — always read labels on packaged ingredients.
          </p>
          <div className="tag-picker">
            {Object.entries(ALLERGEN_GROUPS).map(([k, g]) => {
              const on = avoid.groups.includes(k);
              return (
                <button
                  key={k}
                  className={on ? "tag on" : "tag"}
                  aria-pressed={on}
                  onClick={() => updateAvoid({ ...avoid, groups: on ? avoid.groups.filter((x) => x !== k) : [...avoid.groups, k] })}
                >
                  {on && <Icon name="check" size={14} />} {g.label}
                </button>
              );
            })}
          </div>
          {avoid.custom.length > 0 && (
            <div className="tag-picker">
              {avoid.custom.map((w) => (
                <button
                  key={w}
                  className="tag on"
                  aria-label={`Stop avoiding ${w}`}
                  onClick={() => updateAvoid({ ...avoid, custom: avoid.custom.filter((x) => x !== w) })}
                >
                  {w} <Icon name="close" size={14} />
                </button>
              ))}
            </div>
          )}
          <div className="new-tag">
            <input
              className="text-input"
              placeholder="Something else, e.g. butter"
              value={newAvoid}
              onChange={(e) => setNewAvoid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAvoidWord()}
            />
            <button className="btn" onClick={addAvoidWord} disabled={!newAvoid.trim()}>
              Add
            </button>
          </div>
        </section>

        )}

        <section>
          <h3>Recipe reader</h3>
          <p className="muted small">
            Which Claude model reads your cards, websites and text, and suggests substitutes. Cheaper models cost far less
            but may misread messy handwriting — you can always fix a mistake with Edit.
          </p>
          <div className="model-list" role="radiogroup" aria-label="Recipe reader">
            {MODELS.map((m) => {
              const mine = avgFor(m.id);
              // Typical card scan: ~3,500 tokens in (photo + instructions), ~4,000 out (reasoning + recipe).
              const typical = costOf(m, 3500, 4000);
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={modelId === m.id}
                  className={modelId === m.id ? "model-option on" : "model-option"}
                  onClick={() => {
                    setModel(m.id);
                    setModelId(m.id);
                  }}
                >
                  <span className="model-head">
                    <strong>{m.label}</strong>
                    <span className="model-cost">
                      {mine ? `your average ${money(mine.avg)}` : `≈ ${money(typical)} per card`}
                    </span>
                  </span>
                  <span className="muted small">{m.blurb}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3>Spending</h3>
          {usage.length === 0 ? (
            <p className="muted small">Nothing yet. After your first scan this shows what the app has cost you.</p>
          ) : (
            <>
              <p>
                This month: <strong>{money(thisMonth.reduce((s, u) => s + u.cost, 0))}</strong>{" "}
                <span className="muted">
                  ({thisMonth.length} {thisMonth.length === 1 ? "request" : "requests"})
                </span>
              </p>
              <ul className="usage-list small">
                {usage
                  .slice(-5)
                  .reverse()
                  .map((u, i) => (
                    <li key={i}>
                      <span>
                        {{ scan: "Card scan", website: "Website", text: "Pasted text", substitutes: "Substitutes", nutrition: "Nutrition", receipt: "Receipt", pantryRecipe: "Pantry recipe" }[u.kind]} ·{" "}
                        {MODELS.find((m) => m.id === u.model)?.label ?? u.model}
                      </span>
                      <span>{money(u.cost)}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
          <p className="muted small">
            Estimates from Anthropic's list prices and the size of each request. Your exact bill is in the Anthropic
            Console. Cheapest to most expensive: pasted text, websites, card photos.
          </p>
        </section>

        <section>
          <h3>Anthropic API key</h3>
          <p className="muted small">
            Reading recipes sends the photo, page or text to Claude. Create a key at console.anthropic.com → API Keys.
            Each request is billed to your Anthropic account (see Recipe reader for typical costs). The key is stored only
            on this phone.
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
          {keyError && <div className="callout warn">{keyError}</div>}
        </section>

        <CloudSection />

        <section>
          <h3>Backup</h3>
          <p className="muted small">
            {signedIn
              ? "Everything is backed up to the cloud while you're signed in. A backup file is an extra copy of your recipes that you keep yourself."
              : "Recipes are saved on this phone. Clearing this site's data in your browser settings (or deleting the app) erases them, so sign in to cloud backup above or export a backup now and then."}
            {persisted === true && " This browser has agreed not to clear them on its own to free up space."}
          </p>
          {mode && (
            <p className="small" data-testid="storage-mode">
              <strong>Storage on this browser:</strong> {STORAGE_MODE_TEXT[mode]}
            </p>
          )}
          <div className="button-row">
            <button className="btn" onClick={doExport}>
              <Icon name="download" size={20} /> Export backup
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={20} /> Restore backup
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

        <p className="small settings-footer">
          <a href={href({ name: "privacy" })}>Privacy policy</a>
        </p>
      </main>
    </>
  );
}
