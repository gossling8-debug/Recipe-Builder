import { describe, expect, it } from "vitest";
import { errorDetails } from "./errorReport";

describe("error reports", () => {
  it("keep only the message, a short stack, the kind of screen and the device", () => {
    const e = new Error("boom");
    const d = errorDetails(e, "promise", "#/recipe/abc-123-private-id", "Mozilla/5.0 (iPhone)");
    expect(d.message).toBe("boom");
    expect(d.screen).toBe("recipe");
    expect(d.where).toBe("promise");
    expect(d.device).toContain("iPhone");
    expect(d.stack.split("\n").length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(d)).not.toContain("abc-123-private-id");
  });
  it("handles non-errors and long text", () => {
    expect(errorDetails("plain text", null, "", "x").message).toBe("plain text");
    expect(errorDetails({ code: 1 }, null, "#/", "x").screen).toBe("home");
    expect(errorDetails(new Error("y".repeat(1000)), null, "#/family/b1/r2", "x").message.length).toBe(300);
    expect(errorDetails(new Error("z"), null, "#/family/b1/r2", "x").screen).toBe("family");
  });
});
