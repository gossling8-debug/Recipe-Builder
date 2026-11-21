import { expect, test } from "@playwright/test";
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
