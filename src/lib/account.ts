import { fb, pauseSync, user } from "./cloud";
import { myCookbooks, type Cookbook } from "./family";
import { forgetSyncedAccount } from "./stateSync";
import { cloudState, syncNow } from "./cloud";
import { eraseThisPhone } from "./appLock";

const NOTE_KEY = "recipe-builder.accountNote";
/** A message for the sign-in screen after the page reloads (e.g. "Your account is deleted."). */
export function takeAccountNote(): string {
  try {
    const n = sessionStorage.getItem(NOTE_KEY) ?? "";
    sessionStorage.removeItem(NOTE_KEY);
    return n;
  } catch {
    return "";
  }
}
function leaveNote(n: string) {
  try {
    sessionStorage.setItem(NOTE_KEY, n);
  } catch {
    /* ignore */
  }
}

/**
 * Signs out. Nothing is cleared: the data waits on this phone (behind the
 * sign-in screen) for this account. If a different account signs in here
 * instead, the phone switches to that account's data (see startCloud).
 */
export async function signOutHere(): Promise<void> {
  await syncNow().catch(() => {});
  const unsynced = cloudState().status !== "synced";
  const { auth, a } = await fb();
  leaveNote(
    unsynced
      ? "You're signed out. Some recent changes haven't uploaded yet — they will when you sign in again on this phone."
      : "You're signed out. Everything is saved in your account.",
  );
  await a.signOut(auth);
  if (location.hash) location.hash = "";
}

/**
 * "Delete my account": removes the account and everything stored with it —
 * backed-up recipes, photos, lists and settings, and recipes and memories they
 * shared into family cookbooks (cookbooks with other members stay for them; one
 * nobody else is in is deleted) — then clears this
 * phone too. (Settings → Export backup first keeps a copy.)
 *
 * Firebase asks for the password again before deleting an account.
 */
/** Checks the cloud account's password (used to reset a forgotten app passcode). */
export async function verifyPassword(password: string): Promise<void> {
  const u = await user();
  if (!u || !u.email) throw new Error("You're not signed in.");
  const { a } = await fb();
  try {
    await a.reauthenticateWithCredential(u, a.EmailAuthProvider.credential(u.email, password));
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "auth/too-many-requests") throw new Error("Too many tries. Wait a few minutes and try again.");
    if (code === "auth/network-request-failed") throw new Error("Couldn't reach the cloud. Check your internet connection.");
    throw new Error("That password is wrong.");
  }
}

export async function deleteAccount(password: string): Promise<void> {
  const u = await user();
  if (!u || !u.email) throw new Error("You're not signed in.");
  const { db, a, f } = await fb();
  try {
    await a.reauthenticateWithCredential(u, a.EmailAuthProvider.credential(u.email, password));
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/missing-password")
      throw new Error("That password is wrong.");
    if (code === "auth/too-many-requests") throw new Error("Too many tries. Wait a few minutes and try again.");
    if (code === "auth/network-request-failed") throw new Error("Couldn't reach the cloud. Check your internet connection.");
    throw e;
  }

  pauseSync(true);
  try {
    // Stop any subscription first — if that fails, nothing is deleted.
    const { closeMyAccount } = await import("./subscription");
    await closeMyAccount();

    // Family cookbooks
    const books: Cookbook[] = await myCookbooks();
    for (const book of books) {
      const recipes = f.collection(db, "cookbooks", book.id, "recipes");
      const memories = f.collection(db, "cookbooks", book.id, "memories");
      const rest = book.members.filter((m) => m !== u.uid);
      if (rest.length === 0) {
        for (const sub of [recipes, memories, f.collection(db, "cookbooks", book.id, "memoryPhotos"), f.collection(db, "cookbooks", book.id, "meta")])
          for (const d of (await f.getDocs(sub)).docs) await f.deleteDoc(d.ref);
        await f.deleteDoc(f.doc(db, "cookbooks", book.id));
      } else {
        for (const d of (await f.getDocs(f.query(recipes, f.where("sharedBy", "==", u.uid)))).docs) await f.deleteDoc(d.ref);
        for (const d of (await f.getDocs(f.query(memories, f.where("by", "==", u.uid)))).docs) await f.deleteDoc(d.ref);
        for (const d of (await f.getDocs(f.query(f.collection(db, "cookbooks", book.id, "memoryPhotos"), f.where("by", "==", u.uid)))).docs) await f.deleteDoc(d.ref);
        // Others keep the cookbook; if this person owned it, the next member takes over.
        await f.updateDoc(f.doc(db, "cookbooks", book.id), {
          members: rest,
          [`names.${u.uid}`]: f.deleteField(),
          ...(book.owner === u.uid ? { owner: rest[0] } : {}),
        });
      }
    }

    // Everything under users/{uid}
    for (const name of ["recipes", "photos", "state"]) {
      const docs = (await f.getDocs(f.collection(db, "users", u.uid, name))).docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = f.writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    await a.deleteUser(u);
    forgetSyncedAccount();
    await eraseThisPhone();
  } catch (e) {
    pauseSync(false);
    throw e;
  }
  leaveNote("Your account and all its data are deleted.");
  location.replace(location.pathname); // back to the start, without the current screen's address
}
