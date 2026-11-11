import type { APIRoute } from 'astro';
import { jsonResponse, toApiIndex } from '../../lib/api';
import { getDataset } from '../../lib/site-data';

export const GET: APIRoute = async () => jsonResponse(toApiIndex(await getDataset()));
