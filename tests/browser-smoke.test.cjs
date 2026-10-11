const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'https://aldovra.com';
const parsedBase = new URL(baseUrl);
if (!['https:', 'http:'].includes(parsedBase.protocol)) {
  throw new Error('BASE_URL must use HTTP or HTTPS');
}

test('deployed Aldovra pages respond and public homepage metadata is correct', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const response = await page.goto(new URL('/', parsedBase).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    assert.ok(response, 'Homepage navigation should produce a response');
    assert.ok(response.status() >= 200 && response.status() < 400,
      `Homepage returned HTTP ${response.status()}`);
    await page.locator('title').waitFor({ state: 'attached' });
    assert.match(await page.title(), /Aldovra/i);
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute('href'),
      'https://aldovra.com/',
      'Homepage canonical URL should point to the public homepage',
    );
    assert.ok(
      (await page.locator('meta[name="description"]').getAttribute('content') || '').trim().length > 20,
      'Homepage should have a useful meta description',
    );

    for (const path of [
      '/dashboard.html',
      '/assessment.html',
      '/career-agent.html',
      '/admin-job-sources.html',
    ]) {
      const routeResponse = await page.goto(new URL(path, parsedBase).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      assert.ok(routeResponse, `${path} should produce a response`);
      assert.ok(
        routeResponse.status() >= 200 && routeResponse.status() < 400,
        `${path} returned HTTP ${routeResponse.status()}`,
      );
    }
  } finally {
    await browser.close();
  }
});
