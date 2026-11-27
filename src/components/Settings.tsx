import EatersSection from "./EatersSection";
import { loadKitchen, saveKitchen } from "../lib/kitchen";
import KitchenPicker from "./KitchenPicker";
import { useEffect, useRef, useState } from "react";
import FeaturesSection from "./FeaturesSection";
import { feature, hasPlus } from "../lib/features";
import Header from "./Header";
import Icon from "./Icon";
import CloudSection from "./CloudSection";
import AppLockSection from "./AppLockSection";
import AddToHomeScreen from "./AddToHomeScreen";
import OwnKeySection from "./OwnKeySection";
import { isStandalone } from "../lib/homeScreen";
import { cloudState, subscribeCloud } from "../lib/cloud";
import {
  applyTextSize,
  getTextSize,
  TEXT_SIZES,
  type TextSize,
} from "../lib/textSize";
import { applyTheme, getTheme, THEMES, type Theme } from "../lib/theme";
import { ownKey } from "../lib/settings";
import { href } from "../lib/route";
import {
  ALLERGEN_GROUPS,
  loadAvoid,
  saveAvoid,
  type AvoidList,
} from "../lib/avoid";
import { availableModels, costOf, getModel, setModel } from "../lib/models";
import { allowanceFor } from "../lib/subscription";
import { amAdmin } from "../lib/mix";
import { restartTour } from "../lib/tour";
import { navigate } from "../lib/route";
import AiAllowance from "./AiAllowance";
import { loadUsage, money } from "../lib/usage";
import { exportBackup, importBackup } from "../lib/backup";
import {
  storageErrorMessage,
} from "../lib/db";

export default function Settings() {
  const [, featuresTick] = useState(0);
  useEffect(() => {
    const on = () => featuresTick((n) => n + 1);
    window.addEventListener("features-changed", on);
    return () => window.removeEventListener("features-changed", on);
  }, []);
  const [signedIn, setSignedIn] = useState(() => !!cloudState().uid);
  // The owner dashboard link shows only for admins (admins/{uid}).
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (signedIn) amAdmin().then(setAdmin, () => {});
  }, [signedIn]);
  useEffect(() => subscribeCloud((c) => setSignedIn(!!c.uid)), []);
  const [textSize, setTextSize] = useState<TextSize>(getTextSize());
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [avoid, setAvoid] = useState<AvoidList>(loadAvoid);
  const [kitchen, setKitchen] = useState(loadKitchen);
  const [modelId, setModelId] = useState(getModel().id);
  const usage = loadUsage();
  const avgFor = (id: string) => {
    const scans = usage.filter(
      (u) =>
        u.model === id &&
        u.kind !== "substitutes" &&
        u.kind !== "nutrition" &&
        u.kind !== "receipt",
    );
    return scans.length
      ? {
          avg: scans.reduce((s, u) => s + u.cost, 0) / scans.length,
          n: scans.length,
        }
      : null;
  };
  const [newAvoid, setNewAvoid] = useState("");
  const updateAvoid = (a: AvoidList) => {
    setAvoid(a);
    saveAvoid(a);
  };
  const addAvoidWord = () => {
    const w = newAvoid.trim().toLowerCase();
    if (w && !avoid.custom.includes(w))
      updateAvoid({ ...avoid, custom: [...avoid.custom, w] });
    setNewAvoid("");
  };
  const [message, setMessage] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted, () => setPersisted(null));
  }, []);

  async function doExport() {
    try {
      const n = await exportBackup();
      setMessage(
        `Backup file created with ${n} recipe${n === 1 ? "" : "s"}. Save it somewhere safe (Files, iCloud Drive, Google Drive, email).`,
      );
    } catch (e) {
      setMessage(
        e instanceof DOMException
          ? storageErrorMessage(e)
          : `Backup failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    try {
      const n = await importBackup(file);
      setMessage(`Restored ${n} recipe${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setMessage(
        e instanceof DOMException
          ? storageErrorMessage(e)
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  }

  return (
    <>
      <Header title="Settings" back={href({ name: "library" })} />
      <main className="page">
        <section>
          <h2 className="h3">Display</h2>
          <h3 className="h4">Text size</h3>
          <p className="muted small">
            Makes text, buttons and checkboxes bigger throughout the app.
          </p>
          <div
            className="segmented text-size-control"
            role="radiogroup"
            aria-label="Text size"
          >
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
                <span
                  className="aa"
                  style={{ fontSize: `${15 + i * 4}px` }}
                  aria-hidden
                >
                  Aa
                </span>
                {label}
              </button>
            ))}
          </div>
          <h3 className="h4">Light or Night</h3>
          <p className="muted small">
            Night is a black background with white text — easier on the eyes in
            the dark. Automatic follows your phone.
          </p>
          <div
            className="segmented appearance-control"
            role="radiogroup"
            aria-label="Appearance"
          >
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                role="radio"
                aria-checked={theme === value}
                className={theme === value ? "chip active" : "chip"}
                onClick={() => {
                  applyTheme(value);
                  setTheme(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {!isStandalone() && (
          <section>
            <h2 className="h3">Home screen</h2>
            <AddToHomeScreen />
          </section>
        )}

        <section>
          <h2 className="h3">Your kitchen</h2>
          <p className="muted small">Recipes Cardamix writes for you can use these when they suit the dish. Everyone has a stove and oven.</p>
          <KitchenPicker value={kitchen} onChange={(ids) => (setKitchen(ids), saveKitchen(ids))} />
        </section>

        {feature("tastes") && <EatersSection />}

        {feature("avoid") && (
          <section>
            <h2 className="h3">Allergies &amp; ingredients to avoid</h2>
            <p className="muted small">
              Recipes that use these are flagged, you can filter them out of
              your list, and each recipe can suggest substitutes. Flags are a
              helpful check, not a guarantee — always read labels on packaged
              ingredients.
            </p>
            <div className="tag-picker">
              {Object.entries(ALLERGEN_GROUPS).map(([k, g]) => {
                const on = avoid.groups.includes(k);
                return (
                  <button
                    key={k}
                    className={on ? "tag on" : "tag"}
                    aria-pressed={on}
                    onClick={() =>
                      updateAvoid({
                        ...avoid,
                        groups: on
                          ? avoid.groups.filter((x) => x !== k)
                          : [...avoid.groups, k],
                      })
                    }
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
                    onClick={() =>
                      updateAvoid({
                        ...avoid,
                        custom: avoid.custom.filter((x) => x !== w),
                      })
                    }
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
              <button
                className="btn"
                onClick={addAvoidWord}
                disabled={!newAvoid.trim()}
              >
                Add
              </button>
            </div>
          </section>
        )}










        <FeaturesSection />

        <AiAllowance />

        <section>
          <h2 className="h3">Recipe reader</h2>
          <p className="muted small">
            How carefully Cardamix reads your cards, websites and text. Standard
            stretches your AI much further but may misread messy handwriting —
            you can always fix a mistake with Edit.
          </p>
          <div
            className="model-list"
            role="radiogroup"
            aria-label="Recipe reader"
          >
            {availableModels().map((m) => {
              const mine = avgFor(m.id);
              // Typical card scan: ~3,500 tokens in (photo + instructions), ~4,000 out (reasoning + recipe).
              const typical = costOf(m, 3500, 4000);
              return (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={modelId === m.id}
                  className={
                    modelId === m.id ? "model-option on" : "model-option"
                  }
                  onClick={() => {
                    setModel(m.id);
                    setModelId(m.id);
                  }}
                >
                  <span className="model-head">
                    <strong>{m.label}</strong>
                    <span className="model-cost">
                      {ownKey()
                        ? mine
                          ? `your average ${money(mine.avg)}`
                          : `≈ ${money(typical)} per card`
                        : hasPlus()
                          ? `≈ ${Math.round(allowanceFor() / typical)} scans a month`
                          : "5 free recipe adds a month"}
                    </span>
                  </span>
                  <span className="muted small">{m.blurb}</span>
                </button>
              );
            })}
          </div>
          {!hasPlus() && !ownKey() && (
            <p className="muted small">
              The free plan reads recipes with Standard.{" "}
              <a href={href({ name: "plus" })}>Plus</a> adds Advanced, better
              for messy handwriting.
            </p>
          )}
        </section>

        <AppLockSection />

        {/* Your own Anthropic key lives on the owner dashboard now; a key already saved on this phone can still be removed here. */}
        {ownKey() && <OwnKeySection />}

        <section>
          <h2 className="h3">Backup</h2>
          <p className="muted small">
            {signedIn
              ? "Everything is backed up to your account automatically. A backup file is an extra copy of your recipes that you keep yourself."
              : "Recipes are saved on this phone. Clearing this site's data in your browser settings (or deleting the app) erases them, so sign in to cloud backup below or export a backup now and then."}
            {persisted === true &&
              " This browser has agreed not to clear them on its own to free up space."}
          </p>
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

        <CloudSection />

        <p className="small settings-footer">
          <button
            className="link-btn small"
            onClick={() => {
              restartTour();
              navigate({ name: "library" });
            }}
          >
            Take the tour again
          </button>{" "}
          · <a href={href({ name: "privacy" })}>Privacy policy</a> ·{" "}
          <a href={href({ name: "terms" })}>Terms of service</a> ·{" "}
          <a href={href({ name: "copyright" })}>Copyright</a>
          {admin && (
            <>
              {" "}
              · <a href={href({ name: "owner" })}>Owner dashboard</a>
            </>
          )}
        </p>
      </main>
    </>
  );
}
