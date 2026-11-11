import type { APIRoute } from 'astro';
import { logoSvg } from '../lib/logo';

export const GET: APIRoute = () =>
  new Response(logoSvg(), { headers: { 'Content-Type': 'image/svg+xml' } });
