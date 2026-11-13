import type { APIRoute, GetStaticPaths } from 'astro';
import { BADGE_RATINGS, modelBadge, type BadgeRating } from '../../../lib/badge';
import type { ModelRecord } from '../../../lib/dataset';
import { getDataset } from '../../../lib/site-data';

export const getStaticPaths: GetStaticPaths = async () => {
  const { models } = await getDataset();
  return BADGE_RATINGS.flatMap((rating) =>
    models.map((model) => ({ params: { rating, id: model.id }, props: { rating, model } })),
  );
};

export const GET: APIRoute = ({ props }) =>
  new Response(modelBadge(props.model as ModelRecord, props.rating as BadgeRating), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
