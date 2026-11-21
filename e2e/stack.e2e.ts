import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

const PHOTO = "public/icon-192.png"; // any picture: the test AI reads every card as a recipe

async function choose(page: Page, button: string, files: string[]) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).first().click();
  await (await picker).setFiles(files);
}

test("scan a stack: cards read in the background, a back side, and the free limit pauses the rest", async ({ page }) => {
  await signUp(page, "stack");
  await page.goto("./#/scan");
  await page.getByRole("link", { name: /Have a stack of cards\?/ }).click();
  await expect(page).toHaveURL(/#\/stack$/);

  // Two cards; the newer one gets its back added before it's read.
  await choose(page, "Choose photos", [PHOTO, PHOTO]);
  await expect(page.locator(".stack-card")).toHaveCount(2);
  await choose(page, "Choose a photo of the back", [PHOTO]);
  await expect(page.locator(".stack-card").first()).toContainText("Front and back");
  await expect(page.locator(".stack-summary")).toContainText("2 of 2 added", { timeout: 60_000 });

  // The free plan reads 5 a month: of 4 more, 3 are added and the last waits, with the reason.
  await choose(page, "Choose photos", [PHOTO, PHOTO, PHOTO, PHOTO]);
  await expect(page.locator(".stack-summary")).toContainText("5 of 6 added", { timeout: 90_000 });
  await expect(page.locator(".callout", { hasText: "Reading has stopped" })).toContainText("used this month's 5 free");
  await expect(page.locator(".callout").getByRole("link", { name: "See plans" })).toBeVisible();
  await expect(page.locator(".stack-card.waiting")).toHaveCount(1);

  // Home: the five recipes, and a note that reading stopped.
  await page.goto("./#/");
  await expect(page.locator(".recipe-row")).toHaveCount(5);
  await expect(page.locator(".plan-strip", { hasText: "Reading your cards has stopped" })).toBeVisible();

  // The waiting card is still there after closing and reopening the app.
  await page.reload();
  await page.goto("./#/stack");
  await expect(page.locator(".stack-card.waiting")).toHaveCount(1);
});
