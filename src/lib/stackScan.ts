/**
 * Scanning a stack of recipe cards: each photo is one card; they're read one at a
 * time in the background while you keep taking photos. Cards waiting their turn are
 * kept on this phone (IndexedDB), so closing the app doesn't lose them; reading picks
 * up again when Cardamix is next opened. A card waits a few seconds after its last
 * photo, so its back can be added first.
 */
import { compressPhoto, stripDataUrl } from "./image";
import { listRecipes, newId, saveRecipe } from "./db";
import { duplicatesOf } from "./duplicates";
import { getApiKey } from "./settings";
import type { SavedRecipe } from "./schema";

export interface StackCard {
  id: string;
  photos: string[]; // data: URLs, front first
  status: "waiting" | "reading" | "done" | "failed";
  addedAt: number;
  /** Not read before this (the time of its last photo + a short wait for a back side). */
  readyAt: number;
  recipeId?: string;
  title?: string;
  /** Looks like a recipe that was already there (added anyway; the Duplicates page can sort it out). */
  twin?: string;
  error?: string;
}

export const BACK_SIDE_WAIT = 6000;
const DB = "cardamix-stack";
const STORE = "cards";

let cards: StackCard[] = [];
let loaded: Promise<void> | null = null;
let running = false;
let timer: number | undefined;
/** Why reading stopped for every card (out of free adds, offline…), until "Try again". */
let paused = "";

const changed = () => window.dispatchEvent(new Event("stack-changed"));

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    fn(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}
const keep = (c: StackCard) => tx("readwrite", (s) => s.put(c)).catch(() => {}); // memory still has it
const forget = (id: string) => tx("readwrite", (s) => s.delete(id)).catch(() => {});

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const db = await open();
      const all = await new Promise<StackCard[]>((resolve, reject) => {
        const r = db.transaction(STORE).objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result as StackCard[]);
        r.onerror = () => reject(r.error);
      });
      db.close();
      // A card that was being read when the app closed: read it again.
      cards = all.map((c) => (c.status === "reading" ? { ...c, status: "waiting" as const } : c)).sort((a, b) => a.addedAt - b.addedAt);
    } catch {
      cards = [];
    }
    changed();
  })();
  return loaded;
}

export const stackCards = () => cards;
export const stackPaused = () => paused;
export const stackBusy = () => cards.some((c) => c.status === "waiting" || c.status === "reading");

/** Adds a card (its front). Returns its id, for adding the back. */
export async function addCard(photo: string): Promise<string> {
  await load();
  const now = Date.now();
  const c: StackCard = { id: newId(), photos: [photo], status: "waiting", addedAt: now, readyAt: now + BACK_SIDE_WAIT };
  cards = [...cards, c];
  await keep(c);
  changed();
  void run();
  return c.id;
}

/** Adds the back of a card that hasn't started reading yet. */
export async function addBack(id: string, photo: string): Promise<boolean> {
  const c = cards.find((x) => x.id === id);
  if (!c || c.status !== "waiting" || c.photos.length >= 2) return false;
  const next = { ...c, photos: [...c.photos, photo], readyAt: Date.now() + 1500 };
  cards = cards.map((x) => (x.id === id ? next : x));
  await keep(next);
  changed();
  void run();
  return true;
}

export async function retryCard(id: string): Promise<void> {
  cards = cards.map((c) => (c.id === id ? { ...c, status: "waiting" as const, error: undefined, readyAt: 0 } : c));
  const c = cards.find((x) => x.id === id);
  if (c) await keep(c);
  changed();
  void run();
}

export async function removeCard(id: string): Promise<void> {
  cards = cards.filter((c) => c.id !== id);
  await forget(id);
  changed();
}

/** Clears cards that are done (their recipes stay in your recipes). */
export async function clearFinished(): Promise<void> {
  const done = cards.filter((c) => c.status === "done");
  cards = cards.filter((c) => c.status !== "done");
  for (const c of done) await forget(c.id);
  changed();
}

/** Starts (or restarts after a pause) reading the cards that are waiting. */
export async function resumeStack(): Promise<void> {
  await load();
  paused = "";
  changed();
  void run();
}

// Problems that would stop every card, not just this one: wait for the person instead of failing them all.
const STOPS_ALL = /used this month|allowance|upgrade|offline|internet|sign in|confirm your email|confirmed email|api key|credit|temporarily unavailable|trouble right now/i;

async function run(): Promise<void> {
  if (running || paused) return;
  running = true;
  try {
    for (;;) {
      const waiting = cards.filter((c) => c.status === "waiting");
      if (!waiting.length) break;
      const next = waiting.find((c) => c.readyAt <= Date.now());
      if (!next) {
        // The newest card is still waiting for a possible back side.
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void run(), Math.max(200, Math.min(...waiting.map((c) => c.readyAt)) - Date.now()));
        break;
      }
      await read(next);
      if (paused) break;
    }
  } finally {
    running = false;
  }
}

function update(id: string, patch: Partial<StackCard>): StackCard | undefined {
  cards = cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
  changed();
  return cards.find((c) => c.id === id);
}

async function read(card: StackCard): Promise<void> {
  update(card.id, { status: "reading", error: undefined });
  try {
    const { importRecipe } = await import("./claude");
    const { recipe, usage } = await importRecipe(getApiKey(), { kind: "photos", photos: card.photos.map(stripDataUrl) });
    if (!recipe.steps.length && !recipe.ingredients.length) throw new Error(recipe.warnings[0] ?? "No recipe was found on this card.");
    const thumbs = await Promise.all(card.photos.map((p) => fetch(p).then((r) => r.blob()).then((b) => compressPhoto(b, 1200, 0.7))));
    const saved: SavedRecipe = { ...recipe, id: newId(), createdAt: Date.now(), photos: thumbs, importCost: usage.cost };
    const twin = duplicatesOf(saved, await listRecipes().catch(() => [] as SavedRecipe[]))[0]?.recipe.title;
    await saveRecipe(saved);
    // Done: the photos aren't needed any more (the recipe keeps its own copies).
    const done = update(card.id, { status: "done", recipeId: saved.id, title: saved.title, twin, photos: [thumbs[0]] });
    if (done) await keep(done);
    window.dispatchEvent(new Event("recipes-changed"));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (STOPS_ALL.test(message)) {
      paused = message;
      const back = update(card.id, { status: "waiting", readyAt: 0 });
      if (back) await keep(back);
    } else {
      const failed = update(card.id, { status: "failed", error: message });
      if (failed) await keep(failed);
    }
  }
}
