/**
 * Your plan (Free or Plus) and AI allowance, from the app's server. The server
 * works out Plus from Stripe, so it can't be switched on from the phone; this
 * keeps a copy so the app knows which features to show while offline.
 */
import { fb, user } from "./cloud";

export interface MyPlan {
  plan: "free" | "plus";
  source?: "stripe" | "comp" | "beta" | "none";
  status?: string;
  renews?: number | null;
  cancelsAt?: number | null;
}
export interface AiUsage {
  month: string;
  spent: number;
  limit: number;
  uses: number;
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

async function callable<T>(name: string, data?: unknown): Promise<T> {
  const { app } = await fb();
  const f = await import("firebase/functions");
  const functions = f.getFunctions(app, "us-central1");
  if (import.meta.env.VITE_FIREBASE_EMULATOR && !(functions as unknown as { _emu?: boolean })._emu) {
    f.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    (functions as unknown as { _emu?: boolean })._emu = true;
  }
  const res = await f.httpsCallable<unknown, T>(functions, name, { timeout: 30_000 })(data);
  return res.data;
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
  const p = await callable<MyPlan>("refreshPlan");
  remember({ plan: p.plan, source: p.source, status: p.status, renews: p.renews, cancelsAt: p.cancelsAt });
  return myPlan();
}

/** Starts Stripe Checkout for Plus; the page moves to Stripe. */
export async function upgrade(interval: "monthly" | "yearly"): Promise<void> {
  try {
    const { url } = await callable<{ url: string }>("checkout", { interval });
    location.assign(url);
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
  const snap = await f.getDoc(f.doc(db, "aiUsage", u.uid));
  const d = snap.data() as AiUsage | undefined;
  return d && d.month === new Date().toISOString().slice(0, 7) ? d : null;
}

/** Monthly AI allowance in dollars — kept in step with functions/lib/guard.js. */
export const ALLOWANCE = { free: 0.25, plus: 2.5 };
