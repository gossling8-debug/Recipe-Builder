import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("owner dashboard: counts toward upgrading, with no names", async ({ page }) => {
  const email = await signUp(page, "owner");
  await page.getByRole("button", { name: "Try 3 sample recipes" }).click();
  await expect(page.locator(".recipe-row")).toHaveCount(3);

  // Make this test account an admin (as the owner would be).
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser"))!)!).uid);
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-recipe-builder/databases/(default)/documents/admins?documentId=${uid}`, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: {} }),
  });
  expect(r.ok).toBe(true);

  await page.goto("./#/owner");
  const funnel = page.locator(".owner-funnel");
  await expect(funnel).toBeVisible({ timeout: 30_000 });
  const samples = funnel.locator("tr", { hasText: "Tried the sample recipes" });
  await expect(samples.locator("td").first()).not.toHaveText("0");
  await expect(page.getByRole("heading", { name: "Paying" })).toBeVisible();
  // App Check (watch-only): the emulator app sends no token, so the requests so far count as "No check".
  const appCheck = page.locator(".owner-appcheck tr", { hasText: "Other server requests" });
  await expect(appCheck.locator("td").nth(1)).not.toHaveText("0");
  await expect(appCheck.locator("td").first()).toHaveText("0");
  await expect(page.locator("main")).not.toContainText(email);
  await page.screenshot({ path: "test-results/owner-dashboard.png", fullPage: true });
});
