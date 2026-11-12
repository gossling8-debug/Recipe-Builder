import { fb, user } from "./cloud";
import { newId } from "./db";
import type { SavedRecipe, ScannedRecipe } from "./schema";

/**
 * Family cookbooks: a shared shelf of recipes for a group (needs cloud
 * sign-in). Each member's own recipe box stays private; a recipe is copied
 * into the cookbook only when its owner taps "Share to …", and others save
 * their own copy from there. Photos aren't shared, to stay within free limits.
 *
 * Firestore (see firestore.rules):
 *   cookbooks/{id}                { name, owner, members[], names{uid: name}, createdAt }
 *   cookbooks/{id}/recipes/{doc}  { recipe, sharedBy, sharedByName, sharedAt, sourceId }
 *   cookbooks/{id}/meta/cover     { subtitle, dedication, photo, updatedAt }   (owner edits)
 *   cookbooks/{id}/memories/{doc} { text, photo, by, byName, at, recipeId, recipeTitle }
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
}

async function me() {
  const u = await user();
  if (!u) throw new Error("Sign in to cloud backup (in Settings) to use family cookbooks.");
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

/** Leaves a cookbook (others keep it). The owner deletes it instead. */
export async function leaveCookbook(book: Cookbook): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  await f.updateDoc(f.doc(db, "cookbooks", book.id), { members: book.members.filter((m) => m !== u.uid) });
}

/** Owner only: removes the cookbook with its recipes, cover and memories. Members' own copies stay. */
export async function deleteCookbook(book: Cookbook): Promise<void> {
  await me();
  const { db, f } = await fb();
  for (const sub of ["recipes", "memories", "meta"]) {
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
    updatedAt: Date.now(),
  });
}

// ---------- memories ----------
export interface Memory {
  id: string;
  text: string;
  photo: string | null;
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
export async function addMemory(book: Cookbook, m: { text: string; photo: string | null; recipe: SharedRecipe | null }): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  const doc: Omit<Memory, "id"> = {
    text: m.text.trim().slice(0, 2000),
    photo: m.photo,
    by: u.uid,
    byName: book.names[u.uid] ?? defaultName(u.email),
    at: Date.now(),
    recipeId: m.recipe?.id ?? null,
    recipeTitle: m.recipe?.recipe.title ?? null,
  };
  await f.setDoc(f.doc(db, "cookbooks", book.id, "memories", `${u.uid}_${newId()}`), doc);
}
export async function deleteMemory(bookIdValue: string, id: string): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "cookbooks", bookIdValue, "memories", id));
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

export async function removeFromCookbook(bookIdValue: string, docId: string): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "cookbooks", bookIdValue, "recipes", docId));
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
