/**
 * The owner dashboard's numbers, worked out from plain records so they can be
 * tested without Firebase. Nothing here names a person: no emails or account
 * ids are returned, only counts and amounts.
 */
import { monthKey } from "./guard.js";

const DAY = 86_400_000;
const PRICE = { month: 4.49, year: 34.99 };

/**
 * @param {object} i
 * @param {{ created: number, lastActive: number, verified: boolean }[]} i.users   from Firebase Auth
 * @param {{ plan?: string, source?: string, interval?: string }[]} i.plans        plans/{uid}
 * @param {{ month?: string, spent?: number, uses?: number, counts?: Record<string, number>, plan?: string }[]} i.usage  aiUsage/{uid}
 * @param {{ reporters?: Record<string, boolean> }[]} i.mix                         mix/{id}
 * @param {number} i.cookbooks
 * @param {{ message?: string, screen?: string, app?: string, device?: string, stack?: string, at?: number }[]} i.errors  newest first
 * @param {number} [i.now]
 * @param {number} [i.hideAfter]  reports that hide a Mix recipe
 */
export function summarize({ users, plans, usage, mix, cookbooks, errors, now = Date.now(), hideAfter = 3 }) {
  const since = (days) => now - days * DAY;
  const accounts = {
    total: users.length,
    verified: users.filter((u) => u.verified).length,
    new7: users.filter((u) => u.created >= since(7)).length,
    new30: users.filter((u) => u.created >= since(30)).length,
    active7: users.filter((u) => u.lastActive >= since(7)).length,
    active30: users.filter((u) => u.lastActive >= since(30)).length,
  };

  const paying = plans.filter((p) => p.plan === "plus" && p.source === "stripe");
  const monthly = paying.filter((p) => p.interval !== "year").length;
  const yearly = paying.filter((p) => p.interval === "year").length;
  const plus = {
    monthly,
    yearly,
    comp: plans.filter((p) => p.plan === "plus" && p.source === "comp").length,
    beta: plans.filter((p) => p.plan === "plus" && p.source === "beta").length,
    // Before Stripe's fees; yearly spread over 12 months.
    revenuePerMonth: round(monthly * PRICE.month + (yearly * PRICE.year) / 12),
  };

  const month = monthKey(now);
  const thisMonth = usage.filter((u) => u.month === month);
  const byKind = {};
  for (const u of thisMonth) for (const [k, n] of Object.entries(u.counts ?? {})) byKind[k] = (byKind[k] ?? 0) + n;
  const byPlan = {};
  for (const u of thisMonth) {
    const k = u.plan ?? "free";
    byPlan[k] = round((byPlan[k] ?? 0) + (u.spent ?? 0));
  }
  const spent = thisMonth.map((u) => u.spent ?? 0).sort((a, b) => b - a);
  const ai = {
    month,
    spent: round(spent.reduce((a, b) => a + b, 0)),
    uses: thisMonth.reduce((a, u) => a + (u.uses ?? 0), 0),
    people: thisMonth.filter((u) => (u.uses ?? 0) > 0).length,
    byKind,
    byPlan,
    topSpends: spent.slice(0, 5).map(round),
  };

  const reports = mix.map((m) => Object.keys(m.reporters ?? {}).length);
  const content = {
    mixRecipes: mix.length,
    mixReported: reports.filter((n) => n > 0).length,
    mixHidden: reports.filter((n) => n >= hideAfter).length,
    cookbooks,
  };

  // Error reports grouped by message, most frequent first.
  const groups = new Map();
  for (const e of errors) {
    const key = (e.message ?? "").slice(0, 300);
    const g = groups.get(key) ?? { message: key, count: 0, lastAt: 0, screens: [], apps: [], stack: e.stack ?? "", device: e.device ?? "" };
    g.count++;
    if ((e.at ?? 0) > g.lastAt) g.lastAt = e.at ?? 0;
    if (e.screen && !g.screens.includes(e.screen) && g.screens.length < 5) g.screens.push(e.screen);
    if (e.app && !g.apps.includes(e.app) && g.apps.length < 3) g.apps.push(e.app);
    groups.set(key, g);
  }
  const errorsOut = {
    total: errors.length,
    last7: errors.filter((e) => (e.at ?? 0) >= since(7)).length,
    groups: [...groups.values()].sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, 15),
  };

  return { at: now, accounts, plus, ai, content, errors: errorsOut };
}

const round = (n) => Math.round(n * 100) / 100;
