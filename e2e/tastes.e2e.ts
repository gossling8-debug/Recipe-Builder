import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("who likes what (Family): marks, the list, Everyone eats, and Fill my week skipping it", async ({ page }) => {
  await signUp(page, "tastes");
  await page.getByRole("button", { name: "Try 3 sample recipes" }).click();
  await expect(page.locator(".recipe-row")).toHaveCount(3);

  // Buy Family (test checkout).
  await page.goto("./#/plus");
  await expect(page.locator(".plus-page h1").first()).toHaveText("Choose a plan");
  await page.getByRole("radio", { name: /Family · up to/ }).click();
  await page.getByRole("button", { name: "Get Cardamix Family" }).click();
  await page.waitForURL(/\/pay\//);
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page.locator(".plan-card-plus")).toContainText("Welcome to Cardamix Family!");

  // Who you cook for.
  await page.goto("./#/settings");
  for (const name of ["Sam", "Kids"]) {
    await page.locator(".eaters-add").getByRole("textbox", { name: "Name" }).fill(name);
    await page.locator(".eaters-add").getByRole("button", { name: "Add" }).click();
  }
  await expect(page.locator(".eaters li")).toHaveText(["Sam", "Kids"]);

  // Sam won't eat the tacos: tap once = loves, twice = won't eat.
  await page.goto("./#/");
  await page.locator(".recipe-row a", { hasText: "Weeknight Beef Tacos" }).click();
  const sam = page.locator(".tastes").getByRole("button", { name: /^Sam/ });
  await sam.click();
  await expect(sam).toHaveText("Sam ♥");
  await sam.click();
  await expect(sam).toHaveText("Sam · won't eat");

  // The list says so, and "Everyone eats" leaves it out.
  await page.goto("./#/");
  await expect(page.locator(".recipe-row", { hasText: "Weeknight Beef Tacos" })).toContainText("Sam won't eat");
  await page.locator(".filters").getByRole("button", { name: "Everyone eats" }).click();
  await expect(page.locator(".recipe-card-title")).not.toContainText(["Weeknight Beef Tacos"]);
  await expect(page.locator(".recipe-card-title", { hasText: "Sheet-Pan Lemon Chicken" })).toBeVisible();
  await page.locator(".filters").getByRole("button", { name: "All", exact: true }).click();

  // Fill my week: the chicken goes in, the tacos never do.
  await page.goto("./#/week");
  await page.getByRole("button", { name: "Fill my week for me" }).click();
  await expect(page.locator("ol.week")).toContainText("Sheet-Pan Lemon Chicken");
  await expect(page.locator("ol.week")).not.toContainText("Weeknight Beef Tacos");
});
