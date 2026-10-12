const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'https://aldovra.com';
const parsedBase = new URL(baseUrl);
if (!['https:', 'http:'].includes(parsedBase.protocol)) {
  throw new Error('BASE_URL must use HTTP or HTTPS');
}

test('currently deployed Aldovra public pages respond in a real browser', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const paths = ['/', '/dashboard.html', '/assessment.html', '/career-agent.html'];
    for (const path of paths) {
      const response = await page.goto(new URL(path, parsedBase).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      assert.ok(response, `${path} should produce a response`);
      assert.ok(
        response.status() >= 200 && response.status() < 400,
        `${path} returned HTTP ${response.status()}`,
      );
      if (path === '/') {
        await page.locator('title').waitFor({ state: 'attached' });
        assert.match(await page.title(), /Aldovra/i);
      }
    }
  } finally {
    await browser.close();
  }
});
