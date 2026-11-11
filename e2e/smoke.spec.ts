import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { SITE_URL } from '../src/lib/dataset';
import { useTranslations } from '../src/i18n';
import { giscusAttributes } from '../src/lib/giscus';
import { giscusConfig } from '../src/lib/giscus.config';
import { SITE_HOST } from '../src/lib/share';
import { EXPORT_WIDTH } from '../src/lib/chart-image';
import { en } from '../src/i18n/en';
import { fmt } from '../src/i18n/fmt';
import { BEST } from '../src/lib/filters';

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
  await expect(page.locator('[data-highlights] a[href*="/m/"]').first()).toBeVisible();
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

test('llms.txt links pages and data that load', async ({ request }) => {
  const llms = await request.get('/llms.txt');
  expect(llms.ok()).toBe(true);
  expect(llms.headers()['content-type']).toContain('text/plain');
  const text = await llms.text();
  expect(text.split('\n')[0]).toBe('# mekiki');

  const paths = new Set(
    [...text.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((match) => new URL(match[1]!))
      .filter((url) => url.origin === SITE_URL)
      .map((url) => url.pathname),
  );
  expect(paths.size).toBeGreaterThan(4);
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    if (path.endsWith('.md')) {
      expect(response.headers()['content-type'], path).toContain('text/markdown');
    }
  }
});

test('every page names a Markdown version that loads', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
  const model = await page.locator('table tbody a[href*="/m/"]').first().getAttribute('href');
  expect(model).toBeTruthy();
  const languages = await page
    .locator('[data-locale-link]')
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );

  for (const path of [
    ...new Set(languages),
    model!,
    '/',
    '/en/method/',
    '/en/changelog/',
    '/en/api/',
  ]) {
    const html = await (await request.get(path)).text();
    const href = html.match(/<link rel="alternate" type="text\/markdown" href="([^"]+)"/)?.[1];
    expect(href, path).toBeTruthy();
    const markdown = await request.get(href!);
    expect(markdown.ok(), href).toBe(true);
    expect(markdown.headers()['content-type'], href).toContain('text/markdown');
    expect((await markdown.text()).startsWith('# '), href).toBe(true);
    expect(html, path).toContain('<link rel="describedby" type="text/plain" href="/llms.txt"');
  }
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

test('the best of each vendor leaves one model per vendor, in the table and the quadrant', async ({
  page,
}) => {
  const problems = trackProblems(page);
  await page.goto('/en/');
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();

  const vendorSelect = page.getByRole('combobox', { name: en.table.vendor });
  await vendorSelect.click();
  await page.getByRole('option', { name: en.table.bestOfEach }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('vendor')).toBe(BEST);
  await expect(vendorSelect).toContainText(en.table.bestOfEachShort);

  const vendors = await rows.locator('td:nth-child(2)').allTextContents();
  expect(vendors.length).toBeGreaterThan(1);
  expect(vendors.length).toBeLessThan(total);
  expect(new Set(vendors).size).toBe(vendors.length);
  await expect(
    page.getByText(fmt(en.table.count, { shown: vendors.length, total }), { exact: true }),
  ).toBeVisible();
  const names = await rows.locator('td:first-child a').allTextContents();

  await page.reload();
  await expect(rows).toHaveCount(names.length);
  await expect(vendorSelect).toContainText(en.table.bestOfEachShort);

  await page.locator('fieldset button[aria-pressed]').nth(1).click();
  const dots = page.locator('figure svg a[href]');
  await expect(dots.first()).toBeAttached();
  const plotted = await dots.evaluateAll((links) =>
    links.map((link) => link.getAttribute('aria-label')!.split(': ')[0]!),
  );
  expect(plotted.length).toBeLessThanOrEqual(names.length);
  expect(new Set(plotted).size).toBe(plotted.length);
  for (const name of plotted) expect(names).toContain(name);
  expect(new URL(page.url()).searchParams.get('vendor')).toBe(BEST);
  expect(problems).toEqual([]);
});

test('a chart exports at the desktop width from any screen', async ({ page }) => {
  const problems = trackProblems(page);
  for (const width of [1300, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const view of ['quadrant', 'bar']) {
      await page.goto(`/?view=${view}`);
      const figure = page.locator('figure').first();
      await expect(figure.locator('[data-chart-watermark]')).toHaveText(SITE_HOST);

      const box = await figure.boundingBox();
      const pending = page.waitForEvent('download');
      await figure.locator('[data-export-ignore] button').click();
      const file = await pending;
      expect(file.suggestedFilename()).toMatch(
        new RegExp(`^mekiki-${view}-.*\\d{4}-\\d{2}-\\d{2}\\.png$`),
      );

      const image = await readFile(await file.path());
      expect(image.subarray(1, 4).toString()).toBe('PNG');
      expect(Math.abs(image.readUInt32BE(16) - EXPORT_WIDTH.chart * 2)).toBeLessThanOrEqual(2);
      if (box?.width === EXPORT_WIDTH.chart) {
        expect(Math.abs(image.readUInt32BE(20) - box.height * 2)).toBeLessThanOrEqual(2);
      } else {
        expect(image.readUInt32BE(20)).toBeGreaterThan(400);
      }
      expect(await figure.boundingBox()).toEqual(box);
      await expect(page.locator('body > [inert]')).toHaveCount(0);
    }
  }
  expect(problems).toEqual([]);
});

test('on a phone, every quadrant dot is named once, in the chart or under it', async ({ page }) => {
  const problems = trackProblems(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?view=quadrant');
  const figure = page.locator('figure').first();
  const dots = figure.locator('svg a[href]');
  await expect(dots.first()).toBeAttached();

  const names = await dots.evaluateAll((links) =>
    links.map((link) => link.getAttribute('aria-label')!.split(': ')[0]),
  );
  const inChart = await figure.locator('svg text').allTextContents();
  const listed = figure.locator('[data-unlabelled] a');
  const underIt = await listed.allTextContents();
  expect(underIt.length).toBeGreaterThan(0);
  for (const name of names) {
    expect([inChart.includes(name), underIt.includes(name)]).toContainEqual(true);
    expect(inChart.includes(name) && underIt.includes(name)).toBe(false);
  }

  const overlaps = await figure.evaluate((node) => {
    const boxes = [
      ...[...node.querySelectorAll('svg text')].map((text) => text.getBoundingClientRect()),
      ...[...node.querySelectorAll('svg a circle:not([fill="transparent"])')].map((dot) =>
        dot.getBoundingClientRect(),
      ),
    ];
    const texts = node.querySelectorAll('svg text').length;
    let count = 0;
    for (let i = 0; i < texts; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (
          a.left < b.right - 0.5 &&
          b.left < a.right - 0.5 &&
          a.top < b.bottom - 0.5 &&
          b.top < a.bottom - 0.5
        ) {
          count += 1;
        }
      }
    }
    return count;
  });
  expect(overlaps).toBe(0);

  const first = listed.first();
  await first.hover();
  await expect(figure.locator('[role="presentation"]')).toContainText((await first.textContent())!);
  expect(problems).toEqual([]);
});

test('on a phone, a long filter value is cut short before its arrow', async ({ page }) => {
  const problems = trackProblems(page);
  const { tier } = useTranslations('en');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/en/?int=very_low&val=very_low');
  const triggers = page.locator('search [role="combobox"]');
  await expect(triggers.nth(1)).toContainText(tier.intelligence.very_low);

  const values = await triggers.evaluateAll((buttons) =>
    buttons.map((button) => {
      const value = button.querySelector('[data-slot="select-value"]')!;
      const arrow = button.querySelector(':scope > svg')!.getBoundingClientRect();
      return {
        text: button.textContent,
        overlap: value.getBoundingClientRect().right - arrow.left,
        cut: value.scrollWidth > value.clientWidth,
      };
    }),
  );
  for (const value of values) expect(value.overlap, value.text!).toBeLessThanOrEqual(0);
  expect(values[1]!.cut).toBe(true);
  expect(values.filter((value) => value.text!.endsWith('All')).every((value) => !value.cut)).toBe(
    true,
  );
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

  test('a name under the quadrant shows its dot on the first tap and opens on the second', async ({
    page,
  }) => {
    const problems = trackProblems(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/?view=quadrant');
    const name = page.locator('figure [data-unlabelled] a').first();
    await expect(name).toBeVisible();
    const start = page.url();
    await name.tap();
    await expect(page.locator('figure [role="presentation"]')).toContainText(
      (await name.textContent())!,
    );
    expect(page.url()).toBe(start);
    await name.tap();
    await expect(page).toHaveURL(/\/m\//);
    expect(problems).toEqual([]);
  });
});
