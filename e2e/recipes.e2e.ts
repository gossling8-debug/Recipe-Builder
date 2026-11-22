import { devices, expect, test } from "@playwright/test";
import { pasteRecipe, signUp } from "./helpers";

test("sample recipes: try them, then remove them", async ({ page }) => {
  await signUp(page, "samples");
  await page.getByRole("button", { name: "Try 3 sample recipes" }).click();
  await expect(page.locator(".recipe-card-title")).toHaveText(["Sheet-Pan Lemon Chicken & Potatoes", "Weeknight Beef Tacos", "Banana Oat Pancakes"]);
  await page.getByRole("button", { name: "Remove samples" }).click();
  await expect(page.locator(".recipe-row")).toHaveCount(0);
  await expect(page.getByText("Your recipe box is empty.")).toBeVisible();
});

test("add a recipe by pasting it, delete it with ⋯, then undo", async ({ page }) => {
  await signUp(page, "undo");
  await pasteRecipe(page);
  const title = (await page.locator(".recipe-title").innerText()).trim();
  await page.goto("./#/");
  await expect(page.locator(".recipe-card-title")).toHaveText([title]);

  await page.getByRole("button", { name: `More options for ${title}` }).click();
  await page.locator(".sheet").getByText("Delete").click();
  await expect(page.locator(".recipe-row")).toHaveCount(0);
  await expect(page.locator(".undo-toast")).toContainText(`Deleted “${title}”`);
  await page.locator(".undo-toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".recipe-card-title")).toHaveText([title]);
  // Still there after reopening the app.
  await page.reload();
  await expect(page.locator(".recipe-card-title")).toHaveText([title]);
});

test("“Wouldn't make again” offers to delete; Keep it labels the recipe", async ({ page }) => {
  await signUp(page, "noagain");
  await pasteRecipe(page);
  await page.locator(".make-again").getByText("Wouldn't make again").click();
  const ask = page.getByRole("dialog", { name: "Delete this recipe?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep it" }).click();
  await expect(ask).toHaveCount(0);
  await page.goto("./#/");
  await expect(page.locator(".recipe-row .no-again")).toHaveText(/Wouldn't make again/);
});

test("a fresh browser on an account with recipes never offers the sample recipes while loading", async ({ page, browser }) => {
  const email = await signUp(page, "fresh");
  await pasteRecipe(page);
  // Wait until the recipe has reached the cloud (changes upload a few seconds after they're made).
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser"))!)!).uid);
  await expect
    .poll(async () => {
      const r = await (await fetch(`http://127.0.0.1:8080/v1/projects/demo-recipe-builder/databases/(default)/documents/users/${uid}/recipes`, { headers: { Authorization: "Bearer owner" } })).json();
      return (r.documents ?? []).length;
    }, { timeout: 30_000 })
    .toBe(1);

  // The same account in a brand-new browser (nothing stored yet), as on a new phone or a new tab.
  const other = await browser.newContext({ ...devices["iPhone 13"], baseURL: test.info().project.use.baseURL });
  const p2 = await other.newPage();
  // A slow connection (as on a phone): the account's recipes take a few seconds to arrive.
  await p2.route("http://127.0.0.1:8080/**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  });
  await p2.goto("./");
  await p2.getByRole("tab", { name: "Sign in" }).click();
  await p2.fill("input[type=email]", email);
  await p2.fill(".password-row input", "secret1");
  await p2.click("button[type=submit]");
  // Watch the whole time the recipes load: the empty-box screen must never show.
  let sawSampleOffer = false;
  for (let i = 0; i < 300; i++) {
    if (await p2.getByRole("button", { name: "Try 3 sample recipes" }).count()) sawSampleOffer = true;
    if (await p2.locator(".recipe-row").count()) break;
    await p2.waitForTimeout(100);
  }
  expect(sawSampleOffer).toBe(false);
  await expect(p2.locator(".recipe-row")).toHaveCount(1);
  await other.close();
});

test("a new account whose recipes can't download on this device is never offered the samples", async ({ page, browser }) => {
  const email = await signUp(page, "offline");
  await pasteRecipe(page);
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser"))!)!).uid);
  await expect
    .poll(async () => ((await (await fetch(`http://127.0.0.1:8080/v1/projects/demo-recipe-builder/databases/(default)/documents/users/${uid}/recipes`, { headers: { Authorization: "Bearer owner" } })).json()).documents ?? []).length, { timeout: 30_000 })
    .toBe(1);

  // Another device where the database can't be reached at all (signing in still works).
  const other = await browser.newContext({ ...devices["iPhone 13"], baseURL: test.info().project.use.baseURL });
  const p2 = await other.newPage();
  await p2.route("http://127.0.0.1:8080/**", (route) => route.abort());
  await p2.goto("./");
  await p2.getByRole("tab", { name: "Sign in" }).click();
  await p2.fill("input[type=email]", email);
  await p2.fill(".password-row input", "secret1");
  await p2.click("button[type=submit]");
  let sawSampleOffer = false;
  for (let i = 0; i < 140; i++) {
    if (await p2.getByRole("button", { name: "Try 3 sample recipes" }).count()) sawSampleOffer = true;
    if (await p2.getByText(/Couldn't load your recipes yet|Still loading your recipes/).count()) break;
    await p2.waitForTimeout(100);
  }
  expect(sawSampleOffer).toBe(false);
  await expect(p2.getByText(/Couldn't load your recipes yet|Still loading your recipes/)).toBeVisible();
  await expect(p2.getByRole("link", { name: "Add a recipe" })).toBeVisible();
  await expect(p2.getByRole("button", { name: "Try 3 sample recipes" })).toHaveCount(0);
  await other.close();
});
