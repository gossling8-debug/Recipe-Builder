import { fb, user } from "./cloud";

/**
 * The steps toward upgrading, noted the first time someone reaches each one, so the
 * owner dashboard can show totals (how many saw the Plus card, opened the plans page…
 * and how many of them now pay). Only the step and the time are kept; the dashboard
 * shows counts, never who. Deleted with the account.
 */
export type FunnelStep = "cardSeen" | "cardDismissed" | "plansOpened" | "limitHit" | "samplesTried";

const KEY = (step: FunnelStep, uid: string) => `recipe-builder.funnel.${uid}.${step}`;

export async function noteStep(step: FunnelStep): Promise<void> {
  try {
    const u = await user();
    if (!u) return;
    const key = KEY(step, u.uid);
    if (localStorage.getItem(key)) return; // already noted from this phone
    const { db, f } = await fb();
    await f.setDoc(f.doc(db, "funnel", u.uid), { [step]: Date.now() }, { merge: true });
    localStorage.setItem(key, "1");
  } catch {
    /* offline or storage blocked: it's only a count */
  }
}
