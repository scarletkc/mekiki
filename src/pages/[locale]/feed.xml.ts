import type { APIRoute } from 'astro';
import type { Locale } from '../../i18n';
import { buildFeed, feedResponse } from '../../lib/feed';
import { localeStaticPaths } from '../../lib/routes';
import { getDataset, getHistory } from '../../lib/site-data';

export const getStaticPaths = localeStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { models } = await getDataset();
  const linkable = new Set(models.map((model) => model.id));
  return feedResponse(buildFeed(getHistory().changelog, props.locale as Locale, linkable));
};
