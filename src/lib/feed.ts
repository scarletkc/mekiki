import { LOCALE_INFO, fmt, localePath, useTranslations, type Locale } from '../i18n';
import { describeChange } from './change-text';
import type { Changelog } from './changelog';
import { SITE_URL } from './dataset';

export const FEED_DAYS = 50;

export const feedPath = (locale: Locale) => `/${locale}/feed.xml`;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const rfc822 = (date: string) => new Date(`${date}T00:00:00Z`).toUTCString();

const absolute = (path: string) => new URL(path, SITE_URL).href;

export function buildFeed(changelog: Changelog, locale: Locale, linkable?: Set<string>): string {
  const t = useTranslations(locale);
  const c = t.changelog;
  const page = absolute(localePath(locale, '/changelog'));
  const days = changelog.days.slice(0, FEED_DAYS);
  const updated = days[0]?.date ?? changelog.start;

  const items = days.map(({ date, changes }) => {
    const link = `${page}#${date}`;
    const list = changes
      .map((change) => {
        const html = describeChange(change, t)
          .map((segment) =>
            typeof segment === 'string'
              ? escapeXml(segment)
              : linkable && !linkable.has(segment.id)
                ? escapeXml(segment.name)
                : `<a href="${escapeXml(absolute(localePath(locale, `/m/${segment.id}`)))}">${escapeXml(segment.name)}</a>`,
          )
          .join('');
        return `<li>${html}</li>`;
      })
      .join('');
    return [
      '    <item>',
      `      <title>${escapeXml(fmt(c.feedItem, { date }))}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <pubDate>${rfc822(date)}</pubDate>`,
      `      <description>${escapeXml(`<ul>${list}</ul>`)}</description>`,
      '    </item>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(c.feedTitle)}</title>`,
    `    <link>${escapeXml(page)}</link>`,
    `    <description>${escapeXml(c.feedDescription)}</description>`,
    `    <language>${LOCALE_INFO[locale].tag}</language>`,
    `    <atom:link href="${escapeXml(absolute(feedPath(locale)))}" rel="self" type="application/rss+xml" />`,
    ...(updated ? [`    <lastBuildDate>${rfc822(updated)}</lastBuildDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

export function feedResponse(xml: string): Response {
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
