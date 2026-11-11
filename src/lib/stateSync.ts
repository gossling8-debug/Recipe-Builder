/**
 * Syncing everything besides recipes: pantry, shopping list, week plan,
 * prices, settings and so on. Each saved item (a localStorage key) is
 * stored whole in the cloud with the time it last changed; the newest
 * change wins. The first sync on a device takes the cloud's copy, so a
 * fresh phone's empty lists never wipe out the real ones.
 *
 * Never synced: the Anthropic API key, the local copy of recipes (recipes
 * sync on their own), and short-lived flags.
 */
const PREFIX = "recipe-builder.";
const SYNCED = new Set([
  "week", "plans", "units", "textSize", "staples", "shopping", "receipts", "prices", "spendingFrom", "budget",
  "pantry", "leftovers", "people", "avoid", "featuresOff", "previewPlus", "plan", "model", "usage", "waitForTap",
  "thaw.notFrozen", "thaw.done", "welcomeDone",
]);
const SYNCED_PREFIXES = ["progress."];
const META_KEY = PREFIX + "syncMeta";

/** "recipe-builder.pantry" → "pantry" if it's synced, else null. */
export function syncedName(fullKey: string): string | null {
  if (!fullKey.startsWith(PREFIX)) return null;
  const name = fullKey.slice(PREFIX.length);
  return SYNCED.has(name) || SYNCED_PREFIXES.some((p) => name.startsWith(p)) ? name : null;
}

export interface Entry {
  value: string | null; // the saved JSON text; null = removed
  updatedAt: number;
}

/**
 * What to do with each item: take the cloud's copy, or upload ours.
 * firstSync: this device hasn't synced with this account yet — the cloud wins.
 */
export function plan(local: Record<string, Entry>, remote: Record<string, Entry>, firstSync: boolean): { apply: string[]; upload: string[] } {
  const apply: string[] = [];
  const upload: string[] = [];
  for (const name of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[name];
    const r = remote[name];
    if (r && (!l || firstSync || r.updatedAt > l.updatedAt)) {
      if (!l || l.value !== r.value) apply.push(name);
    } else if (l && (!r || l.updatedAt > r.updatedAt)) {
      upload.push(name);
    }
  }
  return { apply: apply.sort(), upload: upload.sort() };
}

// ---------- bookkeeping on this device ----------
interface Meta {
  uid?: string; // the account this device last synced with
  times: Record<string, number>; // name → when it last changed here
}
let original: { set: Storage["setItem"]; remove: Storage["removeItem"] } | null = null;

function readMeta(): Meta {
  try {
    return { times: {}, ...(JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as Partial<Meta>) };
  } catch {
    return { times: {} };
  }
}
function writeMeta(m: Meta) {
  try {
    (original?.set ?? localStorage.setItem).call(localStorage, META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/**
 * Notes when a synced item changes on this device (and tells `onChange`, to
 * upload it soon). Works for every part of the app without changing each save.
 */
export function trackLocalChanges(onChange: (name: string) => void): void {
  if (original || typeof Storage === "undefined") return;
  const proto = Storage.prototype;
  original = { set: proto.setItem, remove: proto.removeItem };
  const touched = (storage: Storage, key: string) => {
    const name = storage === window.localStorage ? syncedName(key) : null;
    if (!name) return;
    const m = readMeta();
    m.times[name] = Date.now();
    writeMeta(m);
    onChange(name);
  };
  // Saving the same value again isn't a change.
  proto.setItem = function (key: string, value: string) {
    const before = this.getItem(key);
    original!.set.call(this, key, value);
    if (before !== String(value)) touched(this, key);
  };
  proto.removeItem = function (key: string) {
    const before = this.getItem(key);
    original!.remove.call(this, key);
    if (before !== null) touched(this, key);
  };
}

/** Synced items on this device, with when each last changed (0 if before syncing existed). */
export function localEntries(): Record<string, Entry> {
  const times = readMeta().times;
  const out: Record<string, Entry> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const name = syncedName(key);
    if (name) out[name] = { value: localStorage.getItem(key), updatedAt: times[name] ?? 1 };
  }
  // Removed here since the last sync: the removal itself is the change.
  for (const [name, t] of Object.entries(times)) if (!(name in out)) out[name] = { value: null, updatedAt: t };
  return out;
}

/** Puts the cloud's copy on this device without counting it as a new change. */
export function applyRemote(name: string, e: Entry): void {
  const key = PREFIX + name;
  const set = original?.set ?? Storage.prototype.setItem;
  const remove = original?.remove ?? Storage.prototype.removeItem;
  if (e.value === null) remove.call(localStorage, key);
  else set.call(localStorage, key, e.value);
  const m = readMeta();
  m.times[name] = e.updatedAt;
  writeMeta(m);
}

/** After deleting the account: a new account on this phone starts with a first sync. */
export function forgetSyncedAccount(): void {
  writeMeta({ times: readMeta().times });
}

export const isFirstSync = (uid: string) => readMeta().uid !== uid;
export function markSynced(uid: string): void {
  const m = readMeta();
  m.uid = uid;
  writeMeta(m);
}

/** Tells the open screens that their saved data may have changed. */
export function announceChanges(): void {
  for (const ev of ["week-changed", "leftovers-changed", "staples-changed", "thaw-changed", "features-changed", "shopping-changed", "units-changed", "state-synced"])
    window.dispatchEvent(new Event(ev));
}
