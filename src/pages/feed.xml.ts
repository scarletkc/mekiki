import type { APIRoute } from 'astro';
import { DEFAULT_LOCALE } from '../i18n';
import { buildFeed, feedResponse } from '../lib/feed';
import { getDataset, getHistory } from '../lib/site-data';

/**
 * `/feed.xml`: the feed in the default language, at the short URL people
 * guess. A file cannot redirect by browser language like the pages do.
 */
export const GET: APIRoute = async () => {
  const { models } = await getDataset();
  const linkable = new Set(models.map((model) => model.id));
  return feedResponse(buildFeed(getHistory().changelog, DEFAULT_LOCALE, linkable));
};
