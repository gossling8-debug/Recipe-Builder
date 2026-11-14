import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";
import { deleteRecipeFromCloud, listRecipes, onRecipeChange, saveRecipeFromCloud } from "./db";
import type { SavedRecipe } from "./schema";
import { announceChanges, applyRemote, isFirstSync, lastAccount, localEntries, markSynced, plan, trackLocalChanges, type Entry } from "./stateSync";
import { eraseThisPhone } from "./appLock";

/**
 * Cloud backup & sync (Firebase, free plan).
 *
 * The phone's own storage stays the main copy, so the app works offline.
 * When signed in, every change is uploaded, and other devices pick it up the
 * next time they sync. For each recipe the newest version (updatedAt) wins.
 *
 * Firestore layout, all private to the signed-in user (see firestore.rules):
 *   users/{uid}/recipes/{id}  { recipe, updatedAt, photoCount, deleted }
 *   users/{uid}/photos/{id_n} { recipeId, index, data }  — one per photo, to stay
 *                                                       under the 1 MB document limit
 *   users/{uid}/state/{name}  { value, updatedAt }   — pantry, shopping list, week
 *                                                       plan, prices, settings… (stateSync.ts)
 */
export interface CloudState {
  status: "off" | "signed-out" | "syncing" | "synced" | "offline" | "error";
  email?: string;
  uid?: string;
  lastSync?: number;
  message?: string;
  /** False until Firebase has said whether someone is signed in on this device. */
  authKnown?: boolean;
}

let state: CloudState = { status: firebaseConfig ? "signed-out" : "off" };
const subscribers = new Set<(s: CloudState) => void>();
const set = (s: Partial<CloudState>) => {
  state = { ...state, ...s };
  subscribers.forEach((fn) => fn(state));
};
export const cloudState = () => state;
export function subscribeCloud(fn: (s: CloudState) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ---------- Firebase (loaded only when cloud backup is set up) ----------
interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  a: typeof import("firebase/auth");
  f: typeof import("firebase/firestore");
}
let fbPromise: Promise<Fb> | null = null;

export function fb(): Promise<Fb> {
  if (!firebaseConfig) return Promise.reject(new Error("Cloud backup isn't set up yet."));
  fbPromise ??= (async () => {
    const [{ initializeApp }, a, f] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
    const app = initializeApp(firebaseConfig!);
    // Remember the sign-in in localStorage first: Safari's IndexedDB can come back
    // empty after a refresh, which signed people out. Sign-ins saved the old way
    // (IndexedDB) are found and moved over automatically.
    const auth = a.initializeAuth(app, { persistence: [a.browserLocalPersistence, a.indexedDBLocalPersistence, a.browserSessionPersistence] });
    const db = f.getFirestore(app);
    if (import.meta.env.VITE_FIREBASE_EMULATOR) {
      a.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      f.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return { app, auth, db, a, f };
  })();
  // A failed load (e.g. offline on first open) can be tried again later.
  fbPromise.catch(() => {
    fbPromise = null;
  });
  return fbPromise;
}

export const user = async (): Promise<User | null> => (await fb()).auth.currentUser;

// ---------- start ----------
let started = false;
const PUSH_DELAY = 1500;
const pushTimers = new Map<string, number>();
let paused = false;
/** Stops uploads while the account is being deleted. */
export const pauseSync = (on: boolean) => {
  paused = on;
};
const stateDirty = new Set<string>();
let stateTimer = 0;

/** Called once when the app opens. Does nothing until cloud backup is set up. */
export async function startCloud(): Promise<void> {
  if (!firebaseConfig || started) return;
  started = true;
  let loaded: Fb;
  try {
    loaded = await fb();
  } catch {
    started = false; // try again on the next sign-in attempt or when back online
    set({ status: "signed-out", authKnown: true, message: "Couldn't reach the cloud. Check your internet connection." });
    window.addEventListener("online", () => void startCloud(), { once: true });
    return;
  }
  const { auth, a } = loaded;
  a.onAuthStateChanged(auth, async (u) => {
    if (u) {
      set({ status: "syncing", email: u.email ?? undefined, uid: u.uid, message: undefined, authKnown: true });
      const previous = lastAccount();
      if (previous && previous !== u.uid) {
        // This phone holds another account's data: show this account's instead.
        // Nothing is deleted from either account — the other person's data stays in theirs.
        await eraseThisPhone(DEVICE_KEYS);
        await syncNow();
        announceChanges();
      } else void syncNow();
      // Free or Plus comes from the server.
      void import("./subscription").then((m) => m.refreshMyPlan()).catch(() => {});
    } else set({ status: "signed-out", email: undefined, uid: undefined, lastSync: undefined, authKnown: true });
  });

  // Upload each change shortly after it's made (a burst of edits = one upload).
  onRecipeChange((change) => {
    if (!auth.currentUser) {
      if (change.type === "delete") rememberDelete(change.id, change.at);
      return;
    }
    if (change.type === "delete") {
      void pushDelete(change.id, change.at).catch(() => rememberDelete(change.id, change.at));
      return;
    }
    const id = change.recipe.id;
    window.clearTimeout(pushTimers.get(id));
    pushTimers.set(
      id,
      window.setTimeout(() => {
        pushTimers.delete(id);
        void upload(change.recipe).then(
          () => set({ status: "synced", lastSync: Date.now(), message: undefined }),
          () => set({ status: "offline", message: "Changes will upload when you're back online." }),
        );
      }, PUSH_DELAY),
    );
  });

  // Lists and settings: upload shortly after they change.
  trackLocalChanges((name) => {
    if (!auth.currentUser) return; // noted with its time; uploaded at the next sign-in sync
    stateDirty.add(name);
    window.clearTimeout(stateTimer);
    stateTimer = window.setTimeout(() => {
      const names = [...stateDirty];
      stateDirty.clear();
      void pushState(names).then(
        () => set({ status: "synced", lastSync: Date.now(), message: undefined }),
        () => {
          names.forEach((n) => stateDirty.add(n));
          set({ status: "offline", message: "Changes will upload when you're back online." });
        },
      );
    }, PUSH_DELAY);
  });

  // Catch up with other devices when the app comes back to the foreground.
  let lastVisibleSync = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && auth.currentUser && Date.now() - lastVisibleSync > 60_000) {
      lastVisibleSync = Date.now();
      void syncNow();
    }
  });
  window.addEventListener("online", () => auth.currentUser && void syncNow());
}

/** Belong to the phone, not an account: kept when a different account signs in here. */
const DEVICE_KEYS = ["recipe-builder.lock", "recipe-builder.lockTries", "recipe-builder.textSize"];

// ---------- account ----------
function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/missing-password": "Enter a password.",
    "auth/weak-password": "Use a password of at least 6 characters.",
    "auth/email-already-in-use": "There's already an account with that email — tap Sign in instead.",
    "auth/invalid-credential": "Email or password is wrong.",
    "auth/wrong-password": "Email or password is wrong.",
    "auth/user-not-found": "No account with that email — tap Create account.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/network-request-failed": "Couldn't reach the cloud. Check your internet connection.",
  };
  return map[code] ?? (err instanceof Error ? err.message : String(err));
}

export async function createAccount(email: string, password: string): Promise<void> {
  const { auth, a } = await fb();
  try {
    await a.createUserWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    throw new Error(friendly(e));
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { auth, a } = await fb();
  try {
    await a.signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    throw new Error(friendly(e));
  }
}

export async function resetPassword(email: string): Promise<void> {
  const { auth, a } = await fb();
  try {
    await a.sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    throw new Error(friendly(e));
  }
}

/** Signs out on this device. Recipes stay on the phone and in the cloud. */
export async function signOut(): Promise<void> {
  const { auth, a } = await fb();
  await a.signOut(auth);
}

// ---------- sync ----------
interface RemoteDoc {
  recipe?: Omit<SavedRecipe, "photos">;
  updatedAt: number;
  photoCount?: number;
  deleted?: boolean;
}

const stamp = (r: SavedRecipe) => r.updatedAt ?? r.createdAt;
/** Firestore rejects `undefined` values; JSON round-trip drops them. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const DELETES_KEY = "recipe-builder.cloud.deletes";
function pendingDeletes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DELETES_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function rememberDelete(id: string, at: number) {
  try {
    localStorage.setItem(DELETES_KEY, JSON.stringify({ ...pendingDeletes(), [id]: at }));
  } catch {
    /* ignore */
  }
}
function forgetDelete(id: string) {
  const all = pendingDeletes();
  delete all[id];
  try {
    localStorage.setItem(DELETES_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

async function upload(r: SavedRecipe, previousPhotoCount?: number): Promise<void> {
  const u = await user();
  if (!u || paused) return;
  const { db, f } = await fb();
  const { photos, ...rest } = r;
  if (previousPhotoCount !== photos.length) {
    for (let i = 0; i < photos.length; i++) {
      await f.setDoc(f.doc(db, "users", u.uid, "photos", `${r.id}_${i}`), { recipeId: r.id, index: i, data: photos[i] });
    }
    for (let i = photos.length; i < (previousPhotoCount ?? 0); i++) {
      await f.deleteDoc(f.doc(db, "users", u.uid, "photos", `${r.id}_${i}`));
    }
  }
  const remote: RemoteDoc = { recipe: clean(rest), updatedAt: stamp(r), photoCount: photos.length, deleted: false };
  await f.setDoc(f.doc(db, "users", u.uid, "recipes", r.id), remote);
}

async function pushDelete(id: string, at: number): Promise<void> {
  const u = await user();
  if (!u) return rememberDelete(id, at);
  const { db, f } = await fb();
  const ref = f.doc(db, "users", u.uid, "recipes", id);
  const prev = await f.getDoc(ref);
  const count = (prev.data() as RemoteDoc | undefined)?.photoCount ?? 0;
  // Keep a small "deleted" marker so other devices remove it too.
  await f.setDoc(ref, { updatedAt: at, deleted: true } satisfies RemoteDoc);
  for (let i = 0; i < count; i++) await f.deleteDoc(f.doc(db, "users", u.uid, "photos", `${id}_${i}`));
  forgetDelete(id);
}

async function download(id: string, remote: RemoteDoc): Promise<SavedRecipe> {
  const u = (await user())!;
  const { db, f } = await fb();
  let photos: string[] = [];
  if (remote.photoCount) {
    const snap = await f.getDocs(f.query(f.collection(db, "users", u.uid, "photos"), f.where("recipeId", "==", id)));
    photos = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((x, y) => x.index - y.index)
      .map((p) => p.data);
  }
  return { ...(remote.recipe as SavedRecipe), photos, updatedAt: remote.updatedAt };
}

// ---------- lists & settings ----------
async function pushState(names: string[]): Promise<void> {
  const u = await user();
  if (!u || paused || !names.length) return;
  const { db, f } = await fb();
  const local = localEntries();
  for (const name of names) {
    const e = local[name];
    if (e) await f.setDoc(f.doc(db, "users", u.uid, "state", name), { value: e.value, updatedAt: e.updatedAt } satisfies Entry);
  }
}

/** Two-way sync of everything besides recipes. Returns true if this device changed. */
async function syncState(uid: string): Promise<boolean> {
  const { db, f } = await fb();
  const snap = await f.getDocs(f.collection(db, "users", uid, "state"));
  const remote: Record<string, Entry> = {};
  for (const d of snap.docs) {
    const data = d.data() as Partial<Entry>;
    if (typeof data.updatedAt === "number") remote[d.id] = { value: typeof data.value === "string" ? data.value : null, updatedAt: data.updatedAt };
  }
  const todo = plan(localEntries(), remote, isFirstSync(uid));
  for (const name of todo.apply) applyRemote(name, remote[name]);
  await pushState(todo.upload);
  markSynced(uid);
  return todo.apply.length > 0;
}

let syncing: Promise<void> | null = null;

/** Two-way sync of recipes and everything else: the newest version of each wins; deletions carry over. */
export function syncNow(): Promise<void> {
  syncing ??= (async () => {
    try {
      const u = await user();
      if (!u || paused) return;
      set({ status: "syncing" });
      const { db, f } = await fb();

      for (const [id, at] of Object.entries(pendingDeletes())) await pushDelete(id, at);

      const snap = await f.getDocs(f.collection(db, "users", u.uid, "recipes"));
      const remote = new Map(snap.docs.map((d) => [d.id, d.data() as RemoteDoc]));
      const local = new Map((await listRecipes()).map((r) => [r.id, r]));

      for (const [id, rd] of remote) {
        const lr = local.get(id);
        if (rd.deleted) {
          if (lr && stamp(lr) <= rd.updatedAt) await deleteRecipeFromCloud(id);
        } else if (!lr || stamp(lr) < rd.updatedAt) {
          await saveRecipeFromCloud(await download(id, rd));
        }
      }
      for (const [id, lr] of local) {
        const rd = remote.get(id);
        if (!rd || stamp(lr) > rd.updatedAt) await upload(lr, rd && !rd.deleted ? rd.photoCount : undefined);
      }
      stateDirty.clear(); // covered by the full sync below
      if (await syncState(u.uid)) announceChanges();
      set({ status: "synced", lastSync: Date.now(), message: undefined });
      window.dispatchEvent(new Event("recipes-synced"));
    } catch (e) {
      const offline = !navigator.onLine || (e as { code?: string })?.code === "unavailable";
      set(offline ? { status: "offline", message: "You're offline — changes will sync when you're back online." } : { status: "error", message: friendly(e) });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
