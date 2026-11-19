import { describe, expect, it } from "vitest";
import { inviteRoute } from "./invite";

describe("inviteRoute", () => {
  it("finds a shopping list or cookbook invite in pasted text", () => {
    expect(inviteRoute("Shop together on Cardamix — open this:\nhttps://cardamix.com/#/shop/abc123XYZ")).toEqual({ name: "shopjoin", id: "abc123XYZ" });
    expect(inviteRoute("https://cardamix.com/#/join/Book_12345")).toEqual({ name: "join", id: "Book_12345" });
  });
  it("ignores anything else", () => {
    expect(inviteRoute("hello")).toBeNull();
    expect(inviteRoute("https://cardamix.com/#/shopping")).toBeNull();
  });
});
