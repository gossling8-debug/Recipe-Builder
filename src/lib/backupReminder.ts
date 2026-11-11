/**
 * A gentle nudge for people whose recipes live only on this phone: once a
 * month (after the first week), suggest turning on cloud backup or exporting
 * a backup file. Never shown while signed in to cloud backup.
 */
const DAY = 86_400_000;
const LAST_KEY = "recipe-builder.lastBackup";
const SNOOZE_KEY = "recipe-builder.backupSnooze";

export interface NudgeInput {
  backedUpInCloud: boolean;
  recipeCount: number;
  oldestRecipeAt: number | null;
  lastBackup: number | null;
  snoozedUntil: number | null;
  now: number;
}

export function backupDue(i: NudgeInput): boolean {
  if (i.backedUpInCloud || i.recipeCount === 0 || i.oldestRecipeAt === null) return false;
  if (i.snoozedUntil && i.now < i.snoozedUntil) return false;
  if (i.now - i.oldestRecipeAt < 7 * DAY) return false; // give a new user a week
  return !i.lastBackup || i.now - i.lastBackup >= 30 * DAY;
}

const num = (key: string): number | null => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};
const put = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
};

export const lastBackup = () => num(LAST_KEY);
export const snoozedUntil = () => num(SNOOZE_KEY);
export const markBackedUp = (now = Date.now()) => put(LAST_KEY, now);
export const snoozeBackup = (now = Date.now()) => put(SNOOZE_KEY, now + 30 * DAY);
