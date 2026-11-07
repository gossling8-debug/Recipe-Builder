const KEY = "recipe-builder.apiKey";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Returns false if the browser refused to store it. */
export function setApiKey(value: string): boolean {
  try {
    if (value) localStorage.setItem(KEY, value.trim());
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
