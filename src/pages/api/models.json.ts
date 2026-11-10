import type { APIRoute } from 'astro';
import { jsonResponse, toApiIndex } from '../../lib/api';
import { getDataset } from '../../lib/site-data';

/** `/api/models.json`: id, name, vendor and status of every model. */
export const GET: APIRoute = async () => jsonResponse(toApiIndex(await getDataset()));
