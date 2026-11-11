import type { APIRoute } from 'astro';
import type { Locale } from '../../../i18n';
import type { ModelRecord } from '../../../lib/dataset';
import { markdownResponse, modelMarkdown } from '../../../lib/markdown';
import { localizedModelStaticPaths } from '../../../lib/routes';
import { getDataset, getHistory } from '../../../lib/site-data';

export const getStaticPaths = localizedModelStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  markdownResponse(
    modelMarkdown(
      props.model as ModelRecord,
      await getDataset(),
      getHistory(),
      props.locale as Locale,
    ),
  );
