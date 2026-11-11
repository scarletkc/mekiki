import type { APIRoute } from 'astro';
import type { Locale } from '../../i18n';
import { apiMarkdown, markdownResponse } from '../../lib/markdown';
import { localeStaticPaths } from '../../lib/routes';
import { getDataset } from '../../lib/site-data';

export const getStaticPaths = localeStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  markdownResponse(apiMarkdown(await getDataset(), props.locale as Locale));
