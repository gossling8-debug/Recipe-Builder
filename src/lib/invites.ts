import { fb, user } from "./cloud";

/**
 * Invites by email: a member of a shared shopping list or a cookbook invites
 * someone by the email they use for Cardamix, and it's waiting for them in
 * the app next time they open it — no link to open or paste. (Invite links
 * still work, for someone without an account yet.)
 *
 * Firestore invites/{id}: { kind, target, email, fromUid, fromName, title, at }.
 * Only the sender and the invited person (email confirmed) can see one.
 */
export type InviteKind = "shop" | "book" | "household";
export interface Invite {
  id: string;
  kind: InviteKind;
  target: string;
  email: string;
  fromUid: string;
  fromName: string;
  title: string;
  at: number;
}

/** A tidied email address, or null if it doesn't look like one. */
export function cleanEmail(s: string): string | null {
  const e = s.trim().toLowerCase();
  return e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/** The newest invite to each list or cookbook (someone may have been invited twice). */
export function newestPerTarget(invites: Invite[]): Invite[] {
  const best = new Map<string, Invite>();
  for (const i of invites) {
    const k = `${i.kind}:${i.target}`;
    if (!best.has(k) || best.get(k)!.at < i.at) best.set(k, i);
  }
  return [...best.values()].sort((a, b) => b.at - a.at);
}

export async function sendInvite(kind: InviteKind, target: string, emailText: string, fromName: string, title: string): Promise<void> {
  const email = cleanEmail(emailText);
  if (!email) throw new Error("That doesn't look like an email address.");
  const u = await user();
  if (!u) throw new Error("Sign in first.");
  if (email === u.email?.toLowerCase()) throw new Error("That's your own email — enter theirs.");
  const { db, f } = await fb();
  await f.addDoc(f.collection(db, "invites"), {
    kind,
    target,
    email,
    fromUid: u.uid,
    fromName: fromName.trim().slice(0, 40) || "Someone",
    title: title.slice(0, 60),
    at: Date.now(),
  });
}

/** Invites waiting for me (none until my email is confirmed). */
export async function myInvites(): Promise<Invite[]> {
  const u = await user();
  if (!u?.email || !u.emailVerified) return [];
  const { db, f } = await fb();
  const q = await f.getDocs(f.query(f.collection(db, "invites"), f.where("email", "==", u.email.toLowerCase())));
  return newestPerTarget(q.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invite, "id">) })));
}

/** "No thanks", or done with: every invite to me for that list or cookbook goes. */
export async function clearInvitesFor(kind: InviteKind, target: string): Promise<void> {
  const u = await user();
  if (!u?.email || !u.emailVerified) return;
  const { db, f } = await fb();
  const q = await f.getDocs(f.query(f.collection(db, "invites"), f.where("email", "==", u.email.toLowerCase())));
  await Promise.all(q.docs.filter((d) => d.data().kind === kind && d.data().target === target).map((d) => f.deleteDoc(d.ref)));
  window.dispatchEvent(new Event("invites-changed"));
}
