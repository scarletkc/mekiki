import type { APIRoute } from 'astro';
import { logoSvg } from '../lib/logo';
import { logoPng } from '../lib/og';

export const GET: APIRoute = () =>
  new Response(logoPng(180, logoSvg({ rounded: false })), {
    headers: { 'Content-Type': 'image/png' },
  });
