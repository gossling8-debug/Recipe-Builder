/**
 * Cardamix on the home screen: whether it's open from there (an icon added to
 * the home screen has its own storage, apart from the browser, so it needs its
 * own sign-in), which kind of phone and browser this is (for the right steps
 * to add it), and Android's own "Install app" prompt when the browser offers it.
 */
export type Device = "iphone" | "ipad" | "android" | "other";
export type Browser = "safari" | "chrome" | "samsung" | "firefox" | "edge" | "other";

/** Opened from a home screen icon (not in a browser tab). */
export function isStandalone(): boolean {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Which kind of device, from the browser's description of itself. iPads say they're Macs but have a touch screen. */
export function deviceFrom(ua: string, touchPoints = 0): Device {
  if (/iPhone|iPod/.test(ua)) return "iphone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "ipad";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function browserFrom(ua: string): Browser {
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/EdgiOS|EdgA|Edg\//.test(ua)) return "edge";
  if (/FxiOS|Firefox/.test(ua)) return "firefox";
  if (/CriOS|Chrome/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";
  return "other";
}

export const thisDevice = (): Device => deviceFrom(navigator.userAgent, navigator.maxTouchPoints ?? 0);
export const thisBrowser = (): Browser => browserFrom(navigator.userAgent);

/** The steps to add Cardamix to the home screen, for a device and browser. */
export function addSteps(device: Device, browser: Browser): string[] {
  if (device === "iphone" || device === "ipad") {
    const where = device === "ipad" ? "at the top right" : "at the bottom (or top) of the screen";
    if (browser === "chrome" || browser === "edge" || browser === "firefox")
      return [
        "Tap the Share button (a square with an arrow pointing up) in the address bar.",
        "Scroll down and tap “Add to Home Screen”. (If it isn't there, open cardamix.com in Safari and add it from there.)",
        "Tap “Add”.",
      ];
    return [
      `In Safari, tap the Share button (a square with an arrow pointing up) ${where}. If you don't see it, tap ••• first.`,
      "Scroll down and tap “Add to Home Screen”.",
      "Make sure “Open as Web App” is on if you see it, then tap “Add”.",
    ];
  }
  if (device === "android") {
    if (browser === "samsung")
      return ["Tap the menu button (☰) at the bottom right.", "Tap “Add page to”, then “Home screen”.", "Tap “Add”."];
    if (browser === "firefox") return ["Tap the menu button (⋮).", "Tap “Install” or “Add to Home screen”.", "Tap “Add”."];
    return ["In Chrome, tap the menu button (⋮) at the top right.", "Tap “Add to Home screen” or “Install app”.", "Tap “Install” (or “Add”)."];
  }
  return [];
}

// ---------- Android's own install prompt ----------
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

/** Keep the browser's install offer (it comes once, early) so a button can show it later. */
export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}
export const canInstall = () => !!deferred;
export function onInstallChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
/** Shows the browser's "Install Cardamix?" box. True if they installed it. */
export async function install(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred;
  deferred = null;
  await d.prompt();
  const { outcome } = await d.userChoice;
  listeners.forEach((l) => l());
  return outcome === "accepted";
}
