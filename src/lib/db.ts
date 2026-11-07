import type { SavedRecipe } from "./schema";

/**
 * Where recipes are kept. Browsers differ in what they allow, so the app
 * uses the best option that works:
 *   "indexeddb" – the normal choice: large, keeps photos.
 *   "local"     – smaller fallback (about 5 MB) for browsers that block IndexedDB.
 *                 Photos are dropped if space runs out.
 *   "memory"    – nothing can be stored; recipes last until the app is closed.
 */
export type StorageMode = "indexeddb" | "local" | "memory";

interface Backend {
  mode: StorageMode;
  list(): Promise<SavedRecipe[]>;
  put(r: SavedRecipe): Promise<void>;
  remove(id: string): Promise<void>;
}

// ---------- IndexedDB ----------
const DB_NAME = "recipe-builder";
const STORE = "recipes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const indexedDbBackend: Backend = {
  mode: "indexeddb",
  list: () => run("readonly", (s) => s.getAll() as IDBRequest<SavedRecipe[]>),
  put: (r) => run("readwrite", (s) => s.put(r)).then(() => undefined),
  remove: (id) => run("readwrite", (s) => s.delete(id)).then(() => undefined),
};

// ---------- localStorage ----------
const LS_KEY = "recipe-builder.recipes";

function lsRead(): SavedRecipe[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SavedRecipe[]) : [];
  } catch {
    return [];
  }
}

const localBackend: Backend = {
  mode: "local",
  list: async () => lsRead(),
  put: async (r) => {
    const others = lsRead().filter((x) => x.id !== r.id);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify([...others, r]));
    } catch {
      // Out of space: keep the recipe, drop its photos.
      localStorage.setItem(LS_KEY, JSON.stringify([...others, { ...r, photos: [] }]));
    }
  },
  remove: async (id) => {
    localStorage.setItem(LS_KEY, JSON.stringify(lsRead().filter((x) => x.id !== id)));
  },
};

// ---------- memory ----------
const memory = new Map<string, SavedRecipe>();
const memoryBackend: Backend = {
  mode: "memory",
  list: async () => [...memory.values()],
  put: async (r) => void memory.set(r.id, r),
  remove: async (id) => void memory.delete(id),
};

// ---------- choose ----------
async function indexedDbWorks(): Promise<boolean> {
  try {
    (await openDb()).close();
    return true;
  } catch {
    return false;
  }
}

function localStorageWorks(): boolean {
  try {
    localStorage.setItem("recipe-builder.test", "1");
    localStorage.removeItem("recipe-builder.test");
    return true;
  } catch {
    return false;
  }
}

let chosen: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  chosen ??= (async () => {
    if (typeof indexedDB !== "undefined" && (await indexedDbWorks())) return indexedDbBackend;
    if (localStorageWorks()) return localBackend;
    return memoryBackend;
  })();
  return chosen;
}

export const storageMode = async (): Promise<StorageMode> => (await backend()).mode;

export async function listRecipes(): Promise<SavedRecipe[]> {
  const all = await (await backend()).list();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecipe(id: string): Promise<SavedRecipe | undefined> {
  return (await (await backend()).list()).find((r) => r.id === id);
}

export const saveRecipe = async (r: SavedRecipe) => (await backend()).put(r);
export const deleteRecipe = async (id: string) => (await backend()).remove(id);

/** Asks the browser not to evict our data under storage pressure. Returns whether it agreed. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Plain-language explanation of each mode, for the banner and Settings. */
export const STORAGE_MODE_TEXT: Record<StorageMode, string> = {
  indexeddb: "Full storage — recipes and photos are saved on this phone.",
  local:
    "Limited storage — this browser blocks the app's main storage, so recipes go in a smaller space. Recipes are saved, but photos may be dropped if it fills up.",
  memory:
    "Not saving — this browser won't let the app store anything. Recipes you scan disappear when the app closes, and you'll need to re-enter your API key each time. Use Export backup to keep them.",
};

export function isStorageBlocked(err: unknown): boolean {
  return err instanceof DOMException && err.name === "SecurityError";
}

/** Friendly text for an error from the recipe storage. */
export function storageErrorMessage(err: unknown): string {
  if (isStorageBlocked(err)) return STORAGE_MODE_TEXT.memory;
  return `Couldn't use this phone's storage: ${err instanceof Error ? err.message : String(err)}`;
}
