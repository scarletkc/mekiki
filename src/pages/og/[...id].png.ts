import type { APIRoute, GetStaticPaths } from 'astro';
import type { ModelRecord } from '../../lib/dataset';
import { modelCard } from '../../lib/og';
import { getDataset } from '../../lib/site-data';

/** `/og/<provider>/<model>.png`: the share image of one model, shared by every locale. */
export const getStaticPaths: GetStaticPaths = async () => {
  const { models } = await getDataset();
  return models.map((model) => ({ params: { id: model.id }, props: { model } }));
};

export const GET: APIRoute = async ({ props }) =>
  new Response(await modelCard(props.model as ModelRecord), {
    headers: { 'Content-Type': 'image/png' },
  });
