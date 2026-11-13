import { describe, expect, it } from 'vitest';
import {
  BADGE_RATINGS,
  badgeMarkdown,
  badgePath,
  badgeSvg,
  badgeText,
  modelBadge,
  textWidth,
} from '@/lib/badge';
import { SITE_URL } from '@/lib/dataset';
import { BRAND } from '@/lib/logo';
import { getDataset } from '@/lib/site-data';
import { record } from './support/records';

describe('badges', () => {
  it('live under the rating and the model ID', () => {
    expect(badgePath('value', 'openai/gpt-6.1-sol')).toBe('/badge/value/openai/gpt-6.1-sol.svg');
    expect(badgeMarkdown('intelligence', 'openai/gpt-6.1-sol', SITE_URL)).toBe(
      `[![mekiki intelligence](${SITE_URL}/badge/intelligence/openai/gpt-6.1-sol.svg)](${SITE_URL}/m/openai/gpt-6.1-sol)`,
    );
  });

  it('say the tier and the figure of each rating', () => {
    const model = record('a/x', { intelligence: 90, value: 50, price: 2, blended: 1.5 });
    expect(badgeText(model, 'intelligence')).toEqual({
      label: 'mekiki intelligence',
      message: 'Top 90.0',
      rated: true,
    });
    expect(badgeText(model, 'cost')).toEqual({
      label: 'mekiki cost',
      message: 'Mid $1.5',
      rated: true,
    });
    expect(badgeText(model, 'value').message).toBe('Mid 50.0');
  });

  it('say what is missing instead of a zero', () => {
    const model = record('a/x', { intelligence: null, value: null, price: null });
    expect(badgeText(model, 'intelligence')).toMatchObject({ message: 'Not rated', rated: false });
    expect(badgeText(model, 'value')).toMatchObject({ message: 'Not rated', rated: false });
    expect(badgeText(model, 'cost')).toMatchObject({ message: 'No price', rated: false });
    expect(modelBadge(model, 'cost')).not.toContain(BRAND.seal);
    expect(modelBadge(model, 'intelligence')).not.toContain(BRAND.ink);
    const free = record('a/free', { price: 0, free: true });
    expect(badgeText(free, 'cost').message).toBe('Mid Free');
  });

  it('are as wide as their two texts and the padding around them', () => {
    const svg = badgeSvg('mekiki value', 'Top 66.7', BRAND.ink);
    const width = textWidth('mekiki value') + textWidth('Top 66.7') + 24;
    expect(
      svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20"`),
    ).toBe(true);
    expect(svg).toContain(`textLength="${textWidth('mekiki value')}"`);
    expect(svg).toContain('<title>mekiki value: Top 66.7</title>');
    expect(textWidth('mm')).toBeGreaterThan(textWidth('ii'));
  });

  it('escape their text', () => {
    const svg = badgeSvg('a<b', '"c"&d', BRAND.ink);
    expect(svg).not.toMatch(/a<b|"c"|&d/);
    expect(svg).toContain('a&#60;b');
  });

  it('exist for every rating of every listed model', async () => {
    const { models } = await getDataset();
    for (const model of models) {
      for (const rating of BADGE_RATINGS) {
        const svg = modelBadge(model, rating);
        expect(svg, model.id).toMatch(/^<svg [^>]+>.*<\/svg>\n$/s);
        expect(svg, model.id).not.toMatch(/NaN|undefined|null/);
      }
    }
  });
});
