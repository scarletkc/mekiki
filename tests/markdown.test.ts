import { describe, expect, it } from 'vitest';
import { LOCALES, useTranslations } from '@/i18n';
import { SITE_URL } from '@/lib/dataset';
import { buildLlmsTxt } from '@/lib/llms';
import {
  apiMarkdown,
  changelogMarkdown,
  homeMarkdown,
  link,
  markdownPath,
  methodMarkdown,
  modelMarkdown,
  table,
} from '@/lib/markdown';
import { getDataset, getHistory } from '@/lib/site-data';

const dataset = await getDataset();
const history = getHistory();

const linksIn = (text: string) =>
  [...text.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((match) => match[1]!);

describe('Markdown addresses', () => {
  it('puts the locale first and .md last', () => {
    expect(markdownPath('en', '/')).toBe('/en/index.md');
    expect(markdownPath('zh-cn', '/method')).toBe('/zh-cn/method.md');
    expect(markdownPath('zh-tw', '/changelog/')).toBe('/zh-tw/changelog.md');
    expect(markdownPath('en', '/m/openai/gpt-6.1-sol')).toBe('/en/m/openai/gpt-6.1-sol.md');
    expect(markdownPath('en', '/m/openai/gpt-6.1-sol/')).toBe('/en/m/openai/gpt-6.1-sol.md');
  });

  it('has none for a page without a Markdown version', () => {
    expect(markdownPath('en', '/compare')).toBeNull();
    expect(markdownPath('en', '/nope')).toBeNull();
  });
});

describe('Markdown helpers', () => {
  it('keeps a pipe or a line break from breaking a table', () => {
    expect(table(['a', 'b'], [['x|y', 'one\ntwo']], [1])).toBe(
      '| a | b |\n| --- | ---: |\n| x\\|y | one two |',
    );
  });

  it('escapes brackets in link text', () => {
    expect(link('a [b]', 'https://example.com/')).toBe('[a \\[b\\]](https://example.com/)');
  });
});

describe('llms.txt', () => {
  const text = buildLlmsTxt(dataset);

  it('follows the llms.txt layout', () => {
    const lines = text.split('\n');
    expect(lines[0]).toBe('# mekiki');
    expect(lines[2]).toBe(`> ${useTranslations('en').meta.description}`);
    expect(lines.filter((line) => line.startsWith('# '))).toHaveLength(1);
    const sections = lines.filter((line) => line.startsWith('## '));
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.at(-1)).toBe('## Optional');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('links every model once, by its Markdown page', () => {
    const links = linksIn(text);
    for (const model of dataset.models) {
      const href = `${SITE_URL}/en/m/${model.id}.md`;
      expect(
        links.filter((item) => item === href),
        model.id,
      ).toHaveLength(1);
    }
  });

  it('links no page that only redirects', () => {
    const own = linksIn(text).filter((href) => href.startsWith(`${SITE_URL}/`));
    expect(own.length).toBeGreaterThan(dataset.models.length);
    for (const href of own) {
      const path = new URL(href).pathname;
      const file = /\.(md|json|xml|txt)$/.test(path);
      expect(file, path).toBe(true);
      if (path.endsWith('.md')) {
        expect(
          LOCALES.some((locale) => path.startsWith(`/${locale}/`)),
          path,
        ).toBe(true);
      }
    }
  });
});

describe('Markdown pages', () => {
  it.each(LOCALES)('give every model a row on the %s home page', (locale) => {
    const text = homeMarkdown(dataset, locale);
    for (const model of dataset.models) {
      expect(text, model.id).toContain(`](${SITE_URL}/${locale}/m/${model.id}.md)`);
    }
  });

  it.each(LOCALES)('never print a missing value as null or undefined in %s', (locale) => {
    const pages = [
      homeMarkdown(dataset, locale),
      methodMarkdown(dataset, locale),
      changelogMarkdown(history.changelog, dataset, locale),
      ...dataset.models.map((model) => modelMarkdown(model, dataset, history, locale)),
    ];
    for (const page of pages) {
      expect(page.startsWith('# ')).toBe(true);
      expect(page).not.toMatch(/\b(null|undefined|NaN)\b/);
      expect(page).not.toMatch(/\n{3,}/);
    }
  });

  it('show a model with its ratings, its facts and its JSON', () => {
    const model = dataset.models[0]!;
    const t = useTranslations('en');
    const text = modelMarkdown(model, dataset, history, 'en');
    expect(text.startsWith(`# ${model.name}\n`)).toBe(true);
    for (const heading of [t.detail.breakdown, t.detail.facts, t.detail.history, t.detail.links]) {
      expect(text).toContain(`\n## ${heading}\n`);
    }
    for (const label of [t.rating.intelligence, t.rating.cost, t.rating.value]) {
      expect(text).toContain(`\n- ${label}: `);
    }
    expect(text).toContain(`](${SITE_URL}/api/models/${model.id}.json)`);
  });

  it('document every API endpoint', () => {
    const text = apiMarkdown(dataset, 'en');
    for (const path of ['/api.json', '/api/models.json', '/api/history.json']) {
      expect(text).toContain(`](${SITE_URL}${path})`);
    }
  });
});
