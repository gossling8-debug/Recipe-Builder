/**
 * The first-login tour: shown once per account (the flag syncs with the
 * account, so a second phone doesn't show it again). Settings can start it
 * again.
 */
const KEY = "recipe-builder.tourDone";

// "Take the tour again" is for this phone only, so it's kept out of the synced flag.
const AGAIN = "cardamix-tour-again";

/** Seen (and not asked to replay here). */
export function tourDone(): boolean {
  try {
    if (sessionStorage.getItem(AGAIN) === "1") return false;
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: don't show it on every visit
  }
}
export function finishTour(): void {
  try {
    sessionStorage.removeItem(AGAIN);
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}
/** "Take the tour again" (Settings): replays it on this phone. */
export function restartTour(): void {
  try {
    sessionStorage.setItem(AGAIN, "1");
  } catch {
    /* ignore */
  }
}

export interface TourStep {
  /** The button to point at (skipped if it isn't on screen, e.g. a feature that's off). None: a card on its own. */
  target?: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '.tabbar a[href="#/scan"]',
    title: "Add a recipe",
    text: "Snap a recipe card or cookbook page, paste a website link or text, or have one created for you.",
  },
  {
    target: '.tabbar a[href="#/family"]',
    title: "Cookbooks",
    text: "Share recipes and family memories with the people you cook with. The Mix has recipes from other cooks.",
  },
  {
    target: '.tabbar a[href="#/budget"]',
    title: "Budget",
    text: "Your weekly grocery budget and receipts, and which store is cheapest for things you've bought at more than one.",
  },
  {
    target: '.tabbar a[href="#/tonight"]',
    title: "Tonight",
    text: "What's for dinner tonight, or an idea when you can't decide.",
  },
  {
    target: '.topbar a[href="#/week"]',
    title: "Your week",
    text: "Plan the week's meals, or let Fill my week do it.",
  },
  {
    target: '.topbar a[href="#/pantry"]',
    title: "Pantry",
    text: "What you have at home. Can make now shows the recipes you have everything for, and you're reminded to use things before they go bad.",
  },
  {
    target: '.topbar a[href="#/shopping"]',
    title: "Shopping list",
    text: "Add a recipe's ingredients and they're combined into one list, leaving out what's already in your pantry. Note what you paid as you shop to track prices.",
  },
  {
    target: '.topbar a[href="#/settings"]',
    title: "Settings",
    text: "Turn features on or off, set foods to avoid, change the text size and look. You can take this tour again here.",
  },
];

/** The steps whose button is on screen right now (and those that point at nothing). */
export function visibleSteps(steps: TourStep[], exists: (selector: string) => boolean): TourStep[] {
  return steps.filter((s) => !s.target || exists(s.target));
}

// ---------- the second tour: adding your first recipe ----------
// Straight after the home screen tour (when it's finished, not skipped): it opens Add Recipe and starts there.
const ADD_NEXT = "cardamix-add-tour";
export function queueAddTour(): void {
  try {
    sessionStorage.setItem(ADD_NEXT, "1");
  } catch {
    /* ignore */
  }
}
export function addTourQueued(): boolean {
  try {
    return sessionStorage.getItem(ADD_NEXT) === "1";
  } catch {
    return false;
  }
}
export function finishAddTour(): void {
  try {
    sessionStorage.removeItem(ADD_NEXT);
  } catch {
    /* ignore */
  }
}

export const ADD_TOUR_STEPS: TourStep[] = [
  {
    target: ".mode-switch",
    title: "Four ways to add a recipe",
    text: "Photo: a recipe card or cookbook page. Website: paste a recipe's link. Paste text: from a message, email or note. Create: describe a dish and Claude writes the recipe.",
  },
  {
    target: ".fab-stack",
    title: "Snap a recipe card",
    text: "Tap Scan a card to use the camera — it finds the card and straightens it — or Choose from photos. If the recipe continues on the back, add a second photo.",
  },
  {
    target: ".scan-labels",
    title: "Labels (optional)",
    text: "Pick labels like Dinner or Dessert, or leave them off and Claude suggests some. You can filter your recipes by them later.",
  },
  {
    target: ".verify-email",
    title: "Confirm your email first",
    text: "Reading recipes uses AI, which needs a confirmed email. Tap the link we emailed you, then “I've confirmed it”.",
  },
  {
    title: "Then tap Read recipe",
    text: "Claude reads it in about half a minute, keeping every amount in the steps. Check it over, and it's saved to your recipes. That's it — try your first one!",
  },
]
