import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import RecipeView from "./RecipeView";
import SearchBox from "./SearchBox";
import CookMode, { clearCookStart, cookStart } from "./CookMode";
import { TimerBar, useTimers } from "./Timers";
import { useToast } from "./Toast";
import { cloudState, subscribeCloud, type CloudState } from "../lib/cloud";
import { listRecipes, newId, saveRecipe } from "../lib/db";
import { duplicatesOf } from "../lib/duplicates";
import { feature } from "../lib/features";
import { recipeLink } from "../lib/link";
import { loadProgress, saveProgress } from "../lib/progress";
import { href, navigate } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";
import { searchRecipe, type SearchScope } from "../lib/search";
import { recipeToText, shareText } from "../lib/share";
import { applySwaps } from "../lib/swaps";
import { addToShopping } from "../lib/shopping";
import {
  HIDE_AFTER_REPORTS,
  REPORT_REASONS,
  amAdmin,
  getMix,
  latestMix,
  mixRating,
  publicName,
  publishToMix,
  publishedAt,
  rateMix,
  reportCount,
  reportMix,
  unpublish,
  mixId,
  type MixRecipe,
} from "../lib/mix";

function useCloud(): CloudState {
  const [s, setS] = useState(cloudState());
  useEffect(() => subscribeCloud(setS), []);
  return s;
}
const signedIn = (s: CloudState) => s.status !== "off" && s.status !== "signed-out";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const one = (n: number) => (Math.round(n * 10) / 10).toString();
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the original site";
  }
};

function NeedsAccount({ s }: { s: CloudState }) {
  return (
    <div className="callout">
      {s.status === "off" ? (
        <>The Mix needs cloud accounts, which aren't set up in this app yet.</>
      ) : (
        <>
          The Mix uses your account. <a href={href({ name: "settings" })}>Sign in in Settings</a>, then come back.
        </>
      )}
    </div>
  );
}

function MixStars({ m }: { m: MixRecipe }) {
  const r = mixRating(m);
  if (!r) return null;
  return (
    <span className="muted small">
      {" · "}
      <span className="row-stars">★</span> {one(r.average)} ({r.count})
    </span>
  );
}

// ---------- the list ----------
export function MixPage() {
  const s = useCloud();
  const on = signedIn(s);
  const [items, setItems] = useState<MixRecipe[] | null>(null);
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [order, setOrder] = useState<"newest" | "rating">("newest");
  useEffect(() => {
    if (!on) return;
    latestMix().then(setItems, (e) => setError(errText(e)));
    amAdmin().then(setAdmin, () => {});
  }, [on]);

  const q = query.trim();
  const found = new Map(q ? (items ?? []).map((m) => [m.id, searchRecipe({ ...m.recipe, tags: [...(m.recipe.tags ?? []), m.byName] }, q, scope)] as const) : []);
  const avg = (m: MixRecipe) => mixRating(m)?.average ?? -1;
  const shown = (items ?? [])
    // Reported by several people: hidden until an admin looks (still shown to its cook and admins).
    .filter((m) => reportCount(m) < HIDE_AFTER_REPORTS || m.by === s.uid || admin)
    .filter((m) => !q || found.get(m.id)?.match)
    .sort((a, b) => (order === "rating" ? avg(b) - avg(a) || Object.keys(b.ratings).length - Object.keys(a.ratings).length || b.at - a.at : b.at - a.at));

  return (
    <>
      <Header title="The Mix" back={href({ name: "library" })} returnToPrevious />
      <main className="page">
        <p className="muted small">
          Recipes cooks everywhere have shared. Save the ones you like to your recipes. To share one of yours, open it and tap{" "}
          <strong>Publish to The Mix</strong>.
        </p>
        {!on && <NeedsAccount s={s} />}
        {on && items === null && !error && <p className="muted">Loading…</p>}
        {items && items.length === 0 && <p className="muted">Nothing here yet. Be the first: open one of your recipes and publish it.</p>}
        {items && items.length > 0 && (
          <>
            <SearchBox query={query} scope={scope} onQuery={setQuery} onScope={setScope} />
            <div className="book-sort" role="radiogroup" aria-label="Order">
              {(
                [
                  ["newest", "Newest"],
                  ["rating", "Top rated"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} role="radio" aria-checked={order === v} className={order === v ? "chip active" : "chip"} onClick={() => setOrder(v)}>
                  {label}
                </button>
              ))}
            </div>
            {q && shown.length === 0 && <p className="muted">No recipes match “{q}”.</p>}
            <ul className="recipe-list">
              {shown.map((m) => (
                <li key={m.id} className="recipe-row">
                  <a className="recipe-card" href={href({ name: "mix", id: m.id })}>
                    <div className="thumb-placeholder" />
                    <div>
                      <div className="recipe-card-title">{m.recipe.title}</div>
                      <div className="muted small">
                        by {m.by === s.uid ? "you" : m.byName}
                        <MixStars m={m} />
                      </div>
                      {m.sourceUrl && <div className="muted small">From {host(m.sourceUrl)}</div>}
                      {(m.recipe.tags ?? []).length > 0 && <div className="muted small">{m.recipe.tags.join(" · ")}</div>}
                      {admin && reportCount(m) > 0 && <div className="small dup-flag">Reported by {reportCount(m)}</div>}
                      {q && (found.get(m.id)?.ingredientHits.length ?? 0) > 0 && (
                        <div className="small search-hit">Has: {found.get(m.id)!.ingredientHits.slice(0, 3).join(" · ")}</div>
                      )}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
    </>
  );
}

// ---------- one recipe ----------
export function MixRecipePage({ id }: { id: string }) {
  const s = useCloud();
  const on = signedIn(s);
  const [m, setM] = useState<MixRecipe | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(false);
  const [myCopy, setMyCopy] = useState<SavedRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [toast, showToast] = useToast();
  const timers = useTimers();
  const [cooking, setCooking] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  useEffect(() => {
    if (!on) return;
    getMix(id).then(setM, (e) => setError(errText(e)));
    amAdmin().then(setAdmin, () => {});
  }, [on, id]);
  useEffect(() => {
    if (m) listRecipes().then((all) => setMyCopy(duplicatesOf({ ...m.recipe }, all)[0]?.recipe ?? null), () => {});
  }, [m]);

  const mine = !!m && m.by === s.uid;
  const progressId = myCopy?.id ?? `mix-${id}`;
  const run = (fn: () => Promise<void>) => () => fn().catch((e) => setError(errText(e)));

  async function saveCopy(): Promise<SavedRecipe> {
    const saved: SavedRecipe = { ...m!.recipe, id: newId(), createdAt: Date.now(), photos: [], source: m!.sourceUrl ?? undefined };
    await saveRecipe(saved);
    saveProgress(saved.id, loadProgress(progressId));
    setMyCopy(saved);
    return saved;
  }
  const save = run(async () => {
    setSaving(true);
    try {
      const saved = await saveCopy();
      navigate({ name: "recipe", id: saved.id });
    } finally {
      setSaving(false);
    }
  });
  const myStars = m && s.uid ? m.ratings[s.uid] ?? 0 : 0;
  const rate = (n: number) =>
    run(async () => {
      if (!m || !s.uid) return;
      const stars = myStars === n ? null : n;
      const ratings = { ...m.ratings };
      if (stars) ratings[s.uid] = stars;
      else delete ratings[s.uid];
      const before = m;
      setM({ ...m, ratings });
      try {
        await rateMix(m.id, stars);
      } catch (e) {
        setM(before);
        throw e;
      }
    });
  const share = run(async () => {
    if (!m) return;
    const link = m.sourceUrl ?? (await recipeLink(m.recipe).catch(() => ""));
    const r = link ? await shareText(m.recipe.title, `${m.recipe.title}\nFrom The Mix in Cardamix:`, link) : await shareText(m.recipe.title, recipeToText(m.recipe, 1));
    if (r === "copied") showToast("Link copied — paste it in a message");
    if (r === "failed") showToast("Sharing isn't available in this browser");
  });
  const takeDown = run(async () => {
    if (!m) return;
    const msg = mine ? `Take “${m.recipe.title}” out of The Mix? Copies people saved stay theirs.` : `Take down “${m.recipe.title}” for everyone?`;
    if (!confirm(msg)) return;
    await unpublish(m.id);
    navigate({ name: "mix" }, true);
  });

  const r = m ? mixRating(m) : null;
  const hidden = !!m && reportCount(m) >= HIDE_AFTER_REPORTS && !mine && !admin;
  return (
    <>
      <Header
        title="The Mix"
        back={href({ name: "mix" })}
        returnToPrevious
        actions={
          m ? (
            <button className="icon-btn" onClick={share} aria-label="Share recipe">
              <Icon name="share" />
            </button>
          ) : null
        }
      />
      <main className="page">
        {!on && <NeedsAccount s={s} />}
        {m === null && <div className="callout error">This recipe isn't in The Mix any more.</div>}
        {hidden && <div className="callout">This recipe was reported by several cooks and is hidden while it's checked.</div>}
        {m && !hidden && (
          <>
            <p className="muted small shared-note">
              Published by {mine ? "you" : m.byName} · {new Date(m.at).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
              {admin && reportCount(m) > 0 ? ` · reported by ${reportCount(m)}` : ""}
            </p>
            {!mine && (
              <div className="rating-row" role="group" aria-label="Your rating">
                <span className="small muted">Your rating</span>
                <span className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={n <= myStars ? "star-pick on" : "star-pick"} aria-label={`${n} ${n === 1 ? "star" : "stars"}`} aria-pressed={myStars === n} onClick={rate(n)}>
                      <Icon name="star" size={24} filled={n <= myStars} />
                    </button>
                  ))}
                </span>
              </div>
            )}
            <p className="small">
              {r ? (
                <>
                  <span className="row-stars">★</span> <strong>{one(r.average)}</strong> from {r.count} {r.count === 1 ? "cook" : "cooks"}
                </>
              ) : (
                <span className="muted">No ratings yet.</span>
              )}
            </p>
            {myCopy && (
              <div className="callout small">
                In your recipes: <a href={href({ name: "recipe", id: myCopy.id })}>“{myCopy.title}”</a>
              </div>
            )}
            {m.sourceUrl ? (
              <section>
                <h2 className="recipe-title">{m.recipe.title}</h2>
                <p>
                  This recipe is from <strong>{host(m.sourceUrl)}</strong>. The Mix links to the original instead of copying it.
                </p>
                <div className="button-row">
                  <a className="btn primary" href={m.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Open it on {host(m.sourceUrl)}
                  </a>
                </div>
                <p className="muted small">To keep it, add it with Add Recipe → Website and paste the link.</p>
              </section>
            ) : (
              <>
                <TimerBar {...timers} />
                <RecipeView
                  key={`${progressId}-${viewKey}`}
                  recipe={m.recipe}
                  recipeId={progressId}
                  onStartCooking={feature("cookMode") ? () => (cookStart(progressId), setCooking(true)) : undefined}
                  listRow={
                    myCopy ? undefined : (
                      <div className="list-row">
                        <button
                          className="btn"
                          onClick={run(async () => {
                            const saved = await saveCopy();
                            const p = loadProgress(saved.id);
                            addToShopping(saved.id, p.scale, p.have.filter((i) => i < saved.ingredients.length));
                            showToast("Saved to your recipes and added to your shopping list");
                          })}
                        >
                          <Icon name="bag" size={18} /> Add to shopping list
                        </button>
                      </div>
                    )
                  }
                />
              </>
            )}
            <div className="button-row print-link">
              {!mine && (
                <button className="btn" onClick={() => setReporting(true)}>
                  <Icon name="warning" size={18} /> Report
                </button>
              )}
              {(mine || admin) && (
                <button className="btn danger" onClick={takeDown}>
                  <Icon name="trash" size={18} /> {mine ? "Take it out of The Mix" : "Take down"}
                </button>
              )}
            </div>
          </>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
      {m && !hidden && !mine && !myCopy && !m.sourceUrl && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save to my recipes"}
          </button>
        </div>
      )}
      {m && reporting && (
        <ReportSheet
          onClose={() => setReporting(false)}
          onReport={async (reason) => {
            await reportMix(m.id, reason);
            setM({ ...m, reporters: { ...m.reporters, [s.uid ?? ""]: true } });
            setReporting(false);
            showToast("Thanks — it's been reported");
          }}
          already={!!s.uid && !!m.reporters[s.uid]}
        />
      )}
      {m && cooking && (
        <CookMode
          recipe={m.recipe}
          recipeId={progressId}
          timers={timers}
          onLog={async () => clearCookStart(progressId)}
          onClose={() => {
            setCooking(false);
            setViewKey((k) => k + 1);
          }}
        />
      )}
      {toast}
    </>
  );
}

function ReportSheet(props: { onClose: () => void; onReport: (reason: string) => Promise<void>; already: boolean }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="sheet-backdrop" onClick={() => !busy && props.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Report this recipe" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Report this recipe</div>
        {props.already ? (
          <p>You've already reported it. Thank you.</p>
        ) : (
          <>
            <p className="muted small">What's wrong with it? Reports are private.</p>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="pick-row">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                <span>{r}</span>
              </label>
            ))}
          </>
        )}
        {error && <div className="callout error small">{error}</div>}
        <div className="button-row add-to-book-actions">
          {!props.already && (
            <button
              className="btn primary"
              disabled={!reason || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await props.onReport(reason);
                } catch (e) {
                  setError(errText(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? "Sending…" : "Report"}
            </button>
          )}
          <button className="btn" disabled={busy} onClick={props.onClose}>
            {props.already ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- on your own recipe ----------
/** "Publish to The Mix" on one of your recipes. */
export function PublishToMix({ recipe }: { recipe: SavedRecipe }) {
  const s = useCloud();
  const on = signedIn(s);
  const [at, setAt] = useState<number | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => publicName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (on) publishedAt(recipe.id).then(setAt, () => setAt(null));
  }, [on, recipe.id]);
  if (!on || at === undefined) return null;
  const changed = at !== null && (recipe.updatedAt ?? recipe.createdAt) > at;

  async function publish() {
    setBusy(true);
    setError("");
    try {
      await publishToMix(recipe, applySwaps(recipe), name);
      setAt(Date.now());
      setOpen(false);
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }
  async function takeOut() {
    if (!confirm(`Take “${recipe.title}” out of The Mix? Copies people saved stay theirs.`)) return;
    setBusy(true);
    try {
      await unpublish(mixId(s.uid ?? "", recipe.id));
      setAt(null);
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }

  return (
    <section className="mix-publish">
      <h3>The Mix</h3>
      {at !== null ? (
        <p className="small">
          <Icon name="check" size={16} /> Published in <a href={href({ name: "mix", id: mixId(s.uid ?? "", recipe.id) })}>The Mix</a>.{" "}
          {changed && (
            <button className="link-btn small" disabled={busy} onClick={() => setOpen(true)}>
              Update with my changes
            </button>
          )}{" "}
          <button className="link-btn small" disabled={busy} onClick={takeOut}>
            Take it out
          </button>
        </p>
      ) : !open ? (
        <button className="btn" onClick={() => setOpen(true)}>
          <Icon name="share" size={18} /> Publish to The Mix
        </button>
      ) : null}
      {open && (
        <div className="plan-card">
          <p className="small">
            {recipe.source ? (
              <>
                This recipe came from <strong>{host(recipe.source)}</strong>, so The Mix will show its title and a link to the original —
                not the recipe itself.
              </>
            ) : (
              <>
                Anyone using Cardamix will be able to see this recipe (as you cook it, with your swaps), the name below and when you
                published it. Your photos and notes stay private.
              </>
            )}
          </p>
          <label className="field">
            <span>Publish as</span>
            <input className="text-input" value={name} maxLength={40} placeholder="e.g. Grandma Carlson's Kitchen" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="button-row">
            <button className="btn primary" disabled={busy || !name.trim()} onClick={publish}>
              {busy ? "Publishing…" : at !== null ? "Update" : "Publish"}
            </button>
            <button className="btn" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <div className="callout error small">{error}</div>}
    </section>
  );
}
