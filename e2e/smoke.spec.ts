import { expect, type Page, test } from '@playwright/test';

// Structural checks only. Page copy, routes and redirects change often, so
// these tests start from `/` and follow links instead of hardcoding paths or
// text. The JSON API paths are a public contract (README, "JSON API").

/**
 * Records script errors, console errors and failed same-origin requests.
 * Empty the returned array to start a new check on the same page.
 */
function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('response', (response) => {
    const sameOrigin = new URL(response.url()).origin === new URL(page.url()).origin;
    if (sameOrigin && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

test('the home page renders the model table', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('/');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
  expect(problems).toEqual([]);
});

test('every same-origin link on the home page loads cleanly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  const origin = new URL(page.url()).origin;
  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
  const paths = new Set(
    hrefs
      .map((href) => new URL(href))
      .filter((url) => url.origin === origin)
      .map((url) => url.pathname),
  );
  expect(paths.size).toBeGreaterThan(0);

  const problems = trackProblems(page);
  for (const path of paths) {
    problems.length = 0;
    const response = await page.goto(path, { waitUntil: 'load' });
    expect(response?.status(), path).toBeLessThan(400);
    expect(problems, path).toEqual([]);
  }
});

test('the JSON API serves every model', async ({ request }) => {
  const index = await request.get('/api/models.json');
  expect(index.ok()).toBe(true);
  const models = (await index.json()) as { id: string }[];
  expect(models.length).toBeGreaterThan(0);

  const full = await request.get('/api.json');
  expect(full.ok()).toBe(true);
  expect(((await full.json()) as { models: unknown[] }).models).toHaveLength(models.length);

  for (const { id } of models) {
    const one = await request.get(`/api/models/${id}.json`);
    expect(one.ok(), id).toBe(true);
  }
});

test('an unknown URL gets the 404 page', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.locator('a[href]').first()).toBeVisible();
});
