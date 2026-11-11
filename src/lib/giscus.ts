/** The giscus server; its client script and the comment iframe load from here. */
export const GISCUS_ORIGIN = 'https://giscus.app';

export interface GiscusConfig {
  /** `owner/name` of the repository that holds the discussions. */
  repo: string;
  repoId: string;
  /** Name of the Discussions category. */
  category: string;
  categoryId: string;
}

/** giscus theme for each site theme. */
export const GISCUS_THEMES = { light: 'light', dark: 'transparent_dark' } as const;

/**
 * The `data-*` attributes for giscus's client script on one model page, or
 * `null` while the config is incomplete. The theme is left out: it is only
 * known in the browser.
 *
 * The thread is found by the model ID alone (`specific` mapping, strict
 * matching), so every locale shares one thread and URL changes never orphan
 * it. Reactions are off, so the thread does not read as a vote on the model.
 */
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
    'data-reactions-enabled': '0',
    'data-emit-metadata': '0',
    'data-input-position': 'bottom',
    'data-lang': lang,
    'data-loading': 'lazy',
  };
}
