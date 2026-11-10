import type { APIRoute, GetStaticPaths } from 'astro';
import { jsonResponse, toApiModel } from '../../../lib/api';
import type { ModelRecord } from '../../../lib/dataset';
import { getDataset } from '../../../lib/site-data';

/** `/api/models/<provider>/<model>.json`: one model, same shape as an item of `/api.json`. */
export const getStaticPaths: GetStaticPaths = async () => {
  const { models } = await getDataset();
  return models.map((model) => ({ params: { id: model.id }, props: { model } }));
};

export const GET: APIRoute = ({ props }) => jsonResponse(toApiModel(props.model as ModelRecord));
