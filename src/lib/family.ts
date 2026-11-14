import { fb, user } from "./cloud";
import { newId } from "./db";
import { duplicateReason } from "./duplicates";
import { cleanTags, type SavedRecipe, type ScannedRecipe } from "./schema";

/**
 * Family cookbooks: a shared shelf of recipes for a group (needs cloud
 * sign-in). Each member's own recipe box stays private; a recipe is copied
 * into the cookbook only when its owner taps "Share to …", and others save
 * their own copy from there. Photos aren't shared, to stay within free limits.
 *
 * Firestore (see firestore.rules):
 *   cookbooks/{id}                { name, owner, members[], names{uid: name}, createdAt }
 *   cookbooks/{id}/recipes/{doc}  { recipe, sharedBy, sharedByName, sharedAt, sourceId }
 *   cookbooks/{id}/meta/cover     { subtitle, dedication, photo, photoOnly, updatedAt }   (owner edits)
 *   cookbooks/{id}/memories/{doc} { text, photo, photoCount, by, byName, at, recipeId, recipeTitle }
 *   cookbooks/{id}/memoryPhotos/{mem}_{n} { memoryId, index, data, by }
 *   cookbooks/{id}/ratings/{recipe}_{uid} { recipeId, by, byName, stars, at }   (one per member per recipe)
 */
export interface Cookbook {
  id: string;
  name: string;
  owner: string;
  members: string[];
  names: Record<string, string>;
  createdAt: number;
}
export interface SharedRecipe {
  id: string;
  recipe: ScannedRecipe;
  sharedBy: string;
  sharedByName: string;
  sharedAt: number;
  sourceId: string;
  /** Who last edited it in the cookbook, and when. */
  editedBy?: string;
  editedByName?: string;
  editedAt?: number;
}

async function me() {
  const u = await user();
  if (!u) throw new Error("Sign in to cloud backup (in Settings) to use cookbooks.");
  return u;
}
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const defaultName = (email: string | null) => (email ?? "Me").split("@")[0];

/** Cookbook ids: long and random — they double as invite codes. */
const bookId = () => (newId() + newId()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);

export async function myCookbooks(): Promise<Cookbook[]> {
  const u = await me();
  const { db, f } = await fb();
  const snap = await f.getDocs(f.query(f.collection(db, "cookbooks"), f.where("members", "array-contains", u.uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Cookbook, "id">) })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCookbook(name: string, myName: string): Promise<Cookbook> {
  const u = await me();
  const { db, f } = await fb();
  const book: Omit<Cookbook, "id"> = {
    name: name.trim().slice(0, 60) || "Family recipes",
    owner: u.uid,
    members: [u.uid],
    names: { [u.uid]: myName.trim() || defaultName(u.email) },
    createdAt: Date.now(),
  };
  const id = bookId();
  await f.setDoc(f.doc(db, "cookbooks", id), book);
  return { id, ...book };
}

/** Rename a cookbook for everyone (its owner only). */
export async function renameCookbook(id: string, name: string): Promise<string> {
  await me();
  const { db, f } = await fb();
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Give the cookbook a name.");
  await f.updateDoc(f.doc(db, "cookbooks", id), { name: clean });
  return clean;
}

export async function getCookbook(id: string): Promise<Cookbook | null> {
  await me();
  const { db, f } = await fb();
  try {
    const d = await f.getDoc(f.doc(db, "cookbooks", id));
    return d.exists() ? { id, ...(d.data() as Omit<Cookbook, "id">) } : null;
  } catch {
    return null;
  }
}

export async function joinCookbook(book: Cookbook, myName: string): Promise<void> {
  const u = await me();
  if (book.members.includes(u.uid)) return;
  const { db, f } = await fb();
  await f.updateDoc(f.doc(db, "cookbooks", book.id), {
    members: [...book.members, u.uid],
    [`names.${u.uid}`]: myName.trim() || defaultName(u.email),
  });
}

/**
 * Removes the cookbook from my list only; everyone else keeps it. If I own it,
 * the longest-standing remaining member becomes the owner. If nobody else is
 * in it, it is deleted.
 */
export async function leaveCookbook(book: Cookbook): Promise<void> {
  const u = await me();
  const rest = book.members.filter((m) => m !== u.uid);
  if (rest.length === 0) return deleteCookbook(book);
  const { db, f } = await fb();
  await f.updateDoc(f.doc(db, "cookbooks", book.id), {
    members: rest,
    ...(book.owner === u.uid ? { owner: rest[0] } : {}),
  });
}

/** Removes the cookbook with its recipes, cover and memories (used when the last member leaves). */
export async function deleteCookbook(book: Cookbook): Promise<void> {
  await me();
  const { db, f } = await fb();
  for (const sub of ["recipes", "memories", "memoryPhotos", "meta", "ratings"]) {
    const snap = await f.getDocs(f.collection(db, "cookbooks", book.id, sub));
    for (const d of snap.docs) await f.deleteDoc(d.ref);
  }
  await f.deleteDoc(f.doc(db, "cookbooks", book.id));
}

// ---------- cover page ----------
export interface Cover {
  subtitle: string;
  dedication: string;
  photo: string | null; // data: URL, compressed
  /** The photo is a picture of the family's own cover page: show just the photo. */
  photoOnly?: boolean;
  updatedAt?: number;
}
export async function getCover(bookIdValue: string): Promise<Cover | null> {
  await me();
  const { db, f } = await fb();
  const snap = await f.getDoc(f.doc(db, "cookbooks", bookIdValue, "meta", "cover"));
  return snap.exists() ? (snap.data() as Cover) : null;
}
/** Owner only. */
export async function saveCover(bookIdValue: string, cover: Cover): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.setDoc(f.doc(db, "cookbooks", bookIdValue, "meta", "cover"), {
    subtitle: cover.subtitle.trim().slice(0, 120),
    dedication: cover.dedication.trim().slice(0, 1000),
    photo: cover.photo,
    photoOnly: !!cover.photo && !!cover.photoOnly,
    updatedAt: Date.now(),
  });
}

// ---------- memories ----------
// Each memory's photos are separate documents (the database caps a document at ~1 MB):
//   cookbooks/{id}/memories/{mem}          { text, photo (older single photo), photoCount, by, byName, at, recipeId, recipeTitle }
//   cookbooks/{id}/memoryPhotos/{mem}_{n}   { memoryId, index, data, by }
export const MAX_MEMORY_PHOTOS = 10;
export interface Memory {
  id: string;
  text: string;
  photo: string | null; // memories saved before several photos were possible
  photoCount?: number;
  by: string;
  byName: string;
  at: number;
  recipeId: string | null; // a recipe in this cookbook it's about, if any
  recipeTitle: string | null;
}
export async function bookMemories(bookIdValue: string): Promise<Memory[]> {
  await me();
  const { db, f } = await fb();
  const snap = await f.getDocs(f.collection(db, "cookbooks", bookIdValue, "memories"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Memory, "id">) })).sort((a, b) => a.at - b.at);
}
/** A memory's photos, in order. */
export async function memoryPhotos(bookIdValue: string, m: Memory): Promise<string[]> {
  if (!m.photoCount) return m.photo ? [m.photo] : [];
  const { db, f } = await fb();
  const docs = await Promise.all(
    Array.from({ length: m.photoCount }, (_, i) => f.getDoc(f.doc(db, "cookbooks", bookIdValue, "memoryPhotos", `${m.id}_${i}`))),
  );
  return docs.map((d) => (d.data() as { data?: string } | undefined)?.data).filter((x): x is string => !!x);
}
export async function addMemory(book: Cookbook, m: { text: string; photos: string[]; recipe: SharedRecipe | null }): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  const id = `${u.uid}_${newId()}`;
  const photos = m.photos.slice(0, MAX_MEMORY_PHOTOS);
  // Photos first, so a memory never points at photos that aren't there yet.
  for (let i = 0; i < photos.length; i++)
    await f.setDoc(f.doc(db, "cookbooks", book.id, "memoryPhotos", `${id}_${i}`), { memoryId: id, index: i, data: photos[i], by: u.uid });
  const doc: Omit<Memory, "id"> = {
    text: m.text.trim().slice(0, 2000),
    photo: null,
    photoCount: photos.length,
    by: u.uid,
    byName: book.names[u.uid] ?? defaultName(u.email),
    at: Date.now(),
    recipeId: m.recipe?.id ?? null,
    recipeTitle: m.recipe?.recipe.title ?? null,
  };
  await f.setDoc(f.doc(db, "cookbooks", book.id, "memories", id), doc);
}
export async function deleteMemory(bookIdValue: string, m: Memory): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "cookbooks", bookIdValue, "memories", m.id));
  for (let i = 0; i < (m.photoCount ?? 0); i++) await f.deleteDoc(f.doc(db, "cookbooks", bookIdValue, "memoryPhotos", `${m.id}_${i}`));
}

export async function bookRecipes(bookIdValue: string): Promise<SharedRecipe[]> {
  await me();
  const { db, f } = await fb();
  const snap = await f.getDocs(f.collection(db, "cookbooks", bookIdValue, "recipes"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SharedRecipe, "id">) }))
    .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title));
}

/** The recipe as shared: the cook's version (swaps applied by the caller), no photos or private notes. */
function shareable(r: ScannedRecipe): ScannedRecipe {
  return { title: r.title, servings: r.servings, time: r.time, ingredients: r.ingredients, steps: r.steps, notes: r.notes, tags: r.tags ?? [], warnings: [] };
}

/** Shares (or updates) one of my recipes in a cookbook. One copy per recipe per person. */
export async function shareToCookbook(book: Cookbook, source: SavedRecipe, asCooked: ScannedRecipe): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  const doc: Omit<SharedRecipe, "id"> = {
    recipe: clean(shareable(asCooked)),
    sharedBy: u.uid,
    sharedByName: book.names[u.uid] ?? defaultName(u.email),
    sharedAt: Date.now(),
    sourceId: source.id,
  };
  await f.setDoc(f.doc(db, "cookbooks", book.id, "recipes", `${u.uid}_${source.id}`), doc);
}

/** Edits a recipe in the cookbook (the sharer or the owner). Everyone's own saved copies stay as they are. */
export async function editInCookbook(book: Cookbook, docId: string, recipe: ScannedRecipe): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  await f.updateDoc(f.doc(db, "cookbooks", book.id, "recipes", docId), {
    recipe: clean(shareable(recipe)),
    editedBy: u.uid,
    editedByName: book.names[u.uid] ?? defaultName(u.email),
    editedAt: Date.now(),
  });
}

export async function removeFromCookbook(bookIdValue: string, docId: string): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "cookbooks", bookIdValue, "recipes", docId));
}

// ---------- ratings ----------
export interface Rating {
  recipeId: string;
  by: string;
  byName: string;
  stars: number;
  at: number;
}

/** Every rating in a cookbook, by recipe. */
export async function bookRatings(bookIdValue: string): Promise<Record<string, Rating[]>> {
  await me();
  const { db, f } = await fb();
  const snap = await f.getDocs(f.collection(db, "cookbooks", bookIdValue, "ratings"));
  const out: Record<string, Rating[]> = {};
  for (const d of snap.docs) {
    const r = d.data() as Rating;
    (out[r.recipeId] ??= []).push(r);
  }
  return out;
}

/** Sets (1–5) or clears (null) my rating of a cookbook recipe. */
export async function rateInCookbook(book: Cookbook, recipeId: string, stars: number | null): Promise<Rating | null> {
  const u = await me();
  const { db, f } = await fb();
  const ref = f.doc(db, "cookbooks", book.id, "ratings", `${recipeId}_${u.uid}`);
  if (stars === null) {
    await f.deleteDoc(ref);
    return null;
  }
  const r: Rating = { recipeId, by: u.uid, byName: book.names[u.uid] ?? defaultName(u.email), stars: Math.round(stars), at: Date.now() };
  await f.setDoc(ref, r);
  return r;
}

/** Average stars and how many rated, or null when nobody has. */
export function ratingSummary(rs: Rating[] | undefined): { average: number; count: number } | null {
  if (!rs?.length) return null;
  return { average: rs.reduce((n, r) => n + r.stars, 0) / rs.length, count: rs.length };
}

/** Where my recipe is shared: cookbook id → when. */
export async function whereShared(books: Cookbook[], recipeId: string): Promise<Record<string, number>> {
  const u = await me();
  const { db, f } = await fb();
  const out: Record<string, number> = {};
  await Promise.all(
    books.map(async (b) => {
      const d = await f.getDoc(f.doc(db, "cookbooks", b.id, "recipes", `${u.uid}_${recipeId}`)).catch(() => null);
      if (d?.exists()) out[b.id] = (d.data() as SharedRecipe).sharedAt;
    }),
  );
  return out;
}

export const inviteLink = (book: Cookbook) => `${location.origin}${location.pathname}#/join/${book.id}`;

// ---------- labels kept the same on your recipe and its cookbook copies ----------
const lower = (t: string) => t.toLowerCase();

/** Labels in `before` that aren't in `after` (taken off). */
export const removedLabels = (before: string[], after: string[]) => before.filter((t) => !after.some((x) => lower(x) === lower(t)));

/** Both sides' labels together, minus the ones just taken off. */
export function mergeLabels(a: string[], b: string[], removed: string[]): string[] {
  const gone = new Set(removed.map(lower));
  return cleanTags([...a, ...b]).filter((t) => !gone.has(lower(t)));
}

export const sameLabels = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.some((x) => lower(x) === lower(t)));

/** Sets just the labels of a recipe in a cookbook (its sharer or the cookbook's owner). */
export async function setCookbookLabels(bookIdValue: string, docId: string, tags: string[]): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.updateDoc(f.doc(db, "cookbooks", bookIdValue, "recipes", docId), { "recipe.tags": tags });
}

/**
 * After your recipe's labels change: its copies in your cookbooks get the
 * same labels (theirs added, the ones you took off removed). A copy is one you
 * shared from this recipe, or — where you can change it (you shared it, or you
 * own the cookbook) — the same recipe by title or web page, e.g. one someone
 * else shared that you saved. Returns the labels your recipe should have, so it
 * picks up any it was missing.
 */
export async function syncLabelsToCookbooks(recipe: SavedRecipe, before: string[]): Promise<string[]> {
  const u = await me();
  const removed = removedLabels(before, recipe.tags ?? []);
  const books = await myCookbooks();
  const copies = (
    await Promise.all(
      books.map(async (b) => {
        const rs = await bookRecipes(b.id).catch(() => [] as SharedRecipe[]);
        return rs
          .filter((r) => {
            const mine = r.sharedBy === u.uid;
            if (mine && (r.sourceId === recipe.id || r.id === `${u.uid}_${recipe.id}`)) return true;
            if (!mine && b.owner !== u.uid) return false; // not yours to change
            const why = duplicateReason({ ...r.recipe }, recipe);
            return why === "same title" || why === "same web page";
          })
          .map((r) => ({ book: b.id, id: r.id, tags: (r.recipe.tags ?? []) as string[] }));
      }),
    )
  ).flat();
  const merged = mergeLabels(recipe.tags ?? [], copies.flatMap((c) => c.tags), removed);
  await Promise.all(copies.filter((c) => !sameLabels(c.tags, merged)).map((c) => setCookbookLabels(c.book, c.id, merged)));
  return merged;
}
