import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buyPlusMonthly, signUp } from "./helpers";

test("shrinkflation: a smaller package for the same money shows on the price tracker and the budget", async ({ page }) => {
  await signUp(page, "shrink");
  await buyPlusMonthly(page);

  // Two purchases of the same cereal at Walmart a month apart: 12 oz, then 10.8 oz, both $4.29.
  // And a bigger box at Costco (a different size, not shrinkflation).
  const T = Date.now() - 40 * 86_400_000;
  const oz = (g: number) => ({ kind: "weight", g: g * 28.3495 });
  await page.evaluate(
    ([prices]) => localStorage.setItem("recipe-builder.prices", JSON.stringify(prices)),
    [
      [
        { id: "a", key: "cereal", name: "Cereal", qty: oz(12), price: 4.29, at: T, store: "Walmart" },
        { id: "b", key: "cereal", name: "Cereal", qty: oz(10.8), price: 4.29, at: T + 30 * 86_400_000, store: "Walmart" },
        { id: "c", key: "cereal", name: "Cereal", qty: oz(18), price: 5.99, at: T + 35 * 86_400_000, store: "Costco" },
      ],
    ] as const,
  );

  await page.goto("./#/prices");
  const list = page.getByRole("region", { name: "Packages that shrank" });
  await expect(list).toBeVisible();
  await expect(list.locator("li")).toHaveCount(1);
  await expect(list).toContainText("Cereal at Walmart");
  await expect(list).toContainText("10% less in the package");
  await expect(list).toContainText("11% more per oz");
  // Readable for everyone (contrast, structure), like the other main screens.
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  await page.goto("./#/budget");
  await expect(page.locator(".shrink-note")).toContainText("Cereal came in a smaller package");
  const a11yBudget = await new AxeBuilder({ page }).analyze();
  expect(a11yBudget.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
