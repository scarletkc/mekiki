import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../lib/llms';
import { getDataset } from '../lib/site-data';

export const GET: APIRoute = async () =>
  new Response(buildLlmsTxt(await getDataset()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
