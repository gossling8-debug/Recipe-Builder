/**
 * Your plan (Free or Plus) and AI allowance, from the app's server. The server
 * works out Plus from Stripe, so it can't be switched on from the phone; this
 * keeps a copy so the app knows which features to show while offline.
 */
import { fb, user } from "./cloud";

export interface MyPlan {
  plan: "free" | "plus" | "family";
  /** "household": on someone else's Family plan (owner = who pays). */
  source?: "stripe" | "comp" | "beta" | "none" | "household";
  owner?: string;
  status?: string;
  /** Plus billed monthly or yearly. */
  interval?: "month" | "year" | null;
  renews?: number | null;
  cancelsAt?: number | null;
}
export interface AiUsage {
  month: string;
  spent: number;
  limit: number;
  uses: number;
  /** This month's counted requests by kind: scan (recipe adds), create… */
  counts?: Record<string, number>;
}

const KEY = "recipe-builder.myPlan";
let memory: MyPlan = { plan: "free" };

export function myPlan(): MyPlan {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MyPlan;
  } catch {
    /* blocked */
  }
  return memory;
}
/** Keeps the server's answer on this phone. */
export function remember(p: MyPlan) {
  memory = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* session only */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("features-changed"));
}

export async function callable<T>(name: string, data?: unknown): Promise<T> {
  const { app } = await fb();
  const f = await import("firebase/functions");
  const functions = f.getFunctions(app, "us-central1");
  if (import.meta.env.VITE_FIREBASE_EMULATOR && !(functions as unknown as { _emu?: boolean })._emu) {
    f.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    (functions as unknown as { _emu?: boolean })._emu = true;
  }
  try {
    const res = await f.httpsCallable<unknown, T>(functions, name, { timeout: 30_000 })(data);
    return res.data;
  } catch (e) {
    // Firebase adds the HTTP status to the server's message ("… [400]"); people only need the message.
    if (e instanceof Error) e.message = e.message.replace(/\s*\[\d{3}\]$/, "");
    throw e;
  }
}

const friendly = (e: unknown) => {
  const msg = ((e as { message?: string })?.message ?? String(e)).replace(/\s*\[\d+\]$/, "");
  return /internal|not-found|unavailable|failed to fetch/i.test(msg) && !/subscription/i.test(msg)
    ? "Couldn't reach Cardamix. Check your internet connection and try again."
    : msg;
};

/** Asks the server for your current plan (after signing in, and after paying). */
export async function refreshMyPlan(): Promise<MyPlan> {
  if (!(await user())) return myPlan();
  remember(fromServer(await callable<MyPlan>("refreshPlan")));
  return myPlan();
}

const fromServer = (p: MyPlan): MyPlan => ({
  plan: p.plan,
  source: p.source,
  owner: p.owner,
  status: p.status,
  interval: p.interval ?? null,
  renews: p.renews,
  cancelsAt: p.cancelsAt,
});

/**
 * Follows this account's plan as the server saves it, so a change made elsewhere —
 * Stripe reporting a cancellation or a failed card, or the payer of a Family plan
 * changing it — shows at once without reopening the app. Returns a stop function.
 */
export async function watchMyPlan(uid: string): Promise<() => void> {
  const { db, f } = await fb();
  return f.onSnapshot(
    f.doc(db, "plans", uid),
    (snap) => {
      if (snap.metadata.fromCache) return; // an older copy; the server's answer follows
      const p = snap.data() as MyPlan | undefined;
      if (p?.plan) remember(fromServer(p));
    },
    () => {
      /* offline or not allowed: the copy on this phone stays */
    },
  );
}

/** Moving from Plus to Family: what's charged today (only the difference, for the rest of the period paid). */
export interface FamilyQuote {
  amountDue: number; // cents
  currency: string;
  prorationDate: number;
  then: number; // cents per interval afterwards
  interval: "month" | "year";
  /** Monthly ↔ yearly: a new Family period starts today, less credit for the unused Plus time. */
  newPeriod?: boolean;
}

/**
 * Starts Stripe Checkout for Plus or Family (the page moves to Stripe). Plus → Family switches the
 * subscription in place: the first call returns the amount for the cook to confirm ("quote"); calling
 * again with that quote makes the change.
 */
export async function upgrade(
  interval: "monthly" | "yearly",
  tier: "plus" | "family" = "plus",
  confirm?: FamilyQuote,
): Promise<{ kind: "moved" } | { kind: "upgraded" } | { kind: "quote"; quote: FamilyQuote }> {
  try {
    const r = await callable<{ url?: string; upgraded?: boolean; quote?: FamilyQuote }>("checkout", {
      interval,
      tier,
      ...(confirm ? { confirm: true, prorationDate: confirm.prorationDate } : {}),
    });
    if (r.quote) return { kind: "quote", quote: r.quote };
    if (r.upgraded) {
      await refreshMyPlan();
      return { kind: "upgraded" };
    }
    if (r.url) location.assign(r.url);
    return { kind: "moved" };
  } catch (e) {
    throw new Error(friendly(e));
  }
}

/** Opens Stripe's page to change the card, see invoices or cancel. */
export async function manageSubscription(): Promise<void> {
  try {
    const { url } = await callable<{ url: string }>("billingPortal");
    location.assign(url);
  } catch (e) {
    throw new Error(friendly(e));
  }
}

/** Before deleting the account: cancel any subscription and clear the server's records. */
export async function closeMyAccount(): Promise<void> {
  try {
    await callable("closeMyAccount");
  } catch (e) {
    throw new Error(`Couldn't cancel your subscription, so nothing was deleted. ${friendly(e)}`);
  }
}

/** This month's AI use (null before the first AI request). */
export async function loadAiUsage(): Promise<AiUsage | null> {
  const u = await user();
  if (!u) return null;
  const { db, f } = await fb();
  // Family: the household's shared allowance, kept under the payer's id.
  const p = myPlan();
  const id = p.plan === "family" ? `household_${p.owner ?? u.uid}` : u.uid;
  const snap = await f.getDoc(f.doc(db, "aiUsage", id));
  const d = snap.data() as AiUsage | undefined;
  return d && d.month === new Date().toISOString().slice(0, 7) ? d : null;
}

/** Monthly AI allowance in dollars — kept in step with functions/lib/guard.js. */
export const ALLOWANCE = { free: 0.4, plus: 2.5, plus_yearly: 2.25, family: 5, family_yearly: 4.5 };
/** Accounts on one Family plan — kept in step with functions/lib/guard.js. */
export const HOUSEHOLD_MAX = 6;
/** Free accounts each month — kept in step with functions/lib/guard.js. */
export const FREE_LIMITS = { scan: 5, create: 3 };
/** The allowance that applies to you: free, Plus monthly or Plus yearly. */
export const allowanceFor = (p: MyPlan = myPlan()) =>
  p.plan === "family"
    ? p.interval === "year" ? ALLOWANCE.family_yearly : ALLOWANCE.family
    : p.plan !== "free" ? (p.interval === "year" ? ALLOWANCE.plus_yearly : ALLOWANCE.plus) : ALLOWANCE.free;
/** How many free recipe adds / created recipes are left this month (usage from loadAiUsage). */
export function freeLeft(kind: "scan" | "create", usage: AiUsage | null): number {
  return Math.max(0, FREE_LIMITS[kind] - (usage?.counts?.[kind] ?? 0));
}
