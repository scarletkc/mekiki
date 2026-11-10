import type { APIRoute } from 'astro';
import { jsonResponse, toApiFull } from '../lib/api';
import { getDataset } from '../lib/site-data';

/** `/api.json`: metadata plus the full rating of every model. */
export const GET: APIRoute = async () => jsonResponse(toApiFull(await getDataset()));
