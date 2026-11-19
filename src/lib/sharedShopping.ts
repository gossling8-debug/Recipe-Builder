import { useEffect, useState } from "react";
import { fb, user } from "./cloud";
import { getRecipe, newId } from "./db";
import { loadShopping, saveShopping, type ShoppingState } from "./shopping";
import { applySwaps } from "./swaps";
import type { SavedRecipe } from "./schema";

/**
 * A shopping list shared live with other people (a partner, the household).
 * Each person keeps their own account; only the list is shared: the recipes on
 * it (as a copy of what to buy — the others can't see your recipe box) and
 * what's been ticked off. Ticking still goes into the ticker's own pantry,
 * prices and budget. Anyone can leave; they keep a copy of the list.
 *
 * Firestore (see firestore.rules):
 *   shoppingLists/{id}                { owner, members[], names{uid: name}, createdAt }   (the id is the invite code)
 *   shoppingLists/{id}/entries/{uid}_{recipeId}  { title, scale, ingredients[], sourceId, addedBy, addedByName, at }
 *   shoppingLists/{id}/ticks/{itemKey}           { by, at }
 */
export interface SharedList {
  id: string;
  owner: string;
  members: string[];
  names: Record<string, string>;
  createdAt: number;
}
export interface SharedEntry {
  id: string;
  title: string;
  scale: number;
  ingredients: SavedRecipe["ingredients"];
  sourceId: string;
  addedBy: string;
  addedByName: string;
  at: number;
}
export interface SharedTick {
  key: string;
  by: string;
  at: number;
}

const KEY = "recipe-builder.sharedShopping"; // the list this account shops from (synced with the account)
let memory: string | null = null;
export function sharedListId(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}
/** No longer on a shared list (it was deleted, or I was taken off it): back to my own list. */
export const forgetSharedList = () => setSharedListId(null);
function setSharedListId(id: string | null) {
  memory = id;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* this visit only */
  }
  if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event("shared-shopping-changed")));
}

async function me() {
  const u = await user();
  if (!u) throw new Error("Sign in to share a shopping list.");
  return u;
}
const listId = () => (newId() + newId()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A recipe as it goes on the shared list: its ingredients (with your swaps, minus what you crossed off). */
export function entryFor(r: SavedRecipe, scale: number, skip: number[] | undefined, uid: string, name: string, now = Date.now()): Omit<SharedEntry, "id"> {
  const off = new Set(skip ?? []);
  const swapped = { ...r, ...applySwaps(r) };
  return {
    title: swapped.title.slice(0, 200),
    scale,
    ingredients: clean(swapped.ingredients.filter((_, i) => !off.has(i))).slice(0, 150),
    sourceId: r.id,
    addedBy: uid,
    addedByName: name,
    at: now,
  };
}

export async function getSharedList(id: string): Promise<SharedList | null> {
  await me();
  const { db, f } = await fb();
  try {
    const d = await f.getDoc(f.doc(db, "shoppingLists", id));
    return d.exists() ? ({ id, ...(d.data() as Omit<SharedList, "id">) } as SharedList) : null;
  } catch {
    return null;
  }
}

/** Puts my current list (recipes and ticks) onto a shared list I've just made or joined. */
async function uploadMine(id: string, uid: string, name: string) {
  const { db, f } = await fb();
  const s = loadShopping();
  for (const e of s.recipes) {
    const r = await getRecipe(e.id).catch(() => undefined);
    if (r) await f.setDoc(f.doc(db, "shoppingLists", id, "entries", `${uid}_${r.id}`), entryFor(r, e.scale, e.skip, uid, name));
  }
  // Copies kept from an earlier shared list go on too (they're on the shared list from now on).
  for (const c of s.copies ?? [])
    await f.setDoc(f.doc(db, "shoppingLists", id, "entries", `${uid}_copy-${c.id.replace(/[^a-zA-Z0-9-]/g, "").slice(-40)}`), {
      title: c.title,
      scale: c.scale,
      ingredients: clean(c.ingredients).slice(0, 150),
      sourceId: "",
      addedBy: uid,
      addedByName: name,
      at: Date.now(),
    });
  if (s.copies?.length) saveShopping({ ...loadShopping(), copies: [] });
  for (const k of s.checked) await f.setDoc(f.doc(db, "shoppingLists", id, "ticks", k), { by: uid, at: Date.now() }).catch(() => {});
}

/** Starts sharing my list. Returns the invite link. */
export async function startSharing(myName: string): Promise<string> {
  const u = await me();
  const { db, f } = await fb();
  const id = listId();
  const name = myName.trim().slice(0, 40) || (u.email ?? "Me").split("@")[0];
  await f.setDoc(f.doc(db, "shoppingLists", id), { owner: u.uid, members: [u.uid], names: { [u.uid]: name }, createdAt: Date.now() });
  await uploadMine(id, u.uid, name);
  setSharedListId(id);
  return inviteLink(id);
}

export const inviteLink = (id: string) => `${location.origin}${location.pathname}#/shop/${id}`;

/** Joins a shared list; my own list's recipes join it too. */
export async function joinSharedList(list: SharedList, myName: string): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  const name = myName.trim().slice(0, 40) || (u.email ?? "Me").split("@")[0];
  if (!list.members.includes(u.uid)) {
    await f.updateDoc(f.doc(db, "shoppingLists", list.id), { members: [...list.members, u.uid], [`names.${u.uid}`]: name });
  }
  await uploadMine(list.id, u.uid, list.names[u.uid] ?? name);
  setSharedListId(list.id);
}

/**
 * Stops sharing: my list becomes my own again, keeping a copy of everything on
 * it (others' recipes as copies). If I was the last one, the shared list goes.
 */
export async function leaveSharedList(): Promise<void> {
  const u = await me();
  const id = sharedListId();
  if (!id) return;
  // Stop keeping in step: the list empties as I leave, and my copy mustn't follow it.
  syncStop?.();
  syncStop = null;
  const { db, f } = await fb();
  const entries = (await f.getDocs(f.collection(db, "shoppingLists", id, "entries")).catch(() => null))?.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedEntry, "id">) })) ?? [];
  const ticks = (await f.getDocs(f.collection(db, "shoppingLists", id, "ticks")).catch(() => null))?.docs.map((d) => ({ key: d.id, ...(d.data() as Omit<SharedTick, "key">) })) ?? [];
  // My copy: my own recipes as recipe links; the others' as copies of what to buy.
  const s = loadShopping();
  // Entries that are one of my recipes stay recipe links; everything else (others', copies) becomes a copy.
  const isMyRecipe = (e: SharedEntry) => e.addedBy === u.uid && !!e.sourceId && s.recipes.some((r) => r.id === e.sourceId);
  const next: ShoppingState = {
    ...s,
    recipes: s.recipes.filter((r) => entries.some((e) => isMyRecipe(e) && e.sourceId === r.id)),
    copies: entries.filter((e) => !isMyRecipe(e)).map((e) => ({ id: e.id, title: e.title, scale: e.scale, ingredients: e.ingredients, from: e.addedByName })),
    checked: [...new Set([...s.checked, ...ticks.map((t) => t.key)])],
  };
  saveShopping(next);
  const list = await getSharedList(id);
  if (list) {
    const rest = list.members.filter((m) => m !== u.uid);
    if (rest.length === 0) {
      for (const sub of ["entries", "ticks"]) for (const d of (await f.getDocs(f.collection(db, "shoppingLists", id, sub))).docs) await f.deleteDoc(d.ref);
      await f.deleteDoc(f.doc(db, "shoppingLists", id));
    } else {
      await f.updateDoc(f.doc(db, "shoppingLists", id), {
        members: rest,
        names: Object.fromEntries(Object.entries(list.names).filter(([k]) => k !== u.uid)),
        ...(list.owner === u.uid ? { owner: rest[0] } : {}),
      });
    }
  }
  setSharedListId(null);
}

// ---------- while shared ----------
// Recipes I've just added: the shared list may not show them yet, so keeping in step doesn't drop them.
const justAdded = new Map<string, number>();
const justRemoved = new Map<string, number>(); // entry ids

/** Adds (or updates) one of my recipes on the shared list. */
export async function putEntry(recipeId: string, scale: number, skip?: number[]): Promise<void> {
  const id = sharedListId();
  if (!id) return;
  justAdded.set(recipeId, Date.now());
  const u = await me();
  const r = await getRecipe(recipeId);
  if (!r) return;
  const { db, f } = await fb();
  const list = await getSharedList(id);
  const name = list?.names[u.uid] ?? (u.email ?? "Me").split("@")[0];
  await f.setDoc(f.doc(db, "shoppingLists", id, "entries", `${u.uid}_${recipeId}`), entryFor(r, scale, skip, u.uid, name));
}
/** Takes a recipe (anyone's) off the shared list. */
export async function removeEntry(entryId: string): Promise<void> {
  const id = sharedListId();
  if (!id) return;
  justRemoved.set(entryId, Date.now());
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "shoppingLists", id, "entries", entryId));
}
export async function myEntryId(recipeId: string): Promise<string> {
  const u = await me();
  return `${u.uid}_${recipeId}`;
}
export async function setTick(key: string, on: boolean): Promise<void> {
  const id = sharedListId();
  if (!id) return;
  const u = await me();
  const { db, f } = await fb();
  const ref = f.doc(db, "shoppingLists", id, "ticks", key);
  if (on) await f.setDoc(ref, { by: u.uid, at: Date.now() });
  else await f.deleteDoc(ref);
}
/** Clears the shared list for everyone. */
export async function clearSharedList(): Promise<void> {
  const id = sharedListId();
  if (!id) return;
  const { db, f } = await fb();
  for (const sub of ["entries", "ticks"]) for (const d of (await f.getDocs(f.collection(db, "shoppingLists", id, sub))).docs) await f.deleteDoc(d.ref);
}

/** Live updates of the shared list: who's on it, the recipes and the ticks. Returns a stop function. */
export function watchSharedList(
  id: string,
  on: (v: { list: SharedList | null; entries: SharedEntry[]; ticks: SharedTick[]; error?: string }) => void,
): () => void {
  let stopped = false;
  const stops: (() => void)[] = [];
  const seen = new Set<string>(); // the first answer from each of the three, before showing anything
  let list: SharedList | null = null;
  let entries: SharedEntry[] = [];
  let ticks: SharedTick[] = [];
  const got = (part: string) => {
    seen.add(part);
    if (!stopped && seen.size === 3) on({ list, entries, ticks });
  };
  const fail = (e: unknown) => !stopped && on({ list, entries, ticks, error: e instanceof Error ? e.message : String(e) });
  void fb().then(({ db, f }) => {
    if (stopped) return;
    stops.push(
      f.onSnapshot(
        f.doc(db, "shoppingLists", id),
        (d) => {
          list = d.exists() ? ({ id, ...(d.data() as Omit<SharedList, "id">) } as SharedList) : null;
          got("list");
        },
        fail,
      ),
      f.onSnapshot(
        f.collection(db, "shoppingLists", id, "entries"),
        (q) => {
          entries = q.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedEntry, "id">) })).sort((a, b) => a.at - b.at);
          got("entries");
        },
        fail,
      ),
      f.onSnapshot(
        f.collection(db, "shoppingLists", id, "ticks"),
        (q) => {
          ticks = q.docs.map((d) => ({ key: d.id, ...(d.data() as Omit<SharedTick, "key">) }));
          got("ticks");
        },
        fail,
      ),
    );
  }, fail);
  return () => {
    stopped = true;
    stops.forEach((s) => s());
  };
}

/** A shared entry as a recipe the shopping list can combine. */
export const entryAsRecipe = (e: Pick<SharedEntry, "id" | "title" | "ingredients">): SavedRecipe =>
  ({ id: e.id, title: e.title, ingredients: e.ingredients, steps: [], servings: null, time: null, notes: null, tags: [], warnings: [], createdAt: 0 }) as unknown as SavedRecipe;

/** The shared list this account shops from, kept live (null id: not sharing). entries is null until loaded. */
export function useSharedShopping(): { id: string | null; list: SharedList | null; entries: SharedEntry[] | null; ticks: SharedTick[]; error: string } {
  const [id, setId] = useState(sharedListId);
  const [v, setV] = useState<{ list: SharedList | null; entries: SharedEntry[] | null; ticks: SharedTick[]; error: string }>({ list: null, entries: null, ticks: [], error: "" });
  useEffect(() => {
    const on = () => setId(sharedListId());
    window.addEventListener("shared-shopping-changed", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("shared-shopping-changed", on);
      window.removeEventListener("storage", on);
    };
  }, []);
  useEffect(() => {
    setV({ list: null, entries: null, ticks: [], error: "" });
    if (!id) return;
    return watchSharedList(id, (x) => setV({ list: x.list, entries: x.entries, ticks: x.ticks, error: x.error ?? "" }));
  }, [id]);
  return { id, ...v };
}

/**
 * Keeps my own record of what's on the list (which recipe pages, the badge and
 * leaving use) in step with the shared list: a recipe of mine someone took off
 * comes off mine too; one I added on my other phone is on it here too.
 */
export function reconcile(entries: SharedEntry[], uid: string, s: ShoppingState, now = Date.now()): ShoppingState | null {
  const mine = entries.filter((e) => e.addedBy === uid && e.sourceId);
  const keep = s.recipes.filter((r) => mine.some((e) => e.sourceId === r.id) || now - (justAdded.get(r.id) ?? 0) < 20_000);
  const added = mine.filter((e) => !keep.some((r) => r.id === e.sourceId) && now - (justRemoved.get(e.id) ?? 0) >= 20_000).map((e) => ({ id: e.sourceId, scale: e.scale }));
  const recipes = [...keep, ...added];
  const same = recipes.length === s.recipes.length && recipes.every((r) => s.recipes.some((x) => x.id === r.id && x.scale === r.scale));
  return same ? null : { ...s, recipes };
}

let syncStop: (() => void) | null = null;
/** Started once with the app: while this account shares a list, keep its own record in step. */
export function startSharedSync(): void {
  const wire = () => {
    syncStop?.();
    syncStop = null;
    const id = sharedListId();
    if (!id) return;
    void user().then((u) => {
      if (!u || sharedListId() !== id) return;
      syncStop = watchSharedList(id, ({ entries, error }) => {
        if (error) return;
        const next = reconcile(entries, u.uid, loadShopping());
        if (next) saveShopping(next);
      });
    });
  };
  window.addEventListener("shared-shopping-changed", wire);
  window.addEventListener("state-synced", wire);
  wire();
}
