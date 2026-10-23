const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.ALDOVRA_BASE_URL || "https://aldovra.com";

test.describe("Aldovra public smoke tests", () => {
  test("homepage serves the expected Aldovra content", async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    expect(response, "homepage should return a response").not.toBeNull();
    expect(response.status(), "homepage HTTP status").toBe(200);
    await expect(page).toHaveTitle(/Aldovra/i);
    await expect(page.locator("body")).toContainText(/Aldovra|Skills Verified|Better Hiring/i);
  });

  test("homepage remains usable at a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(/Aldovra/i);

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.content,
      `horizontal overflow at mobile width: viewport=${dimensions.viewport}, content=${dimensions.content}`,
    ).toBeLessThanOrEqual(dimensions.viewport + 2);
  });

  test("student dashboard document is served", async ({ page }) => {
    const response = await page.goto(new URL("/dashboard.html", BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
    expect(response, "dashboard should return a response").not.toBeNull();
    expect(response.status(), "dashboard HTTP status").toBe(200);
    await expect(page).toHaveTitle(/Aldovra/i);
    await expect(page.locator("body")).toContainText(/dashboard|skills|assessment|career/i);
  });
});
