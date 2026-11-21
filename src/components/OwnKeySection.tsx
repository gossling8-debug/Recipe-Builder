import { useState } from "react";
import { getApiKey, ownKey, setApiKey } from "../lib/settings";
import { MODELS } from "../lib/models";
import { loadUsage, money } from "../lib/usage";

/**
 * A personal Anthropic key: AI then goes straight from this phone to Anthropic,
 * billed to that key, with the Expert reader available. On the owner dashboard
 * (and in Settings only while a key is saved on the phone, so it can be removed).
 */
export default function OwnKeySection({ open = false }: { open?: boolean }) {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const [keyError, setKeyError] = useState("");
  const usage = loadUsage();
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).getTime();
  const thisMonth = usage.filter((u) => u.at >= monthStart);

  function save() {
    setKeyError(
      setApiKey(key)
        ? ""
        : "This browser won't let the app remember your key, so it's kept only until you close the app.",
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <details className="advanced" open={open}>
      <summary>Your own API key (advanced)</summary>
      <section>
        <h3>Your own Anthropic key</h3>
        <p className="muted small">
          Optional, for advanced users. With your own key, AI is billed to your
          Anthropic account instead of using your monthly allowance, and the
          Expert model is available. Create one at console.anthropic.com → API
          Keys. It's stored only on this phone. Leave it empty to use Cardamix's
          AI.
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

      {ownKey() && (
        <section>
          <h3>Spending</h3>
          {usage.length === 0 ? (
            <p className="muted small">
              Nothing yet. After your first scan this shows what the app has
              cost you.
            </p>
          ) : (
            <>
              <p>
                This month:{" "}
                <strong>
                  {money(thisMonth.reduce((s, u) => s + u.cost, 0))}
                </strong>{" "}
                <span className="muted">
                  ({thisMonth.length}{" "}
                  {thisMonth.length === 1 ? "request" : "requests"})
                </span>
              </p>
              <ul className="usage-list small">
                {usage
                  .slice(-5)
                  .reverse()
                  .map((u, i) => (
                    <li key={i}>
                      <span>
                        {
                          {
                            scan: "Card scan",
                            website: "Website",
                            text: "Pasted text",
                            substitutes: "Substitutes",
                            nutrition: "Nutrition",
                            receipt: "Receipt",
                            pantryRecipe: "Pantry recipe",
                            prices: "Price estimates",
                            rewrite: "Rewritten for The Mix",
                            memory: "Memory page",
                            create: "Created recipe",
                          }[u.kind]
                        }{" "}
                        ·{" "}
                        {MODELS.find((m) => m.id === u.model)?.label ?? u.model}
                      </span>
                      <span>{money(u.cost)}</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
          <p className="muted small">
            Estimates from Anthropic's list prices and the size of each request.
            Your exact bill is in the Anthropic Console. Cheapest to most
            expensive: pasted text, websites, card photos.
          </p>
        </section>
      )}
    </details>
  );
}
