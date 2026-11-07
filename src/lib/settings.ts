const KEY = "recipe-builder.apiKey";

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
