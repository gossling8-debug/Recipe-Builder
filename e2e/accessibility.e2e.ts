import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// The main screens, checked with axe (readable contrast, headings in order, labels…).
test("main screens have no accessibility problems", async ({ page }) => {
  await signUp(page, "a11y");
  await page.getByRole("button", { name: "Try 3 sample recipes" }).click();
  await expect(page.locator(".recipe-row")).toHaveCount(3);
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser"))!)!).uid);
  // An admin account, so every screen shows.
  await fetch(`http://127.0.0.1:8080/v1/projects/demo-recipe-builder/databases/(default)/documents/admins?documentId=${uid}`, { method: "POST", headers: { Authorization: "Bearer owner", "content-type": "application/json" }, body: "{}" });
  await page.locator(".recipe-row a").first().click();
  await page.locator(".my-notes").waitFor();
  const recipe = page.url();

  const problems: string[] = [];
  for (const [name, url] of [
    ["Recipes", "./#/"],
    ["Recipe", recipe],
    ["Shopping list", "./#/shopping"],
    ["Week", "./#/week"],
    ["Tonight", "./#/tonight"],
    ["Pantry", "./#/pantry"],
    ["Budget", "./#/budget"],
    ["Cookbooks", "./#/family"],
    ["Add Recipe", "./#/scan"],
    ["Settings", "./#/settings"],
    ["Your plan", "./#/plus"],
    ["Owner dashboard", "./#/owner"],
  ]) {
    await page.goto(url);
    await page.waitForTimeout(1500);
    const r = await new AxeBuilder({ page }).analyze();
    for (const v of r.violations) problems.push(`${name}: ${v.id} (${v.nodes.length}) ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
