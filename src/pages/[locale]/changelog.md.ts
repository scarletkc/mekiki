import type { APIRoute } from 'astro';
import type { Locale } from '../../i18n';
import { changelogMarkdown, markdownResponse } from '../../lib/markdown';
import { localeStaticPaths } from '../../lib/routes';
import { getDataset, getHistory } from '../../lib/site-data';

export const getStaticPaths = localeStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  markdownResponse(
    changelogMarkdown(getHistory().changelog, await getDataset(), props.locale as Locale),
  );
