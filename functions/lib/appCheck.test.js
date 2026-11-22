import { describe, expect, it } from "vitest";
import { APP_CHECK_SHARDS, appCheckDocIds, callStatus, dayKey, requestStatus, totals } from "./appCheck.js";

const httpReq = (headers) => ({ get: (h) => headers[h.toLowerCase()] });

describe("App Check (watch-only counts)", () => {
  it("a callable is 'verified' only when firebase-functions accepted the token", () => {
    expect(callStatus({ app: { appId: "x" }, rawRequest: httpReq({ "x-firebase-appcheck": "t" }) })).toBe("verified");
    expect(callStatus({ rawRequest: httpReq({ "x-firebase-appcheck": "forged" }) })).toBe("invalid");
    expect(callStatus({ rawRequest: httpReq({}) })).toBe("missing");
  });

  it("an AI request is checked with the Admin SDK", async () => {
    const verify = async (t) => {
      if (t !== "good") throw new Error("bad token");
    };
    expect(await requestStatus(httpReq({ "x-firebase-appcheck": "good" }), verify)).toBe("verified");
    expect(await requestStatus(httpReq({ "x-firebase-appcheck": "forged" }), verify)).toBe("invalid");
    expect(await requestStatus(httpReq({}), verify)).toBe("missing");
  });

  it("adds up the daily counts, ignoring junk", () => {
    expect(totals([{ ai: { verified: 3, missing: 1 } }, { ai: { verified: 2, invalid: "x" }, call: { missing: 4 } }, undefined])).toEqual({
      ai: { verified: 5, missing: 1, invalid: 0 },
      call: { verified: 0, missing: 4, invalid: 0 },
    });
    expect(dayKey(Date.parse("2026-11-22T23:59:00Z"))).toBe("2026-11-22");
    const ids = appCheckDocIds(Date.parse("2026-11-22T12:00:00Z"));
    expect(ids).toHaveLength(7 * APP_CHECK_SHARDS);
    expect(ids[0]).toBe("2026-11-22_0");
    expect(ids.at(-1)).toBe(`2026-11-16_${APP_CHECK_SHARDS - 1}`);
  });
});
