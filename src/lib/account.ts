import { fb, pauseSync, user } from "./cloud";
import { myCookbooks, type Cookbook } from "./family";
import { forgetSyncedAccount } from "./stateSync";

/**
 * "Delete my account": removes the cloud account and everything stored with
 * it — backed-up recipes, photos, lists and settings, cookbooks this person
 * owns, and recipes they shared into other people's cookbooks. What's on this
 * phone stays (it's theirs; Settings → Export backup still works).
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
    // Family cookbooks
    const books: Cookbook[] = await myCookbooks();
    for (const book of books) {
      const recipes = f.collection(db, "cookbooks", book.id, "recipes");
      if (book.owner === u.uid) {
        for (const d of (await f.getDocs(recipes)).docs) await f.deleteDoc(d.ref);
        await f.deleteDoc(f.doc(db, "cookbooks", book.id));
      } else {
        for (const d of (await f.getDocs(f.query(recipes, f.where("sharedBy", "==", u.uid)))).docs) await f.deleteDoc(d.ref);
        await f.updateDoc(f.doc(db, "cookbooks", book.id), {
          members: book.members.filter((m) => m !== u.uid),
          [`names.${u.uid}`]: f.deleteField(),
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
    try {
      localStorage.removeItem("recipe-builder.cloud.deletes");
    } catch {
      /* ignore */
    }
  } finally {
    pauseSync(false);
  }
}
