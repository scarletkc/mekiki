import { en as t } from '../i18n/en';
import type { ModelRecord } from './dataset';
import { formatPrice, formatScore } from './format';
import { BRAND } from './logo';

export const BADGE_RATINGS = ['intelligence', 'cost', 'value'] as const;
export type BadgeRating = (typeof BADGE_RATINGS)[number];

export function badgePath(rating: BadgeRating, id: string): string {
  return `/badge/${rating}/${id}.svg`;
}

const UNRATED = '#8b929c';
const HEIGHT = 20;
const PADDING = 6;
const FONT_SIZE = 11;
const DEFAULT_WIDTH = 7;

const WIDTHS: Record<string, number> = {
  ' ': 3.87,
  $: 6.99,
  '.': 4,
  a: 6.61,
  b: 6.85,
  c: 5.73,
  d: 6.85,
  e: 6.55,
  f: 3.87,
  g: 6.85,
  h: 6.96,
  i: 3.02,
  j: 3.79,
  k: 6.51,
  l: 3.02,
  m: 10.7,
  n: 6.96,
  o: 6.68,
  p: 6.85,
  q: 6.85,
  r: 4.69,
  s: 5.73,
  t: 4.33,
  u: 6.96,
  v: 6.51,
  w: 9,
  x: 6.51,
  y: 6.51,
  z: 5.78,
  F: 6.32,
  H: 8.27,
  L: 6.12,
  M: 9.27,
  N: 8.23,
  T: 6.78,
  V: 7.52,
};

export function textWidth(text: string): number {
  let width = 0;
  for (const char of text) width += WIDTHS[char] ?? (/\d/.test(char) ? 6.99 : DEFAULT_WIDTH);
  return Math.round(width);
}

const escapeXml = (text: string) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

export function badgeSvg(label: string, message: string, color: string): string {
  const labelText = textWidth(label);
  const messageText = textWidth(message);
  const labelWidth = labelText + PADDING * 2;
  const messageWidth = messageText + PADDING * 2;
  const width = labelWidth + messageWidth;
  const name = escapeXml(`${label}: ${message}`);
  const text = (content: string, x: number, length: number) =>
    `<text x="${x}" y="14" textLength="${length}">${escapeXml(content)}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" role="img" aria-label="${name}">` +
    `<title>${name}</title>` +
    `<clipPath id="r"><rect width="${width}" height="${HEIGHT}" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${labelWidth}" height="${HEIGHT}" fill="${BRAND.muted}"/>` +
    `<rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" fill="${color}"/>` +
    `</g>` +
    `<g fill="${BRAND.paper}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_SIZE}" text-rendering="geometricPrecision">` +
    text(label, labelWidth / 2, labelText) +
    text(message, labelWidth + messageWidth / 2, messageText) +
    `</g></svg>\n`
  );
}

export function badgeText(
  model: Pick<ModelRecord, 'rating'>,
  rating: BadgeRating,
): { label: string; message: string; rated: boolean } {
  const label = `mekiki ${t.changelog.rating[rating]}`;
  if (rating === 'cost') {
    const { tier, blended, free } = model.rating.cost;
    if (tier === null || blended === null) return { label, message: t.empty.noPrice, rated: false };
    const figure = free ? t.empty.free : formatPrice(blended);
    return { label, message: `${t.tier.cost[tier]} ${figure}`, rated: true };
  }
  const { tier, score } = model.rating[rating];
  if (tier === null || score === null) return { label, message: t.empty.unrated, rated: false };
  return { label, message: `${t.tier[rating][tier]} ${formatScore(score)}`, rated: true };
}

export function modelBadge(model: Pick<ModelRecord, 'rating'>, rating: BadgeRating): string {
  const { label, message, rated } = badgeText(model, rating);
  const color = rated ? (rating === 'cost' ? BRAND.seal : BRAND.ink) : UNRATED;
  return badgeSvg(label, message, color);
}

export function badgeMarkdown(rating: BadgeRating, id: string, site: string): string {
  const label = `mekiki ${t.changelog.rating[rating]}`;
  return `[![${label}](${site}${badgePath(rating, id)})](${site}/m/${id})`;
}
