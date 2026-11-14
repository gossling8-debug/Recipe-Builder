import { describe, expect, it } from "vitest";
import { shouldRelock, validPasscode, waitAfter, type LockSettings } from "./appLock";

const lock = (after: number): LockSettings => ({ salt: "", hash: "", length: 4, after });

describe("app lock", () => {
  it("passcodes are 4 or 6 digits", () => {
    expect(validPasscode("1234")).toBe(true);
    expect(validPasscode("123456")).toBe(true);
    expect(validPasscode("12345")).toBe(false);
    expect(validPasscode("12a4")).toBe(false);
  });
  it("locks again after the chosen time away", () => {
    expect(shouldRelock(lock(60_000), 1_000, 30_000)).toBe(false);
    expect(shouldRelock(lock(60_000), 1_000, 61_000)).toBe(true);
    expect(shouldRelock(lock(0), 1_000, 1_001)).toBe(true);
    expect(shouldRelock(null, 1_000, 999_999)).toBe(false);
  });
  it("makes you wait after repeated wrong passcodes", () => {
    expect(waitAfter(4)).toBe(0);
    expect(waitAfter(5)).toBe(30);
    expect(waitAfter(6)).toBe(60);
    expect(waitAfter(20)).toBe(900);
  });
});

import { lockOnLoad, REFRESH_GRACE } from "./appLock";
describe("locking as the app loads", () => {
  const lock = { salt: "", hash: "", length: 4, after: 60_000 };
  const now = 1_000_000;
  it("locks when opened, not when refreshed while in use", () => {
    expect(lockOnLoad(null, "navigate", null, now)).toBe(false);
    expect(lockOnLoad(lock, "navigate", now - 1000, now)).toBe(true);
    expect(lockOnLoad(lock, "reload", null, now)).toBe(true);
    expect(lockOnLoad(lock, "reload", now - 5000, now)).toBe(false);
  });
  it("still locks a refresh after being away longer than the lock time", () => {
    expect(lockOnLoad(lock, "reload", now - 61_000, now)).toBe(true);
    expect(lockOnLoad({ ...lock, after: 0 }, "reload", now - 5000, now)).toBe(false);
    expect(lockOnLoad({ ...lock, after: 0 }, "reload", now - REFRESH_GRACE - 1, now)).toBe(true);
  });
});
