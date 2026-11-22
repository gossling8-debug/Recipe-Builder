import { useEffect, useState } from "react";
import Header from "./Header";
import OwnKeySection from "./OwnKeySection";
import LuluKeysSection from "./LuluKeysSection";
import AppLookSection from "./AppLookSection";
import CopyrightEmailSection from "./CopyrightEmailSection";
import { href } from "../lib/route";
import { amAdmin } from "../lib/mix";
import {
  clearErrorReports,
  confirmEmailFor,
  KIND_LABELS,
  ownerStats,
  type OwnerStats,
} from "../lib/owner";
import { Loading } from "./LogoLoader";

const money = (n: number) => `$${n.toFixed(2)}`;
const when = (t: number) =>
  new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
// "plus" also covers the testing period and gifted Plus, so it isn't labeled monthly.
const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  plus: "Plus",
  plus_yearly: "Plus yearly",
};
const errText = (e: unknown) =>
  ((e as { message?: string })?.message ?? String(e)).replace(
    /\s*\[\d+\]$/,
    "",
  );

/** The owner dashboard (admins only): accounts, Plus, AI cost this month, The Mix and error reports. */
export default function OwnerPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      setStats(await ownerStats());
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  }
  useEffect(() => {
    amAdmin().then((ok) => {
      setAllowed(ok);
      if (ok) void load();
    });
  }, []);

  async function clear() {
    if (
      !confirm(
        "Delete all error reports? Read them first: this can't be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      await clearErrorReports();
      await load();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  const s = stats;
  const free = s
    ? Math.max(
        0,
        s.accounts.total -
          s.plus.monthly -
          s.plus.yearly -
          (s.plus.familyMonthly ?? 0) -
          (s.plus.familyYearly ?? 0) -
          (s.plus.household ?? 0) -
          s.plus.comp -
          s.plus.beta,
      )
    : 0;
  return (
    <>
      <Header title="Owner dashboard" back={href({ name: "settings" })} />
      <main className="page owner">
        {allowed === false && (
          <div className="callout">Only the app's owner can see this page.</div>
        )}
        {error && <div className="callout error">{error}</div>}
        {allowed && !s && !error && <Loading />}
        {s && (
          <>
            <p className="muted small">
              As of {when(s.at)}. Counts only: no names or emails.{" "}
              <button className="link-btn small" disabled={busy} onClick={load}>
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            </p>

            <section>
              <h2 className="h3">Accounts</h2>
              <div className="owner-grid">
                <Stat n={s.accounts.total} label="accounts" />
                <Stat n={s.accounts.active7} label="active this week" />
                <Stat n={s.accounts.new7} label="new this week" />
                <Stat n={s.accounts.new30} label="new in 30 days" />
              </div>
              <p className="muted small">
                {s.accounts.active30} active in the last 30 days ·{" "}
                {s.accounts.verified} of {s.accounts.total} confirmed their
                email.
              </p>
            </section>

            <section>
              <h2 className="h3">Paying</h2>
              <div className="owner-grid">
                <Stat n={s.plus.monthly} label="Plus monthly" />
                <Stat n={s.plus.yearly} label="Plus yearly" />
                <Stat n={s.plus.familyMonthly ?? 0} label="Family monthly" />
                <Stat n={s.plus.familyYearly ?? 0} label="Family yearly" />
                <Stat
                  n={money(s.plus.revenuePerMonth)}
                  label="a month, before Stripe fees"
                />
              </div>
              <p className="muted small">
                {s.plus.household ?? 0} more on someone's Family plan. Free Plus: {s.plus.beta} in the testing period, {s.plus.comp}{" "}
                gifted. On the free plan: {free}.
                {s.plus.beta > 0 &&
                  " (The testing period gives everyone Plus until it's switched off.)"}
              </p>
            </section>

            {s.upgrade && (
              <section>
                <h2 className="h3">Toward upgrading</h2>
                <p className="muted small">People who reached each step at least once, and how many of them pay now.</p>
                <table className="owner-funnel">
                  <tbody>
                    {(
                      [
                        ["samplesTried", "Tried the sample recipes"],
                        ["limitHit", "Used up the free recipe adds"],
                        ["cardSeen", "Saw the Plus card"],
                        ["cardDismissed", "Tapped “Not now”"],
                        ["plansOpened", "Opened the plans page (on the free plan)"],
                      ] as const
                    ).map(([k, label]) => (
                      <tr key={k}>
                        <th scope="row">{label}</th>
                        <td>{s.upgrade![k].reached}</td>
                        <td className="muted">{s.upgrade![k].reached ? `${s.upgrade![k].payNow} pay now (${Math.round((100 * s.upgrade![k].payNow) / s.upgrade![k].reached)}%)` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section>
              <h2 className="h3">AI this month</h2>
              <div className="owner-grid">
                <Stat n={money(s.ai.spent)} label="AI cost (list price)" />
                <Stat n={s.ai.uses} label="requests" />
                <Stat n={s.ai.people} label="people used AI" />
              </div>
              {Object.keys(s.ai.byKind).length > 0 && (
                <ul className="owner-list">
                  {Object.entries(s.ai.byKind)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => (
                      <li key={k}>
                        <span>{KIND_LABELS[k] ?? k}</span>
                        <span>{n}</span>
                      </li>
                    ))}
                </ul>
              )}
              <p className="muted small">
                Cost by plan:{" "}
                {Object.entries(s.ai.byPlan)
                  .map(([p, v]) => `${PLAN_NAMES[p] ?? p} ${money(v)}`)
                  .join(" · ") || "none yet"}
                .
                {s.ai.topSpends.length > 0 &&
                  ` Highest single accounts: ${s.ai.topSpends.map(money).join(", ")}.`}{" "}
                Requests made with someone's own API key aren't included. Your
                exact bill is in the Anthropic Console.
              </p>
            </section>

            <section>
              <h2 className="h3">Recipes shared</h2>
              <div className="owner-grid">
                <Stat n={s.content.mixRecipes} label="in The Mix" />
                <Stat n={s.content.mixReported} label="reported" />
                <Stat n={s.content.mixHidden} label="hidden by reports" />
                <Stat n={s.content.cookbooks} label="cookbooks" />
              </div>
              {s.content.mixReported > 0 && (
                <p className="small">
                  <a href={href({ name: "mix" })}>Open The Mix</a> to look at
                  reported recipes and take them down.
                </p>
              )}
            </section>

            {s.appCheck && <AppCheckSection counts={s.appCheck} />}

            <ConfirmSomeone />

            <OwnKeySection />
            <LuluKeysSection />
            <AppLookSection />
            <CopyrightEmailSection />

            <section>
              <h2 className="h3">Error reports</h2>
              <p className="muted small">
                {s.errors.total === 0
                  ? "None. Crashes and errors people hit show up here."
                  : `${s.errors.total} saved (${s.errors.last7} this week). Tap one for details.`}
              </p>
              {s.errors.groups.length > 0 && (
                <ul className="owner-errors">
                  {s.errors.groups.map((g, i) => (
                    <li key={i}>
                      <button
                        className="owner-error"
                        onClick={() => setOpen(open === i ? null : i)}
                        aria-expanded={open === i}
                      >
                        <span className="owner-error-count">{g.count}×</span>
                        <span className="owner-error-msg">
                          {g.message || "(no message)"}
                        </span>
                      </button>
                      {open === i && (
                        <div className="owner-error-detail small">
                          <div>Last: {when(g.lastAt)}</div>
                          <div>Screens: {g.screens.join(", ") || "?"}</div>
                          <div>App version: {g.apps.join(", ") || "?"}</div>
                          {g.device && <div className="muted">{g.device}</div>}
                          {g.stack && <pre>{g.stack}</pre>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {s.errors.total > 0 && (
                <button className="btn" disabled={busy} onClick={clear}>
                  Delete all error reports
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Stat(props: { n: number | string; label: string }) {
  return (
    <div className="owner-stat">
      <strong>{props.n}</strong>
      <span>{props.label}</span>
    </div>
  );
}

/** When someone's confirmation email never arrives: confirm their address by hand (you know who they are). */
function ConfirmSomeone() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  return (
    <section>
      <h2 className="h3">Confirm someone's email</h2>
      <p className="muted small">
        If someone's confirmation email never arrives, enter their account's
        email exactly. Then they tap “I've confirmed it” in the app (or sign out
        and back in).
      </p>
      <form
        className="owner-confirm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setNote("");
          try {
            const r = await confirmEmailFor(email.trim());
            setNote(
              r.already
                ? `${email.trim()} was already confirmed.`
                : `Confirmed ${email.trim()}.`,
            );
            setEmail("");
          } catch (err) {
            setNote(errText(err));
          }
          setBusy(false);
        }}
      >
        <input
          className="text-input"
          type="email"
          placeholder="their@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Their email"
        />
        <button
          className="btn primary"
          type="submit"
          disabled={busy || !email.trim()}
        >
          {busy ? "Confirming…" : "Confirm"}
        </button>
      </form>
      {note && (
        <p className="small" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

/** App Check, watch-only: how many requests came from the real app over the last 7 days. */
function AppCheckSection({ counts }: { counts: NonNullable<OwnerStats["appCheck"]> }) {
  const rows = [
    ["AI requests", counts.ai],
    ["Other server requests", counts.call],
  ] as const;
  const all = rows.reduce((n, [, c]) => n + c.verified + c.missing + c.invalid, 0);
  const notVerified = rows.reduce((n, [, c]) => n + c.missing + c.invalid, 0);
  return (
    <section>
      <h2 className="h3">App Check (last 7 days)</h2>
      <table className="owner-appcheck">
        <thead>
          <tr>
            <th scope="col">Requests</th>
            <th scope="col">From the app</th>
            <th scope="col">No check</th>
            <th scope="col">Failed check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, c]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{c.verified}</td>
              <td>{c.missing}</td>
              <td>{c.invalid}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        {all === 0
          ? "No requests counted yet."
          : notVerified === 0
            ? "Every request came from the app. Requests aren't turned away yet; that's switched on separately."
            : "Requests without a passing check are still allowed for now. Older copies of the app (before an update) show up as “No check”."}
      </p>
    </section>
  );
}
