import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// Not part of the regular suite: screenshots of the main screens, to compare a change
// that shouldn't alter how anything looks. Run with LOOK=before|after bash e2e/run.sh look
test.skip(!process.env.LOOK, "only when comparing screenshots");

test("main screens look", async ({ page }) => {
  await signUp(page, "look");
  await page.getByRole("button", { name: "Try 3 sample recipes" }).click();
  await expect(page.locator(".recipe-row")).toHaveCount(3);
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser"))!)!).uid);
  // Gifted, so every screen shows (as the owner sees it).
  await fetch(`http://127.0.0.1:8080/v1/projects/demo-recipe-builder/databases/(default)/documents/admins?documentId=${uid}`, { method: "POST", headers: { Authorization: "Bearer owner", "content-type": "application/json" }, body: "{}" });
  await page.locator(".recipe-row a").first().click();
  await page.locator(".my-notes").waitFor();
  const recipe = page.url();
  for (const [name, url] of [
    ["recipe", recipe],
    ["shopping", "./#/shopping"],
    ["tonight", "./#/tonight"],
    ["pantry", "./#/pantry"],
    ["budget", "./#/budget"],
    ["settings", "./#/settings"],
    ["plus", "./#/plus"],
    ["privacy", "./#/privacy"],
    ["owner", "./#/owner"],
  ]) {
    await page.goto(url);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `e2e/.out/look-${process.env.LOOK}/${name}.png`, fullPage: true, animations: "disabled" });
  }
});
