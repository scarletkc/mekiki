import type { APIRoute } from 'astro';
import { DEFAULT_LOCALE } from '../i18n';
import { buildFeed, feedResponse } from '../lib/feed';
import { getDataset, getHistory } from '../lib/site-data';

export const GET: APIRoute = async () => {
  const { models } = await getDataset();
  const linkable = new Set(models.map((model) => model.id));
  return feedResponse(buildFeed(getHistory().changelog, DEFAULT_LOCALE, linkable));
};
