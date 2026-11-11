import type { APIRoute } from 'astro';
import { siteCard } from '../lib/og';

export const GET: APIRoute = async () =>
  new Response(await siteCard(), { headers: { 'Content-Type': 'image/png' } });
