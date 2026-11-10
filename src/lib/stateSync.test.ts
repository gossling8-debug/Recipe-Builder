import { describe, expect, it } from "vitest";
import { plan, syncedName } from "./stateSync";

const e = (value: string | null, updatedAt: number) => ({ value, updatedAt });

describe("what syncs", () => {
  it("syncs lists and settings, never the API key or the local recipe copy", () => {
    expect(syncedName("recipe-builder.pantry")).toBe("pantry");
    expect(syncedName("recipe-builder.shopping")).toBe("shopping");
    expect(syncedName("recipe-builder.thaw.done")).toBe("thaw.done");
    expect(syncedName("recipe-builder.progress.abc")).toBe("progress.abc");
    expect(syncedName("recipe-builder.apiKey")).toBeNull();
    expect(syncedName("recipe-builder.recipes")).toBeNull();
    expect(syncedName("recipe-builder.cloud.deletes")).toBeNull();
    expect(syncedName("recipe-builder.library.filter")).toBeNull();
    expect(syncedName("something-else")).toBeNull();
  });
});

describe("merging", () => {
  it("the newest change wins", () => {
    const r = plan({ pantry: e("A", 200), week: e("W1", 100) }, { pantry: e("B", 150), week: e("W2", 300) }, false);
    expect(r).toEqual({ apply: ["week"], upload: ["pantry"] });
  });
  it("uploads what the cloud doesn't have, and takes what this device doesn't have", () => {
    expect(plan({ pantry: e("A", 5) }, { prices: e("P", 5) }, false)).toEqual({ apply: ["prices"], upload: ["pantry"] });
  });
  it("on a device's first sync, the cloud's copy wins — a fresh phone can't wipe out real lists", () => {
    const freshPhone = { shopping: e('{"recipes":[]}', 9_999_999) };
    const cloud = { shopping: e('{"recipes":[{"id":"chili"}]}', 100) };
    expect(plan(freshPhone, cloud, true)).toEqual({ apply: ["shopping"], upload: [] });
  });
  it("a removal on this device is uploaded as a change", () => {
    expect(plan({ leftovers: e(null, 500) }, { leftovers: e("[…]", 100) }, false)).toEqual({ apply: [], upload: ["leftovers"] });
  });
  it("nothing to do when they match", () => {
    expect(plan({ units: e('"metric"', 100) }, { units: e('"metric"', 100) }, false)).toEqual({ apply: [], upload: [] });
  });
});
