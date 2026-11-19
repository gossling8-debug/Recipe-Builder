import { fb, user } from "./cloud";
import { sendInvite } from "./invites";
import { callable, refreshMyPlan, type MyPlan } from "./subscription";

/**
 * Cardamix Family's household: the payer and up to 5 others, each with their
 * own account, sharing the plan and one AI allowance. The server keeps the
 * list (households/{payer}); joining needs an invite to your confirmed email.
 */
export interface Household {
  owner: string;
  members: string[];
  names: Record<string, string>;
}

export async function myHousehold(): Promise<Household | null> {
  const u = await user();
  if (!u) return null;
  const { db, f } = await fb();
  const q = await f.getDocs(f.query(f.collection(db, "households"), f.where("members", "array-contains", u.uid), f.limit(1)));
  const d = q.docs[0];
  return d ? (d.data() as Household) : null;
}

/** The payer invites someone (by the email they use for Cardamix). */
export async function inviteToHousehold(email: string, myName: string): Promise<void> {
  const u = await user();
  if (!u) throw new Error("Sign in first.");
  await sendInvite("household", u.uid, email, myName, "a Cardamix Family plan");
}

export async function joinHousehold(owner: string, myName: string): Promise<MyPlan> {
  await callable("joinHousehold", { owner, name: myName });
  window.dispatchEvent(new Event("invites-changed"));
  return refreshMyPlan();
}
export async function leaveHousehold(): Promise<MyPlan> {
  await callable("leaveHousehold");
  return refreshMyPlan();
}
export async function removeFromHousehold(uid: string): Promise<void> {
  await callable("removeFromHousehold", { uid });
}
