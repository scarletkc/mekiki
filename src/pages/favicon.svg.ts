import type { APIRoute } from 'astro';
import { logoSvg } from '../lib/logo';

/** `/favicon.svg`, drawn from the same source as the header mark. */
export const GET: APIRoute = () =>
  new Response(logoSvg(), { headers: { 'Content-Type': 'image/svg+xml' } });
