import { describe, expect, it } from "vitest";
import { cleanEmail, newestPerTarget, type Invite } from "./invites";

describe("invites", () => {
  it("tidies email addresses and turns down what isn't one", () => {
    expect(cleanEmail("  Sam.Smith@Example.COM ")).toBe("sam.smith@example.com");
    expect(cleanEmail("sam")).toBeNull();
    expect(cleanEmail("sam@example")).toBeNull();
    expect(cleanEmail("sam @example.com")).toBeNull();
  });
  it("shows one invite per list, the newest", () => {
    const i = (id: string, target: string, at: number) => ({ id, kind: "shop", target, at }) as Invite;
    expect(newestPerTarget([i("a", "L1", 1), i("b", "L1", 5), i("c", "L2", 3)]).map((x) => x.id)).toEqual(["b", "c"]);
  });
});
