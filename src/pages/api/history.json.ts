import type { APIRoute } from 'astro';
import { jsonResponse, toApiHistory } from '../../lib/api';
import { getDataset, getHistory } from '../../lib/site-data';

/** `/api/history.json`: the ratings as recorded each day. */
export const GET: APIRoute = async () =>
  jsonResponse(toApiHistory(await getDataset(), getHistory().entries));
