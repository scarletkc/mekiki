import type { APIRoute } from 'astro';
import { jsonResponse, toApiFull } from '../lib/api';
import { getDataset } from '../lib/site-data';

export const GET: APIRoute = async () => jsonResponse(toApiFull(await getDataset()));
