import { fb, user } from "./cloud";
import type { SavedRecipe, ScannedRecipe } from "./schema";

/**
 * The Mix: recipes anyone using Cardamix can publish for everyone else (needs
 * an account). A published recipe is a copy — the cook's own version, without
 * photos or private notes — under the display name they choose, never their
 * email. Recipes read from a web page aren't reposted: only the title and a
 * link to the original site are published.
 *
 * Firestore (see firestore.rules):
 *   mix/{uid}_{recipeId}     { recipe, sourceUrl, by, byName, at, updatedAt, ratings{uid: 1–5}, reporters{uid: true} }
 *   mix/{id}/reports/{uid}   { reason, at }   (read by admins only)
 *   admins/{uid}             (created by hand in the Firebase console; can take any recipe down)
 */
export interface MixRecipe {
  id: string;
  recipe: ScannedRecipe;
  /** Set when the recipe came from a web page: the Mix links there instead of reposting it. */
  sourceUrl: string | null;
  by: string;
  byName: string;
  at: number;
  updatedAt: number;
  ratings: Record<string, number>;
  reporters: Record<string, boolean>;
}

/** Hidden from the list once this many different people report it (an admin can take it down for good). */
export const HIDE_AFTER_REPORTS = 3;
export const REPORT_REASONS = ["Not a recipe", "Offensive or inappropriate", "Spam or advertising", "Copied from someone else", "Something else"];

async function me() {
  const u = await user();
  if (!u) throw new Error("Sign in to use The Mix.");
  return u;
}
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const NAME_KEY = "recipe-builder.mixName";
/** The name you publish under (remembered on this phone). */
export function publicName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* fine */
  }
}

/** The recipe as published: the cook's version, no photos or private notes. A web recipe is just its title. */
function publishable(r: ScannedRecipe, fromWeb: boolean): ScannedRecipe {
  if (fromWeb) return { title: r.title, servings: r.servings, time: r.time, ingredients: [], steps: [], notes: null, tags: r.tags ?? [], warnings: [] };
  return { title: r.title, servings: r.servings, time: r.time, ingredients: r.ingredients, steps: r.steps, notes: r.notes, tags: r.tags ?? [], warnings: [] };
}

export const mixId = (uid: string, recipeId: string) => `${uid}_${recipeId}`;

/** Publishes (or updates) one of my recipes. */
export async function publishToMix(source: SavedRecipe, asCooked: ScannedRecipe, name: string): Promise<string> {
  const u = await me();
  const { db, f } = await fb();
  const byName = name.trim().slice(0, 40);
  if (!byName) throw new Error("Choose a name to publish under.");
  rememberName(byName);
  const id = mixId(u.uid, source.id);
  const ref = f.doc(db, "mix", id);
  const existing = await f.getDoc(ref);
  const now = Date.now();
  const fromWeb = !!source.source;
  const content = { recipe: clean(publishable(asCooked, fromWeb)), sourceUrl: source.source ?? null, byName, updatedAt: now };
  if (existing.exists()) await f.updateDoc(ref, content);
  else await f.setDoc(ref, { ...content, by: u.uid, at: now, ratings: {}, reporters: {} });
  return id;
}

export async function unpublish(id: string): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "mix", id));
}

/** When my recipe was published, or null. */
export async function publishedAt(recipeId: string): Promise<number | null> {
  const u = await me();
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "mix", mixId(u.uid, recipeId))).catch(() => null);
  return d?.exists() ? ((d.data() as MixRecipe).updatedAt ?? null) : null;
}

const toMix = (d: { id: string; data: () => unknown }): MixRecipe => {
  const x = d.data() as Omit<MixRecipe, "id">;
  return { ...x, id: d.id, ratings: x.ratings ?? {}, reporters: x.reporters ?? {} };
};

/** The newest published recipes (newest first). */
export async function latestMix(max = 200): Promise<MixRecipe[]> {
  await me();
  const { db, f } = await fb();
  const snap = await f.getDocs(f.query(f.collection(db, "mix"), f.orderBy("at", "desc"), f.limit(max)));
  return snap.docs.map(toMix);
}

export async function getMix(id: string): Promise<MixRecipe | null> {
  await me();
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "mix", id));
  return d.exists() ? toMix(d) : null;
}

/** Sets (1–5) or clears (null) my rating. You can't rate your own recipe. */
export async function rateMix(id: string, stars: number | null): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  await f.updateDoc(f.doc(db, "mix", id), { [`ratings.${u.uid}`]: stars === null ? f.deleteField() : Math.round(stars) });
}

export async function reportMix(id: string, reason: string): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  await f.setDoc(f.doc(db, "mix", id, "reports", u.uid), { reason: reason.slice(0, 200), at: Date.now() });
  await f.updateDoc(f.doc(db, "mix", id), { [`reporters.${u.uid}`]: true });
}

/** Whether I can take down any recipe (an admins/{uid} document exists). */
export async function amAdmin(): Promise<boolean> {
  const u = await user();
  if (!u) return false;
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "admins", u.uid)).catch(() => null);
  return !!d?.exists();
}

export function mixRating(m: MixRecipe): { average: number; count: number } | null {
  const v = Object.values(m.ratings);
  return v.length ? { average: v.reduce((a, b) => a + b, 0) / v.length, count: v.length } : null;
}
export const reportCount = (m: MixRecipe) => Object.keys(m.reporters).length;

/** Account deletion: my published recipes. */
export async function deleteMyMix(uid: string): Promise<void> {
  const { db, f } = await fb();
  const snap = await f.getDocs(f.query(f.collection(db, "mix"), f.where("by", "==", uid)));
  for (const d of snap.docs) await f.deleteDoc(d.ref);
}
