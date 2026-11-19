import { describe, expect, it } from "vitest";
import { videoSource } from "./videoLink";

describe("video links", () => {
  it("TikTok: reads the caption through oEmbed, then the page", () => {
    const v = videoSource("https://www.tiktok.com/@chef/video/7301234567890123456?is_from_webapp=1&sender_device=pc")!;
    expect(v.site).toBe("TikTok");
    expect(v.pages[0]).toBe("https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40chef%2Fvideo%2F7301234567890123456");
    expect(videoSource("vm.tiktok.com/ZMabc123/")!.site).toBe("TikTok");
  });
  it("Instagram: posts and reels through the captioned embed", () => {
    expect(videoSource("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz")!.pages[0]).toBe("https://www.instagram.com/p/C1a2B3c4D5e/embed/captioned/");
    expect(videoSource("https://instagram.com/p/AbC_dEf-123/")!.pages[0]).toBe("https://www.instagram.com/p/AbC_dEf-123/embed/captioned/");
    expect(videoSource("https://www.instagram.com/somechef/")).toBeNull();
  });
  it("YouTube: watch pages, short links and Shorts", () => {
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")!.pages).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
    expect(videoSource("https://youtu.be/dQw4w9WgXcQ?si=abc")!.pages[0]).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(videoSource("https://youtube.com/shorts/abcDEF12345")!.pages[0]).toBe("https://www.youtube.com/watch?v=abcDEF12345");
  });
  it("ignores ordinary recipe websites", () => {
    expect(videoSource("https://www.allrecipes.com/recipe/123/pie/")).toBeNull();
    expect(videoSource("not a link")).toBeNull();
  });
});
