import { expect, type Page } from "@playwright/test";

export const STRIPE = process.env.STRIPE_URL || "http://127.0.0.1:43200";
const OOB = "http://127.0.0.1:9099/emulator/v1/projects/demo-recipe-builder/oobCodes";

let count = 0;
/** A new, unique test email (the emulator stores them lowercase). */
export const newEmail = (tag: string) => `${tag}${Date.now()}${++count}@example.com`.toLowerCase();

/** Creates an account, skips setup and the tour, and confirms the email. Ends on the Recipes screen. */
export async function signUp(page: Page, tag: string): Promise<string> {
  const email = newEmail(tag);
  await page.goto("./");
  await page.locator(".account-screen form").waitFor({ timeout: 30_000 });
  await page.fill("input[type=email]", email);
  await page.fill(".password-row input", "secret1");
  await page.click("button[type=submit]");
  await page.getByRole("button", { name: "Skip setup" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Skip tour" }).click({ timeout: 15_000 });
  // Confirm the email with the link the emulator "sent".
  await page.goto("./#/scan");
  await expect.poll(async () => (await (await fetch(OOB)).json()).oobCodes.some((c: { email: string }) => c.email === email)).toBe(true);
  const codes = (await (await fetch(OOB)).json()).oobCodes.filter((c: { email: string }) => c.email === email);
  await fetch(codes.at(-1).oobLink);
  await page.getByRole("button", { name: "I've confirmed it" }).click();
  await expect(page.getByRole("button", { name: "I've confirmed it" })).toHaveCount(0);
  await page.goto("./#/");
  return email;
}

/** Adds a recipe by pasting text (read by the test AI). Ends on the new recipe. */
export async function pasteRecipe(page: Page): Promise<void> {
  await page.goto("./#/scan");
  await page.locator(".mode-switch").getByText("Paste text").click();
  await page.fill("textarea", "Pie\nServes 4\n\nIngredients\n1 cup flour\n\nSteps\n1. Mix.\n2. Bake.");
  await page.getByRole("button", { name: "Read recipe" }).click();
  await page.locator(".my-notes").waitFor({ timeout: 45_000 });
}

/** Amounts the test Stripe has charged, in cents. */
export const charges = async (): Promise<number[]> => (await fetch(`${STRIPE}/test/charges`)).json();
export const declineNextCharge = (on: boolean) => fetch(`${STRIPE}/test/decline?on=${on ? 1 : 0}`);

/** Free → Plus (monthly) through the test checkout. Ends on "Your plan". */
export async function buyPlusMonthly(page: Page) {
  await page.goto("./#/plus");
  await expect(page.locator(".plus-page h1").first()).toHaveText("Choose a plan");
  await page.locator(".plus-interval").getByText("Monthly ·").click();
  await page.getByRole("button", { name: "Upgrade to Plus" }).click();
  await page.waitForURL(/\/pay\//);
  await expect(page.locator("#price")).toHaveText("cardamix_plus_monthly_449: $4.49/month");
  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForURL(/#\/plus\/done/);
  await expect(page.locator(".plan-card-plus")).toContainText("Welcome to Plus!");
  await expect(page.locator(".plus-page h1").first()).toHaveText("You have Plus");
}
