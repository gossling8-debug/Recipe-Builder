/**
 * Server-side data cleanup, with the Admin SDK (so it can't stop halfway the
 * way the app could, and reaches records the app can't):
 *  - deleteUserData: everything an account left anywhere, when it's deleted.
 *  - deleteVotesOn:  the private votes on a Mix recipe once it's gone.
 *  - migrateMix:     one-off, safe to repeat — moves The Mix's older ratings
 *    and reports (once readable by anyone, keyed by account id) into private
 *    votes, and older recipes whose id held the cook's account id to random ids.
 */
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { legacyRecipeId, totalsOf, voteDelta } from "./mixVotes.js";

/** A random Mix id, like the app's. */
export const randomMixId = () => Array.from(randomBytes(15), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);

async function deleteAll(query) {
  for (;;) {
    const q = await query.limit(400).get();
    if (q.empty) return;
    const batch = q.docs[0].ref.firestore.batch();
    q.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export const deleteVotesOn = (db, mixId) => deleteAll(db.collection("mixVotes").where("mixId", "==", mixId));

/** A Mix recipe with everything under it, and the votes on it. */
export async function deleteMixRecipe(db, mixId) {
  await db.recursiveDelete(db.doc(`mix/${mixId}`));
  await deleteVotesOn(db, mixId);
}

/** Takes one person's ratings and reports off every Mix recipe. */
export async function removeVotesBy(db, uid) {
  const votes = await db.collection("mixVotes").where("uid", "==", uid).get();
  for (const v of votes.docs) {
    await db.runTransaction(async (t) => {
      const fresh = await t.get(v.ref);
      if (!fresh.exists) return;
      const mixRef = db.doc(`mix/${fresh.data().mixId}`);
      const m = await t.get(mixRef);
      if (m.exists) {
        const d = voteDelta(fresh.data(), null);
        t.update(mixRef, { ratingSum: FieldValue.increment(d.ratingSum), ratingCount: FieldValue.increment(d.ratingCount), reportCount: FieldValue.increment(d.reportCount) });
      }
      t.delete(v.ref);
    });
  }
}

/** One person leaves a cookbook for good: what they added goes; the others keep the rest. */
export async function leaveBook(db, bookDoc, uid) {
  const b = bookDoc.data();
  const ref = bookDoc.ref;
  const rest = (b.members ?? []).filter((m) => m !== uid);
  if (rest.length === 0) return db.recursiveDelete(ref);
  for (const [sub, field] of [["recipes", "sharedBy"], ["memories", "by"], ["memoryPhotos", "by"], ["ratings", "by"]])
    await deleteAll(ref.collection(sub).where(field, "==", uid));
  // Their name on recipes they edited.
  const edited = await ref.collection("recipes").where("editedBy", "==", uid).get();
  await Promise.all(edited.docs.map((d) => d.ref.update({ editedBy: FieldValue.delete(), editedByName: FieldValue.delete(), editedAt: FieldValue.delete() })));
  // The cover page is the owner's (only the owner can write it).
  if (b.owner === uid) await ref.collection("meta").doc("cover").delete();
  await ref.update({
    members: rest,
    names: Object.fromEntries(Object.entries(b.names ?? {}).filter(([k]) => k !== uid)),
    ...(b.owner === uid ? { owner: rest[0] } : {}),
  });
}

/** Everything an account left in the database (its plan and Stripe records are handled separately). */
export async function deleteUserData(db, uid, email) {
  // Invites they sent, and any sent to them.
  await deleteAll(db.collection("invites").where("fromUid", "==", uid));
  if (email) await deleteAll(db.collection("invites").where("email", "==", String(email).toLowerCase()));

  // The Mix: their recipes (with others' votes on them), then their votes on others'.
  const owned = await db.collection("mixOwners").where("uid", "==", uid).get();
  for (const d of owned.docs) {
    await deleteMixRecipe(db, d.id);
    await d.ref.delete();
  }
  const legacy = await db.collection("mix").where("by", "==", uid).get();
  for (const d of legacy.docs) await deleteMixRecipe(db, d.id);
  await removeVotesBy(db, uid);

  // Cookbooks.
  const books = await db.collection("cookbooks").where("members", "array-contains", uid).get();
  for (const b of books.docs) await leaveBook(db, b, uid);

  // Shared shopping lists: their recipes and ticks go; the others keep the list.
  const lists = await db.collection("shoppingLists").where("members", "array-contains", uid).get();
  for (const l of lists.docs) {
    const d = l.data();
    const rest = (d.members ?? []).filter((m) => m !== uid);
    if (rest.length === 0) {
      await db.recursiveDelete(l.ref);
      continue;
    }
    await deleteAll(l.ref.collection("entries").where("addedBy", "==", uid));
    await deleteAll(l.ref.collection("ticks").where("by", "==", uid));
    await l.ref.update({
      members: rest,
      names: Object.fromEntries(Object.entries(d.names ?? {}).filter(([k]) => k !== uid)),
      ...(d.owner === uid ? { owner: rest[0] } : {}),
    });
  }

  // Their own recipes, photos and settings, and admin access.
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.doc(`admins/${uid}`).delete();
}

/** See the top of this file. Returns what it changed. */
export async function migrateMix(db) {
  const out = { moved: 0, tidied: 0 };
  const all = await db.collection("mix").get();
  for (const doc of all.docs) {
    const d = doc.data();
    const by = typeof d.by === "string" && d.by ? d.by : null;
    const hasMaps = "ratings" in d || "reporters" in d;
    if (!by && !hasMaps && "ratingCount" in d) continue;

    let id = doc.id;
    let ref = doc.ref;
    if (by) {
      // A random id, with who published it kept privately (as for every newer recipe).
      id = randomMixId();
      ref = db.doc(`mix/${id}`);
      const { by: _by, ratings: _r, reporters: _p, ...rest } = d;
      await db.batch().set(ref, rest).set(db.doc(`mixOwners/${id}`), { uid: by, recipeId: legacyRecipeId(doc.id, by) }).commit();
      const votes = await db.collection("mixVotes").where("mixId", "==", doc.id).get();
      for (const v of votes.docs) {
        await db.doc(`mixVotes/${id}_${v.data().uid}`).set({ ...v.data(), mixId: id });
        await v.ref.delete();
      }
      out.moved++;
    }

    // The old ratings and reports become private votes (one each, never twice).
    const reasons = Object.fromEntries((await doc.ref.collection("reports").get()).docs.map((r) => [r.id, r.data()]));
    const voters = new Set([...Object.keys(d.ratings ?? {}), ...Object.keys(d.reporters ?? {})]);
    for (const uid of voters) {
      const vref = db.doc(`mixVotes/${id}_${uid}`);
      if ((await vref.get()).exists) continue;
      const stars = Number.isInteger(d.ratings?.[uid]) && d.ratings[uid] >= 1 && d.ratings[uid] <= 5 ? d.ratings[uid] : null;
      const rep = d.reporters?.[uid] ? reasons[uid] ?? {} : null;
      if (stars === null && !rep) continue;
      await vref.set({ mixId: id, uid, stars, reportedAt: rep ? rep.at ?? Date.now() : null, reason: rep ? String(rep.reason ?? "").slice(0, 200) : null, at: Date.now() });
    }
    const totals = totalsOf((await db.collection("mixVotes").where("mixId", "==", id).get()).docs.map((v) => v.data()));
    await ref.update({ ...totals, ratings: FieldValue.delete(), reporters: FieldValue.delete() });
    await db.recursiveDelete(doc.ref.collection("reports"));
    if (by) await db.recursiveDelete(doc.ref);
    out.tidied++;
  }
  return out;
}
