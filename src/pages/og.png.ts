import type { APIRoute } from 'astro';
import { siteCard } from '../lib/og';

/** `/og.png`: the share image of every page that is not about one model. */
export const GET: APIRoute = async () =>
  new Response(await siteCard(), { headers: { 'Content-Type': 'image/png' } });
