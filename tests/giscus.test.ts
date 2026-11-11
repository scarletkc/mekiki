import { describe, expect, it } from 'vitest';
import { LOCALE_INFO, LOCALES } from '@/i18n';
import { type GiscusConfig, giscusAttributes } from '@/lib/giscus';

const CONFIG: GiscusConfig = {
  repo: 'owner/repo',
  repoId: 'R_1',
  category: 'Models',
  categoryId: 'DIC_1',
};
const PAGE = { term: 'anthropic/claude-opus-5-5', lang: 'en' };

describe('giscus attributes', () => {
  it('are absent while any part of the config is empty', () => {
    for (const key of Object.keys(CONFIG) as (keyof GiscusConfig)[]) {
      expect(giscusAttributes({ ...CONFIG, [key]: '' }, PAGE), key).toBeNull();
    }
  });

  it('find the thread by model ID, strictly', () => {
    const attributes = giscusAttributes(CONFIG, PAGE);
    expect(attributes).toMatchObject({
      'data-repo': 'owner/repo',
      'data-repo-id': 'R_1',
      'data-category': 'Models',
      'data-category-id': 'DIC_1',
      'data-mapping': 'specific',
      'data-term': 'anthropic/claude-opus-5-5',
      'data-strict': '1',
      'data-loading': 'lazy',
    });
  });

  it('are the same in every locale except the language', () => {
    const [first, ...rest] = LOCALES.map((locale) => {
      const { 'data-lang': lang, ...shared } = giscusAttributes(CONFIG, {
        ...PAGE,
        lang: LOCALE_INFO[locale].tag,
      })!;
      return { lang, shared };
    });
    for (const other of rest) expect(other.shared).toEqual(first!.shared);
    expect([first!.lang, ...rest.map((other) => other.lang)]).toEqual(['en', 'zh-CN', 'zh-TW']);
  });
});
