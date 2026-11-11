import { expect, type Page, test } from '@playwright/test';
import { giscusAttributes } from '../src/lib/giscus';
import { giscusConfig } from '../src/lib/giscus.config';

const GISCUS = 'https://giscus.app';

test.beforeEach(async ({ context }) => {
  await context.route(`${GISCUS}/**`, (route) => route.abort());
});

function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const blockedGiscus =
      message.location().url.startsWith(`${GISCUS}/`) &&
      message.text().startsWith('Failed to load resource');
    if (!blockedGiscus) problems.push(`console error: ${message.text()}`);
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

  const history = await request.get('/api/history.json');
  expect(history.ok()).toBe(true);
  expect(Array.isArray(((await history.json()) as { entries: unknown }).entries)).toBe(true);
});

test('the RSS feed a page advertises is RSS', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  const href = await page
    .locator('link[rel="alternate"][type="application/rss+xml"]')
    .getAttribute('href');
  expect(href).toBeTruthy();
  const feed = await request.get(href!);
  expect(feed.ok()).toBe(true);
  const xml = await feed.text();
  expect(xml).toContain('<rss version="2.0"');
  expect(xml).toContain('<channel>');
});

test('an unknown URL gets the 404 page', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.locator('a[href]').first()).toBeVisible();
});

test('the sitemap lists pages that load, each with a share image that loads', async ({
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const paths = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]!).pathname,
  );
  expect(paths.length).toBeGreaterThan(0);

  const images = new Set<string>();
  for (const path of paths) {
    const page = await request.get(path);
    expect(page.ok(), path).toBe(true);
    const html = await page.text();
    const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(image, path).toBeTruthy();
    const data = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    expect(data, path).toBeTruthy();
    expect(new URL(JSON.parse(data!)['@graph'][1].url).pathname, path).toBe(path);
    images.add(new URL(image!).pathname);
  }
  for (const path of images) {
    const image = await request.get(path);
    expect(image.ok(), path).toBe(true);
    expect(image.headers()['content-type'], path).toContain('image/png');
  }
});

test('models ticked on the home page open side by side on the compare page', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('/');
  const boxes = page.locator('table tbody input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.locator('a[href*="?m="]').click();
  await expect(page.locator('thead th[scope="col"]')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('the home page switches between the table and the charts', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('/');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  const views = page.locator('fieldset button[aria-pressed]');
  await expect(views).toHaveCount(4);

  await views.nth(1).click();
  await expect(views.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('figure svg a[href]').first()).toBeAttached();
  await expect(page.locator('table')).toBeHidden();
  expect(new URL(page.url()).searchParams.get('view')).toBeTruthy();

  await views.nth(2).click();
  await expect(page.locator('figure')).toBeVisible();

  await views.nth(3).click();
  await expect(page.locator('figure ol li a[href]').first()).toBeVisible();

  await page.reload();
  await expect(page.locator('figure ol li a[href]').first()).toBeVisible();

  await views.nth(0).click();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('view')).toBeNull();
  expect(problems).toEqual([]);
});

test('a model page has one discussion thread in every language, in the site theme', async ({
  page,
}) => {
  test.skip(giscusAttributes(giscusConfig, { term: '-', lang: '-' }) === null, 'giscus is off');
  const problems = trackProblems(page);
  await page.route(`${GISCUS}/client.js`, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `(function () {
        var frame = document.createElement('iframe');
        frame.src = '${GISCUS}/widget';
        document.querySelector('.giscus').appendChild(frame);
      })();`,
    }),
  );
  await page.route(`${GISCUS}/widget`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>
        window.themes = [];
        addEventListener('message', function (event) {
          var config = event.data && event.data.giscus && event.data.giscus.setConfig;
          if (config) themes.push(config.theme);
        });
        parent.postMessage({ giscus: { resizeHeight: 100 } }, '*');
      </script>`,
    }),
  );

  await page.goto('/');
  await page.locator('table tbody a[href*="/m/"]').first().click();
  await expect(page).toHaveURL(/\/m\//);
  const script = page.locator(`script[src="${GISCUS}/client.js"]`);
  const term = await script.getAttribute('data-term');
  expect(term).toBeTruthy();

  const initial = await script.getAttribute('data-theme');
  await expect.poll(() => page.frames().length).toBe(2);
  const themes = () => page.frames()[1]!.evaluate(() => (window as { themes?: string[] }).themes);
  await expect.poll(themes).toEqual([initial]);
  await page.locator('[data-theme-toggle]').click();
  await expect.poll(async () => new Set(await themes()).size).toBe(2);

  const languages = new Set(
    await page
      .locator('[data-locale-link]')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href)),
  );
  expect(languages.size).toBeGreaterThan(1);
  const langs = new Set<string>();
  for (const href of languages) {
    await page.goto(href);
    await expect(script).toHaveAttribute('data-term', term!);
    langs.add((await script.getAttribute('data-lang'))!);
  }
  expect(langs.size).toBe(languages.size);
  expect(problems).toEqual([]);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a quadrant dot shows its ratings on the first tap and opens on the second', async ({
    page,
  }) => {
    const problems = trackProblems(page);
    await page.goto('/?view=quadrant');
    const dot = page.locator('figure svg a[href]').first();
    await expect(dot).toBeAttached();
    const start = page.url();
    await dot.tap();
    await expect(page.locator('figure [role="presentation"]')).toBeVisible();
    expect(page.url()).toBe(start);
    await dot.tap();
    await expect(page).toHaveURL(/\/m\//);
    expect(problems).toEqual([]);
  });
});
