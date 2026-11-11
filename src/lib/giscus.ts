export const GISCUS_ORIGIN = 'https://giscus.app';

export interface GiscusConfig {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
}

export const GISCUS_THEMES = { light: 'light', dark: 'transparent_dark' } as const;

export function giscusAttributes(
  config: GiscusConfig,
  { term, lang }: { term: string; lang: string },
): Record<string, string> | null {
  if (!config.repo || !config.repoId || !config.category || !config.categoryId) return null;
  return {
    'data-repo': config.repo,
    'data-repo-id': config.repoId,
    'data-category': config.category,
    'data-category-id': config.categoryId,
    'data-mapping': 'specific',
    'data-term': term,
    'data-strict': '1',
    'data-reactions-enabled': '1',
    'data-emit-metadata': '0',
    'data-input-position': 'bottom',
    'data-lang': lang,
    'data-loading': 'lazy',
  };
}
