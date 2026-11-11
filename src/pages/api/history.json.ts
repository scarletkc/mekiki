import type { APIRoute } from 'astro';
import { jsonResponse, toApiHistory } from '../../lib/api';
import { getDataset, getHistory } from '../../lib/site-data';

export const GET: APIRoute = async () =>
  jsonResponse(toApiHistory(await getDataset(), getHistory().entries));
