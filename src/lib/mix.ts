import { fb, user } from "./cloud";
import { cleanTags, type SavedRecipe, type ScannedRecipe } from "./schema";
import { sameLabels } from "./family";

/**
 * The Mix: recipes anyone using Cardamix can publish for everyone else (needs
 * an account). A published recipe is a copy — the cook's own version, without
 * photos or private notes — under the display name they choose, never their
 * email. Recipes read from a web page aren't reposted: only the title and a
 * link to the original site are published.
 *
 * Published recipes have a random id and carry no account id: who published
 * one is kept in mixOwners/{id}, readable only by that person. So a recipe
 * published anonymously can't be traced back, or linked to the cook's others.
 *
 * Ratings and reports are private too: they go through the server, which keeps
 * each person's in mixVotes (readable only by them and admins) and puts just
 * the totals on the recipe.
 *
 * Firestore (see firestore.rules):
 *   mix/{id}                 { recipe, sourceUrl, byName, anonymous, at, updatedAt, ratingSum, ratingCount, reportCount }
 *   mixOwners/{id}           { uid, recipeId }   (only its owner can read it)
 *   mixVotes/{id}_{uid}      { mixId, uid, stars, reportedAt, reason, at }   (written by the server; only that person and admins read it)
 *   admins/{uid}             (created by hand in the Firebase console; can take any recipe down)
 */
export interface MixRecipe {
  id: string;
  recipe: ScannedRecipe;
  /** Set when the recipe came from a web page: the Mix links there instead of reposting it. */
  sourceUrl: string | null;
  byName: string;
  anonymous?: boolean;
  at: number;
  updatedAt: number;
  /** Totals only: who rated or reported isn't public. */
  ratingSum: number;
  ratingCount: number;
  reportCount: number;
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

export const ANONYMOUS_NAME = "Anonymous cook";
/** The id a recipe published before ids were made anonymous has. */
const legacyId = (uid: string, recipeId: string) => `${uid}_${recipeId}`;
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);

/** The Mix id of one of my recipes, if I published it. */
async function myMixIdFor(recipeId: string): Promise<{ id: string; legacy: boolean } | null> {
  const u = await me();
  const { db, f } = await fb();
  const snap = await f.getDocs(f.query(f.collection(db, "mixOwners"), f.where("uid", "==", u.uid), f.where("recipeId", "==", recipeId)));
  if (snap.docs[0]) return { id: snap.docs[0].id, legacy: false };
  const old = await f.getDoc(f.doc(db, "mix", legacyId(u.uid, recipeId))).catch(() => null);
  return old?.exists() ? { id: old.id, legacy: true } : null;
}

/** The ids of everything I've published (to show "by you"). */
export async function myMixIds(): Promise<Set<string>> {
  const u = await user();
  if (!u) return new Set();
  const { db, f } = await fb();
  const [owned, old] = await Promise.all([
    f.getDocs(f.query(f.collection(db, "mixOwners"), f.where("uid", "==", u.uid))).catch(() => null),
    f.getDocs(f.query(f.collection(db, "mix"), f.where("by", "==", u.uid))).catch(() => null),
  ]);
  return new Set([...(owned?.docs ?? []), ...(old?.docs ?? [])].map((d) => d.id));
}

/**
 * Publishes (or updates) one of my recipes — under a name I choose, or
 * anonymously — optionally with a different title. Returns its id.
 */
export async function publishToMix(
  source: SavedRecipe,
  asCooked: ScannedRecipe,
  opts: { name: string; anonymous: boolean; title?: string },
): Promise<string> {
  const u = await me();
  const { db, f } = await fb();
  const byName = opts.anonymous ? ANONYMOUS_NAME : opts.name.trim().slice(0, 40);
  if (!byName) throw new Error("Choose a name to publish under, or publish anonymously.");
  if (!opts.anonymous) rememberName(byName);
  const now = Date.now();
  const fromWeb = !!source.source;
  const recipe = { ...asCooked, title: opts.title?.trim().slice(0, 200) || asCooked.title };
  const content = { recipe: clean(publishable(recipe, fromWeb)), sourceUrl: source.source ?? null, byName, anonymous: opts.anonymous, updatedAt: now };
  const mine = await myMixIdFor(source.id);
  if (mine && !mine.legacy) {
    await f.updateDoc(f.doc(db, "mix", mine.id), content);
    return mine.id;
  }
  // New (or moving an older one, which had my account id on it, to a random id).
  const id = randomId();
  const batch = f.writeBatch(db);
  batch.set(f.doc(db, "mix", id), { ...content, at: now, ratingSum: 0, ratingCount: 0, reportCount: 0 });
  batch.set(f.doc(db, "mixOwners", id), { uid: u.uid, recipeId: source.id });
  await batch.commit();
  if (mine?.legacy) await f.deleteDoc(f.doc(db, "mix", mine.id)).catch(() => {});
  return id;
}

/** If I published this recipe, its published copy gets these labels too (nothing else changes). */
export async function syncLabelsToMix(recipeId: string, tags: string[]): Promise<void> {
  const mine = await myMixIdFor(recipeId);
  if (!mine) return;
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "mix", mine.id));
  if (!d.exists()) return;
  const now = cleanTags(tags);
  if (sameLabels(((d.data() as MixRecipe).recipe.tags ?? []) as string[], now)) return;
  await f.updateDoc(f.doc(db, "mix", mine.id), { "recipe.tags": now });
}

/** Takes a recipe out of The Mix (yours, or any if you're an admin). */
export async function unpublish(id: string): Promise<void> {
  await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "mix", id));
  await f.deleteDoc(f.doc(db, "mixOwners", id)).catch(() => {}); // an admin taking down an older recipe has none
}

/** My published copy of a recipe: its id, when, the title and whether it's anonymous — or null. */
export async function publishedInfo(recipeId: string): Promise<{ id: string; at: number; title: string; anonymous: boolean } | null> {
  const mine = await myMixIdFor(recipeId).catch(() => null);
  if (!mine) return null;
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "mix", mine.id)).catch(() => null);
  if (!d?.exists()) return null;
  const m = d.data() as MixRecipe;
  return { id: mine.id, at: m.updatedAt, title: m.recipe.title, anonymous: !!m.anonymous };
}

const toMix = (d: { id: string; data: () => unknown }): MixRecipe => {
  const x = d.data() as Partial<MixRecipe> & { ratings?: Record<string, number>; reporters?: Record<string, boolean> };
  // Recipes not yet moved to totals (the server deploy moves them) still count.
  const old = Object.values(x.ratings ?? {});
  const { ratings: _r, reporters: _p, ...rest } = x;
  return {
    ...(rest as Omit<MixRecipe, "id" | "ratingSum" | "ratingCount" | "reportCount">),
    id: d.id,
    ratingSum: x.ratingSum ?? old.reduce((a, b) => a + b, 0),
    ratingCount: x.ratingCount ?? old.length,
    reportCount: x.reportCount ?? Object.keys(x.reporters ?? {}).length,
  };
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

export interface MyVote {
  stars: number | null;
  reported: boolean;
}
async function vote(data: { id: string; stars?: number | null; report?: string }): Promise<MyVote> {
  await me();
  const { callable } = await import("./subscription");
  try {
    return await callable<MyVote>("mixVote", data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/internal|network|unavailable|deadline/i.test(msg) ? "Couldn't reach Cardamix. Check your connection and try again." : msg);
  }
}

/** Sets (1–5) or clears (null) my rating. You can't rate your own recipe; your email needs to be confirmed. */
export const rateMix = (id: string, stars: number | null) => vote({ id, stars: stars === null ? null : Math.round(stars) });

export const reportMix = (id: string, reason: string) => vote({ id, report: reason.slice(0, 200) });

/** My rating of a Mix recipe, and whether I reported it. */
export async function myVote(id: string): Promise<MyVote> {
  const u = await me();
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "mixVotes", `${id}_${u.uid}`)).catch(() => null);
  const v = d?.exists() ? (d.data() as { stars?: number | null; reportedAt?: number | null }) : null;
  return { stars: v?.stars ?? null, reported: !!v?.reportedAt };
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
  return m.ratingCount > 0 ? { average: m.ratingSum / m.ratingCount, count: m.ratingCount } : null;
}
export const reportCount = (m: MixRecipe) => m.reportCount;
