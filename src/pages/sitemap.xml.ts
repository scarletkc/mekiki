import type { APIRoute } from 'astro';
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, localePath } from '../i18n';
import { latestSync, SITE_URL } from '../lib/dataset';
import { getDataset } from '../lib/site-data';

export const GET: APIRoute = async () => {
  const dataset = await getDataset();
  const paths = [
    '/',
    '/compare',
    '/changelog',
    '/method',
    '/api',
    ...dataset.models.map((model) => `/m/${model.id}`),
  ];
  const synced = latestSync(dataset);
  const lastmod = synced ? `<lastmod>${synced.slice(0, 10)}</lastmod>` : '';
  const absolute = (locale: (typeof LOCALES)[number], path: string) =>
    new URL(localePath(locale, path), SITE_URL).href;

  const urls = paths.flatMap((path) => {
    const alternates = [
      ...LOCALES.map(
        (locale) =>
          `<xhtml:link rel="alternate" hreflang="${LOCALE_INFO[locale].tag}" href="${absolute(locale, path)}"/>`,
      ),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${absolute(DEFAULT_LOCALE, path)}"/>`,
    ].join('');
    return LOCALES.map(
      (locale) => `<url><loc>${absolute(locale, path)}</loc>${lastmod}${alternates}</url>`,
    );
  });

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `${urls.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
