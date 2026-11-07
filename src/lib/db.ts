import type { SavedRecipe } from "./schema";

// Recipes live in IndexedDB on this device. It holds far more than
// localStorage (photos included) and, once the browser grants "persistent"
// storage, isn't cleared automatically to free space.
const DB_NAME = "recipe-builder";
const STORE = "recipes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
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

export async function listRecipes(): Promise<SavedRecipe[]> {
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<SavedRecipe[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const getRecipe = (id: string) => run("readonly", (s) => s.get(id) as IDBRequest<SavedRecipe | undefined>);
export const saveRecipe = (r: SavedRecipe) => run("readwrite", (s) => s.put(r)).then(() => undefined);
export const deleteRecipe = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);

/** Asks the browser not to evict our data under storage pressure. Returns whether it agreed. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
