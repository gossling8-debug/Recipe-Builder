import { describe, expect, it } from "vitest";
import { backupDue } from "./backupReminder";

const DAY = 86_400_000;
const now = 100 * DAY;
const base = { backedUpInCloud: false, recipeCount: 5, oldestRecipeAt: now - 20 * DAY, lastBackup: null, snoozedUntil: null, now };

describe("backup reminder", () => {
  it("nudges when recipes are only on this phone and never backed up", () => {
    expect(backupDue(base)).toBe(true);
  });
  it("never while cloud backup is on", () => {
    expect(backupDue({ ...base, backedUpInCloud: true })).toBe(false);
  });
  it("gives a new user a week, and skips an empty recipe box", () => {
    expect(backupDue({ ...base, oldestRecipeAt: now - 3 * DAY })).toBe(false);
    expect(backupDue({ ...base, recipeCount: 0, oldestRecipeAt: null })).toBe(false);
  });
  it("once a month after a backup file", () => {
    expect(backupDue({ ...base, lastBackup: now - 10 * DAY })).toBe(false);
    expect(backupDue({ ...base, lastBackup: now - 31 * DAY })).toBe(true);
  });
  it("'Not now' hides it until the snooze ends", () => {
    expect(backupDue({ ...base, snoozedUntil: now + DAY })).toBe(false);
    expect(backupDue({ ...base, snoozedUntil: now - DAY })).toBe(true);
  });
});
