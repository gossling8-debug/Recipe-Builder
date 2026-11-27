import { expect, test } from "@playwright/test";
import { clearLastAiMessage, lastAiMessage, newEmail, signUp } from "./helpers";

test("setup asks what's in your kitchen, and Settings keeps it", async ({ page }) => {
  // Sign up, but go through setup instead of skipping it.
  await page.goto("./");
  await page.locator(".account-screen form").waitFor({ timeout: 30_000 });
  await page.fill("input[type=email]", newEmail("kitchen"));
  await page.fill(".password-row input", "secret1");
  await page.click("button[type=submit]");
  await page.getByRole("button", { name: "Next" }).click({ timeout: 30_000 }); // how many people
  await expect(page.getByRole("heading", { name: "What's in your kitchen?" })).toBeVisible();
  const devices = page.getByRole("group", { name: "Kitchen devices" });
  await devices.getByRole("button", { name: "Air fryer" }).click();
  await expect(devices.getByRole("button", { name: "Air fryer" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.getByRole("button", { name: "Skip tour" }).click({ timeout: 15_000 });

  // Settings shows it, and a change there is kept.
  await page.goto("./#/settings");
  const inSettings = page.getByRole("group", { name: "Kitchen devices" });
  await expect(inSettings.getByRole("button", { name: "Air fryer" })).toHaveAttribute("aria-pressed", "true");
  await inSettings.getByRole("button", { name: "Slow cooker" }).click();
  await page.reload();
  await expect(page.getByRole("group", { name: "Kitchen devices" }).getByRole("button", { name: "Slow cooker" })).toHaveAttribute("aria-pressed", "true");
});

test("Create a recipe tells the AI which devices you have", async ({ page }) => {
  await signUp(page, "devices");
  await page.goto("./#/settings");
  await page.getByRole("group", { name: "Kitchen devices" }).getByRole("button", { name: "Instant Pot / pressure cooker" }).click();

  await page.goto("./#/scan");
  await page.getByRole("tab", { name: "Create" }).click();
  await page.getByPlaceholder(/Crispy-skin salmon/).fill("Weeknight beef stew");
  await clearLastAiMessage(); // only what this click sends counts
  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect.poll(lastAiMessage, { timeout: 30_000 }).toContain("My kitchen also has: Instant Pot / pressure cooker");
});

test("a long email address doesn't make Settings wider than the phone", async ({ page }) => {
  // An email has no spaces to wrap at; a long one used to push the page wider than the screen,
  // so the phone zoomed the whole page out (found by these tests on GitHub's machines).
  await signUp(page, "averyveryverylongnamewithnowheretowrap"); // no "." to wrap at; under the 64-character limit before "@"
  await page.goto("./#/settings");
  await expect(page.getByText("Signed in as")).toBeVisible();
  // Compare with the phone's real width: when the page is too wide, the phone zooms out and the page's
  // own idea of the screen width grows to match, so that can't be the yardstick.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
});
