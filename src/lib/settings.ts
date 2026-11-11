import { firebaseConfig } from "./firebaseConfig";

const KEY = "recipe-builder.apiKey";

/** AI works for everyone through the app's server; your own key (advanced) is optional. */
export const aiReady = () => !!firebaseConfig || !!getApiKey();
/** Using your own Anthropic key instead of the app's AI allowance. */
export const ownKey = () => !!getApiKey();

// If the browser blocks storage, the key is kept in memory for this session only.
let sessionKey = "";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? sessionKey;
  } catch {
    return sessionKey;
  }
}

/** Returns true if the key was saved on the phone, false if only for this session. */
export function setApiKey(value: string): boolean {
  sessionKey = value.trim();
  try {
    if (sessionKey) localStorage.setItem(KEY, sessionKey);
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
