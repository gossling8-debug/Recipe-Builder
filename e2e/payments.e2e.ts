import { expect, test, type Page } from "@playwright/test";
import { buyPlusMonthly, charges, declineNextCharge, pasteRecipe, signUp, STRIPE } from "./helpers";

const heading = (page: Page) => page.locator(".plus-page h1").first();


test("free → upgrade card → Plus → Family for only the difference", async ({ page }) => {
  await signUp(page, "pay");
  await pasteRecipe(page);

  // Free: the upgrade card shows, and paid screens are hidden.
  await page.goto("./#/");
  await expect(page.locator(".upgrade-card")).toBeVisible();
  await expect(page.locator("nav.tabbar")).not.toContainText("Tonight");
  await page.locator(".upgrade-card").getByRole("link", { name: "See plans" }).click();

  await buyPlusMonthly(page);
  await page.goto("./#/");
  await expect(page.locator("nav.tabbar")).toContainText("Tonight");
  await expect(page.locator(".upgrade-card")).toHaveCount(0);

  // The owner dashboard's "toward upgrading" steps were noted (times only).
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser"))!)!).uid);
  const doc = await (await fetch(`http://127.0.0.1:8080/v1/projects/demo-recipe-builder/databases/(default)/documents/funnel/${uid}`, { headers: { Authorization: "Bearer owner" } })).json();
  expect(Object.keys(doc.fields ?? {}).sort()).toEqual(["cardSeen", "plansOpened"]);

  // Plus → Family: monthly stays monthly, and the amount is shown before anything is charged.
  await page.goto("./#/plus");
  await expect(page.getByText("Move up to Cardamix Family")).toBeVisible();
  await expect(page.locator(".plus-interval [aria-checked=true]")).toHaveText("Monthly · $8.99");
  const before = (await charges()).length;
  await page.getByRole("button", { name: "Get Cardamix Family" }).click();
  const quote = page.locator(".family-quote");
  // 20 of 30 days left: ($8.99 − $4.49) × 20/30 = $3.00
  await expect(quote).toContainText("You'll be charged $3.00 today.");
  await expect(quote).toContainText("only the difference between Plus and Family");

  // Cancel: nothing charged, still Plus.
  await quote.getByRole("button", { name: "Cancel" }).click();
  expect((await charges()).length).toBe(before);
  await expect(heading(page)).toHaveText("You have Plus");

  // A declined card: nothing charged, still Plus, and it says so.
  await declineNextCharge(true);
  await page.getByRole("button", { name: "Get Cardamix Family" }).click();
  await quote.getByRole("button", { name: "Pay $3.00 and switch" }).click();
  await expect(page.locator(".callout.error")).toContainText("declined, so you're still on Plus");
  expect((await charges()).length).toBe(before);
  await expect(heading(page)).toHaveText("You have Plus");

  // Paid: exactly the amount shown.
  await declineNextCharge(false);
  await quote.getByRole("button", { name: "Pay $3.00 and switch" }).click();
  await expect(heading(page)).toHaveText("You have Cardamix Family");
  expect((await charges()).slice(before)).toEqual([300]);
});

test("Stripe's messages change the plan at once: failed card, cancel, and the end of the plan", async ({ page }) => {
  await signUp(page, "hook");
  await buyPlusMonthly(page);

  // Card fails (in Stripe's portal): the warning shows on return.
  await page.getByRole("button", { name: "Manage subscription" }).click();
  await page.waitForURL(/\/portal\//);
  const customer = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByRole("button", { name: "Card fails" }).click();
  await page.locator("#back").click();
  await expect(page.locator(".callout.warn")).toContainText("Your last payment didn't go through");

  // Cancelled: keeps Plus until the end of the period.
  await page.getByRole("button", { name: "Manage subscription" }).click();
  await page.getByRole("button", { name: "Cancel plan" }).click();
  await page.locator("#back").click();
  await expect(page.getByText(/Your subscription is cancelled and ends on/)).toBeVisible();

  // The period ends while the app is open on Recipes. Nobody taps anything: only Stripe's
  // message reaches the server, and the app follows — paid screens go, the upgrade card comes back.
  await page.goto("./#/");
  await expect(page.locator("nav.tabbar")).toContainText("Tonight");
  await fetch(`${STRIPE}/test/end?customer=${customer}`);
  await expect(page.locator("nav.tabbar")).not.toContainText("Tonight", { timeout: 20_000 });
});

test("the webhook turns away messages that aren't signed by Stripe", async () => {
  const url = process.env.STRIPE_WEBHOOK_URL || "http://127.0.0.1:5001/demo-recipe-builder/us-central1/stripeWebhook";
  const body = JSON.stringify({ type: "customer.subscription.deleted", data: { object: { customer: "cus_1" } } });
  const unsigned = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  expect(unsigned.status).toBe(400);
  const forged = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` }, body });
  expect(forged.status).toBe(400);
});
