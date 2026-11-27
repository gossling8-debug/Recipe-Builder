import { expect, test, type Locator } from "@playwright/test";
import { clearLastAiMessage, lastAiMessage, newEmail, signUp } from "./helpers";

/**
 * Tap a chip the way a person would: scrolled into the middle of the screen first. Scrolling
 * only "into view" can leave it at the very edge, under the fixed top bar or bottom tab bar,
 * and on slower machines (GitHub's) the tap then lands on the bar instead.
 */
async function tap(chip: Locator) {
  await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
  try {
    await chip.click({ timeout: 15_000 });
  } catch (e) {
    // Temporary diagnostic (GitHub-only failure): what is under the tap point, and where things are.
    const info = await chip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const css = getComputedStyle(el);
      return {
        chip: [r.x, r.y, r.width, r.height].map(Math.round),
        viewport: [innerWidth, innerHeight, Math.round(scrollY), devicePixelRatio],
        atCentre: top ? `${top.tagName}.${top.className}` : null,
        chipStyle: { display: css.display, pointerEvents: css.pointerEvents, zoom: (css as unknown as { zoom: string }).zoom, position: css.position },
        bodyZoom: (getComputedStyle(document.body) as unknown as { zoom: string }).zoom,
        textSize: document.documentElement.dataset.textSize ?? null,
        ua: navigator.userAgent,
      };
    });
    console.log("TAP-DIAG", JSON.stringify(info));
    // What is wider than the phone (390)? Innermost elements past it, with their widths and styles.
    const wide = await chip.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > 391)
        .filter((el) => ![...el.children].some((c) => c.getBoundingClientRect().right > 391))
        .slice(0, 12)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const c = getComputedStyle(el);
          return `${el.tagName}.${el.className} [${Math.round(r.left)}-${Math.round(r.right)}] pos=${c.position} ws=${c.whiteSpace} minW=${c.minWidth} text=${(el.textContent || "").trim().slice(0, 40)}`;
        }),
    );
    console.log("TAP-WIDE", JSON.stringify({ scrollWidth: document === undefined ? 0 : await chip.evaluate(() => document.documentElement.scrollWidth), wide }));
    throw e;
  }
}

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
  await tap(devices.getByRole("button", { name: "Air fryer" }));
  await expect(devices.getByRole("button", { name: "Air fryer" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Skip setup" }).click();
  await page.getByRole("button", { name: "Skip tour" }).click({ timeout: 15_000 });

  // Settings shows it, and a change there is kept.
  await page.goto("./#/settings");
  const inSettings = page.getByRole("group", { name: "Kitchen devices" });
  await expect(inSettings.getByRole("button", { name: "Air fryer" })).toHaveAttribute("aria-pressed", "true");
  await tap(inSettings.getByRole("button", { name: "Slow cooker" }));
  await page.reload();
  await expect(page.getByRole("group", { name: "Kitchen devices" }).getByRole("button", { name: "Slow cooker" })).toHaveAttribute("aria-pressed", "true");
});

test("Create a recipe tells the AI which devices you have", async ({ page }) => {
  await signUp(page, "devices");
  await page.goto("./#/settings");
  await tap(page.getByRole("group", { name: "Kitchen devices" }).getByRole("button", { name: "Instant Pot / pressure cooker" }));

  await page.goto("./#/scan");
  await page.getByRole("tab", { name: "Create" }).click();
  await page.getByPlaceholder(/Crispy-skin salmon/).fill("Weeknight beef stew");
  await clearLastAiMessage(); // only what this click sends counts
  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect.poll(lastAiMessage, { timeout: 30_000 }).toContain("My kitchen also has: Instant Pot / pressure cooker");
});
