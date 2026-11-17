import { describe, expect, it } from "vitest";
import { addSteps, browserFrom, deviceFrom } from "./homeScreen";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36";

describe("home screen steps", () => {
  it("tells phones and browsers apart", () => {
    expect([deviceFrom(IPHONE_SAFARI), browserFrom(IPHONE_SAFARI)]).toEqual(["iphone", "safari"]);
    expect([deviceFrom(IPHONE_CHROME), browserFrom(IPHONE_CHROME)]).toEqual(["iphone", "chrome"]);
    expect(deviceFrom(IPAD, 5)).toBe("ipad"); // iPads say they're Macs
    expect(deviceFrom(IPAD, 0)).toBe("other"); // a real Mac
    expect([deviceFrom(ANDROID_CHROME), browserFrom(ANDROID_CHROME)]).toEqual(["android", "chrome"]);
    expect([deviceFrom(SAMSUNG), browserFrom(SAMSUNG)]).toEqual(["android", "samsung"]);
  });
  it("gives each its own steps", () => {
    expect(addSteps("iphone", "safari")[0]).toMatch(/Share/);
    expect(addSteps("iphone", "safari").join(" ")).toMatch(/Add to Home Screen/);
    expect(addSteps("android", "chrome")[0]).toMatch(/⋮/);
    expect(addSteps("android", "samsung").join(" ")).toMatch(/Add page to/);
    expect(addSteps("other", "chrome")).toEqual([]);
  });
});
