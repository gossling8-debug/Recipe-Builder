import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { nextReadingUnclear, signUp } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * The live scanner with a stand-in camera: a short looping video (made here, not stored)
 * of an empty table for 2 seconds, then a recipe card held a little unsteadily for 3.
 */
const VIDEO = join(dirname(fileURLToPath(import.meta.url)), ".out", "fake-camera.y4m");
const W = 480, H = 640, FPS = 15;

function makeVideo() {
  mkdirSync(dirname(VIDEO), { recursive: true });
  const frames: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`)];
  let seed = 3;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let f = 0; f < FPS * 5; f++) {
    const y = Buffer.alloc(W * H);
    for (let i = 0; i < y.length; i++) y[i] = 55 + ((rand() * 20) | 0); // a dark table
    if (f >= FPS * 2) {
      // The card, moving a pixel or two as a hand would.
      const ox = 50 + Math.round(2 * Math.sin(f / 3)), oy = 200 + Math.round(2 * Math.cos(f / 2.5));
      for (let r = 0; r < 260; r++)
        for (let c = 0; c < 380; c++) {
          const line = r > 30 && (r - 30) % 34 < 10 && c > 25 && c < 330 && (c >> 3) % 5 !== 4; // rows of "writing"
          y[(oy + r) * W + ox + c] = line ? 70 : 232;
        }
    }
    frames.push(Buffer.from("FRAME\n"), y, Buffer.alloc((W * H) / 2, 128)); // grey (no colour)
  }
  writeFileSync(VIDEO, Buffer.concat(frames));
}
makeVideo();

test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${VIDEO}`] },
  permissions: ["camera"],
});

test("live scanner: corners to aim at, finds the card, takes the picture by itself", async ({ page }) => {
  await signUp(page, "scan");
  await page.goto("./#/scan");
  await page.getByRole("button", { name: "Scan a card" }).click();

  const scanner = page.getByRole("dialog", { name: "Scanner" });
  // Auto off while we look (the video loops, so the camera may start on either part).
  await scanner.getByRole("button", { name: "Auto" }).click();
  const status = scanner.getByRole("status");
  // Nothing in view: the corners to aim at.
  await expect(status).toHaveText("Fit the card inside the corners", { timeout: 30_000 });
  // The card comes into view and is found.
  await expect(status).toHaveText("Found it — tap the button", { timeout: 15_000 });
  // Auto on: once the card holds steady, the picture is taken without a tap.
  await scanner.getByRole("button", { name: "Auto" }).click();
  await expect(scanner.getByText("Check the scan")).toBeVisible({ timeout: 30_000 });
  await expect(scanner.getByAltText("The scanned page")).toBeVisible({ timeout: 15_000 });
  // The straightened scan is the card's shape (wider than tall), not the whole camera picture (taller than wide).
  const size = await scanner.getByAltText("The scanned page").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size[0]).toBeGreaterThan(size[1]);

  await scanner.getByRole("button", { name: "Keep scan" }).click();
  await scanner.getByRole("button", { name: /Done · 1 page/ }).click();
  await expect(page.locator(".photo-grid img")).toHaveCount(1);
});

/** Scan a card with the stand-in camera (Auto on) and add it. Ends with the photo on the scan screen. */
async function scanCard(page: Page) {
  await page.getByRole("button", { name: "Scan a card" }).click();
  const scanner = page.getByRole("dialog", { name: "Scanner" });
  await scanner.getByRole("button", { name: "Keep scan" }).click({ timeout: 45_000 });
  await scanner.getByRole("button", { name: /Done · 1 page/ }).click();
  await expect(page.locator(".photo-grid img")).toHaveCount(1);
}

test("a reading that had trouble offers to retake the photo, and the retake replaces the same recipe", async ({ page }) => {
  await signUp(page, "retake");
  await page.goto("./#/scan");
  await scanCard(page);
  await nextReadingUnclear();
  await page.getByRole("button", { name: "Read recipe" }).click();

  // The reading had trouble: the note says so and offers a retake.
  const note = page.locator(".callout.warn");
  await expect(note).toContainText("hard to read", { timeout: 45_000 });
  const firstTitle = await page.locator("h1").first().textContent();
  const recipeUrl = page.url();
  await note.getByRole("button", { name: "Retake the photo" }).click();

  // Retake mode: about this recipe, photos only.
  await expect(page.getByRole("heading", { name: "Retake the photo" })).toBeVisible();
  await expect(page.locator(".retake-note")).toContainText(firstTitle!.trim());
  await expect(page.getByRole("tablist", { name: "Add from" })).toHaveCount(0);
  await scanCard(page);
  await page.getByRole("button", { name: "Read recipe" }).click();

  // Back on the same recipe, with the new reading and no trouble note.
  await expect(page.locator(".my-notes")).toBeVisible({ timeout: 45_000 });
  expect(page.url()).toBe(recipeUrl);
  await expect(page.locator("h1").first()).not.toHaveText(firstTitle!);
  await expect(page.locator(".callout.warn")).toHaveCount(0);
  // Replaced, not added: still one recipe.
  await page.goto("./#/");
  await expect(page.locator(".recipe-row")).toHaveCount(1);
});

test("a clear reading doesn't offer a retake", async ({ page }) => {
  await signUp(page, "clear");
  await page.goto("./#/scan");
  await scanCard(page);
  await page.getByRole("button", { name: "Read recipe" }).click();
  await expect(page.locator(".my-notes")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Retake the photo" })).toHaveCount(0);
});

test("scanning leaves no big drawing surfaces behind (iPhone Safari goes black when they pile up)", async ({ page }) => {
  // Track every canvas the app makes.
  await page.addInitScript(() => {
    const made: HTMLCanvasElement[] = ((window as unknown as { __canvases: HTMLCanvasElement[] }).__canvases = []);
    const create = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, tag: string, opts?: ElementCreationOptions) {
      const el = create.call(this, tag, opts);
      if (String(tag).toLowerCase() === "canvas") made.push(el as HTMLCanvasElement);
      return el;
    } as typeof Document.prototype.createElement;
  });
  await signUp(page, "mem");
  await page.goto("./#/scan");
  await scanCard(page);
  await page.getByRole("button", { name: "Read recipe" }).click();
  await expect(page.locator(".my-notes")).toBeVisible({ timeout: 45_000 });
  // Pixels still held by canvases that are no longer on screen.
  const left = await page.evaluate(() =>
    (window as unknown as { __canvases: HTMLCanvasElement[] }).__canvases
      .filter((c) => !c.isConnected)
      .reduce((n, c) => n + c.width * c.height, 0),
  );
  expect(left).toBeLessThan(500_000); // well under one camera frame
});
