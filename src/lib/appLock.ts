/**
 * App lock: a passcode (and optionally Face ID / Touch ID / fingerprint) to
 * open the app on this phone. It's a privacy screen for this device — it
 * isn't synced, and it doesn't change the cloud account's own password.
 *
 * Face ID uses the browser's passkey support (WebAuthn): the phone checks the
 * face and only says yes or no; the app never sees any face data.
 */
const KEY = "recipe-builder.lock";

export interface LockSettings {
  salt: string; // base64
  hash: string; // base64 PBKDF2 of the passcode
  length: number; // 4 or 6 digits
  biometricId?: string; // base64url credential id, when Face ID is on
  after: number; // ms away before it locks again (0 = every time)
}

export const LOCK_AFTER = [
  { ms: 0, label: "Immediately" },
  { ms: 60_000, label: "After 1 minute" },
  { ms: 5 * 60_000, label: "After 5 minutes" },
  { ms: 15 * 60_000, label: "After 15 minutes" },
];

export function loadLock(): LockSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LockSettings) : null;
  } catch {
    return null;
  }
}
function saveLock(l: LockSettings | null) {
  try {
    if (l) localStorage.setItem(KEY, JSON.stringify(l));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("lock-changed"));
}

// ---------- passcode ----------
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(code: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 150_000 }, key, 256);
  return b64(bits);
}

export const validPasscode = (code: string) => /^(\d{4}|\d{6})$/.test(code);

export async function setPasscode(code: string): Promise<void> {
  if (!validPasscode(code)) throw new Error("Use 4 or 6 digits.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prev = loadLock();
  saveLock({ salt: b64(salt), hash: await derive(code, salt), length: code.length, after: prev?.after ?? 60_000, biometricId: prev?.biometricId });
}

export async function checkPasscode(code: string): Promise<boolean> {
  const l = loadLock();
  if (!l) return true;
  return (await derive(code, unb64(l.salt))) === l.hash;
}

export function setLockAfter(ms: number): void {
  const l = loadLock();
  if (l) saveLock({ ...l, after: ms });
}

export const removeLock = () => saveLock(null);

// ---------- too many wrong tries ----------
/** Seconds to wait after this many wrong passcodes in a row: none for the first 4, then growing. */
export function waitAfter(wrong: number): number {
  if (wrong < 5) return 0;
  return Math.min(30 * 2 ** (wrong - 5), 15 * 60);
}

// ---------- when to lock ----------
/** Lock again when coming back? `hiddenAt` is when the app went to the background. */
export function shouldRelock(lock: LockSettings | null, hiddenAt: number | null, now: number): boolean {
  if (!lock || hiddenAt === null) return false;
  return now - hiddenAt >= lock.after;
}

// ---------- Face ID (WebAuthn platform authenticator) ----------
const b64url = (buf: ArrayBuffer) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

export async function biometricAvailable(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== "undefined" && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Turns on Face ID: the phone asks to save a passkey for this app, confirmed with your face. */
export async function enableBiometric(): Promise<void> {
  const l = loadLock();
  if (!l) throw new Error("Set a passcode first.");
  let cred: Credential | null;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: "Cardamix" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "Cardamix app lock", displayName: "Cardamix app lock" },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60_000,
      },
    });
  } catch (e) {
    throw new Error(biometricError(e));
  }
  if (!cred) throw new Error("Face ID wasn't turned on.");
  saveLock({ ...l, biometricId: b64url((cred as PublicKeyCredential).rawId) });
}

export function disableBiometric(): void {
  const l = loadLock();
  if (l) saveLock({ ...l, biometricId: undefined });
}

/** Asks the phone to check your face. True if it did. */
export async function unlockWithBiometric(): Promise<boolean> {
  const l = loadLock();
  if (!l?.biometricId) return false;
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: unb64url(l.biometricId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!got;
  } catch {
    return false;
  }
}

function biometricError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return "Face ID was cancelled or isn't allowed in this browser.";
  if (name === "NotSupportedError" || name === "SecurityError") return "This browser can't use Face ID for websites. Your passcode still works.";
  return "Couldn't turn on Face ID. Your passcode still works.";
}

// ---------- wrong tries survive a reload ----------
const TRIES_KEY = "recipe-builder.lockTries";
export function loadTries(): { wrong: number; until: number } {
  try {
    return { wrong: 0, until: 0, ...(JSON.parse(localStorage.getItem(TRIES_KEY) ?? "{}") as object) };
  } catch {
    return { wrong: 0, until: 0 };
  }
}
export function saveTries(t: { wrong: number; until: number }): void {
  try {
    if (t.wrong) localStorage.setItem(TRIES_KEY, JSON.stringify(t));
    else localStorage.removeItem(TRIES_KEY);
  } catch {
    /* ignore */
  }
}

/** Clears the app's data on this phone (all of it, or all but `keep`). */
export async function eraseThisPhone(keep: string[] = []): Promise<void> {
  try {
    // Twice: removing synced items notes the removal in the sync bookkeeping, which the second pass clears.
    for (let pass = 0; pass < 2; pass++)
      for (const k of Object.keys(localStorage)) if (k.startsWith("recipe-builder.") && !keep.includes(k)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  await new Promise<void>((res) => {
    try {
      const req = indexedDB.deleteDatabase("recipe-builder");
      req.onsuccess = req.onerror = req.onblocked = () => res();
    } catch {
      res();
    }
  });
}
