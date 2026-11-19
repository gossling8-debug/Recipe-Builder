import { describe, expect, it } from "vitest";
import { linkFrom } from "./shareTarget";

describe("shared to Cardamix", () => {
  it("finds the link wherever the app put it", () => {
    expect(linkFrom(new URLSearchParams("url=https://www.tiktok.com/@a/video/1"))).toBe("https://www.tiktok.com/@a/video/1");
    expect(linkFrom(new URLSearchParams({ text: "Check this out! https://youtu.be/abcDEF123, so good" }))).toBe("https://youtu.be/abcDEF123");
    expect(linkFrom(new URLSearchParams("text=no link here"))).toBeNull();
  });
});
